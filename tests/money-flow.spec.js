'use strict'
/**
 * 订单金额 / 修改订单 / 退款 的回归测试（不需要连 uniCloud）
 *
 * 做法：给云函数补一个「内存版数据库 + 假登录态」，然后直接跑真实的云对象代码。
 *
 * 覆盖的核心场景（也就是这次报的 bug）：
 *   1 元的单改成 3 元 → 只补 2 元差价，总支出 3 元（不是 4 元）
 *   3 元的单改回 1 元 → 退 2 元
 *   再取消订单       → 剩下的 1 元继续退
 *   全程「实付 = 已退 + 未退」，钱既不会丢也不会多退
 *
 * 运行：node tests/money-flow.spec.js
 */

const path = require('path')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const CF = path.join(ROOT, 'apps/user/uniCloud-alipay/cloudfunctions')
const COMMON = path.join(CF, 'common/xyyx-common/index.js')
const USER_OBJ = path.join(CF, 'xyyx-user/index.obj.js')
const PAY_OBJ = path.join(CF, 'xyyx-pay/index.obj.js')

/* ------------------------------------------------------------------ */
/* 1. 内存数据库                                                       */
/* ------------------------------------------------------------------ */

const OP = (op, val) => ({ __op: op, val })
const command = {
  inc: (v) => OP('inc', v),
  push: (v) => OP('push', v),
  neq: (v) => OP('neq', v),
  eq: (v) => OP('eq', v),
  gt: (v) => OP('gt', v),
  gte: (v) => OP('gte', v),
  lt: (v) => OP('lt', v),
  lte: (v) => OP('lte', v),
  in: (v) => OP('in', v),
  and: (...a) => OP('and', a),
  or: (...a) => OP('or', a)
}

const tables = new Map()
let idSeq = 0

function coll(name) {
  if (!tables.has(name)) tables.set(name, new Map())
  return tables.get(name)
}

function matchOne(doc, key, cond) {
  const v = doc[key]
  if (cond && cond.__op) {
    const c = cond.val
    switch (cond.__op) {
      case 'neq': return v !== c
      case 'eq': return v === c
      case 'gt': return Number(v) > Number(c)
      case 'gte': return Number(v) >= Number(c)
      case 'lt': return Number(v) < Number(c)
      case 'lte': return Number(v) <= Number(c)
      case 'in': return Array.isArray(c) && c.includes(v)
      default: throw new Error('unsupported query operator: ' + cond.__op)
    }
  }
  return v === cond
}

function matches(doc, query) {
  if (!query) return true
  return Object.keys(query).every((k) => matchOne(doc, k, query[k]))
}

function applyPatch(doc, patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k]
    if (v && v.__op === 'inc') doc[k] = (Number(doc[k]) || 0) + Number(v.val)
    else if (v && v.__op === 'push') doc[k] = (Array.isArray(doc[k]) ? doc[k] : []).concat(v.val)
    else doc[k] = v
  }
}

function addDoc(name, doc) {
  const d = { ...doc }
  // 真实 uniCloud 的 _id 是 24~32 位，这里也生成足够长的，
  // 否则会被 taskIdOf / refundId 的长度校验挡掉
  if (!d._id) d._id = 'id' + String(++idSeq).padStart(10, '0')
  coll(name).set(d._id, d)
  return { id: d._id }
}

function docApi(name, id) {
  return {
    async get() {
      const d = coll(name).get(id)
      return { data: d ? [d] : [] }
    },
    async update(patch) {
      const d = coll(name).get(id)
      if (!d) return { updated: 0 }
      applyPatch(d, patch)
      return { updated: 1 }
    },
    async set(patch) {
      coll(name).set(id, { ...patch, _id: id })
      return { updated: 1 }
    },
    async remove() {
      const had = coll(name).delete(id)
      return { deleted: had ? 1 : 0 }
    }
  }
}

