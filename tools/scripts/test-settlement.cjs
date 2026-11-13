#!/usr/bin/env node
/**
 * 资金记账测试（不需要云端）
 *
 * 验的是钱：`settleTask` 会不会正确把托管金额拆成「骑手 90% + 平台 10%」，
 * 会不会重复记账，退款是不是原路全额。
 *
 * 做法：用一个内存版 MongoDB 子集（支持 doc/where/get/update/add/inc/neq/lte/gt）
 * 把 uniCloud.database() 打桩，然后 require 真实的 xyyx-common，调真实的结算函数。
 *
 * 用法：node tools/scripts/test-settlement.cjs
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')

/** 自动探测 uniCloud-* 目录（阿里云/支付宝云会改名） */
function findUniCloudDir() {
  const userApp = path.resolve(__dirname, '..', '..', 'apps', 'user')
  const preferred = path.join(userApp, 'uniCloud-alipay')
  if (fs.existsSync(preferred)) return preferred
  const hit = fs.existsSync(userApp)
    ? fs.readdirSync(userApp).find((name) => name.startsWith('uniCloud-'))
    : null
  if (!hit) throw new Error(`找不到 uniCloud 目录：${userApp}`)
  return path.join(userApp, hit)
}

const COMMON = path.join(
  findUniCloudDir(),
  'cloudfunctions', 'common', 'xyyx-common', 'index.js'
)

/* ============ 内存版 db ============ */
const tables = {}
function table(name) {
  if (!tables[name]) tables[name] = []
  return tables[name]
}

function matchValue(docVal, condVal) {
  if (condVal && typeof condVal === 'object') {
    if ('__neq' in condVal) return docVal !== condVal.__neq
    if ('__lte' in condVal) return Number(docVal) <= condVal.__lte
    if ('__lt' in condVal) return Number(docVal) < condVal.__lt
    if ('__gte' in condVal) return Number(docVal) >= condVal.__gte
    if ('__gt' in condVal) return Number(docVal) > condVal.__gt
  }
  return docVal === condVal
}

function matches(doc, cond) {
  return Object.keys(cond || {}).every((k) => matchValue(doc[k], cond[k]))
}

function applyPatch(doc, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && '__inc' in v) doc[k] = (doc[k] || 0) + v.__inc
    else doc[k] = v
  }
}

let autoId = 0
function makeQuery(name, cond) {
  const rows = () => table(name).filter((d) => matches(d, cond))
  const q = {
    get: async () => ({ data: rows().map((d) => ({ ...d })) }),
    count: async () => ({ total: rows().length }),
    update: async (patch) => {
      const rs = rows()
      rs.forEach((d) => applyPatch(d, patch))
      return { updated: rs.length }
    },
    remove: async () => {
      const rs = rows()
      tables[name] = table(name).filter((d) => !rs.includes(d))
      return { deleted: rs.length }
    },
    orderBy: () => q,
    skip: () => q,
    limit: () => q
  }
  return q
}

const db = {
  collection: (name) => ({
    doc: (id) => ({
      get: async () => ({ data: table(name).filter((d) => d._id === id).map((d) => ({ ...d })) }),
      update: async (patch) => {
        const d = table(name).find((x) => x._id === id)
        if (!d) return { updated: 0 }
        applyPatch(d, patch)
        return { updated: 1 }
      },
      set: async (doc) => {
        tables[name] = table(name).filter((x) => x._id !== id)
        table(name).push({ ...doc, _id: id })
        return {}
      }
    }),
    where: (cond) => makeQuery(name, cond),
    add: async (doc) => {
      const _id = doc._id || `auto_${++autoId}`
      table(name).push({ ...doc, _id })
      return { id: _id }
    }
  }),
  command: {
    inc: (n) => ({ __inc: n }),
    neq: (v) => ({ __neq: v }),
    lte: (v) => ({ __lte: v }),
    lt: (v) => ({ __lt: v }),
    gte: (v) => ({ __gte: v }),
    gt: (v) => ({ __gt: v }),
    or: (...a) => ({ __or: a }),
    and: (...a) => ({ __and: a })
  }
}

global.uniCloud = { database: () => db, importObject: () => ({}) }
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'uni-id-common') return { createInstance: () => ({ checkToken: async () => ({ uid: 'u1' }) }) }
  return origLoad.call(this, request, parent, isMain)
}

const C = require(COMMON)

