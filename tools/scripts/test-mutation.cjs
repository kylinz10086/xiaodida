#!/usr/bin/env node
/**
 * 变异测试（测试「测试」本身）
 *
 * 思路：故意把关键业务规则改错，再跑对应测试；如果测试仍然通过，
 * 说明测试没有守住这条规则（假绿）。每个变异都会在 finally 里还原。
 *
 * 用法：node tools/scripts/test-mutation.cjs
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')

function findUniCloudDir() {
  const userApp = path.join(ROOT, 'apps', 'user')
  const preferred = path.join(userApp, 'uniCloud-alipay')
  if (fs.existsSync(preferred)) return preferred
  const hit = fs.readdirSync(userApp).find((n) => n.startsWith('uniCloud-'))
  return path.join(userApp, hit)
}

const CLOUD = findUniCloudDir()
const COMMON = path.join(CLOUD, 'cloudfunctions', 'common', 'xyyx-common', 'index.js')
const MINI_STORE = path.join(ROOT, 'miniprogram', 'utils', 'store.js')

const mutations = [
  {
    name: '抽佣比例 10% 改成 20%',
    file: COMMON,
    from: 'const COMMISSION_RATE = 0.1',
    to: 'const COMMISSION_RATE = 0.2',
    test: 'tools/scripts/test-settlement.cjs'
  },
  {
    name: '手机号脱敏改成返回完整号',
    file: COMMON,
    from: 'return `${s.slice(0, 3)}****${s.slice(-4)}`',
    to: 'return s',
    test: 'tools/scripts/test-isolation.cjs'
  },
  {
    name: '允许接自己发布的单',
    file: MINI_STORE,
    from: "if (task.publisher_id === user._id) return { code: 400, msg: '不能接取自己发布的任务' }",
    to: "if (false) return { code: 400, msg: '不能接取自己发布的任务' }",
    test: 'miniprogram/tools/simulate.js'
  },
  {
    name: '发布金额上限 1000 改成无限',
    file: MINI_STORE,
    from: 'if (money > 1000) return { code: 400, msg: \'单笔金额不能超过 1000 元\' }',
    to: 'if (false) return { code: 400, msg: \'单笔金额不能超过 1000 元\' }',
    test: 'miniprogram/tools/simulate.js'
  },
  {
    name: '首页发布跳转改成死链',
    file: path.join(ROOT, 'miniprogram', 'pages', 'index', 'index.js'),
    from: 'url: `/pages/publish/publish?type=${type}`',
    to: 'url: `/pages/nope/nope?type=${type}`',
    test: 'tools/scripts/check-routes.cjs'
  }
]

let caught = 0
let weak = 0

for (const m of mutations) {
  const original = fs.readFileSync(m.file, 'utf8')
  if (!original.includes(m.from)) {
    console.log(`✗ 找不到变异点：${m.name}`)
    weak++
    continue
  }

  let result
  try {
    fs.writeFileSync(m.file, original.replace(m.from, m.to))
    result = spawnSync(process.execPath, [path.join(ROOT, m.test)], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000
    })
  } finally {
    fs.writeFileSync(m.file, original)
  }

  const failedAsExpected = result && result.status !== 0
  if (failedAsExpected) {
    caught++
    console.log(`  ✓ 测试抓住了变异：${m.name}`)
  } else {
    weak++
    console.log(`  ✗ 测试没抓住变异（假绿）：${m.name}`)
  }
}

console.log('')
if (weak) {
  console.log(`✗ ${weak} 个变异未被测试发现，${caught} 个被发现`)
  process.exit(1)
}
console.log(`✓ 全部 ${caught} 个变异都被测试发现（测试具备防回归能力）`)
