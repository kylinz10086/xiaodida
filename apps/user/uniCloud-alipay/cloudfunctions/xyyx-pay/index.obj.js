'use strict'
/**
 * xyyx-pay —— 支付 / 退款云对象
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
 *   - 支付成功用「pending_pay_no + pay_status」做 CAS，天然幂等
 *   - 退款金额由服务端按「已付 - 已退」算，客户端只能指定退哪一笔（refundId）
 *
 * 一笔订单可能有多次支付：先付全款，涨价改单后再补一次差价。
 * 每次支付都有独立的 out_trade_no（C.newPayNo），记在 task.payments 里；
 * 退款按 payments 逐笔发起（C.allocateRefund 负责摊分）。
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

// 本地回归测试可强制 mock，避免真实商户配置影响内存测试
const FORCE_MOCK = process.env.XYYX_PAY_FORCE_MOCK === '1'

function isRealPay() {
  if (FORCE_MOCK) return false
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

/**
 * 调微信支付 V3。
 *
 * 默认直连 api.mch.weixin.qq.com；如果 pay-config.js 里配了 relay，
 * 就先发到「固定 IP 转发器」（tools/wechat-relay.cjs），由它转发。
 * 为什么需要：云函数公网出口是 NAT 池，IP 会变，而商家转账必须配「接口安全IP」白名单；
 * 走固定 IP 的转发机之后，微信看到的出口 IP 就不会再变。
 */
