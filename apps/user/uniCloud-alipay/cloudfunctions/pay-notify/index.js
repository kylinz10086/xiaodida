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
