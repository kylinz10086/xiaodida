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

const api = {
  /** 支付模式探测，客户端用它决定显示「微信支付」还是「模拟支付」 */
  async getPayMode() {
    return C.ok({ mode: isRealPay() ? 'wechat' : 'mock' })
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