async function wxRequest(method, urlPath, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : ''
  const headers = {
    Authorization: buildAuthorization(method, urlPath, body),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'xiaodida-pay/1.0'
  }

  const relay = PAY_CONFIG.relay || null
  if (relay && relay.url) {
    const ts = String(Date.now())
    const sign = crypto
      .createHmac('sha256', String(relay.secret || ''))
      .update(ts + '\n' + urlPath + '\n' + body)
      .digest('hex')
    const res = await uniCloud.httpclient.request(relay.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-relay-ts': ts,
        'x-relay-sign': sign,
        'x-relay-path': encodeURIComponent(urlPath),
        'x-relay-method': method
      },
      content: JSON.stringify({ path: urlPath, method, headers, body }),
      dataType: 'json',
      timeout: 20000
    })
    const d = (res && res.data) || {}
    return { status: Number(d.status) || (res && res.status) || 0, data: d.data || {} }
  }

  const res = await uniCloud.httpclient.request(WX_API + urlPath, {
    method,
    headers,
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

/** 验签（支付/退款回调共用） */
function verifyNotify(headers, rawBody) {
  const timestamp = headers['wechatpay-timestamp']
  const nonceStr = headers['wechatpay-nonce']
  const signature = headers['wechatpay-signature']
  const serial = headers['wechatpay-serial']
  C.assert(timestamp && nonceStr && signature, 400, '缺少签名头')
  C.assert(Math.abs(Date.now() / 1000 - Number(timestamp)) < 300, 400, '回调已过期')
  C.assert(serial === PAY_CONFIG.platformSerial, 400, '证书序列号不匹配')

  const message = `${timestamp}\n${nonceStr}\n${rawBody}\n`
  const verify = crypto.createVerify('RSA-SHA256').update(message)
  const okSign = verify.verify(PAY_CONFIG.platformPublicKey, signature, 'base64')
  C.assert(okSign, 401, '回调验签失败')
  return JSON.parse(rawBody)
}

/**
 * 本轮「应该收多少钱」。
 * 涨价改单后 due_cent > 0，这时只需要补差价；否则就是全款。
 */
function payAmountOf(task) {
  const due = C.dueCentOf(task)
  return due > 0 ? due : Number(task.amount_cent) || 0
}

/** 找到某笔支付（按 out_trade_no），用于算退款时的 total */
function paymentCentOf(task, payNo) {
  const list = C.paymentsOf(task)
  const hit = list.find((p) => p.no === payNo)
  if (hit) return Number(hit.cent) || 0
  // 老数据：out_trade_no 就是订单号，总额等于订单金额
  return Number(task.amount_cent) || 0
}

/**
 * 把钱记到订单上（幂等）。
 *
 * @param {string} outTradeNo 微信/模拟支付的 out_trade_no
 */
async function markPaid(outTradeNo, transactionId, payMode) {
  // 1. 先查支付单登记表：微信回调只带 out_trade_no，
  //    有这张表才能保证迟到的支付也一定能找到自己的订单（不会「付了但没记账」）
  let task = null
  let byPayNo = false
  let payorder = null

  try {
    const poRes = await C.db.collection(C.COLL.payorders).where({ out_trade_no: outTradeNo }).limit(1).get()
    if (poRes.data && poRes.data.length) {
      payorder = poRes.data[0]
      task = await C.getTask(payorder.task_id)
      byPayNo = true
    }
  } catch (e) {
    // 集合还没建（新环境）时退化到下面的兼容查找
    console.warn('[xyyx-pay] 支付单表不可用，退回按订单查：', e && e.message)
  }

  // 2. 兼容没有支付单登记的历史数据：先按 pending_pay_no，再按订单号
  if (!task) {
    const pendingRes = await C.db
      .collection(C.COLL.tasks)
      .where({ pending_pay_no: outTradeNo })
      .limit(1)
      .get()
    if (pendingRes.data && pendingRes.data.length) {
      task = pendingRes.data[0]
      byPayNo = true
    } else {
      const docRes = await C.db.collection(C.COLL.tasks).doc(outTradeNo).get()
      task = (docRes.data && docRes.data[0]) || null
    }
  }
  C.assert(task, 404, '订单不存在')

  // 3. 已经记过账就直接返回（微信会重试回调）
  const already = C.paymentsOf(task).some((p) => p.no === outTradeNo)
  if (already) return { alreadyPaid: true, taskId: task._id }

  const amountCent = payorder
    ? Number(payorder.amount_cent) || 0
    : byPayNo
      ? Number(task.pending_pay_cent) || 0
      : Number(task.amount_cent) || 0
  C.assert(amountCent > 0, 400, '支付金额异常')
  const isTopup = C.dueCentOf(task) > 0

  const payment = {
    no: outTradeNo,
    cent: amountCent,
    type: isTopup ? 'topup' : 'full',
    time: Date.now(),
    refunded: 0
  }

  // 3. 写账
  //
  //    这里不再要求 pay_status != 'paid'：
  //    如果用户重复点支付、两笔都真的扣了钱，第二笔也必须记下来
  //    （多付的钱会变成可退额度，而不是凭空消失）。
  //    幂等靠上面的「payments 里已有同一个 out_trade_no」判断。
  const clearPending = task.pending_pay_no === outTradeNo

  const patch = {
    paid_cent: C.dbCmd.inc(amountCent),
    payments: C.dbCmd.push([payment]),
    update_time: Date.now()
  }
  if (clearPending) {
    patch.pending_pay_no = ''
    patch.pending_pay_cent = 0
  }
  if (task.pay_status !== 'paid') {
    patch.pay_status = 'paid'
    patch.pay_time = Date.now()
    patch.pay_mode = payMode
    patch.transaction_id = transactionId || ''
    patch.due_cent = 0
  }

  const upd = await C.db.collection(C.COLL.tasks).where({ _id: task._id }).update(patch)
  if (!upd.updated) {
    const latest = await C.getTask(task._id)
    if (C.paymentsOf(latest).some((p) => p.no === outTradeNo)) {
      return { alreadyPaid: true, taskId: task._id }
    }
    throw new C.BizError(500, '订单状态异常，请联系客服')
  }

  if (payorder) {
    await C.db.collection(C.COLL.payorders).doc(payorder._id).update({
      status: 'paid',
      transaction_id: transactionId || '',
      pay_time: Date.now(),
      update_time: Date.now()
    })
  }

  try {
    await C.db.collection(C.COLL.transactions).add(
      C.txDoc({
        type: C.TX_TYPE.ESCROW_IN,
        uid: task.publisher_id,
        taskId: task._id,
        amountCent,
        remark: isTopup ? `修改订单补差价 ¥${C.yuan(amountCent)}` : '下单支付，进入平台托管',
        key: `escrow_in:${outTradeNo}`
      })
    )
  } catch (e) {
    // idempotency_key 冲突说明这笔流水已经记过，忽略即可
    console.warn('[xyyx-pay] escrow_in 重复记账已忽略', outTradeNo)
  }
  return { alreadyPaid: false, taskId: task._id, isTopup, amount: C.yuan(amountCent) }
}

/** 在 task 上登记「本轮要付的那一笔」，避免客户端伪造金额 */
async function stampPendingPay(task, amountCent, payNo) {
  const now = Date.now()
  await C.db.collection(C.COLL.tasks).doc(task._id).update({
    pending_pay_no: payNo,
    pending_pay_cent: amountCent,
    pending_pay_time: now,
    update_time: now
  })

  // 支付单登记：微信回调只带 out_trade_no，这里留一条记录，
  // 即使客户端同时发起多笔支付，也不会出现「钱付了但找不到订单」。
  // 集合还没建的时候不能把支付流程整个卡死，所以这里单独兜住异常。
  try {
    await C.db.collection(C.COLL.payorders).add({
      out_trade_no: payNo,
      task_id: task._id,
      user_id: task.publisher_id,
      amount_cent: amountCent,
      type: C.dueCentOf(task) > 0 ? 'topup' : 'full',
      status: 'pending',
      create_time: now,
      update_time: now
    })
  } catch (e) {
    console.warn('[xyyx-pay] 支付单登记失败（请确认已创建 yyx-payorders 集合）：', e && e.message)
  }
}

/* ------------------------------------------------------------------ */
/* 商家转账到零钱（骑手提现）                                            */
/* ------------------------------------------------------------------ */

const TRANSFER_PATH = '/v3/fund-app/mch-transfer/transfer-bills'
/** 佣金报酬场景固定 1005；两条报备信息是微信要求的固定字段 */
const TRANSFER_SCENE_ID = '1005'
const TRANSFER_IP_WHITELIST_HINT = '请确认商户平台「商家转账 → 接口安全IP」已加入云函数出口IP'

/** 今天 0 点（北京时间） */
function todayStart() {
  const OFFSET = 8 * 3600 * 1000
  return Math.floor((Date.now() + OFFSET) / 86400000) * 86400000 - OFFSET
}

function transferRemark(text) {
  return String(text || '跑腿收入提现').slice(0, 32)
}

function transferBody({ openid, amountCent, outBillNo }) {
  return {
    appid: PAY_CONFIG.appid,
    out_bill_no: outBillNo,
    transfer_scene_id: TRANSFER_SCENE_ID,
    openid,
    transfer_amount: amountCent,
    transfer_remark: transferRemark('校递达跑腿报酬'),
    user_recv_perception: '劳务报酬',
    transfer_scene_report_infos: [
      { info_type: '岗位类型', info_content: '校园跑腿骑手' },
      { info_type: '报酬说明', info_content: '跑腿订单收入提现' }
    ]
  }
}

/** 云函数出口 IP（排查「接口安全IP」白名单用） */
async function egressIp() {
  try {
    const r = await uniCloud.httpclient.request('https://api.ipify.org?format=json', {
      dataType: 'json',
      timeout: 5000
    })
    return (r.data && r.data.ip) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 一次问多个回显服务，把云函数出口 IP 都收集起来。
 * 微信「商家转账 → 接口安全IP」要逐个填，所以多问几次 + 多个来源，
 * 尽量把 NAT 池里的地址都找出来（同一台机器多次调用也可能落在不同 IP 上）。
 */
async function egressIpList() {
  const urls = [
    'https://api.ipify.org?format=json',
    'https://ipv4.icanhazip.com',
    'https://api.ip.sb/ip',
    'https://myip.ipip.net'
  ]
  const found = []
  await Promise.all(
    urls.map(async (u) => {
      try {
        const r = await uniCloud.httpclient.request(u, { dataType: 'text', timeout: 6000 })
        const text = String((r && r.data) || '')
        const m = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
        if (m) found.push(m[1])
      } catch (e) {}
    })
  )
  return Array.from(new Set(found))
}

/** 用户小程序 openid：uni-id 存在 wx_openid 对象里，key 形如 mp-weixin_wx... */
async function openidOf(uid) {
  try {
    const res = await C.db.collection('uni-id-users').doc(uid).get()
    const u = res.data && res.data[0]
    const map = (u && u.wx_openid) || {}
    const keys = Object.keys(map)
    const hit = keys.find((k) => String(k).indexOf('mp-weixin') === 0) || keys[0]
    const v = hit ? map[hit] : ''
    return typeof v === 'string' ? v : ''
  } catch (e) {
    return ''
  }
}

/** 本地回归测试开关：XYYX_WITHDRAW_MOCK=success|fail 时不真调微信，其它逻辑照常 */
function transferMock() {
  return String(process.env.XYYX_WITHDRAW_MOCK || '')
}

async function wxTransfer(body) {
  const mock = transferMock()
  if (mock) {
    const ok = mock !== 'fail'
    return {
      status: 200,
      data: ok
        ? { state: 'SUCCESS', transfer_bill_no: 'mock_' + body.out_bill_no }
        : { state: 'FAIL', fail_reason: '测试模拟转账失败' }
    }
  }

  // 不同商户开通的商家转账产品版本，对「可选参数」支持不一样。
  // 遇到「请求中含有未在API文档中定义的参数」（PARAM_ERROR）时，
  // 按可选字段从多到少依次重试 —— 同一 out_bill_no 重试是微信允许的，
  // 参数错误不会产生转账单，所以这样试是安全的。
  const variants = []
  const v1 = Object.assign({}, body)
  const v2 = Object.assign({}, body)
  delete v2.user_recv_perception
  const v3 = Object.assign({}, v2)
  delete v3.transfer_scene_report_infos
  variants.push(v1, v2, v3)

  let last = null
  for (let i = 0; i < variants.length; i++) {
    const res = await wxRequest('POST', TRANSFER_PATH, variants[i])
    last = res
    const code = String((res.data && res.data.code) || '')
    const msg = String((res.data && res.data.message) || '')
    const paramErr = code === 'PARAM_ERROR' || /未在API文档中定义|参数错误|参数不正确/.test(msg)
    if (!paramErr) {
      // 记下哪一档可用：wx_variant=1 完整 / 2 去掉收款感知 / 3 再去掉报备信息
      if (res.data && typeof res.data === 'object') res.data.wx_variant = i + 1
      return res
    }
    // 参数报错**不代表钱没出去**：先查一次微信到底有没有这张单，
    // 有就按真实状态返回，绝不换参数用同一个单号再试（会变成「出错但钱已到账」）。
    if (i < variants.length - 1) {
      const probe = await probeBillState(body.out_bill_no)
      if (probe.known && probe.exists) {
        return {
          status: 200,
          data: Object.assign({}, probe.raw || {}, { state: probe.state, wx_variant: i + 1 })
        }
      }
    }
  }
  return last
}

async function wxQueryTransfer(outBillNo) {
  const mock = transferMock()
  if (mock) {
    // 离线测试：转账用 mock 时，查单也返回同一套状态，保证「失败→冲正 / 成功→不冲正」都能验到
    return {
      status: 200,
      data:
        mock === 'fail'
          ? { state: 'FAIL', fail_reason: '测试模拟转账失败', out_bill_no: outBillNo }
          : { state: 'SUCCESS', transfer_bill_no: 'mock_' + outBillNo, out_bill_no: outBillNo }
    }
  }
  const res = await wxRequest(
    'GET',
    `${TRANSFER_PATH}/out-bill-no/${encodeURIComponent(outBillNo)}?mchid=${PAY_CONFIG.mchid}`
  )
  return { status: res.status, data: res.data || {} }
}

/**
 * 查微信那边到底有没有这张转账单 —— 冲正前唯一的依据。
 *
 * 踩过的坑：接口返回「请求中含有未在API文档中定义的参数」时，我们当失败把余额退回去了，
 * 但钱其实已经打出去了（用户微信里到账了，系统显示未到账）。
 * 所以任何「失败」结论落地前，都必须先问微信：这张单存在吗？状态是什么？
 *
 * 返回 { known, exists, state, raw }：
 *   known=false → 查询本身失败，结论未知，不许冲正
 *   exists=false → 微信确认没有这张单，可以安全冲正
 */
async function probeBillState(no) {
  try {
    const r = await wxQueryTransfer(no)
    const d = (r && r.data) || {}
    if (Number(r && r.status) === 200 && d.state) {
      return { known: true, exists: true, state: String(d.state), raw: d }
    }
    const code = String(d.code || '')
    const msg = String(d.message || '')
    if (/NOT_FOUND|NOT_EXIST|ORDER_NOT_EXIST|BILL_NOT_EXIST/i.test(code) || /不存在|未找到/.test(msg)) {
      return { known: true, exists: false, state: '', raw: d }
    }
    return { known: false, exists: false, state: '', raw: d }
  } catch (e) {
    return { known: false, exists: false, state: '', raw: {} }
  }
}

/** 转账失败时把提现冲正：余额加回去、累计已提现减掉、补一条退回流水 */
async function rollbackWithdraw(uid, amountCent, reason) {
  await C.db.collection(C.COLL.wallets).doc(uid).update({
    balance_cent: C.dbCmd.inc(amountCent),
    withdrawn_cent: C.dbCmd.inc(-amountCent),
    update_time: Date.now()
  })
  await C.db.collection(C.COLL.transactions).add(
    C.txDoc({
      type: C.TX_TYPE.WITHDRAW,
      uid,
      taskId: '',
      amountCent,
      remark: `提现失败退回：${String(reason || '转账失败').slice(0, 20)}`,
      key: `withdraw-rollback:${uid}:${Date.now()}`
    })
  )
}

/* ------------------------------------------------------------------ */
/* 提现单（每笔提现一条记录，状态可追踪、失败可重试、后台可核查）        */
/* ------------------------------------------------------------------ */

/** 还在途中的微信转账状态 */
const WD_IN_FLIGHT = ['pending', 'ACCEPTED', 'TRANSFERING', 'PROCESSING', 'WAIT_USER_CONFIRM']

function wdStateText(s) {
  const map = {
    pending: '提交中',
    ACCEPTED: '已受理',
    TRANSFERING: '转账中',
    PROCESSING: '转账中',
    WAIT_USER_CONFIRM: '待确认收款',
    SUCCESS: '已到账',
    FAIL: '转账失败',
    CANCELLED: '已取消',
    CANCELING: '取消中',
    EXPIRED: '已过期'
  }
  return map[s] || s || '未知'
}

async function wdGet(no) {
  try {
    const r = await C.db.collection(C.COLL.withdrawals).doc(no).get()
    return (r.data && r.data[0]) || null
  } catch (e) {
    return null
  }
}

async function wdAdd(doc) {
  try {
    await C.db.collection(C.COLL.withdrawals).add(doc)
    return true
  } catch (e) {
    // 集合还没建也要能把提现走完，只是后台少一条记录
    console.warn('[xyyx-pay] 提现单写入失败（请确认已创建 yyx-withdrawals 集合）：', e && e.message)
    return false
  }
}

async function wdPatch(no, patch) {
  try {
    await C.db
      .collection(C.COLL.withdrawals)
      .doc(no)
      .update(Object.assign({ update_time: Date.now() }, patch))
  } catch (e) {}
}

/**
 * 把微信返回的转账状态落到提现单上。
 *
 * **铁律：只要微信那边有这张单，就绝不冲正。**
 * 之前就是「接口报参数错误 → 当失败 → 余额退回」，
 * 但钱其实已经到账，结果用户微信里收到钱、系统显示失败还把钱退回去了（一笔钱记成两笔）。
 * 现在所有「失败」结论落地前，先用 probeBillState 问一次微信：
 *   有单且成功/在途 → 按真实状态落库，不退钱
 *   有单但确认失败/取消/过期 → 才冲正
 *   查不到（网络/权限问题）→ 标 pending 等定时任务再对账，不擅自退钱
 */
async function applyTransferState(doc, data, httpStatus) {
  const no = doc._id
  let state = String((data && data.state) || '')
  const failReason = String((data && (data.fail_reason || data.message)) || '').slice(0, 120)
  const billNo = (data && data.transfer_bill_no) || ''
  const variant = Number((data && data.wx_variant) || 0)

  if (state === 'SUCCESS') {
    await wdPatch(no, {
      state: 'SUCCESS',
      transfer_bill_no: billNo,
      fail_reason: '',
      finish_time: Date.now(),
      wx_variant: variant
    })
    return 'SUCCESS'
  }

  const bad = state === 'FAIL' || state === 'CANCELLED' || state === 'EXPIRED' || (httpStatus && Number(httpStatus) !== 200)
  if (!bad) {
    await wdPatch(no, { state: state || 'PROCESSING', transfer_bill_no: billNo, wx_variant: variant })
    return state || 'PROCESSING'
  }

  // ---- 失败结论落地前，先问微信 ----
  const probe = await probeBillState(no)
  if (!probe.known) {
    await wdPatch(no, {
      state: 'pending',
      fail_reason: ('待核对：' + (failReason || '微信查询失败')).slice(0, 120)
    })
    return 'pending'
  }
  if (probe.exists && probe.state) {
    const ps = probe.state
    const stillAlive = ps === 'SUCCESS' || WD_IN_FLIGHT.indexOf(ps) >= 0
    if (stillAlive) {
      await wdPatch(no, {
        state: ps,
        transfer_bill_no: (probe.raw && probe.raw.transfer_bill_no) || billNo,
        fail_reason: '',
        wx_variant: variant
      })
      return ps
    }
    // 微信确认失败/取消/过期 → 允许冲正，用微信给的状态
    state = ps
  }

  let rolled = false
  try {
    const upd = await C.db
      .collection(C.COLL.withdrawals)
      .where({ _id: no, rolled_back: C.dbCmd.neq(true) })
      .update({
        state: state || 'FAIL',
        rolled_back: true,
        fail_reason: failReason || '转账失败',
        finish_time: Date.now(),
        update_time: Date.now()
      })
    rolled = Boolean(upd && upd.updated)
  } catch (e) {
    rolled = false
  }

  if (!rolled) {
    await wdPatch(no, { state: state || 'FAIL', fail_reason: failReason || '转账失败' })
    return state || 'FAIL'
  }

  try {
    await rollbackWithdraw(doc.user_id, Number(doc.amount_cent) || 0, failReason || state)
  } catch (e) {
    console.error('[xyyx-pay] 提现冲正失败，需人工核账', doc._id, e && e.message)
  }
  return state || 'FAIL'
}

/**
 * 真正发起一笔转账：登记提现单 → 调微信 → 落状态。
 * requestWithdraw（用户发起）和 adminReissueWithdraw（后台重发）共用。
 *
 * reuse=true 表示复用原来那张提现单号（微信要求：资金不足等可重试的失败要「原单号重试」，
 * 换单号会让微信那边多出一笔记录，也容易对不上账）。
 */
async function issueTransfer({ uid, amountCent, outBillNo, openid, source, reuse }) {
  const now = Date.now()
  const doc = {
    _id: outBillNo,
    user_id: uid,
    amount_cent: amountCent,
    state: 'pending',
    rolled_back: false,
    fail_reason: '',
    transfer_bill_no: '',
    source: source || 'user',
    create_time: now,
    update_time: now
  }

  if (reuse) {
    const old = await wdGet(outBillNo)
    doc.create_time = (old && old.create_time) || now
    await wdPatch(outBillNo, {
      state: 'pending',
      rolled_back: false,
      fail_reason: '',
      transfer_bill_no: '',
      retry_count: (Number(old && old.retry_count) || 0) + 1
    })
  } else {
    await wdAdd(doc)
  }

  let r
  try {
    r = await wxTransfer(transferBody({ openid, amountCent, outBillNo }))
  } catch (e) {
    const ip = await egressIp()
    await wdPatch(outBillNo, { egress_ip: ip })
    await applyTransferState(doc, { state: 'FAIL', fail_reason: '网络异常' }, 0)
    const err = new C.BizError(500, `微信转账请求失败${ip ? '（出口IP ' + ip + '）' : ''}，金额已退回，请稍后再试`)
    err.outBillNo = outBillNo
    throw err
  }

  const d = (r && r.data) || {}
  const state = await applyTransferState(doc, d, r && r.status)
  const okState = state !== 'FAIL' && state !== 'CANCELLED' && state !== 'EXPIRED'
  if (!okState) {
    const ip = await egressIp()
    // 记下这次用的出口 IP + 微信原始返回：后台能直接看到「该加白名单的是哪个 IP」，
    // 参数类报错也能看到 wechat 的 detail（哪个字段不合法），不用再猜
    await wdPatch(outBillNo, {
      egress_ip: ip,
      wx_code: d.code || '',
      wx_resp: JSON.stringify(d).slice(0, 600)
    })
    const reason = d.message || d.fail_reason || `HTTP ${r.status}`
    const err = new C.BizError(
      400,
      `微信转账失败：${reason}${ip ? '（出口IP ' + ip + '）' : ''}。${TRANSFER_IP_WHITELIST_HINT}`
    )
    err.outBillNo = outBillNo
    throw err
  }
  return { state, data: d, outBillNo }
}

/** 提现单对外的样子（客户端/后台共用，不暴露内部字段） */
function wdPub(d) {
  const amount = Number(d.amount_cent) || 0
  return {
    out_bill_no: d._id,
    amount: C.yuan(amount),
    amount_cent: amount,
    state: d.state || '',
    state_text: wdStateText(d.state),
    fail_reason: d.fail_reason || '',
    rolled_back: Boolean(d.rolled_back),
    transfer_bill_no: d.transfer_bill_no || '',
    mchid: PAY_CONFIG.mchid || '',
    appid: PAY_CONFIG.appid || '',
    create_time: d.create_time || 0
  }
}

const api = {

  /**
   * 查云函数出口 IP（配「商家转账 → 接口安全IP」白名单用）。
   * 连查 3 轮，把不同实例/不同 NAT 出口的地址都收进来。
   */
  async checkEgressIp() {
    const info = typeof this.getClientInfo === 'function' ? this.getClientInfo() : {}
    if (!info || info.source === 'client') await C.requireAdmin(this)

    const ips = []
    for (let i = 0; i < 3; i++) {
      const list = await egressIpList()
      list.forEach((ip) => {
        if (ips.indexOf(ip) < 0) ips.push(ip)
      })
    }
    return C.ok(
      {
        ips,
        tip: '把下面这些 IP 全部加到 微信商户平台 → 产品中心 → 商家转账 → 接口安全IP，保存后 1~5 分钟生效'
      },
      ips.length ? '查到 ' + ips.length + ' 个出口 IP' : '没查到（云函数访问公网受限）'
    )
  },

  /** 支付模式探测，客户端用它决定显示「微信支付」还是「模拟支付」 */
  async getPayMode() {
    return C.ok({ mode: isRealPay() ? 'wechat' : 'mock' })
  },

  /**
   * 提现：直接打款到用户微信零钱（商家转账 · 佣金报酬场景）。
   *
   * 流程：校验 → 扣余额 → 调微信转账 → 需要用户在微信里确认收款 → 轮询/回调更新状态。
   * 转账请求失败或返回 FAIL 时，自动把余额/累计已提现冲正，避免「扣了钱没到账」。
   */
  async requestWithdraw(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) === 2, 403, '骑手认证通过后才能提现')

    const amountCent = Math.round(Number(data.amount) * 100)
    C.assert(Number.isFinite(amountCent) && amountCent > 0, 400, '提现金额不合法')
    const s = C.S()
    const minCent = Math.round(s.minWithdrawYuan * 100)
    C.assert(amountCent >= minCent, 400, `提现金额不能低于 ${s.minWithdrawYuan} 元`)
    C.assert(amountCent <= 20000, 400, '单笔最多提现 200 元，可分几次提')

    const since = todayStart()
    const todayRes = await C.db
      .collection(C.COLL.transactions)
      .where({ user_id: auth.uid, type: C.TX_TYPE.WITHDRAW, create_time: C.dbCmd.gte(since) })
      .orderBy('create_time', 'desc')
      .get()
    const todayTx = todayRes.data || []
    C.assert(todayTx.length < 20, 400, '每天最多提现 20 次，明天再来')
    const todayCent = todayTx.reduce((sum, t) => sum + Math.abs(Number(t.amount_cent) || 0), 0)
    C.assert(todayCent + amountCent <= 50000, 400, '单日累计提现上限 500 元')
    if (todayTx.length) {
      const last = Number(todayTx[0].create_time) || 0
      // 两次提现间隔 1 分钟（1.11.8 起从 10 分钟放宽，配合每天 20 次）
      const wait = 60 * 1000 - (Date.now() - last)
      if (wait > 0) throw new C.BizError(400, `刚提过一次，请 ${Math.ceil(wait / 1000)} 秒后再试`)
    }

    let wallet = await C.ensureWallet(auth.uid)
    const frozen = Number(wallet.frozen_cent) || 0
    if (frozen > 0) {
      await C.db
        .collection(C.COLL.wallets)
        .doc(auth.uid)
        .update({ balance_cent: C.dbCmd.inc(frozen), frozen_cent: 0, update_time: Date.now() })
      wallet = { ...wallet, balance_cent: Number(wallet.balance_cent) + frozen, frozen_cent: 0 }
    }
    C.assert(Number(wallet.balance_cent) >= amountCent, 400, '余额不足')

    const openid = await openidOf(auth.uid)
    C.assert(openid, 400, '缺少微信 openid，请退出小程序重新登录后再试')
    C.assert(isRealPay() || transferMock(), 400, '商户支付未配置，暂时无法提现到微信零钱')

    const outBillNo = 'WD' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const upd = await C.db
      .collection(C.COLL.wallets)
      .where({ _id: auth.uid, balance_cent: C.dbCmd.gte(amountCent) })
      .update({
        balance_cent: C.dbCmd.inc(-amountCent),
        withdrawn_cent: C.dbCmd.inc(amountCent),
        update_time: Date.now()
      })
    C.assert(upd.updated === 1, 409, '余额已变化，请刷新')

    await C.db.collection(C.COLL.transactions).add(
      C.txDoc({
        type: C.TX_TYPE.WITHDRAW,
        uid: auth.uid,
        taskId: '',
        amountCent: -amountCent,
        remark: '提现到微信零钱（商家转账）',
        key: `withdraw:${auth.uid}:${outBillNo}`
      })
    )

    const r = await issueTransfer({ uid: auth.uid, amountCent, outBillNo, openid, source: 'user' })
    const state = r.state
    const after = await C.ensureWallet(auth.uid)
    return C.ok(
      {
        amount: C.yuan(amountCent),
        balance: C.yuan(after.balance_cent),
        out_bill_no: outBillNo,
        state,
        package_info: (r.data && r.data.package_info) || '',
        mchid: PAY_CONFIG.mchid || '',
        appid: PAY_CONFIG.appid || '',
        need_confirm: state === 'WAIT_USER_CONFIRM'
      },
      state === 'WAIT_USER_CONFIRM' ? '请在微信里确认收款' : '提现成功'
    )
  },

  /** 查询自己的提现转账状态（用户确认收款后轮询用） */
  async queryWithdraw(outBillNo) {
    const auth = await C.requireAuth(this)
    const no = C.str(outBillNo, { min: 6, max: 64, name: '提现单号', required: true })
    const doc = await wdGet(no)
    if (doc) C.assert(doc.user_id === auth.uid, 403, '无权查询这笔提现')

    let state = (doc && doc.state) || ''
    let pkg = ''
    if (isRealPay() || transferMock()) {
      try {
        const r = await wxQueryTransfer(no)
        const d = (r && r.data) || {}
        pkg = d.package_info || ''
        state = doc ? await applyTransferState(doc, d, r && r.status) : d.state || ''
      } catch (e) {
        // 查不到就按本地记录的状态返回，不让轮询直接报错
      }
    }
    const latest = (await wdGet(no)) || doc || {}
    return C.ok({
      state,
      state_text: wdStateText(state),
      fail_reason: latest.fail_reason || '',
      transfer_bill_no: latest.transfer_bill_no || '',
      package_info: pkg
    })
  },

  /**
   * 后台对账：以微信侧状态为准，修正本地提现单。
   *
   * 典型场景：接口报错被当成失败、余额退回了，但钱其实已经到账。
   * 这里查到「确实到账」就把误退的余额扣回来（余额不够就标记人工核账），
   * 查到「微信侧真没到账」就保持失败，什么也不退。
   */
  async reconcileWithdraw(data = {}) {
    const info = typeof this.getClientInfo === 'function' ? this.getClientInfo() : {}
    if (!info || info.source === 'client') await C.requireAdmin(this)

    const no = C.str(data.outBillNo, { min: 6, max: 64, name: '提现单号', required: true })
    const doc = await wdGet(no)
    C.assert(doc, 404, '提现单不存在')

    const probe = await probeBillState(no)
    if (!probe.known) return C.ok({ state: doc.state, fixed: false }, '查不到微信侧状态，稍后再试')

    const ps = probe.state
    const billNo = (probe.raw && probe.raw.transfer_bill_no) || ''
    const notPaid = !probe.exists || ps === 'FAIL' || ps === 'CANCELLED' || ps === 'EXPIRED'

    if (notPaid) {
      await wdPatch(no, {
        state: ps || 'FAIL',
        fail_reason: doc.fail_reason || '微信侧确认未到账',
        transfer_bill_no: billNo
      })
      return C.ok({ state: ps || 'FAIL', fixed: false, recharged: false }, '微信侧确认这笔没有到账')
    }

    // 微信侧确实有单：之前如果误退过，把多退的钱扣回来
    if (doc.rolled_back) {
      const amountCent = Number(doc.amount_cent) || 0
      let deducted = false
      try {
        const upd = await C.db
          .collection(C.COLL.wallets)
          .where({ _id: doc.user_id, balance_cent: C.dbCmd.gte(amountCent) })
          .update({
            balance_cent: C.dbCmd.inc(-amountCent),
            withdrawn_cent: C.dbCmd.inc(amountCent),
            update_time: Date.now()
          })
        deducted = Boolean(upd && upd.updated)
      } catch (e) {
        deducted = false
      }

      if (deducted) {
        try {
          await C.db.collection(C.COLL.transactions).add(
            C.txDoc({
              type: C.TX_TYPE.WITHDRAW,
              uid: doc.user_id,
              taskId: '',
              amountCent: -amountCent,
              remark: '提现对账补扣（钱已到账，撤回误退）',
              key: `withdraw-reconcile:${no}`
            })
          )
        } catch (e) {}
        await wdPatch(no, {
          state: ps,
          rolled_back: false,
          fail_reason: '',
          transfer_bill_no: billNo,
          reconciled: true,
          finish_time: ps === 'SUCCESS' ? Date.now() : doc.finish_time || 0
        })
        return C.ok({ state: ps, fixed: true, recharged: true }, '已对账：钱确实到账，已撤回误退的余额')
      }

      await wdPatch(no, {
        state: ps,
        fail_reason: '已到账，但余额不足无法撤回误退，需人工核账',
        transfer_bill_no: billNo,
        reconciled: true
      })
      return C.ok({ state: ps, fixed: true, recharged: false }, '已到账；余额不足，需人工核账')
    }

    await wdPatch(no, { state: ps, fail_reason: '', transfer_bill_no: billNo, reconciled: true })
    return C.ok({ state: ps, fixed: true, recharged: false }, '已按微信状态更新')
  },

  /** 我的提现记录（钱包页显示最近几笔的状态） */
  async myWithdrawals(limit = 10) {
    const auth = await C.requireAuth(this)
    const n = Math.min(20, Math.max(1, Number(limit) || 10))
    try {
      const res = await C.db
        .collection(C.COLL.withdrawals)
        .where({ user_id: auth.uid })
        .orderBy('create_time', 'desc')
        .limit(n)
        .get()
      return C.ok({ list: (res.data || []).map(wdPub) })
    } catch (e) {
      return C.ok({ list: [] })
    }
  },

  /**
   * 同步在途提现的真实状态（定时任务调用）。
   * 用户点了「确认收款」却没回调、或者确认页超时消失，都靠这里兜底把余额冲正。
   */
  async syncWithdrawals() {
    const info = typeof this.getClientInfo === 'function' ? this.getClientInfo() : {}
    // 客户端也能调（方便手动刷新），但只允许管理员，避免被刷接口
    if (info && info.source === 'client') await C.requireAdmin(this)

    const scanned = { n: 0, updated: 0 }
    if (!isRealPay() && !transferMock()) return C.ok({ scanned: 0, updated: 0, tip: '未配置商户支付' })
    try {
      const res = await C.db
        .collection(C.COLL.withdrawals)
        .where({ state: C.dbCmd.in(WD_IN_FLIGHT), rolled_back: C.dbCmd.neq(true) })
        .orderBy('create_time', 'asc')
        .limit(20)
        .get()
      const list = res.data || []
      scanned.n = list.length
      for (const doc of list) {
        // 刚提交的先别查，微信那边还没落状态
        if (Date.now() - (Number(doc.create_time) || 0) < 30000) continue
        let r
        try {
          r = await wxQueryTransfer(doc._id)
        } catch (e) {
          continue
        }
        const before = doc.state
        const st = await applyTransferState(doc, (r && r.data) || {}, r && r.status)
        if (st !== before) scanned.updated++
      }
    } catch (e) {
      console.warn('[xyyx-pay] 同步提现状态失败', e && e.message)
    }
    return C.ok({ scanned: scanned.n, updated: scanned.updated })
  },

  /**
   * 后台重发一笔失败/过期的提现。
   * 失败时钱已经退回余额（rolled_back=true），这里重新扣一次再发起转账，
   * 单号是新的，不会和微信侧历史单冲突。
   */
  async reissueWithdraw(data = {}) {
    const info = typeof this.getClientInfo === 'function' ? this.getClientInfo() : {}
    if (!info || info.source === 'client') await C.requireAdmin(this)

    const no = C.str(data.outBillNo, { min: 6, max: 64, name: '提现单号', required: true })
    const doc = await wdGet(no)
    C.assert(doc, 404, '提现单不存在')
    C.assert(['FAIL', 'CANCELLED', 'EXPIRED'].indexOf(doc.state) >= 0, 400, '只有失败/取消/过期的提现才能重发')
    C.assert(doc.rolled_back, 400, '这笔提现的钱还没退回余额，先核对余额再重发')
    C.assert(isRealPay() || transferMock(), 400, '商户支付未配置，无法重发')

    const uid = doc.user_id
    const amountCent = Number(doc.amount_cent) || 0
    C.assert(amountCent > 0, 400, '提现金额异常')
    const openid = await openidOf(uid)
    C.assert(openid, 400, '该用户缺少微信 openid，让对方重新登录一次小程序')

    const wallet = await C.ensureWallet(uid)
    C.assert(Number(wallet.balance_cent) >= amountCent, 400, '用户当前余额不足，无法重发')

    // 微信明确要求：资金不足这类失败要「原单号重试，请勿更换商户单号」，
    // 所以这里复用原来的 out_bill_no，不再生成新单号。
    const outBillNo = no
    const upd = await C.db
      .collection(C.COLL.wallets)
      .where({ _id: uid, balance_cent: C.dbCmd.gte(amountCent) })
      .update({
        balance_cent: C.dbCmd.inc(-amountCent),
        withdrawn_cent: C.dbCmd.inc(amountCent),
        update_time: Date.now()
      })
    C.assert(upd.updated === 1, 409, '余额已变化，请刷新')

    await C.db.collection(C.COLL.transactions).add(
      C.txDoc({
        type: C.TX_TYPE.WITHDRAW,
        uid,
        taskId: '',
        amountCent: -amountCent,
        remark: '提现重发（商家转账·原单号）',
        key: `withdraw:${uid}:${outBillNo}:r${Date.now().toString(36)}`
      })
    )

    const r = await issueTransfer({ uid, amountCent, outBillNo, openid, source: 'admin', reuse: true })
    return C.ok(
      {
        out_bill_no: outBillNo,
        state: r.state,
        state_text: wdStateText(r.state),
        need_confirm: r.state === 'WAIT_USER_CONFIRM',
        reused: true
      },
      r.state === 'WAIT_USER_CONFIRM' ? '已用原单号重发，需要用户在小程序里确认收款' : '已用原单号重新发起转账'
    )
  },

  /**
   * 创建 JSAPI 预支付单。
   * mock 模式直接返回一个前端可用的假参数，前端确认后调 mockPaySuccess。
   *
   * 金额规则：涨价改单后 due_cent > 0，这里只收差价，不会重复收全款。
   */
  async createJsapiOrder(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const taskId = C.taskIdOf(data.taskId)
    const task = await C.getTask(taskId)

    C.assert(task.publisher_id === auth.uid, 403, '只能支付自己的订单')
    C.assert(task.pay_status !== 'paid', 400, '订单已付清，不需要再支付')
    C.assert(task.status === C.STATUS.PENDING, 400, '订单状态不允许支付')

    const amountCent = payAmountOf(task)
    C.assert(amountCent > 0, 400, '订单金额异常')
    C.assert(amountCent <= 100000, 400, '金额超过单笔上限')

    // 金额以服务端订单为准，客户端传什么都要对上
    if (data.amountCent !== undefined && Number(data.amountCent) !== amountCent) {
      throw new C.BizError(400, '金额不一致，请刷新后重试')
    }

    const isTopup = C.dueCentOf(task) > 0
    const payNo = C.newPayNo(isTopup)
    await stampPendingPay(task, amountCent, payNo)

    if (!isRealPay()) {
      return C.ok({
        mode: 'mock',
        taskId,
        payNo,
        amount: C.yuan(amountCent),
        isTopup,
        tip: isTopup ? '补差价（模拟支付）' : '当前未配置商户证书，走模拟支付（仅开发环境）'
      })
    }

    // 取 openid
    // uni-id-co 在微信小程序端把 openid 存在 wx_openid.mp / wx_openid.mp_<appid>；
    // 旧版本/旧数据可能是 wx_openid['mp-weixin']，这里几种都兼容。
    const userRes = await C.db.collection('uni-id-users').doc(auth.uid).get()
    const wxOpenid = (userRes.data && userRes.data[0] && userRes.data[0].wx_openid) || {}
    const mpKey = Object.keys(wxOpenid).find((k) => (
      k === 'mp' || k === 'mp-weixin' || k.startsWith('mp_') || k.startsWith('mp-weixin_')
    ))
    const openid = mpKey ? wxOpenid[mpKey] : ''
    C.assert(openid, 400, '缺少微信 openid，请重新登录')

    const body = {
      appid: PAY_CONFIG.appid,
      mchid: PAY_CONFIG.mchid,
      description: `校递达-${task.type_text || '跑腿'}${isTopup ? '（补差价）' : ''}`,
      out_trade_no: payNo,
      notify_url: PAY_CONFIG.notifyUrl,
      amount: { total: amountCent, currency: 'CNY' },
      payer: { openid }
    }

    const res = await wxRequest('POST', '/v3/pay/transactions/jsapi', body)
    if (!(res.status === 200 && res.data && res.data.prepay_id)) {
      const wxCode = (res.data && res.data.code) || ''
      const wxMsg = (res.data && res.data.message) || '未知错误'
      console.error('[xyyx-pay] 微信下单失败', res.status, wxCode, wxMsg)
      C.assert(false, 500, `微信下单失败：${wxMsg}${wxCode ? '（' + wxCode + '）' : ''}`)
    }

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
      payNo,
      amount: C.yuan(amountCent),
      isTopup,
      payParams: { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign }
    })
  },

  /**
   * 模拟支付成功。只有未配置商户证书时才允许调用，
   * 避免线上被人拿来白嫖订单。
   */
  async mockPaySuccess(taskId, meta = {}) {
    C.assert(!isRealPay(), 403, '已配置真实支付，禁止使用模拟支付')
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id === auth.uid, 403, '只能支付自己的订单')

    // 正常情况下 createJsapiOrder 已经登记了本轮的 pending_pay_no；
    // 没有的话退回用订单号当 out_trade_no（兼容老流程）
    const payNo = task.pending_pay_no || id
    const r = await markPaid(payNo, `mock_${Date.now()}`, 'mock')
    return C.ok(r, '支付成功（模拟）')
  },

  /** 主动查单（对账/兜底） */
  async queryOrder(taskId) {
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id === auth.uid, 403, '无权查询')

    if (!isRealPay()) return C.ok({ pay_status: task.pay_status, mode: 'mock' })

    // 注意：云函数运行时不支持可选链（?.），这里必须写成兼容 ES2019 的写法，
    // 否则整个云对象会「语法或逻辑异常」，所有方法全部挂掉。
    const list = C.paymentsOf(task)
    const no = task.pending_pay_no || (list.length ? list[list.length - 1].no : '') || id
    const res = await wxRequest('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(no)}?mchid=${PAY_CONFIG.mchid}`)
    return C.ok({ pay_status: task.pay_status, wx: res.data })
  },

  /* ---------------- 退款 ---------------- */

  /**
   * 执行退款（把 beginRefund 登记好的退款单真正提交给微信）。
   *
   * 调用方：
   *   - 小程序客户端（有 token）：只能退自己的订单
   *   - 定时任务/其它云函数（无 token）：只允许推进「已登记、还没退成功」的退款单，
   *     所以即使被恶意调用，最多把一笔本来就要退的钱退掉，无法凭空造退款。
   */
  async refundTask(refundId) {
    const auth = await C.getAuth(this)
    const id = String(refundId || '').trim()
    C.assert(id.length >= 8, 400, '退款单号不合法')

    // 正常传的是退款单 _id；也允许直接传订单号（排查/重试时方便，
    // 客户端只有订单号，不必再暴露退款单 id）
    let refund = null
    const res = await C.db.collection(C.COLL.refunds).doc(id).get()
    refund = (res.data && res.data[0]) || null

    if (!refund) {
      const byTask = await C.db
        .collection(C.COLL.refunds)
        .where({ task_id: id })
        .orderBy('create_time', 'desc')
        .limit(20)
        .get()
      const list = byTask.data || []
      // 优先推进没退成的那一笔
      refund =
        list.find((r) => r.status === 'processing') ||
        list.find((r) => r.status === 'failed') ||
        list[0] ||
        null
    }

    // 订单上写着「退款中/已退」，但根本没有退款单 → 是登记那一步丢的（集合还没建）
    // 这时补建一张再退，属于自愈，不会给正常订单凭空退款
    if (!refund) {
      const t = await C.getTask(id)
      if (C.looksRefunding(t)) {
        const repaired = await C.repairOrphanRefund(t, '退款单丢失，自动补建')
        refund = await C.getRefund(repaired.refundId)
      }
    }
    C.assert(refund, 404, '退款单不存在')

    const task = await C.getTask(refund.task_id)
    if (auth) C.assert(task.publisher_id === auth.uid, 403, '只能退自己的订单')

    if (refund.status === 'success') {
      return C.ok({ status: 'success', already: true, amount: C.yuan(refund.net_cent || refund.amount_cent), fee: C.yuan(refund.fee_cent || 0) }, '已经退过了')
    }

    // 余额退款在 beginRefund 里已经完成
    if (refund.mode !== 'wechat') {
      return C.ok({ status: refund.status, amount: C.yuan(refund.net_cent || refund.amount_cent) }, '已退回余额')
    }

    C.assert(isRealPay(), 400, '未配置微信商户支付，无法原路退款')

    const parts = Array.isArray(refund.parts) ? refund.parts : []
    C.assert(parts.length > 0, 500, '退款单缺少支付明细')

    const results = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.status === 'success') {
        results.push(part)
        continue
      }
      // total 用登记时记下的「这笔支付当时的金额」；
      // 订单改过价之后 task.amount_cent 已经变了，绝不能拿它当 total
      const total = Number(part.total) || paymentCentOf(task, part.no)
      // 退给微信的是净额（已扣 0.6% 通道费）；part.cent 只是毛额，用来占可退额度
      const refundCent = Math.max(1, Number(part.net != null ? part.net : part.cent) || 0)
      C.assert(refundCent <= total, 500, '退款金额超过原支付金额，无法退款')
      const body = {
        out_trade_no: part.no,
        // 每笔支付一个退款单号；同号重试 = 微信侧幂等
        out_refund_no: `${refund.out_refund_no}${i}`.slice(0, 64),
        reason: String(refund.reason || '订单退款').slice(0, 80),
        notify_url: PAY_CONFIG.notifyUrl,
        amount: { refund: refundCent, total, currency: 'CNY' }
      }

      let r
      try {
        r = await wxRequest('POST', '/v3/refund/domestic/refunds', body)
      } catch (e) {
        r = { status: 0, data: { message: (e && e.message) || '网络异常' } }
      }

      const okRefund = r.status === 200 && r.data && r.data.refund_id
      if (!okRefund) {
        const code = (r.data && r.data.code) || ''
        const msg = (r.data && r.data.message) || '退款失败'
        results.push({ ...part, status: 'failed', error: `${msg}${code ? '（' + code + '）' : ''}` })
        continue
      }
      results.push({
        ...part,
        status: 'success',
        wx_refund_id: r.data.refund_id || '',
        wx_status: r.data.status || ''
      })
    }

    const failed = results.filter((p) => p.status === 'failed')
    if (failed.length) {
      // 部分成功也要落库：成功的不能回滚，只把失败的那几笔额度还回去
      await C.failRefund({
        refundId: id,
        parts: results,
        failReason: failed[0].error || '退款失败'
      })
      throw new C.BizError(500, `退款失败：${failed[0].error || '未知原因'}`)
    }

    await C.finishRefund({ refundId: id, status: 'success', parts: results })
    const netCent = Number(refund.net_cent || refund.amount_cent) || 0
    const feeCent = Number(refund.fee_cent) || 0
    return C.ok(
      { status: 'success', amount: C.yuan(netCent), fee: C.yuan(feeCent) },
      `已退款 ¥${C.yuan(netCent)}${feeCent > 0 ? `（已扣通道费 ¥${C.yuan(feeCent)}）` : ''}`
    )
  },

  /** 查询微信退款状态并同步（对账/兜底） */
  async syncRefund(refundId) {
    const id = String(refundId || '').trim()
    const res = await C.db.collection(C.COLL.refunds).doc(id).get()
    const refund = res.data && res.data[0]
    C.assert(refund, 404, '退款单不存在')
    if (!isRealPay() || refund.mode !== 'wechat') return C.ok({ status: refund.status })

    const outRefundNo = `${refund.out_refund_no}0`
    const r = await wxRequest('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`)
    if (r.status !== 200 || !r.data) return C.ok({ status: refund.status, wx: r.data })
    if (r.data.status === 'SUCCESS') {
      await C.finishRefund({ refundId: id, status: 'success' })
      return C.ok({ status: 'success' })
    }
    return C.ok({ status: refund.status, wx_status: r.data.status })
  },

  /**
   * 回调（由 HTTP 触发的云函数 pay-notify 调用，不直接给客户端用）
   * 支付回调：trade_state === SUCCESS → 记账
   * 退款回调：event_type 以 REFUND 开头 → 更新退款单
   */
  async handleNotify(headers = {}, rawBody = '') {
    C.assert(isRealPay(), 400, '未配置真实支付')

    const body = verifyNotify(headers, rawBody)
    const plain = decryptResource(body.resource)

    // 退款结果回调
    if (String(body.event_type || '').startsWith('REFUND')) {
      const outRefundNo = String(plain.out_refund_no || '')
      // 退款单号 = 基号 + 支付序号，所以按前缀匹配最近的在途退款单
      const hit = await C.db
        .collection(C.COLL.refunds)
        .where({ status: 'processing' })
        .orderBy('create_time', 'desc')
        .limit(20)
        .get()
      const refund = (hit.data || []).find((r) => outRefundNo.startsWith(r.out_refund_no)) || null
      if (!refund) {
        console.warn('[xyyx-pay] 退款回调找不到退款单', outRefundNo)
        return C.ok(null, 'ok')
      }
      const ok = plain.refund_status === 'SUCCESS'
      if (ok) await C.finishRefund({ refundId: refund._id, status: 'success' })
      else {
        await C.failRefund({
          refundId: refund._id,
          failReason: `微信退款状态：${plain.refund_status || '未知'}`
        })
      }
      return C.ok(null, 'ok')
    }

    // 支付结果回调
    C.assert(plain.trade_state === 'SUCCESS', 400, '非成功状态')
    await markPaid(plain.out_trade_no, plain.transaction_id, 'wechat')
    return C.ok(null, 'ok')
  }
}

// 统一兜底：把业务异常(BizError)转成 { code, msg }，未知异常压成 500，
// 否则云函数会直接把异常抛给客户端，前端只能看到「用户函数代码异常」。
module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))
