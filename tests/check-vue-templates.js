'use strict'
/**
 * 检查 .vue 的 <template> 标签是否配对（防止手改模板时漏闭合）。
 * 用法：node tests/check-vue-templates.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

/** 扫目录而不是维护白名单：新加页面自动纳入检查 */
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

const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

let failed = 0

for (const rel of files) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) {
    console.log('SKIP  ' + rel + ' (missing)')
    continue
  }
  const src = fs.readFileSync(abs, 'utf8')

  // 取出最外层 <template>（uni-app 单文件组件）
  const start = src.indexOf('<template>')
  if (start < 0) {
    console.log('SKIP  ' + rel + ' (no template)')
    continue
  }
  // 从 <template> 之后开始，找到最后一个 </template>
  const end = src.lastIndexOf('</template>')
  const body = src.slice(start + '<template>'.length, end)

  // 去掉注释
  const clean = body.replace(/<!--[\s\S]*?-->/g, '')

  const stack = []
  let bad = null
  let m
  // 小程序里 input/image 这类可以只写开标签，按 void 元素处理，避免误报
  const VOID = new Set(['input', 'image', 'img', 'br', 'hr', 'meta', 'link', 'source'])
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(clean))) {
    const closing = m[1] === '/'
    const name = m[2]
    const selfClosing = m[4] === '/'
    if (VOID.has(name)) continue
    if (selfClosing) continue
    if (!closing) {
      stack.push(name)
    } else {
      const top = stack.pop()
      if (top !== name) {
        bad = `闭合标签 </${name}> 与最近的 <${top || '(空)'}> 不匹配`
        break
      }
    }
  }
  if (!bad && stack.length) bad = '未闭合的标签：<' + stack.join('>, <') + '>'

  if (bad) {
    failed++
    console.log('FAIL  ' + rel + '\n      ' + bad)
  } else {
    console.log('OK    ' + rel)
  }
}

if (failed) {
  console.log('\n' + failed + ' file(s) failed')
  process.exit(1)
}
console.log('\nall templates balanced')
