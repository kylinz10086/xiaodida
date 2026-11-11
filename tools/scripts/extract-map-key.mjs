#!/usr/bin/env node
/**
 * 把页面里硬编码的腾讯地图 key 抽到单独的本地配置文件。
 *
 * 为什么：key 写死在 8 个 .vue 里，等于跟着仓库一起公开，别人可以拿去刷你的配额。
 * 抽出来后：apps/user/common/map-key.js 本地保留（已 gitignore），
 * 仓库里只有 map-key.example.js。
 *
 * 用法：node tools/scripts/extract-map-key.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = path.join(ROOT, 'apps', 'user')
const KEY_RE = /(['"])[0-9a-f]{32}\1/

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'unpackage'].includes(e.name)) walk(fp, out)
    } else if (e.name.endsWith('.vue')) out.push(fp)
  }
  return out
}

const files = walk(APP)
const hits = []

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)
  let found = null
  for (const line of lines) {
    if (/\bkey\s*:\s*/.test(line)) {
      const m = line.match(KEY_RE)
      if (m) {
        found = m[0].slice(1, -1)
        break
      }
    }
  }
  if (!found) continue
  hits.push({ file, key: found })
}

if (!hits.length) {
  console.log('没有发现硬编码的地图 key（可能已处理过）')
  process.exit(0)
}

const key = hits[0].key
if (new Set(hits.map((h) => h.key)).size > 1) {
  console.log('! 发现多个不同的 key，先人工确认：')
  for (const h of hits) console.log('  ', path.relative(ROOT, h.file), h.key.slice(0, 6) + '...')
  process.exit(1)
}

const commonDir = path.join(APP, 'common')
fs.mkdirSync(commonDir, { recursive: true })

const localFile = path.join(commonDir, 'map-key.js')
const exampleFile = path.join(commonDir, 'map-key.example.js')

fs.writeFileSync(
  localFile,
  `// 腾讯位置服务 KEY（本地文件，已 gitignore，不入库）\n// 申请地址：https://lbs.qq.com/dev/console/application/mine\nexport default '${key}'\n`,
  'utf8'
)
fs.writeFileSync(
  exampleFile,
  `// 腾讯位置服务 KEY —— 复制本文件为 map-key.js 并填入自己的 key\n// 申请地址：https://lbs.qq.com/dev/console/application/mine\nexport default ''\n`,
  'utf8'
)

let touched = 0
for (const { file } of hits) {
  let src = fs.readFileSync(file, 'utf8')
  const before = src
  src = src.replace(new RegExp(KEY_RE.source, 'g'), (m, q) => `MAP_KEY`)

  // 保证有 import
  if (!/from\s+['"]@\/common\/map-key\.js['"]/.test(src)) {
    const m = src.match(/<script[^>]*>\s*\n/)
    if (m) {
      const idx = m.index + m[0].length
      src = src.slice(0, idx) + `\timport MAP_KEY from '@/common/map-key.js'\n` + src.slice(idx)
    } else {
      console.log('  ! 没找到 <script> 标签，跳过:', path.relative(ROOT, file))
      continue
    }
  }
  if (src !== before) {
    fs.writeFileSync(file, src, 'utf8')
    touched++
    console.log('  ✓', path.relative(ROOT, file).replace(/\\/g, '/'))
  }
}

console.log(`\n完成：${touched} 个文件已改为引用 common/map-key.js`)
console.log(`真实 key 已写入：${path.relative(ROOT, localFile).replace(/\\/g, '/')}（记得 gitignore）`)
