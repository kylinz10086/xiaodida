#!/usr/bin/env node
/**
 * 内部链接/路由静态检查
 *
 * 扫描 user/miniprogram/rider 三个工程里所有 `url: '...'` 跳转，
 * 与 pages.json / app.json 的页面表比对，抓死链。
 *
 * 用法：node tools/scripts/check-routes.cjs
 * 退出码：0 全过；1 有死链
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SKIP_DIRS = new Set(['node_modules', 'unpackage', 'uni_modules', 'uview-ui', 'static', '.git'])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out)
    } else if (/\.(vue|js|wxml)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

function pagesOf(appDir) {
  const pagesJson = path.join(appDir, 'pages.json')
  const appJson = path.join(appDir, 'app.json')
  if (fs.existsSync(pagesJson)) {
    const s = fs.readFileSync(pagesJson, 'utf8')
    return new Set([...s.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map((m) => '/' + m[1]))
  }
  if (fs.existsSync(appJson)) {
    const j = JSON.parse(fs.readFileSync(appJson, 'utf8'))
    return new Set((j.pages || []).map((p) => '/' + p))
  }
  return new Set()
}

function check(label, appDir) {
  const pages = pagesOf(appDir)
  const bad = []
  for (const f of walk(appDir)) {
    const s = fs.readFileSync(f, 'utf8')
    const re = /url\s*:\s*['"`]([^'"`]+)['"`]/g
    let m
    while ((m = re.exec(s))) {
      let u = m[1].trim()
      if (!u.startsWith('/')) continue
      u = u.split('?')[0].replace(/\$\{[^}]*\}/g, 'X')
      if (!pages.has(u)) bad.push(`${path.relative(appDir, f)} -> ${m[1]}`)
    }
  }
  console.log(`${label}: ${pages.size} 个页面，死链 ${bad.length} 条`)
  bad.slice(0, 30).forEach((x) => console.log('  ✗ ' + x))
  return bad
}

const bad = [
  ...check('user', path.join(ROOT, 'apps', 'user')),
  ...check('miniprogram', path.join(ROOT, 'miniprogram')),
  ...check('rider', path.join(ROOT, 'apps', 'rider'))
]

if (bad.length) process.exit(1)
console.log('✓ 全部内部链接都有对应页面')
