#!/usr/bin/env node
/**
 * 原生小程序静态校验（无依赖）
 *
 * 校验项：
 *   1. WXML 标签是否闭合平衡
 *   2. 绑定的事件处理函数（bindtap/catchtap/...）在对应 .js 里是否存在
 *   3. wx:for 是否带 wx:key
 *   4. app.json 里登记的页面文件是否齐全
 *   5. 所有 .json 是否能被解析
 *
 * 用法：node tools/validate.js
 * 退出码：0 全部通过；1 有错
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const errors = []
const warnings = []

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) walk(fp, out)
    else out.push(fp)
  }
  return out
}

const files = walk(ROOT)
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/')

/* ---------------- 1. JSON ---------------- */
for (const f of files.filter((x) => x.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    errors.push(`${rel(f)}: JSON 解析失败 -> ${e.message}`)
  }
}

/* ---------------- 2. app.json 页面完整性 ---------------- */
const appJsonPath = path.join(ROOT, 'app.json')
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
for (const page of appJson.pages || []) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    const fp = path.join(ROOT, page + ext)
    if (!fs.existsSync(fp)) errors.push(`app.json 声明了 ${page}，但缺少 ${page}${ext}`)
  }
}
for (const tab of (appJson.tabBar && appJson.tabBar.list) || []) {
  if (!appJson.pages.includes(tab.pagePath)) errors.push(`tabBar 项 ${tab.pagePath} 不在 pages 列表里`)
  for (const k of ['iconPath', 'selectedIconPath']) {
    if (tab[k] && !fs.existsSync(path.join(ROOT, tab[k]))) errors.push(`tabBar 图标缺失：${tab[k]}`)
  }
}

/* ---------------- 3. WXML 标签平衡 ---------------- */
const SELF_CLOSING = new Set(['image', 'input', 'icon', 'progress', 'checkbox', 'radio', 'switch', 'slider', 'textarea'])

function checkWxml(file) {
  const src = fs.readFileSync(file, 'utf8')
  const stack = []
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  let m
  while ((m = tagRe.exec(src))) {
    const [, closing, name, attrs, selfClose] = m
    if (selfClose) continue
    if (closing) {
      const top = stack.pop()
      if (!top) {
        errors.push(`${rel(file)}: 多余的 </${name}>`)
      } else if (top !== name) {
        errors.push(`${rel(file)}: 标签不匹配，期望 </${top}>，实际 </${name}>`)
      }
    } else {
      // 用到的属性留到事件检查
      stack.push(name)
    }
  }
  if (stack.length) errors.push(`${rel(file)}: 以下标签未闭合 -> ${stack.join(', ')}`)

  // wx:for 必须带 wx:key
  const forRe = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)wx:for=(?:"[^"]*"|'[^']*')((?:[^>"']|"[^"]*"|'[^']*')*?)>/g
  while ((m = forRe.exec(src))) {
    const attrs = m[2] + m[3]
    if (!/wx:key=/.test(attrs)) warnings.push(`${rel(file)}: <${m[1]}> 用了 wx:for 但没有 wx:key`)
  }

  return src
}

/* ---------------- 4. 事件处理函数存在性 ---------------- */
function collectPageMethods(jsFile) {
  const src = fs.readFileSync(jsFile, 'utf8')
  const names = new Set()
  // ES6 方法简写：2 空格缩进的 name(
  const re = /^\s{0,4}([A-Za-z_$][\w$]*)\s*\(/gm
  let m
  while ((m = re.exec(src))) names.add(m[1])
  return names
}

const pages = (appJson.pages || []).map((p) => path.join(ROOT, p))

for (const page of pages) {
  const wxml = page + '.wxml'
  const js = page + '.js'
  if (!fs.existsSync(wxml) || !fs.existsSync(js)) continue
  const src = checkWxml(wxml)
  const methods = collectPageMethods(js)

  const bindRe = /\b(?:bind|catch|capture-bind|capture-catch|mut-bind):?([a-zA-Z]+)="([^"{}]+)"/g
  let m
  while ((m = bindRe.exec(src))) {
    const handler = m[2].trim()
    if (!handler) continue
    if (!methods.has(handler)) {
      errors.push(`${rel(wxml)}: 事件 ${m[0]} 指向的 ${handler}() 在 ${rel(js)} 里找不到`)
    }
  }
}

// 单独出现的 .wxml（如未登记的）也做一次标签检查
for (const wf of files.filter((x) => x.endsWith('.wxml') && !pages.some((p) => x === p + '.wxml'))) {
  checkWxml(wf)
}

/* ---------------- 输出 ---------------- */
console.log(`检查文件：${files.length} 个`)
if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 条：`)
  warnings.forEach((w) => console.log('  ! ' + w))
}
if (errors.length) {
  console.log(`\n错误 ${errors.length} 条：`)
  errors.forEach((e) => console.log('  ✗ ' + e))
  process.exit(1)
}
console.log('✓ 全部通过')
