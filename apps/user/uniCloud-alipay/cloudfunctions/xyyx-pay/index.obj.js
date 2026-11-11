'use strict'
/**
 * xyyx-pay —— 支付云对象
 *
 * 两种模式：
 *   mock  ：没有配置商户证书时使用。客户端点「模拟支付」即视为支付成功，只用于开发联调。
 *   wechat：配置了商户号 + 私钥 + APIv3 密钥时，走微信支付 V3 JSAPI。
 *
 * 密钥全部来自 pay-config.js（**本地文件，已 gitignore，不入库**）。
 * 模板见同目录 pay-config.example.js。
 *
 * 安全要点：
 *   - 金额由服务端按订单金额决定，客户端传的 amountCent 只用于校验，不一致直接拒绝
 *   - 回调必须验签 + 解密，验不过一律当失败
 *   - 支付成功用「pay_status 必须是 unpaid」做 CAS，天然幂等
 */

const crypto = require('crypto')
const C = require('xyyx-common')

let PAY_CONFIG = {}
try {
  PAY_CONFIG = require('./pay-config.js')
} catch (e) {
  PAY_CONFIG = {}
}

const WX_API = 'https://api.mch.weixin.qq.com'

function isRealPay() {
  return Boolean(PAY_CONFIG.mchid && PAY_CONFIG.serialNo && PAY_CONFIG.privateKey && PAY_CONFIG.apiV3Key && PAY_CONFIG.appid)
}

function nonce() {
  return crypto.randomBytes(16).toString('hex')
}

