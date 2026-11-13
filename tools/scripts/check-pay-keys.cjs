#!/usr/bin/env node
/**
 * 检查 xyyx-pay 的 pay-config.js 是否具备真实支付条件。
 *
 * 只输出「有没有 / 能不能解析」，绝不打印密钥内容。
 * 用法：node tools/scripts/check-pay-keys.cjs
 * 退出码：0 可真实支付；1 还缺东西或格式不对。
 */
'use strict'

const path = require('path')
const crypto = require('crypto')

const CONFIG = path.resolve(
  __dirname, '..', '..',
  'apps', 'user', 'uniCloud-alipay', 'cloudfunctions', 'xyyx-pay', 'pay-config.js'
)

function line(label, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? '：' + detail : ''}`)
}

let cfg
try {
  cfg = require(CONFIG)
} catch (e) {
  console.error('FAIL  pay-config.js 无法加载（多半是反引号/逗号写错）：' + e.message)
  process.exit(1)
}

let ok = true
const need = (v) => typeof v === 'string' && v.trim().length > 0

if (need(cfg.appid)) line('appid', true)
else { line('appid', false, '为空'); ok = false }

if (need(cfg.mchid)) line('mchid', true)
else { line('mchid', false, '为空'); ok = false }

const serialOk = /^[0-9A-Fa-f]{40}$/.test(String(cfg.serialNo || ''))
line('商户证书序列号', serialOk, serialOk ? '' : '应为 40 位十六进制')
if (!serialOk) ok = false

if (!need(cfg.privateKey)) {
  line('商户 API 私钥', false, '为空')
  ok = false
} else {
  try {
    const key = crypto.createPrivateKey(cfg.privateKey)
    const bits = key.asymmetricKeyDetails && key.asymmetricKeyDetails.modulusLength
    line('商户 API 私钥', key.asymmetricKeyType === 'rsa', `${key.asymmetricKeyType}${bits ? ' ' + bits + 'bit' : ''}`)
    if (key.asymmetricKeyType !== 'rsa') ok = false
  } catch (e) {
    line('商户 API 私钥', false, '解析失败：' + e.message)
    ok = false
  }
}

if (!need(cfg.apiV3Key)) {
  line('APIv3 密钥', false, '为空')
  ok = false
} else {
  const len = Buffer.byteLength(cfg.apiV3Key, 'utf8')
  line('APIv3 密钥', len === 32, len === 32 ? '32 字节' : `当前 ${len} 字节，必须 32 字节`)
  if (len !== 32) ok = false
}

const pubIdOk = /^PUB_KEY_ID_/.test(String(cfg.platformSerial || ''))
line('微信支付公钥 ID', pubIdOk, pubIdOk ? '' : '应以 PUB_KEY_ID_ 开头')
if (!pubIdOk) ok = false

if (!need(cfg.platformPublicKey)) {
  line('微信支付公钥 PEM', false, '为空')
  ok = false
} else {
  try {
    const key = crypto.createPublicKey(cfg.platformPublicKey)
    line('微信支付公钥 PEM', key.asymmetricKeyType === 'rsa', key.asymmetricKeyType)
    if (key.asymmetricKeyType !== 'rsa') ok = false
  } catch (e) {
    line('微信支付公钥 PEM', false, '解析失败：' + e.message)
    ok = false
  }
}

const notifyOk = /^https:\/\/.+/.test(String(cfg.notifyUrl || '')) && !/localhost|127\.0\.0\.1/.test(cfg.notifyUrl)
line('回调地址', notifyOk, cfg.notifyUrl || '为空')
if (!notifyOk) ok = false

console.log('')
console.log(ok ? '结论：配置齐全，可以部署并走真实微信支付。' : '结论：还缺配置，当前会走 mock 支付。')
process.exit(ok ? 0 : 1)
