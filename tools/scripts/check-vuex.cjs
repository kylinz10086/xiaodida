#!/usr/bin/env node
/**
 * Vuex action 静态检查
 *
 * 抓「页面 dispatch 了一个 store 里不存在的 action」这类问题。
 * 之前登录/资料保存失败就是这种错：dispatch('setUserData') / ('updateUserInfo')
 * 在 store 里根本没有定义，运行时才报 unknown action type。
 *
 * 用法：node tools/scripts/check-vuex.cjs
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const USER_APP = path.join(ROOT, 'apps', 'user')

function blockAfter(src, key) {
  const name = key.replace(/[^A-Za-z]/g, '')
  const re = new RegExp('\\b' + name + '\\s*:')
  const m = re.exec(src)
  if (!m) return ''
  const i = m.index
  const start = src.indexOf('{', i)
  if (start < 0) return ''
  let depth = 0
  let quote = ''
  for (let j = start; j < src.length; j++) {
    const c = src[j]
    if (quote) {
      if (c === '\\') j++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return src.slice(start + 1, j)
    }
  }
  return ''
}

function actionNames(file) {
  const src = fs.readFileSync(file, 'utf8')
  const body = blockAfter(src, 'actions:')
  return new Set([...body.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]))
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'unpackage', 'uni_modules', 'uview-ui', 'static'].includes(e.name)) walk(p, out)
    } else if (/\.(vue|js)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

const storeActions = actionNames(path.join(USER_APP, 'store', 'index.js'))
const riderActions = actionNames(path.join(USER_APP, 'store', 'rider.js'))
const missing = []

for (const f of walk(USER_APP)) {
  const s = fs.readFileSync(f, 'utf8')
  const rel = path.relative(USER_APP, f)

  for (const m of s.matchAll(/dispatch\(\s*['"]([^'"]+)['"]/g)) {
    const n = m[1]
    if (!storeActions.has(n) && !riderActions.has(n)) missing.push(`${rel}: dispatch('${n}')`)
  }

  for (const m of s.matchAll(/mapActions\(\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
      if (!storeActions.has(q[1])) missing.push(`${rel}: mapActions('${q[1]}')`)
    }
  }

  for (const m of s.matchAll(/mapActions\(\s*['"]rider['"]\s*,\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
      if (!riderActions.has(q[1])) missing.push(`${rel}: mapActions('rider','${q[1]}')`)
    }
  }
}

console.log(`store actions ${storeActions.size} 个，rider actions ${riderActions.size} 个`)
if (missing.length) {
  missing.forEach((x) => console.log('  ✗ ' + x))
  process.exit(1)
}
console.log('✓ 所有 dispatch / mapActions 都有对应 action')
