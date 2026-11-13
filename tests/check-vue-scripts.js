'use strict'
/**
 * 把 .vue 文件里的 <script> 抽出来做语法检查（不需要 HBuilderX）。
 * 用法：node tests/check-vue-scripts.js
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '..')

/** 扫目录而不是维护白名单：新加页面自动纳入检查，删页面也不会留下 SKIP */
function walkVue(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walkVue(p, out)
    else if (name.endsWith('.vue')) out.push(path.relative(ROOT, p).replace(/\\/g, '/'))
  }
  return out
}

const files = [
  ...walkVue(path.join(ROOT, 'apps/user/pages')),
  ...walkVue(path.join(ROOT, 'apps/user/components')),
  ...walkVue(path.join(ROOT, 'admin/pages/xyyx'))
]

let failed = 0

for (const rel of files) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) {
    console.log('SKIP  ' + rel + ' (missing)')
    continue
  }
  const src = fs.readFileSync(abs, 'utf8')
  const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  if (!m) {
    console.log('SKIP  ' + rel + ' (no script block)')
    continue
  }
  const script = m[1]
  // 用 ESM 解析（.mjs）才能过 import/export
  const tmp = path.join(os.tmpdir(), 'vue-check-' + Buffer.from(rel).toString('hex').slice(0, 16) + '.mjs')
  fs.writeFileSync(tmp, script, 'utf8')
  try {
    // SourceTextModule 能只做解析，不执行
    new vm.SourceTextModule(script, { identifier: rel })
    console.log('OK    ' + rel)
  } catch (e) {
    failed++
    console.log('FAIL  ' + rel + '\n      ' + e.message)
  } finally {
    try { fs.unlinkSync(tmp) } catch (err) {}
  }
}

if (failed) {
  console.log('\n' + failed + ' file(s) failed')
  process.exit(1)
}
console.log('\nall script blocks parsed')