/* ============ 断言 ============ */
let pass = 0
const fails = []
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fails.push(name); console.log(`  ✗ ${name}  ${extra}`) }
}

function seedTask(over = {}) {
  const t = {
    _id: 'task_' + Math.random().toString(36).slice(2, 7),
    title: '取快递',
    type: 1,
    amount_cent: 1000,
    status: C.STATUS.ONGOING,
    publisher_id: 'u_pub',
    runner_id: 'u_rider',
    accept_time: Date.now() - 60000,
    create_time: Date.now() - 120000,
    ...over
  }
  table(C.COLL.tasks).push(t)
  return t
}

async function main() {
console.log('1. 正常结算：10 元订单，抽佣 10%')
const t1 = seedTask()
const r1 = await C.settleTask(t1, 'u_pub')
const after1 = table(C.COLL.tasks).find((x) => x._id === t1._id)
ok('骑手收入 9 元（900 分）', after1.rider_income_cent === 900, String(after1.rider_income_cent))
ok('平台佣金 1 元（100 分）', after1.commission_cent === 100, String(after1.commission_cent))
ok('订单状态变成已完成(3)', after1.status === 3)
ok('记录了完成时间', !!after1.complete_time)
ok('记录了确认人', after1.complete_by === 'u_pub')
ok('返回值与库一致', r1.riderIncome === 900 && r1.commission === 100)

const wallet = table(C.COLL.wallets).find((w) => w._id === 'u_rider')
ok('骑手钱包余额 +9 元', wallet && wallet.balance_cent === 900, JSON.stringify(wallet))

const tx1 = table(C.COLL.transactions).filter((x) => x.task_id === t1._id)
ok('产生 3 条流水', tx1.length === 3, String(tx1.length))
ok('有骑手收入 +900', tx1.some((x) => x.type === 'income' && x.amount_cent === 900))
ok('有平台佣金 +100', tx1.some((x) => x.type === 'commission' && x.amount_cent === 100))
ok('有托管出账 -1000', tx1.some((x) => x.type === 'escrow_out' && x.amount_cent === -1000))
ok('每笔都有幂等键', tx1.every((x) => !!x.idempotency_key))

console.log('\n2. 重复结算必须被拒绝')
let dup = false
try {
  await C.settleTask(after1, 'u_pub')
} catch (e) {
  dup = true
}
ok('第二次结算抛错（状态已是 3）', dup)
ok('钱包没有被加两次', table(C.COLL.wallets).find((w) => w._id === 'u_rider').balance_cent === 900)

console.log('\n3. 退款：待接单取消，全额退')
const t2 = seedTask({ status: C.STATUS.PENDING, runner_id: '' })
const rr = await C.refundTask(t2, '用户取消')
const after2 = table(C.COLL.tasks).find((x) => x._id === t2._id)
ok('状态变成已取消(4)', after2.status === 4)
ok('支付状态变成已退款', after2.pay_status === 'refunded', after2.pay_status)
ok('记录退款金额 1000 分', after2.refund_cent === 1000)
ok('记录取消原因', after2.cancel_reason === '用户取消')
ok('返回值正确', rr.refund === 1000)
const tx2 = table(C.COLL.transactions).filter((x) => x.task_id === t2._id)
ok('产生 1 条退款流水', tx2.length === 1 && tx2[0].type === 'refund')
ok('退款是全额', tx2[0].amount_cent === 1000)

console.log('\n4. 非待接单状态不能退款')
let refundBlocked = false
try {
  await C.refundTask(after1, '想退')
} catch (e) {
  refundBlocked = true
}
ok('已完成的单不能退款', refundBlocked)

console.log('\n5. 对账等式：骑手钱包余额 = 流水求和')
const riderTx = table(C.COLL.transactions).filter((x) => x.user_id === 'u_rider')
const sum = riderTx.reduce((a, x) => a + x.amount_cent, 0)
const w = table(C.COLL.wallets).find((x) => x._id === 'u_rider')
ok('流水求和等于钱包余额', sum === w.balance_cent, `流水 ${sum} vs 钱包 ${w.balance_cent}`)

console.log('')
if (fails.length) {
  console.log(`✗ ${fails.length} 项失败，${pass} 项通过`)
  process.exit(1)
}
console.log(`✓ 全部 ${pass} 项断言通过`)
}

main().catch((e) => { console.error(e); process.exit(1) })