function collectionApi(name) {
  const state = { q: null, order: null, skip: 0, limit: 1000 }

  function pick() {
    let list = Array.from(coll(name).values()).filter((d) => matches(d, state.q))
    if (state.order) {
      const [f, dir] = state.order
      list = list.slice().sort((a, b) => (dir === 'desc' ? -1 : 1) * ((a[f] || 0) - (b[f] || 0)))
    }
    return list
  }

  const api = {
    where(q) { state.q = q; return api },
    orderBy(f, dir) { state.order = [f, dir]; return api },
    skip(n) { state.skip = n; return api },
    limit(n) { state.limit = n; return api },
    async get() { return { data: pick().slice(state.skip, state.skip + state.limit) } },
    async count() { return { total: pick().length } },
    async update(patch) {
      const list = pick()
      list.forEach((d) => applyPatch(d, patch))
      return { updated: list.length }
    },
    async remove() {
      const list = pick()
      list.forEach((d) => coll(name).delete(d._id))
      return { deleted: list.length }
    },
    doc(id) { return docApi(name, id) },
    async add(doc) { return addDoc(name, doc) }
  }
  return api
}

/* 云对象互调（common.beginRefund 会 importObject('xyyx-pay') 立刻退） */
const registeredObjects = {}

global.uniCloud = {
  database: () => ({ collection: collectionApi, command }),
  importObject: (name) => {
    const target = registeredObjects[name]
    if (!target) throw new Error('cloud object not registered: ' + name)
    // 云函数调用云对象时会丢客户端 token，这里模拟成「无身份的服务端调用」
    const serverCtx = { getUniIdToken: () => '', getClientInfo: () => ({}) }
    const wrapped = {}
    for (const k of Object.keys(target)) {
      if (typeof target[k] === 'function') wrapped[k] = (...args) => target[k].apply(serverCtx, args)
    }
    return wrapped
  }
}

/* ------------------------------------------------------------------ */
/* 2. 假登录态 + 模块别名                                              */
/* ------------------------------------------------------------------ */

const CURRENT_UID = 'pub-user'

const uniIdStub = {
  createInstance: () => ({
    checkToken: async () => ({ uid: CURRENT_UID })
  })
}

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'uni-id-common') return uniIdStub
  if (request === 'xyyx-common') return origLoad.call(this, COMMON, parent, isMain)
  return origLoad.apply(this, arguments)
}

// 先强制 mock 支付（pay-config.js 里是真实商户配置，但测试不联网）
process.env.XYYX_PAY_FORCE_MOCK = '1'

const C = require(COMMON)
const userObj = require(USER_OBJ)
const payObj = require(PAY_OBJ)

const ctx = {
  getUniIdToken: () => 'fake-token',
  getClientInfo: () => ({})
}

/* ------------------------------------------------------------------ */
/* 3. 断言工具                                                          */
/* ------------------------------------------------------------------ */

let passed = 0
const failures = []

function ok(cond, label, extra) {
  if (cond) {
    passed++
    console.log('  [OK] ' + label)
  } else {
    failures.push(label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
    console.log('  [FAIL] ' + label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
  }
}

function eq(actual, expect, label) {
  ok(actual === expect, label, { actual, expect })
}

async function task(id) {
  return coll('xyyx-tasks').get(id)
}

async function call(fn, ...args) {
  return fn.call(ctx, ...args)
}

let n = 0
function meta() {
  return { nonce: 'n_' + Date.now().toString(36) + '_' + (++n) + '_' + 'x'.repeat(40), timestamp: Date.now() }
}

/** 分 -> 元（保留两位） */
function yuanOf(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2))
}

