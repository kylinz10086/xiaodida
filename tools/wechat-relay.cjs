'use strict'
/**
 * 微信支付「固定出口 IP」转发器
 *
 * 为什么需要它
 * ------------
 * uniCloud（支付宝云）云函数的公网出口是 NAT 池，出口 IP 会变；
 * 而微信「商家转账到零钱」要求把调用方 IP 加进「接口安全IP」白名单。
 * IP 一变，转账就报「此IP地址不允许调用接口」。
 *
 * 这台机器（有固定公网 IP 的服务器）只做一件事：把云函数发来的请求，
 * 原样转发到 api.mch.weixin.qq.com。微信看到的出口 IP 永远是这台机器的 IP，
 * 加到白名单一次就永久有效。
 *
 * 安全设计
 * --------
 * - 云函数用 HMAC-SHA256 签名（时间戳 + 路径 + body），密钥只存在于
 *   pay-config.js（本地，已 gitignore）和这台机器的环境变量里；
 * - 转发器不接触商户私钥，只透传 header 和 body，签名仍由云函数生成；
 * - 时间戳超过 5 分钟直接拒绝，防止重放；
 * - 建议用 HTTPS（nginx 反代）或至少限制来源 IP。
 *
 * 用法
 * ----
 *   RELAY_SECRET=随机长串 PORT=8787 node tools/wechat-relay.cjs
 *
 *   查这台机器的公网 IP（拿去加白名单）：
 *     curl http://127.0.0.1:8787/ip
 *
 *   pay-config.js 里加：
 *     relay: { url: 'https://relay.example.com/forward', secret: '同一串密钥' }
 */

const http = require('http')
const https = require('https')
const crypto = require('crypto')

const PORT = Number(process.env.PORT || 8787)
const SECRET = String(process.env.RELAY_SECRET || '')
const WX_HOST = 'api.mch.weixin.qq.com'
const MAX_SKEW_MS = 5 * 60 * 1000

if (!SECRET) {
  console.error('缺少 RELAY_SECRET 环境变量，拒绝启动')
  process.exit(1)
}

function hmac(ts, urlPath, body) {
  return crypto.createHmac('sha256', SECRET).update(ts + '\n' + urlPath + '\n' + body).digest('hex')
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function json(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

/** 本机公网出口 IP（用来配微信白名单） */
function publicIp() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (r) => {
      let s = ''
      r.on('data', (d) => (s += d))
      r.on('end', () => {
        try {
          resolve(JSON.parse(s).ip || '')
        } catch (e) {
          resolve('')
        }
      })
    })
    req.on('error', () => resolve(''))
    req.on('timeout', () => {
      req.destroy()
      resolve('')
    })
  })
}

/** 把请求透传给微信 */
function forward(path, method, headers, body) {
  return new Promise((resolve) => {
    const payload = body || ''
    const h = {
      Authorization: headers.authorization || headers.Authorization || '',
      Accept: headers.accept || headers.Accept || 'application/json',
      'Content-Type': headers['content-type'] || headers['Content-Type'] || 'application/json',
      'User-Agent': headers['user-agent'] || headers['User-Agent'] || 'xiaodida-relay/1.0',
      'Content-Length': Buffer.byteLength(payload)
    }
    const req = https.request(
      { hostname: WX_HOST, path, method, headers: h, timeout: 20000 },
      (up) => {
        let s = ''
        up.on('data', (d) => (s += d))
        up.on('end', () => {
          let data = {}
          try {
            data = JSON.parse(s || '{}')
          } catch (e) {
            data = { raw: s }
          }
          resolve({ status: up.statusCode || 0, data })
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ status: 0, data: { message: 'relay timeout' } })
    })
    req.on('error', (e) => resolve({ status: 0, data: { message: 'relay error: ' + e.message } }))
    if (payload) req.write(payload)
    req.end()
  })
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/ip' || req.url === '/ip/')) {
    return publicIp().then((ip) => json(res, 200, { ip }))
  }
  if (req.method !== 'POST' || !req.url.startsWith('/forward')) {
    return json(res, 404, { message: 'not found' })
  }

  let raw = ''
  req.on('data', (d) => {
    raw += d
    if (raw.length > 2 * 1024 * 1024) req.destroy()
  })
  req.on('end', async () => {
    const ts = String(req.headers['x-relay-ts'] || '')
    const sign = String(req.headers['x-relay-sign'] || '')
    if (!ts || !sign) return json(res, 401, { message: 'missing signature' })
    if (Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) return json(res, 401, { message: 'stale request' })

    let input
    try {
      input = JSON.parse(raw || '{}')
    } catch (e) {
      return json(res, 400, { message: 'bad json' })
    }
    const urlPath = String(input.path || '')
    const method = String(input.method || 'POST').toUpperCase()
    const body = String(input.body || '')
    if (!urlPath.startsWith('/v3/')) return json(res, 400, { message: 'bad path' })

    // 签名只覆盖 时间戳 + 路径 + body，和云函数侧完全一致
    if (!safeEqual(sign, hmac(ts, urlPath, body))) return json(res, 401, { message: 'bad signature' })

    const out = await forward(urlPath, method, input.headers || {}, body)
    return json(res, 200, out)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`wechat-relay listening on :${PORT}  (POST /forward, GET /ip)`)
})
