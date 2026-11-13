'use strict'
/**
 * pay-notify —— 微信支付 V3 回调的 HTTP 入口
 *
 * 部署后在 uniCloud 控制台给本云函数开启「URL 化 / HTTP 访问服务」，
 * 把公网 HTTPS 地址填到 pay-config.js 的 notifyUrl。
 *
 * 注意：微信要求回调返回 200 + {"code":"SUCCESS","message":"成功"}，
 * 否则会重试；验签/解密逻辑统一在 xyyx-pay.handleNotify 里
 * （支付回调与退款回调都在那里分流）。
 */
exports.main = async (event = {}) => {
  const json = (statusCode, obj) => ({
    mpserverlessComposedResponse: true,
    isBase64Encoded: false,
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
  })

  // ── 只读诊断入口（排查提现失败用）──────────────────────────────
  // GET /pay-notify?k=<DIAG_KEY>  只返回最近几笔提现的状态和失败原因，
  // 不含手机号/昵称/openid 等个人信息。排查完可以删掉这段。
  const DIAG_KEY = 'xyyx-diag-7f3k9q2m5x8v1n4p'
  if (String(event.httpMethod || '').toUpperCase() === 'GET') {
    const q = event.queryStringParameters || {}
    if (String(q.k || '') !== DIAG_KEY) return json(403, { message: 'forbidden' })
    try {
      const db = uniCloud.database()

      // ?k=...&reissue=<out_bill_no>：用原单号重发一笔失败的提现（后台「重发」等价的自动化）
      if (q.reissue) {
        const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
        const r = await pay.reissueWithdraw({ outBillNo: String(q.reissue) })
        return json(200, { ok: r && r.code === 0, code: r && r.code, msg: r && r.msg, data: (r && r.data) || null })
      }

      const wd = await db
        .collection('xyyx-withdrawals')
        .orderBy('create_time', 'desc')
        .limit(8)
        .get()
      let settings = {}
      try {
        const s = await db.collection('xyyx-settings').doc('app').get()
        const d = (s.data && s.data[0]) || {}
        settings = {
          minWithdrawYuan: d.minWithdrawYuan,
          commissionRate: d.commissionRate
        }
      } catch (e) {}
      const list = (wd.data || []).map((d) => ({
        no: d._id,
        amount: (Number(d.amount_cent) || 0) / 100,
        state: d.state,
        fail_reason: d.fail_reason || '',
        egress_ip: d.egress_ip || '',
        wx_code: d.wx_code || '',
        wx_resp: d.wx_resp || '',
        wx_variant: Number(d.wx_variant) || 0,
        rolled_back: Boolean(d.rolled_back),
        retry_count: Number(d.retry_count) || 0,
        source: d.source || '',
        create_time: d.create_time,
        time_text: d.create_time ? new Date(Number(d.create_time) + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) : ''
      }))
      return json(200, { ok: true, settings, list })
    } catch (e) {
      return json(500, { ok: false, message: (e && e.message) || 'diag failed' })
    }
  }

  try {
    const rawHeaders = event.headers || {}
    const headers = {}
    for (const key of Object.keys(rawHeaders)) {
      headers[String(key).toLowerCase()] = rawHeaders[key]
    }

    let rawBody = event.body
    if (rawBody === undefined || rawBody === null) rawBody = ''
    if (event.isBase64Encoded && typeof rawBody === 'string') {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
    } else if (typeof rawBody !== 'string') {
      rawBody = JSON.stringify(rawBody)
    }

    const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
    const res = await pay.handleNotify(headers, rawBody)
    if (res && res.code === 0) {
      return json(200, { code: 'SUCCESS', message: '成功' })
    }
    return json(400, { code: 'FAIL', message: (res && res.msg) || '验签失败' })
  } catch (e) {
    console.error('[pay-notify]', e && e.message)
    return json(400, { code: 'FAIL', message: e && e.message ? e.message : '回调处理失败' })
  }
}