/* ------------------------------------------------------------------ */
/* 4. 用例                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  addDoc('xyyx-users', { _id: 'pub-user', nickname: 'xiaoming', role: 'user', rider_status: 0, mobile: '13800000000' })

  addDoc('xyyx-tasks', {
    _id: 'task-0001',
    title: 'qu kuaidi',
    type: 1,
    type_text: 'kuaidi',
    description: 'cainiao',
    amount_cent: 100,
    paid_cent: 0,
    due_cent: 0,
    refund_cent: 0,
    refund_status: '',
    payments: [],
    status: C.STATUS.PENDING,
    pay_status: 'unpaid',
    publisher_id: 'pub-user',
    runner_id: '',
    create_time: Date.now()
  })

  console.log('\n[1] order 1 yuan then pay')
  const pay1 = await call(payObj.createJsapiOrder, { taskId: 'task-0001', ...meta() })
  eq(pay1.code, 0, 'create pay order ok')
  eq(pay1.data.amount, 1, 'should pay 1 yuan')
  const paid1 = await call(payObj.mockPaySuccess, 'task-0001', meta())
  eq(paid1.code, 0, 'pay ok')
  let t = await task('task-0001')
  eq(C.paidCentOf(t), 100, 'paid 100 cents')
  eq(t.payments.length, 1, 'one payment recorded')
  eq(t.pay_status, 'paid', 'order paid off')

  console.log('\n[2] edit order: 1 yuan -> 3 yuan (the reported bug: used to cost 4)')
  const upd1 = await call(userObj.updateTask, { taskId: 'task-0001', amount: 3, ...meta() })
  eq(upd1.code, 0, 'edit ok')
  eq(upd1.data.needPay, true, 'need top-up')
  eq(upd1.data.payAmount, 2, 'only 2 yuan top-up (not 3 again)')
  t = await task('task-0001')
  eq(t.amount_cent, 300, 'amount now 3 yuan')
  eq(t.due_cent, 200, 'due 200 cents')
  eq(t.pay_status, 'partial', 'pay status partial')
  eq(C.paidCentOf(t), 100, 'still only paid 1 yuan')

  console.log('\n[3] pay the 2 yuan difference')
  const pay2 = await call(payObj.createJsapiOrder, { taskId: 'task-0001', ...meta() })
  eq(pay2.code, 0, 'create top-up order ok')
  eq(pay2.data.amount, 2, 'charge only 2 yuan')
  eq(pay2.data.isTopup, true, 'flagged as top-up')
  const paid2 = await call(payObj.mockPaySuccess, 'task-0001', meta())
  eq(paid2.code, 0, 'top-up ok')
  t = await task('task-0001')
  eq(C.paidCentOf(t), 300, 'total paid 300 cents')
  eq(C.dueCentOf(t), 0, 'no due left')
  eq(t.pay_status, 'paid', 'paid off again')
  eq(t.payments.length, 2, 'two payments')
  eq(t.payments.reduce((s, p) => s + p.cent, 0), 300, 'sum of payments is 3 yuan, not overcharged')

  console.log('\n[3b] 支付单登记（迟到的支付也能找到自己的订单）')
  const payorders = Array.from(coll('xyyx-payorders').values())
  eq(payorders.length, 2, 'two pay orders recorded')
  eq(payorders[0].amount_cent, 100, 'first pay order is 1 yuan')
  eq(payorders[1].amount_cent, 200, 'second pay order is the 2 yuan top-up')
  eq(payorders[1].type, 'topup', 'second is typed as topup')
  eq(payorders[1].task_id, 'task-0001', 'pay order points back to the task')
  eq(payorders.every((p) => p.status === 'paid'), true, 'both pay orders marked paid')

  console.log('\n[4] edit again: 3 yuan -> 1 yuan (refund 2 minus channel fee)')
  const upd2 = await call(userObj.updateTask, { taskId: 'task-0001', amount: 1, ...meta() })
  eq(upd2.code, 0, 'edit ok')
  // 退 2 元毛额，扣 0.6% 通道费后才是到手的钱
  eq(upd2.data.refund, yuanOf(C.refundNetOf(200)), 'refund 2 yuan minus 0.6% fee')
  eq(upd2.data.refundFee, yuanOf(C.refundFeeOf(200)), 'fee is 0.6%')
  t = await task('task-0001')
  eq(t.amount_cent, 100, 'amount back to 1 yuan')
  eq(C.paidCentOf(t), 300, 'history paid still 300')
  eq(C.refundedCentOf(t), 200, 'gross refunded 200 (quota consumed)')
  eq(C.refundedNetCentOf(t), C.refundNetOf(200), 'net refunded to user is 199')
  eq(t.refund_fee_cent, C.refundFeeOf(200), 'fee recorded on the task')
  eq(C.refundableCentOf(t), 100, '100 left refundable')
  const wallet1 = coll('xyyx-wallets').get('pub-user')
  eq(wallet1.balance_cent, C.refundNetOf(200), 'mock mode refunds net amount to balance')
  const refunds1 = Array.from(coll('xyyx-refunds').values())
  eq(refunds1.length, 1, 'one refund doc')
  eq(refunds1[0].amount_cent, 200, 'refund doc gross 200')
  eq(refunds1[0].fee_cent, C.refundFeeOf(200), 'refund doc fee 1')
  eq(refunds1[0].net_cent, C.refundNetOf(200), 'refund doc net 199')
  eq(refunds1[0].parts[0].net, C.refundNetOf(200), 'wechat refunds the net amount')
  eq(refunds1[0].source, 'edit_down', 'source is edit_down')
  eq(refunds1[0].status, 'success', 'refund success')

  console.log('\n[5] cancel order: refund the remaining 1 yuan (minus fee)')
  const cancel = await call(userObj.cancelTask, 'task-0001', 'no longer needed', meta())
  eq(cancel.code, 0, 'cancel ok')
  eq(cancel.data.refund, yuanOf(C.refundNetOf(100)), 'refund remaining 1 yuan minus fee')
  t = await task('task-0001')
  eq(t.status, C.STATUS.CANCELLED, 'order cancelled')
  eq(t.refund_status, 'done', 'refund done')
  eq(t.pay_status, 'refunded', 'pay status refunded')
  const wallet2 = coll('xyyx-wallets').get('pub-user')
  eq(wallet2.balance_cent, C.refundNetOf(200) + C.refundNetOf(100), 'net refunds credited in total')
  const refunds2 = Array.from(coll('xyyx-refunds').values())
  const refundSum = refunds2.reduce((s, r) => s + r.amount_cent, 0)
  eq(refundSum, 300, 'gross refunds sum to 300')
  eq(refundSum, C.paidCentOf(t), 'gross refunded == paid: quota fully consumed, nothing double-refunded')
  eq(
    refunds2.reduce((s, r) => s + r.net_cent, 0) + t.refund_fee_cent,
    C.paidCentOf(t),
    'net refunded + fee == paid (every cent accounted for)'
  )

  console.log('\n[6] legacy docs (no payments field) still refund correctly')
  addDoc('xyyx-tasks', {
    _id: 'task-old-01',
    title: 'old order',
    type: 2,
    type_text: 'meal',
    amount_cent: 500,
    status: C.STATUS.PENDING,
    pay_status: 'paid',
    publisher_id: 'pub-user',
    runner_id: '',
    create_time: Date.now() - 86400000
  })
  const oldTask = await task('task-old-01')
  eq(C.paidCentOf(oldTask), 500, 'legacy paid inferred from amount')
  const cancelOld = await call(userObj.cancelTask, 'task-old-01', 'nope', meta())
  eq(cancelOld.code, 0, 'legacy cancel ok')
  eq(cancelOld.data.refund, yuanOf(C.refundNetOf(500)), 'refund 5 yuan minus fee')
  const oldAfter = await task('task-old-01')
  eq(C.refundedCentOf(oldAfter), 500, 'gross refunded 500')
  eq(C.refundedNetCentOf(oldAfter), C.refundNetOf(500), 'net refunded 497')
  eq(oldAfter.refund_status, 'done', 'refund status done')

  console.log('\n[7] cannot edit an order the rider already took')
  addDoc('xyyx-tasks', {
    _id: 'task-ongoing',
    title: 'ongoing',
    type: 1,
    type_text: 'kuaidi',
    amount_cent: 300,
    status: C.STATUS.ONGOING,
    pay_status: 'paid',
    publisher_id: 'pub-user',
    runner_id: 'rider-1',
    accept_time: Date.now(),
    create_time: Date.now()
  })
  const upd3 = await call(userObj.updateTask, { taskId: 'task-ongoing', amount: 9, ...meta() })
  eq(upd3.code, 400, 'blocked')
  ok(!!upd3.msg, 'has a message', upd3.msg)

  console.log('\n[8] refund cannot exceed what is refundable')
  const refundOver = await C.beginRefund({
    task: { _id: 'task-old-01', publisher_id: 'pub-user', amount_cent: 500, pay_status: 'refunded', payments: [], refund_cent: 500 },
    amountCent: 100,
    reason: 'over the limit'
  }).then(() => 'no-error').catch((e) => e.message)
  ok(!!refundOver && refundOver !== 'no-error', 'over-limit refund rejected', refundOver)

  console.log('\n[9] wechat refund path (fake http response)')
  process.env.XYYX_PAY_FORCE_MOCK = ''
  delete require.cache[require.resolve(PAY_OBJ)]
  const payObjReal = require(PAY_OBJ)
  let lastReq = null
  global.uniCloud.httpclient = {
    request: async (url, opts) => {
      lastReq = { url, body: opts.content ? JSON.parse(opts.content) : null }
      return { status: 200, data: { refund_id: 'wx-refund-1', status: 'SUCCESS' } }
    }
  }

  const modeInfo = await call(payObjReal.getPayMode)
  if (modeInfo.data.mode !== 'wechat') {
    console.log('  skip: no merchant config (pay-config.js) on this machine')
  } else {
    addDoc('xyyx-tasks', {
      _id: 'task-wx-01',
      title: 'wechat order',
      type: 1,
      type_text: 'kuaidi',
      amount_cent: 300,
      paid_cent: 300,
      refund_cent: 0,
      refund_status: '',
      payments: [{ no: 'P1', cent: 300, type: 'full', time: Date.now(), refunded: 0 }],
      status: C.STATUS.PENDING,
      pay_status: 'paid',
      pay_mode: 'wechat',
      publisher_id: 'pub-user',
      runner_id: '',
      create_time: Date.now()
    })

    const wxTask = await task('task-wx-01')
    // 把「真实模式」的支付对象注册进去：beginRefund 会立刻通过它提交微信退款
    registeredObjects['xyyx-pay'] = payObjReal
    const begin = await C.beginRefund({ task: wxTask, amountCent: 300, reason: 'cancel refund', source: 'cancel' })
    eq(begin.mode, 'wechat', 'refund mode wechat')
    // 关键：同一个请求里就把钱退掉了，不需要客户端补一刀、也不用等定时任务
    eq(begin.status, 'success', 'refund executed inline (no client follow-up needed)')
    eq(begin.executed, true, 'executed flag true')

    eq(lastReq.body.out_trade_no, 'P1', 'refund by original trade no')
    eq(lastReq.body.amount.refund, C.refundNetOf(300), 'wechat is asked to refund the net amount (298)')
    eq(lastReq.body.amount.total, 300, 'original total ok')
    eq(lastReq.body.out_refund_no.indexOf(begin.outRefundNo) === 0, true, 'refund no prefixed for idempotent retry')

    const wxAfter = await task('task-wx-01')
    eq(wxAfter.refund_status, 'done', 'refund done')
    eq(wxAfter.pay_status, 'refunded', 'pay status refunded')
    const refDoc = coll('xyyx-refunds').get(begin.refundId)
    eq(refDoc.status, 'success', 'refund doc success')
    eq(refDoc.parts[0].wx_refund_id, 'wx-refund-1', 'wx refund id stored')

    // 客户端再补一刀也不会重复退（幂等）
    const r9 = await call(payObjReal.refundTask, begin.refundId)
    eq(r9.code, 0, 'repeat refund call is idempotent')
    eq(!!(r9.data && r9.data.already), true, 'repeat call reports already refunded')
  }

  console.log('\n-----------------------------')
  console.log(`passed ${passed}, failed ${failures.length}`)
  if (failures.length) {
    failures.forEach((f) => console.log('  FAIL: ' + f))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('test crashed:', e)
  process.exit(1)
})
