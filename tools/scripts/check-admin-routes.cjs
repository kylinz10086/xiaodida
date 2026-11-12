const fs = require('fs')
const path = require('path')

const root = path.resolve('admin')
const pagesJson = fs.readFileSync(path.join(root, 'pages.json'), 'utf8')

// pages.json 是 JSONC（带注释/尾逗号），这里只提取 path 字符串。
const paths = [...pagesJson.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
const subRoots = [...pagesJson.matchAll(/"root"\s*:\s*"([^"]+)"/g)].map((m) => m[1])

const missing = []
for (const p of paths) {
  // 子包路径已包含 root；主包 path 直接相对 admin。
  const candidates = [
    path.join(root, p + '.vue'),
    path.join(root, p + '.nvue'),
    ...subRoots.map((r) => path.join(root, r, p + '.vue'))
  ]
  if (!candidates.some((f) => fs.existsSync(f))) missing.push(p)
}

// 自定义菜单里的页面也必须存在
const config = fs.readFileSync(path.join(root, 'admin.config.js'), 'utf8')
const menuPaths = [...config.matchAll(/value:\s*'(\/pages\/[^']+)'/g)].map((m) => m[1])
for (const p of menuPaths) {
  if (!fs.existsSync(path.join(root, p.replace(/^\//, '') + '.vue'))) missing.push(p)
}

if (missing.length) {
  console.error('✗ 管理后台死链/缺页：')
  for (const p of [...new Set(missing)]) console.error('  -', p)
  process.exit(1)
}
console.log(`✓ 管理后台页面齐全（${paths.length} 个 pages.json 路径，${menuPaths.length} 个菜单入口）`)
