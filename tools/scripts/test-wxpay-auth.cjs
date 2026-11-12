#!/usr/bin/env node
/**
 * 只诊断微信支付 V3 的「商户身份 + appid 绑定 + JSAPI 权限」。
 * 不会真实下单成功：openid 是假的，微信会在参数校验阶段拒绝。
 * 输出微信返回的 status/code/message，不打印任何密钥。
 */
'use strict'

const https = require('https')
const crypto = require('crypto')
const path = require('path')
const cfg = require(path.resolve(__dirname, '..', '..', 'apps', 'user', 'uniCloud-alipay', 'cloudfunctions', 'xyyx-pay', 'pay-config.js'))

const urlPath = '/v3/pay/transactions/jsapi'
const body = JSON.stringify({
  appid: cfg.appid,
  mchid: cfg.mchid,
  description: '校递达-支付诊断',
  out_trade_no: 'DIAG' + Date.now(),
  notify_url: cfg.notifyUrl,
  amount: { total: 1, currency: 'CNY' },
  payer: { openid: 'oTestDiagnosticOpenid0000000000' }
})

const timestamp = Math.floor(Date.now() / 1000).toString()
const nonceStr = crypto.randomBytes(16).toString('hex')
const message = `POST\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`
const signature = crypto.createSign('RSA-SHA256').update(message).sign(cfg.privateKey, 'base64')
const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serialNo}"`

const req = https.request({
  hostname: 'api.mch.weixin.qq.com',
  path: urlPath,
  method: 'POST',
  headers: {
    Authorization: authorization,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'xiaodida-pay-diagnose/1.0'
  },
  timeout: 15000
}, (res) => {
  let data = ''
  res.on('data', (chunk) => { data += chunk })
  res.on('end', () => {
    console.log('HTTP', res.statusCode)
    console.log(data)
  })
})

req.on('timeout', () => req.destroy(new Error('timeout')))
req.on('error', (e) => {
  console.error('REQUEST_ERROR', e.message)
  process.exit(1)
})
req.write(body)
req.end()
