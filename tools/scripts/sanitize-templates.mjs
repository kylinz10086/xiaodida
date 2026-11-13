#!/usr/bin/env node
/**
 * 把模板工程里残留的真实密钥替换成占位符。
 *
 * 为什么需要它：这个仓库最初是几个 DCloud 模板拼起来的，模板的 uni-id config.json
 * 里带着真实的 appsecret / tokenSecret。一次性清洗掉，避免「历史里还留着」。
 *
 * 用法：node tools/scripts/sanitize-templates.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DRY = process.argv.includes('--dry')

// 只清洗「模板/参考」工程，apps/user 的真实配置另有处理（整份 gitignore）
const TARGETS = [
  'admin/uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json',
  'reference/uni-id-login/uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json'
]

const PLACEHOLDERS = {
  tokenSecret: '<TOKEN_SECRET>',
  requestAuthSecret: '<REQUEST_AUTH_SECRET>',
  sensitiveInfoEncryptSecret: ''
}

function scrubOauth(obj) {
  if (!obj || typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      scrubOauth(v)
      continue
    }
    if (typeof v !== 'string') continue
    if (['appsecret', 'apiSecret', 'smsSecret', 'privateKey', 'apiKey', 'smsKey'].includes(k)) {
      if (v && !/^<.*>$/.test(v)) obj[k] = `<${k.toUpperCase()}>`
    }
  }
}

let changed = 0
for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel)
  if (!fs.existsSync(fp)) {
    console.log(`- 跳过（不存在）：${rel}`)
    continue
  }
  const raw = fs.readFileSync(fp, 'utf8')
  let json
  try {
    json = JSON.parse(raw)
  } catch (e) {
    console.log(`! 解析失败，跳过：${rel}  ${e.message}`)
    continue
  }
  let touched = false
  for (const [k, v] of Object.entries(PLACEHOLDERS)) {
    if (k in json && json[k] !== v) {
      json[k] = v
      touched = true
    }
  }
  const before = JSON.stringify(json)
  scrubOauth(json)
  if (JSON.stringify(json) !== before) touched = true

  // passwordSecret 只留 type/version，去掉 value
  if (Array.isArray(json.passwordSecret)) {
    json.passwordSecret = json.passwordSecret.map((p) => {
      const copy = { type: 'scrypt-salted', version: p.version || 1 }
      if (p.value) touched = true
      return copy
    })
  }

  if (!touched) {
    console.log(`- 已干净：${rel}`)
    continue
  }
  if (DRY) {
    console.log(`~ 会清洗：${rel}`)
  } else {
    fs.writeFileSync(fp, JSON.stringify(json, null, 2) + '\n', 'utf8')
    console.log(`✓ 已清洗：${rel}`)
  }
  changed++
}

console.log(DRY ? `\n(dry-run) 待清洗 ${changed} 个文件` : `\n完成，清洗 ${changed} 个文件`)
