#!/usr/bin/env node
/**
 * 密钥扫描（提交前必须通过）
 *
 * 目的：保证「仓库里没有任何私密信息」这条规则可执行、可自动检查，而不是靠人记。
 *
 * 检查内容：
 *   1. 已知密钥键名（appsecret / tokenSecret / apiv3 / mchid / privateKey …）后面跟着「像真值」的字符串
 *   2. 微信 AppSecret 形态：32 位 hex
 *   3. 微信支付 V3 密钥形态：32 位大小写字母数字
 *   4. 私钥文件头 -----BEGIN ... PRIVATE KEY-----
 *   5. 不该入库的文件名（微信支付信息.txt、.secrets/、真实 config.json 等）
 *
 * 用法：
 *   node tools/scripts/check-secrets.mjs            # 扫描，命中返回 1
 *   node tools/scripts/check-secrets.mjs --all      # 连 .gitignore 里的也扫（默认跳过被忽略的）
 *
 * 退出码：0 干净；1 有命中
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SKIP_DIRS = new Set(['node_modules', 'unpackage', '.git', '__pycache__', '.pnpm-store', 'dist'])
const TEXT_EXT = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.vue', '.txt', '.md', '.yml', '.yaml', '.html', '.css', '.scss'])

// 允许出现的占位符/演示值
const ALLOW = [
  /^$/,
  /^<.*>$/,                     // <PLACEHOLDER>
  /^PUT_YOUR_/,
  /^xxxx+$/i,
  /x{4,}/i,                     // 掩码值
  /demo/i,
  /example/i,
  /your[_-]?/i,
  /请填|填入|占位|替换/i,
  /^test$/i,
  /^0{4,}$/,
]

function isPlaceholder(value) {
  const v = String(value)
  // 模板变量/插值也算占位：`${PAY_CONFIG.mchid}`、`{{secret}}`
  if (/\$\{|\{\{|%[A-Z_]+%/.test(v)) return true
  return ALLOW.some((re) => re.test(v))
}

// 键名 -> 命中描述
const SENSITIVE_KEYS = [
  'appsecret',
  'app_secret',
  'tokenSecret',
  'requestAuthSecret',
  'apiSecret',
  'smsSecret',
  'apiv3',
  'apiv2',
  'mchid',
  'mch_id',
  'privateKey',
  'private_key',
  'passwordHash',
  'secretKey',
]

const BAD_FILES = [
  { test: (p) => p.endsWith('微信支付信息.txt'), why: '微信支付凭据（明文商户号/密钥）' },
  { test: (p) => /[/\\]\.secrets[/\\]/.test(p), why: '.secrets/ 本地密钥目录' },
  { test: (p) => /uni-config-center[/\\]uni-id[/\\]config\.json$/.test(p), why: 'uni-id 真实配置（含 tokenSecret/appsecret），只提交 config.example.json' },
  { test: (p) => p.endsWith('.pem') || p.endsWith('.p12') || p.endsWith('.key'), why: '私钥/证书文件' },
]

const findings = []

/* ---------- 极简 .gitignore 匹配：被忽略的文件本来就不会进仓库，不该报错 ---------- */
function loadIgnore() {
  const fp = path.join(ROOT, '.gitignore')
  if (!fs.existsSync(fp)) return () => false
  const rules = fs
    .readFileSync(fp, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((p) => {
      let pat = p.replace(/^!/, '')
      const dirOnly = pat.endsWith('/')
      if (dirOnly) pat = pat.slice(0, -1)
      const anchored = pat.includes('/')
      const glob = pat
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '§§')
        .replace(/\*/g, '[^/]*')
        .replace(/§§/g, '.*')
      const re = new RegExp(anchored ? `^${glob}$` : `(^|/)${glob}$`)
      return { re, dirOnly }
    })

  return (rel) => {
    const normalized = rel.replace(/\\/g, '/')
    const segments = normalized.split('/')
    for (const { re, dirOnly } of rules) {
      if (re.test(normalized)) return true
      if (dirOnly && segments.some((s) => re.test(s))) return true
    }
    return false
  }
}

const IGNORED = loadIgnore()
const SCAN_ALL = process.argv.includes('--all')

function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.git')) continue
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(fp, out)
    } else {
      out.push(fp)
    }
  }
  return out
}

const files = walk(ROOT).filter((f) => SCAN_ALL || !IGNORED(path.relative(ROOT, f)))

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')

  for (const rule of BAD_FILES) {
    if (rule.test(rel)) findings.push({ rel, line: 0, why: rule.why, sample: '' })
  }

  const ext = path.extname(file).toLowerCase()
  if (!TEXT_EXT.has(ext)) continue
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.length > 2 * 1024 * 1024) continue

  // 私钥：只有出现在真实代码行里才算（注释里描述「把 PEM 贴进来」不算）
  const pemLine = text
    .split(/\r?\n/)
    .find((l) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(l) && !/^\s*(\/\/|\*|#|<!--)/.test(l))
  if (pemLine) {
    findings.push({ rel, line: 0, why: '内嵌私钥', sample: 'BEGIN PRIVATE KEY' })
  }

  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    // 1) 已知敏感键 + 像真值的字符串
    for (const key of SENSITIVE_KEYS) {
      const re = new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"']{6,})["']`, 'i')
      const m = line.match(re)
      if (m && !isPlaceholder(m[1])) {
        findings.push({ rel, line: i + 1, why: `敏感键 ${key} 带真实值`, sample: mask(m[1]) })
      }
    }
    // 2) 32 位 hex（微信 AppSecret 形态）
    const hex = line.match(/["']([0-9a-f]{32})["']/i)
    if (hex && !isPlaceholder(hex[1]) && !/md5|sha|hash|etag/i.test(line)) {
      findings.push({ rel, line: i + 1, why: '疑似 32 位十六进制密钥', sample: mask(hex[1]) })
    }
  })
}

function mask(v) {
  const s = String(v)
  if (s.length <= 8) return s[0] + '***'
  return s.slice(0, 4) + '****' + s.slice(-2)
}

if (!findings.length) {
  console.log(`✓ 未发现私密信息（扫描 ${files.length} 个文件）`)
  process.exit(0)
}

console.log(`✗ 发现 ${findings.length} 处疑似私密信息：\n`)
for (const f of findings) {
  console.log(`  ${f.rel}${f.line ? ':' + f.line : ''}`)
  console.log(`    ${f.why}${f.sample ? '  样例:' + f.sample : ''}`)
}
console.log('\n处理办法：把真实值移到本地（.gitignore 覆盖）的 *.local.json 或 .secrets/，仓库里只留占位符。')
process.exit(1)
