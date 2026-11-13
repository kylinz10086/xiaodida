const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(process.argv[2] || 'admin/unpackage/dist/build/web')
const PORT = Number(process.env.PORT || 5180)
const PREFIX = '/admin'
const CLOUD_HOST = 'env-00jy72ju8b4z.api-hz.cloudbasefunction.cn'

/** 同源反向代理：浏览器只访问 /admin/cloud，避开 uniCloud H5 的跨域限制 */
function proxyCloud(req, res) {
  const targetPath = req.url.slice('/admin/cloud'.length) || '/'
  const headers = { ...req.headers, host: CLOUD_HOST }
  delete headers.origin
  delete headers.referer
  const p = https.request(
    {
      hostname: CLOUD_HOST,
      port: 443,
      path: targetPath,
      method: req.method,
      headers,
      timeout: 60000
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers)
      up.pipe(res)
    }
  )
  p.on('timeout', () => p.destroy(new Error('cloud timeout')))
  p.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('cloud proxy error: ' + e.message)
  })
  req.pipe(p)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
}

http
  .createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0])
    if (url === '/admin/cloud' || url.startsWith('/admin/cloud/')) return proxyCloud(req, res)
    if (url === '/admin') {
      res.writeHead(302, { Location: '/admin/' })
      res.end()
      return
    }
    if (!url.startsWith(PREFIX + '/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Only /admin/ is served')
      return
    }
    let rel = url.slice(PREFIX.length)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.resolve(ROOT, '.' + rel)
    if (!file.startsWith(ROOT)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(res, file)
    // hash 路由：非资源请求回 index.html
    if (!path.extname(rel)) return send(res, path.join(ROOT, 'index.html'))
    send(res, file)
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`admin: http://127.0.0.1:${PORT}/admin/`)
  })