/** 微信支付 V3 请求签名 */
function buildAuthorization(method, urlPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = nonce()
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(PAY_CONFIG.privateKey, 'base64')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${PAY_CONFIG.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${PAY_CONFIG.serialNo}"`
}

async function wxRequest(method, urlPath, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : ''
  const res = await uniCloud.httpclient.request(WX_API + urlPath, {
    method,
    headers: {
      Authorization: buildAuthorization(method, urlPath, body),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'xiaodida-pay/1.0'
    },
    content: body,
    dataType: 'json',
    timeout: 15000
  })
  return { status: res.status, data: res.data }
}

/** 回调报文解密（AES-256-GCM） */
function decryptResource(resource) {
  const key = Buffer.from(PAY_CONFIG.apiV3Key, 'utf8')
  const nonceBuf = Buffer.from(resource.nonce, 'utf8')
  const data = Buffer.from(resource.ciphertext, 'base64')
  const authTag = data.subarray(data.length - 16)
  const payload = data.subarray(0, data.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceBuf)
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'))
  const out = Buffer.concat([decipher.update(payload), decipher.final()])
  return JSON.parse(out.toString('utf8'))
}

/** 把订单标记为已支付（幂等） */
async function markPaid(taskId, transactionId, payMode) {
  const upd = await C.db
    .collection(C.COLL.tasks)
    .where({ _id: taskId, pay_status: C.dbCmd.neq('paid') })
    .update({
      pay_status: 'paid',
      pay_time: Date.now(),
      pay_mode: payMode,
      transaction_id: transactionId || ''
    })
  if (!upd.updated) {
    const task = await C.getTask(taskId)
    if (task.pay_status === 'paid') return { alreadyPaid: true }
    throw new C.BizError(500, '订单状态异常')
  }

  const task = await C.getTask(taskId)
  await C.db.collection(C.COLL.transactions).add(
    C.txDoc({
      type: C.TX_TYPE.ESCROW_IN,
      uid: task.publisher_id,
      taskId,
      amountCent: task.amount_cent,
      remark: '下单支付，进入平台托管',
      key: `escrow_in:${taskId}`
    })
  )
  return { alreadyPaid: false }
}

const api = {
  /** 支付模式探测，客户端用它决定显示「微信支付」还是「模拟支付」 */
  async getPayMode() {
    return C.ok({ mode: isRealPay() ? 'wechat' : 'mock' })
  },

  /**
   * 创建 JSAPI 预支付单
   * mock 模式直接返回一个前端可用的假参数，前端点确认后调 mockPaySuccess
   */
  async createJsapiOrder(data = {}) {
    const auth = await C.requireAuth(this)
    const taskId = C.taskIdOf(data.taskId)
    const task = await C.getTask(taskId)

    C.assert(task.publisher_id === auth.uid, 403, '只能支付自己的订单')
    C.assert(task.pay_status !== 'paid', 400, '订单已支付')
    C.assert(task.status === C.STATUS.PENDING, 400, '订单状态不允许支付')

    // 金额以服务端订单为准，客户端传什么都要对上
    if (data.amountCent !== undefined) {
      C.assert(Number(data.amountCent) === task.amount_cent, 400, '金额不一致，请刷新后重试')
    }

    if (!isRealPay()) {
      return C.ok({
        mode: 'mock',
        taskId,
        amount: C.yuan(task.amount_cent),
        tip: '当前未配置商户证书，走模拟支付（仅开发环境）'
      })
    }

    // 取 openid
    const userRes = await C.db.collection('uni-id-users').doc(auth.uid).get()
    const openid =
      userRes.data && userRes.data[0] && userRes.data[0].wx_openid && userRes.data[0].wx_openid['mp-weixin']
    C.assert(openid, 400, '缺少微信 openid，请重新登录')

    const body = {
      appid: PAY_CONFIG.appid,
      mchid: PAY_CONFIG.mchid,
      description: `校递达-${task.type_text || '跑腿'}`,
      out_trade_no: taskId,
      notify_url: PAY_CONFIG.notifyUrl,
      amount: { total: task.amount_cent, currency: 'CNY' },
      payer: { openid }
    }

    const res = await wxRequest('POST', '/v3/pay/transactions/jsapi', body)
    C.assert(res.status === 200 && res.data && res.data.prepay_id, 500, '微信下单失败')

    const prepayId = res.data.prepay_id
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = nonce()
    const pkg = `prepay_id=${prepayId}`
    const paySign = crypto
      .createSign('RSA-SHA256')
      .update(`${PAY_CONFIG.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`)
      .sign(PAY_CONFIG.privateKey, 'base64')

    return C.ok({
      mode: 'wechat',
      taskId,
      payParams: { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign }
    })
  },

  /**
   * 模拟支付成功。只有未配置商户证书时才允许调用，
   * 避免线上被人拿来白嫖订单。
   */
  async mockPaySuccess(taskId) {
    C.assert(!isRealPay(), 403, '已配置真实支付，禁止使用模拟支付')
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id === auth.uid, 403, '只能支付自己的订单')

    await markPaid(id, `mock_${Date.now()}`, 'mock')
    return C.ok(null, '支付成功（模拟）')
  },

  /** 主动查单（对账/兜底） */
  async queryOrder(taskId) {
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id === auth.uid, 403, '无权查询')

    if (!isRealPay()) return C.ok({ pay_status: task.pay_status, mode: 'mock' })

    const res = await wxRequest('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(id)}?mchid=${PAY_CONFIG.mchid}`)
    return C.ok({ pay_status: task.pay_status, wx: res.data })
  },

  /**
   * 支付回调（由 HTTP 触发的云函数 pay-notify 调用，不直接给客户端用）
   * 这里做验签 + 解密 + 幂等入账
   */
  async handleNotify(headers = {}, rawBody = '') {
    C.assert(isRealPay(), 400, '未配置真实支付')

    const timestamp = headers['wechatpay-timestamp']
    const nonceStr = headers['wechatpay-nonce']
    const signature = headers['wechatpay-signature']
    const serial = headers['wechatpay-serial']
    C.assert(timestamp && nonceStr && signature, 400, '缺少签名头')

    // 防重放：5 分钟
    C.assert(Math.abs(Date.now() / 1000 - Number(timestamp)) < 300, 400, '回调已过期')
    C.assert(serial === PAY_CONFIG.platformSerial, 400, '证书序列号不匹配')

    const message = `${timestamp}\n${nonceStr}\n${rawBody}\n`
    const verify = crypto.createVerify('RSA-SHA256').update(message)
    const okSign = verify.verify(PAY_CONFIG.platformPublicKey, signature, 'base64')
    C.assert(okSign, 401, '回调验签失败')

    const body = JSON.parse(rawBody)
    const plain = decryptResource(body.resource)
    C.assert(plain.trade_state === 'SUCCESS', 400, '非成功状态')

    await markPaid(plain.out_trade_no, plain.transaction_id, 'wechat')
    return C.ok(null, 'ok')
  }
}

// 统一兜底：把业务异常(BizError)转成 { code, msg }，未知异常压成 500，
// 否则云函数会直接把异常抛给客户端，前端只能看到「用户函数代码异常」。
module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))