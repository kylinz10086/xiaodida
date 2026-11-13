#!/usr/bin/env node
/**
 * 云对象集成测试（不需要真实 uniCloud 空间）
 *
 * 做什么：把 uniCloud 数据库打成一个内存版 MongoDB 子集，把 uni-id-common
 * 打成一个「token -> uid」的桩，然后 require **真实的** xyyx-common / xyyx-user /
 * xyyx-rider / xyyx-pay / xyyx-cron，按真实调用方式跑完整链路：
 *
 *   登录态 → 发布 → 支付 → 抢单 → 取件 → 送达 → 确认收货/结算 → 评价 → 提现
 *   以及：取消退款、越权、字段裁剪、幂等、CAS、限流、nonce、定时任务
 *
 * 为什么不用云端：不往生产库写测试数据；内存 DB 能把错误码和账本断言到分。
 *
 * 用法：node tools/scripts/test-cloud-objects.cjs
 * 退出码：0 全过；1 有失败
 */
'use strict'

// 本测试使用内存 DB + mock 支付，强制忽略本机真实商户配置
process.env.XYYX_PAY_FORCE_MOCK = '1'

const fs = require('fs')
const path = require('path')
const Module = require('module')

/* ================================================================
 * 1. 定位目录 & 内存数据库
 * ================================================================ */

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

const CLOUD = findUniCloudDir()
const COMMON = path.join(CLOUD, 'cloudfunctions', 'common', 'xyyx-common', 'index.js')
const USER_OBJ = path.join(CLOUD, 'cloudfunctions', 'xyyx-user', 'index.obj.js')
const RIDER_OBJ = path.join(CLOUD, 'cloudfunctions', 'xyyx-rider', 'index.obj.js')
const PAY_OBJ = path.join(CLOUD, 'cloudfunctions', 'xyyx-pay', 'index.obj.js')
const CRON = path.join(CLOUD, 'cloudfunctions', 'xyyx-cron', 'index.js')

/* ---------------- 内存 DB ---------------- */

const tables = new Map()
const UNIQUE = {
  'xyyx-nonces': ['key'],
  'xyyx-transactions': ['idempotency_key']
}

function table(name) {
  if (!tables.has(name)) tables.set(name, [])
  return tables.get(name)
}

function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x))
}

function matchValue(docVal, condVal) {
  if (condVal && typeof condVal === 'object' && !Array.isArray(condVal)) {
    if ('__neq' in condVal) return docVal !== condVal.__neq
    if ('__lte' in condVal) return Number(docVal) <= condVal.__lte
    if ('__lt' in condVal) return Number(docVal) < condVal.__lt
    if ('__gte' in condVal) return Number(docVal) >= condVal.__gte
    if ('__gt' in condVal) return Number(docVal) > condVal.__gt
    if ('__in' in condVal) return condVal.__in.includes(docVal)
    if ('__nin' in condVal) return !condVal.__nin.includes(docVal)
    if ('__exists' in condVal) return condVal.__exists ? docVal !== undefined : docVal === undefined
    // 普通对象：做浅层逐字段匹配
    if (docVal && typeof docVal === 'object') {
      return Object.keys(condVal).every((k) => matchValue(docVal[k], condVal[k]))
    }
  }
  return docVal === condVal
}

function matches(doc, cond) {
  if (!cond || typeof cond !== 'object') return true
  if ('__and' in cond) return cond.__and.every((c) => matches(doc, c))
  if ('__or' in cond) return cond.__or.some((c) => matches(doc, c))
  return Object.keys(cond).every((k) => matchValue(doc[k], cond[k]))
}

function applyPatch(doc, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && '__inc' in v) doc[k] = (doc[k] || 0) + v.__inc
    else doc[k] = v
  }
  return doc
}

let autoId = 0
function makeQuery(name, cond) {
  let sort = null
  let skipN = 0
  let limitN = Infinity

  const rows = () => {
    let list = table(name).filter((d) => matches(d, cond))
    if (sort) {
      const { field, dir } = sort
      list = list.slice().sort((a, b) => {
        const av = a[field]
        const bv = b[field]
        if (av === bv) return 0
        const r = av > bv ? 1 : -1
        return dir === 'desc' ? -r : r
      })
    }
    return list
  }

  const q = {
    get: async () => ({ data: rows().slice(skipN, skipN === 0 && limitN === Infinity ? undefined : skipN + limitN).map(clone) }),
    count: async () => ({ total: rows().length }),
    update: async (patch) => {
      const rs = rows()
      rs.forEach((d) => applyPatch(d, patch))
      return { updated: rs.length }
    },
    remove: async () => {
      const rs = rows()
      const set = new Set(rs)
      tables.set(name, table(name).filter((d) => !set.has(d)))
      return { deleted: rs.length }
    },
    orderBy: (field, dir) => {
      sort = { field, dir: dir === 'desc' ? 'desc' : 'asc' }
      return q
    },
    skip: (n) => {
      skipN = Number(n) || 0
      return q
    },
    limit: (n) => {
      limitN = Number(n) || 0
      return q
    }
  }
  return q
}

const db = {
  collection: (name) => ({
    doc: (id) => ({
      get: async () => ({ data: table(name).filter((d) => d._id === id).map(clone) }),
      update: async (patch) => {
        const d = table(name).find((x) => x._id === id)
        if (!d) return { updated: 0 }
        applyPatch(d, patch)
        return { updated: 1 }
      },
      set: async (doc) => {
        tables.set(name, table(name).filter((x) => x._id !== id))
        table(name).push({ ...clone(doc), _id: id })
        return {}
      }
    }),
    where: (cond) => makeQuery(name, cond),
    add: async (doc) => {
      const record = clone(doc)
      const _id = record._id || `auto_${String(++autoId).padStart(12, '0')}`
      for (const field of UNIQUE[name] || []) {
        if (record[field] !== undefined && table(name).some((d) => d[field] === record[field])) {
          const err = new Error(`duplicate key: ${name}.${field}`)
          err.code = 'DUPLICATE'
          throw err
        }
      }
      table(name).push({ ...record, _id })
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
    in: (v) => ({ __in: v }),
    nin: (v) => ({ __nin: v }),
    exists: (v) => ({ __exists: v }),
    or: (...conds) => ({ __or: conds }),
    and: (...conds) => ({ __and: conds })
  }
}

global.uniCloud = {
  database: () => db,
  importObject: () => ({}),
  httpclient: { request: async () => ({ status: 500, data: {} }) }
}

/* ---------------- uni-id-common 桩 ---------------- */

const uniIDMock = {
  createInstance: () => ({
    checkToken: async (token) => {
      if (!token) return { errCode: 'TOKEN_INVALID' }
      if (String(token).startsWith('bad')) throw new Error('malformed token')
      if (!String(token).startsWith('tok_')) return { errCode: 'TOKEN_INVALID' }
      const uid = String(token).slice(4)
      // 约定：uid 以 bad 开头 = 畸形 token，checkToken 直接抛错
      if (uid.startsWith('bad')) throw new Error('malformed token')
      return { uid }
    }
  })
}

/* ---------------- require 真实的云对象 ---------------- */

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'uni-id-common') return uniIDMock
  if (request === 'xyyx-common') return C
  return origLoad.call(this, request, parent, isMain)
}

const C = require(COMMON)
const userObj = require(USER_OBJ)
const riderObj = require(RIDER_OBJ)
const payObj = require(PAY_OBJ)
const cronObj = require(CRON)

/* ================================================================
 * 2. 断言框架
 * ================================================================ */

let pass = 0
const fails = []

function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fails.push(name)
    console.log(`  ✗ ${name}${extra ? `  ${extra}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

function ctxFor(uid) {
  return {
    getUniIdToken: () => (uid ? `tok_${uid}` : ''),
    getClientInfo: () => ({ PLATFORM: 'mp-weixin', appId: '__UNI__TEST' })
  }
}

const OBJ_WRITE = new Set([
  'updateProfile', 'publishTask', 'submitReview', 'acceptAgreement',
  'applyRider', 'requestWithdraw', 'createJsapiOrder'
])
const TASK_WRITE = new Set(['mockPaySuccess', 'grabTask', 'markPicked', 'markDelivered', 'confirmReceipt'])
const TASK_REASON_WRITE = new Set(['cancelTask', 'abandonTask'])

let nonceCounter = 0
function testMeta() {
  return {
    nonce: `n_${Date.now().toString(36)}_${(++nonceCounter).toString(36)}_${'x'.repeat(40)}`,
    timestamp: Date.now()
  }
}

async function call(obj, uid, method, ...args) {
  const fn = obj[method]
  if (!fn) throw new Error(`方法不存在：${method}`)
  if (OBJ_WRITE.has(method)) {
    args[0] = { ...(args[0] || {}), ...testMeta() }
  } else if (TASK_WRITE.has(method)) {
    while (args.length < 2) args.push(undefined)
    args[1] = testMeta()
  } else if (TASK_REASON_WRITE.has(method)) {
    while (args.length < 3) args.push(undefined)
    args[2] = testMeta()
  }
  return fn.call(ctxFor(uid), ...args)
}

function codeIs(label, res, code) {
  ok(`${label} → code=${code}`, res && res.code === code, JSON.stringify(res))
}

function tableRows(name) {
  return table(name)
}

function resetData() {
  tables.clear()
  autoId = 0
}

/* ================================================================
 * 3. 测试主体
 * ================================================================ */

async function main() {
  const PUB = 'u_pub'
  const RIDER1 = 'u_rider1'
  const RIDER2 = 'u_rider2'
  const STRANGER = 'u_stranger'

  /* ---------------- 1. 鉴权 ---------------- */
  section('1. 鉴权 / 用户初始化')
  resetData()

  codeIs('无 token 获取资料', await call(userObj, '', 'getProfile'), 401)
  codeIs('畸形 token 获取资料（不应 500）', await call(userObj, 'bad_token_xxx', 'getProfile'), 401)
  codeIs('陌生 token 获取资料', await call(userObj, STRANGER, 'getProfile'), 0)

  const pubProfile = await call(userObj, PUB, 'getProfile')
  ok('首次访问自动建资料', pubProfile.code === 0 && !!pubProfile.data._id)
  ok('默认身份是 user', pubProfile.data.role === 'user')
  ok('学校固定为浙江中医药大学', pubProfile.data.school === '浙江中医药大学')
  ok('自动建钱包且余额为 0', pubProfile.data.wallet && pubProfile.data.wallet.balance === 0)
  ok('默认昵称非空', !!pubProfile.data.nickname)

  codeIs('更新资料', await call(userObj, PUB, 'updateProfile', { nickname: '测试昵称' }), 0)
  ok('昵称已更新', tableRows(C.COLL.users).find((u) => u._id === PUB).nickname === '测试昵称')
  codeIs('同意用户协议', await call(userObj, PUB, 'acceptAgreement', { version: '1.0.0' }), 0)
  ok('协议留痕', tableRows(C.COLL.agreements).some((a) => a.user_id === PUB && a.version === '1.0.0'))

  /* ---------------- 2. 发布参数校验 ---------------- */
  section('2. 发布：参数校验与白名单')

  const base = {
    title: '东门驿站取个快递',
    type: 1,
    amount: 8.5,
    mobile: '13800001234',
    origin: { name: '东门菜鸟驿站', detail: '3号柜' },
    destination: { name: '3号宿舍楼', detail: '302 室' },
    remark: '到了打电话',
    description: '两个箱子'
  }

  codeIs('标题为空', await call(userObj, PUB, 'publishTask', { ...base, title: '' }), 400)
  codeIs('标题 3 字', await call(userObj, PUB, 'publishTask', { ...base, title: '取快递' }), 400)
  codeIs('标题 41 字', await call(userObj, PUB, 'publishTask', { ...base, title: '测'.repeat(41) }), 400)
  codeIs('金额 0.5 元', await call(userObj, PUB, 'publishTask', { ...base, amount: 0.5 }), 400)
  codeIs('金额 1000.01 元', await call(userObj, PUB, 'publishTask', { ...base, amount: 1000.01 }), 400)
  codeIs('金额非法', await call(userObj, PUB, 'publishTask', { ...base, amount: 'abc' }), 400)
  codeIs('类型越界', await call(userObj, PUB, 'publishTask', { ...base, type: 4 }), 400)
  codeIs('手机号非法', await call(userObj, PUB, 'publishTask', { ...base, mobile: '123' }), 400)
  codeIs('手机号缺失', await call(userObj, PUB, 'publishTask', { ...base, mobile: '' }), 400)

  const pub = await call(userObj, PUB, 'publishTask', {
    ...base,
    // 故意塞客户端不该控制的字段
    status: 3,
    pay_status: 'paid',
    commission_cent: 999,
    publisher_id: 'hacker',
    role: 'admin',
    images: Array.from({ length: 9 }, (_, i) => `https://x/${i}.png`)
  })
  codeIs('正常发布', pub, 0)
  const task1 = pub.data.id
  ok('返回金额按元', pub.data.amount === 8.5)

  const stored1 = tableRows(C.COLL.tasks).find((t) => t._id === task1)
  ok('服务端状态=1（忽略客户端 status）', stored1.status === 1)
  ok('服务端 pay_status=unpaid（忽略客户端 paid）', stored1.pay_status === 'unpaid')
  ok('客户端 publisher_id 被丢弃', stored1.publisher_id === PUB)
  ok('客户端 commission_cent 被丢弃', stored1.commission_cent === undefined)
  ok('客户端 role 被丢弃', stored1.role === undefined)
  ok('图片最多 6 张', stored1.images.length === 6)
  ok('金额落库为整数分 850', stored1.amount_cent === 850)
  ok('发布数 +1', tableRows(C.COLL.users).find((u) => u._id === PUB).published_count === 1)

  // 防重放：缺少 nonce / 同一个 nonce 第二次提交
  const noNonce = await userObj.publishTask.call(ctxFor(PUB), { ...base, title: '无 nonce 测试订单' })
  codeIs('写接口缺少 nonce 被拒', noNonce, 400)

  const replayUser = 'u_replay'
  const replayData = {
    ...base,
    title: '重放测试订单',
    nonce: `n_replay_${'x'.repeat(60)}`,
    timestamp: Date.now()
  }
  const replay1 = await userObj.publishTask.call(ctxFor(replayUser), replayData)
  const replay2 = await userObj.publishTask.call(ctxFor(replayUser), replayData)
  codeIs('首次 nonce 写成功', replay1, 0)
  codeIs('同 nonce 重放被拒', replay2, 409)
  ok(
    '重放没有生成第二条订单',
    tableRows(C.COLL.tasks).filter((t) => t.publisher_id === replayUser).length === 1
  )

  /* ---------------- 3. 大厅与支付 ---------------- */
  section('3. 大厅、支付与可见性')

  codeIs('游客看大厅', await call(userObj, '', 'listHall', {}), 0)
  let hall = await call(userObj, '', 'listHall', {})
  ok('未支付订单不进大厅', hall.data.total === 0)

  codeIs('别人支付我的单', await call(payObj, STRANGER, 'mockPaySuccess', task1), 403)
  codeIs('金额不一致', await call(payObj, PUB, 'createJsapiOrder', { taskId: task1, amountCent: 999 }), 400)
  const payMode = await call(payObj, PUB, 'getPayMode')
  ok('未配证书返回 mock', payMode.code === 0 && payMode.data.mode === 'mock')

  const order = await call(payObj, PUB, 'createJsapiOrder', { taskId: task1 })
  codeIs('创建 mock 支付单', order, 0)
  ok('mock 单不带真实 payParams', order.data.mode === 'mock')

  codeIs('模拟支付成功', await call(payObj, PUB, 'mockPaySuccess', task1), 0)
  codeIs('重复模拟支付幂等', await call(payObj, PUB, 'mockPaySuccess', task1), 0)

  const storedPaid = tableRows(C.COLL.tasks).find((t) => t._id === task1)
  ok('订单变为已支付', storedPaid.pay_status === 'paid' && storedPaid.pay_time > 0)
  const escrowTx = tableRows(C.COLL.transactions).filter((x) => x.task_id === task1 && x.type === 'escrow_in')
  ok('只产生 1 条托管入账', escrowTx.length === 1 && escrowTx[0].amount_cent === 850)

  hall = await call(userObj, '', 'listHall', {})
  ok('支付后进入大厅', hall.data.total === 1)

  const asStranger = await call(userObj, STRANGER, 'getTaskDetail', task1)
  ok('陌生人看不到发布者电话', asStranger.data.contact === null)
  ok('陌生人看不到门牌详情', asStranger.data.destination.detail === '', JSON.stringify(asStranger.data.destination))
  ok('陌生人看不到备注', asStranger.data.remark === '')

  const asPublisher = await call(userObj, PUB, 'getTaskDetail', task1)
  ok('发布者能看到自己的电话', asPublisher.data.contact && asPublisher.data.contact.mobile === '13800001234')
  ok('发布者能看到门牌', asPublisher.data.destination.detail === '302 室')

  /* ---------------- 4. 骑手申请与抢单 ---------------- */
  section('4. 骑手申请、抢单与字段隔离')

  codeIs('骑手资料：姓名过短', await call(riderObj, RIDER1, 'applyRider', { real_name: '王', student_no: '20230001', mobile: '13900001111' }), 400)
  codeIs('骑手资料：学号过短', await call(riderObj, RIDER1, 'applyRider', { real_name: '王小明', student_no: '123', mobile: '13900001111' }), 400)
  codeIs('骑手资料：手机号错', await call(riderObj, RIDER1, 'applyRider', { real_name: '王小明', student_no: '20230001', mobile: '123' }), 400)

  const apply1 = await call(riderObj, RIDER1, 'applyRider', { real_name: '王小明', student_no: '20230001', mobile: '13900001111' })
  codeIs('第一个骑手申请', apply1, 0)
  ok('冷启动自动通过', apply1.data.status === 2 && apply1.data.auto === true)

  const applyAgain = await call(riderObj, RIDER1, 'applyRider', { real_name: '王小明', student_no: '20230001', mobile: '13900001111' })
  codeIs('已通过再申请', applyAgain, 400)
  codeIs('骑手改资料', await call(riderObj, RIDER1, 'updateProfile', { nickname: '骑手昵称' }), 0)
  ok('骑手昵称已更新', tableRows(C.COLL.users).find((u) => u._id === RIDER1).nickname === '骑手昵称')
  codeIs('骑手同意协议', await call(riderObj, RIDER1, 'acceptAgreement', { version: '1.0.0' }), 0)
  ok('骑手协议留痕', tableRows(C.COLL.agreements).some((a) => a.user_id === RIDER1 && a.role === 'rider'))

  const apply2 = await call(riderObj, RIDER2, 'applyRider', { real_name: '李小红', student_no: '20230002', mobile: '13900002222' })
  codeIs('第二个骑手申请', apply2, 0)
  ok('第二个进入审核中', apply2.data.status === 1)

  codeIs('未审核骑手抢单', await call(riderObj, RIDER2, 'grabTask', task1), 403)
  codeIs('非骑手抢单', await call(riderObj, PUB, 'grabTask', task1), 403)

  // 发布接口的限流把上面 9 次参数校验也计入了，这里清一次窗口，避免后续用例误触 429
  tables.set(C.COLL.limits, [])

  // 未支付单不能抢
  const unpaid = await call(userObj, PUB, 'publishTask', { ...base, title: '未支付测试单' })
  codeIs('发布未支付单', unpaid, 0)
  codeIs('抢未支付单', await call(riderObj, RIDER1, 'grabTask', unpaid.data.id), 400)

  // 自己发布的单不能抢
  const own = await call(userObj, RIDER1, 'publishTask', { ...base, title: '骑手自己发的单' })
  await call(payObj, RIDER1, 'mockPaySuccess', own.data.id)
  codeIs('抢自己发布的单', await call(riderObj, RIDER1, 'grabTask', own.data.id), 400)

  const grab1 = await call(riderObj, RIDER1, 'grabTask', task1)
  codeIs('认证骑手抢单', grab1, 0)
  const ongoing = tableRows(C.COLL.tasks).find((t) => t._id === task1)
  ok('状态变为进行中', ongoing.status === 2)
  ok('记录接单者', ongoing.runner_id === RIDER1 && ongoing.accept_time > 0)

  codeIs('重复抢单', await call(riderObj, RIDER1, 'grabTask', task1), 400)

  const otherRiderView = await call(riderObj, RIDER2, 'getTaskDetail', task1)
  ok('别的骑手看不到手机号', otherRiderView.data.contact === null)
  ok('别的骑手看不到门牌', otherRiderView.data.destination.detail === '', JSON.stringify(otherRiderView.data.destination))
  ok('别的骑手看不到备注', otherRiderView.data.remark === '')

  const myRiderView = await call(riderObj, RIDER1, 'getTaskDetail', task1)
  ok('接单骑手拿到脱敏号', myRiderView.data.contact && myRiderView.data.contact.mobile_masked === '138****1234')
  ok('接单骑手拿到门牌', myRiderView.data.destination.detail === '302 室')
  ok('接单骑手拿到备注', myRiderView.data.remark === '到了打电话')
  ok('标记 mine=true', myRiderView.data.mine === true)
  ok('返回体不含完整手机号', !JSON.stringify(myRiderView).includes('13800001234'))

  /* ---------------- 5. 取件 / 送达 / 确认 / 结算 ---------------- */
  section('5. 取件、送达、确认收货与结算')

  codeIs('别人取件', await call(riderObj, RIDER2, 'markPicked', task1), 403)
  codeIs('本人取件', await call(riderObj, RIDER1, 'markPicked', task1), 0)
  ok('记录取件时间', tableRows(C.COLL.tasks).find((t) => t._id === task1).picked_time > 0)

  codeIs('别人送达', await call(riderObj, RIDER2, 'markDelivered', task1), 403)
  codeIs('本人送达', await call(riderObj, RIDER1, 'markDelivered', task1), 0)
  const delivered = tableRows(C.COLL.tasks).find((t) => t._id === task1)
  ok('记录送达时间', delivered.delivered_time > 0)
  ok('设置自动确认时间', delivered.auto_confirm_at > Date.now())
  codeIs('重复送达', await call(riderObj, RIDER1, 'markDelivered', task1), 400)

  codeIs('别人确认收货', await call(userObj, STRANGER, 'confirmReceipt', task1), 403)

  // 未送达就确认 -> 必须拒绝（另起一单验证）
  const early = await call(userObj, PUB, 'publishTask', { ...base, title: '提前确认测试单' })
  await call(payObj, PUB, 'mockPaySuccess', early.data.id)
  await call(riderObj, RIDER1, 'grabTask', early.data.id)
  codeIs('未送达就确认收货', await call(userObj, PUB, 'confirmReceipt', early.data.id), 400)

  const confirm = await call(userObj, PUB, 'confirmReceipt', task1)
  codeIs('发布者确认收货', confirm, 0)

  const done = tableRows(C.COLL.tasks).find((t) => t._id === task1)
  ok('订单已完成', done.status === 3)
  ok('佣金 10% = 85 分', done.commission_cent === 85, String(done.commission_cent))
  ok('骑手实得 765 分', done.rider_income_cent === 765, String(done.rider_income_cent))
  ok('记录确认人', done.complete_by === PUB)
  ok('记录完成时间', done.complete_time > 0)

  const wallet1 = tableRows(C.COLL.wallets).find((w) => w._id === RIDER1)
  ok('骑手钱包 +7.65 元', wallet1 && wallet1.balance_cent === 765, JSON.stringify(wallet1))
  ok('骑手累计收入 765 分', wallet1 && wallet1.income_cent === 765)

  const task1Tx = tableRows(C.COLL.transactions).filter((x) => x.task_id === task1)
  const settlementTx = task1Tx.filter((x) => x.type !== 'escrow_in')
  ok('支付产生 1 条托管入账', task1Tx.filter((x) => x.type === 'escrow_in').length === 1)
  ok('结算产生 3 条流水', settlementTx.length === 3, String(settlementTx.length))
  ok('收入 +765', task1Tx.some((x) => x.type === 'income' && x.amount_cent === 765))
  ok('佣金 +85', task1Tx.some((x) => x.type === 'commission' && x.amount_cent === 85))
  ok('托管出账 -850', task1Tx.some((x) => x.type === 'escrow_out' && x.amount_cent === -850))
  ok('每条流水都有幂等键', task1Tx.every((x) => !!x.idempotency_key))

  codeIs('重复确认收货', await call(userObj, PUB, 'confirmReceipt', task1), 400)
  let dupSettle = false
  try {
    await C.settleTask(done, PUB)
  } catch (e) {
    dupSettle = true
  }
  ok('重复结算抛错', dupSettle)
  ok('钱包未二次入账', tableRows(C.COLL.wallets).find((w) => w._id === RIDER1).balance_cent === 765)

  const riderWallet = await call(riderObj, RIDER1, 'getWallet')
  ok('骑手钱包接口余额正确', riderWallet.code === 0 && riderWallet.data.balance === 7.65)
  ok('骑手流水含本单收入', riderWallet.data.transactions.some((x) => x.type === 'income' && x.amount === 7.65))

  const jobs = await call(riderObj, RIDER1, 'listMyJobs', {})
  ok('我的任务含已完成单', jobs.data.list.some((t) => t._id === task1 && t.status === 3))

  /* ---------------- 6. 取消与退款 ---------------- */
  section('6. 取消与退款')

  const refundable = await call(userObj, PUB, 'publishTask', { ...base, title: '待取消测试单' })
  await call(payObj, PUB, 'mockPaySuccess', refundable.data.id)
  codeIs('别人取消', await call(userObj, STRANGER, 'cancelTask', refundable.data.id, '捣乱'), 403)
  codeIs('发布者取消待接单', await call(userObj, PUB, 'cancelTask', refundable.data.id, '不想发了'), 0)

  const refunded = tableRows(C.COLL.tasks).find((t) => t._id === refundable.data.id)
  ok('状态=4 已取消', refunded.status === 4)
  ok('pay_status=refunded', refunded.pay_status === 'refunded', refunded.pay_status)
  ok('退款金额=全额', refunded.refund_cent === 850)
  ok('记录取消原因', refunded.cancel_reason === '不想发了')
  const refundTx = tableRows(C.COLL.transactions).filter((x) => x.task_id === refundable.data.id && x.type === 'refund')
  ok('产生 1 条退款流水', refundTx.length === 1 && refundTx[0].amount_cent === 850)
  codeIs('重复取消', await call(userObj, PUB, 'cancelTask', refundable.data.id, '再取消'), 400)

  const cancelAfterGrab = await call(userObj, PUB, 'publishTask', { ...base, title: '接单后取消测试单' })
  await call(payObj, PUB, 'mockPaySuccess', cancelAfterGrab.data.id)
  await call(riderObj, RIDER1, 'grabTask', cancelAfterGrab.data.id)
  codeIs('接单后取消', await call(userObj, PUB, 'cancelTask', cancelAfterGrab.data.id, '反悔'), 400)

  /* ---------------- 7. 评价 ---------------- */
  section('7. 评价')

  codeIs('别人评价', await call(userObj, STRANGER, 'submitReview', { taskId: task1, score: 5, content: '不错' }), 403)
  codeIs('评分 0', await call(userObj, PUB, 'submitReview', { taskId: task1, score: 0, content: '差' }), 400)
  codeIs('评分 6', await call(userObj, PUB, 'submitReview', { taskId: task1, score: 6, content: '好' }), 400)
  codeIs('未完成订单评价', await call(userObj, PUB, 'submitReview', { taskId: early.data.id, score: 5, content: '好' }), 400)
  codeIs('正常评价', await call(userObj, PUB, 'submitReview', { taskId: task1, score: 5, content: '很快' }), 0)
  codeIs('重复评价', await call(userObj, PUB, 'submitReview', { taskId: task1, score: 4, content: '再评' }), 400)
  ok('产生评价记录', tableRows(C.COLL.reviews).some((r) => r.task_id === task1 && r.score === 5))
  const riderProfileAfterReview = await call(riderObj, RIDER1, 'getProfile')
  ok('骑手被评价次数 +1', riderProfileAfterReview.data.rider.rating_count === 1, JSON.stringify(riderProfileAfterReview.data.rider))

  /* ---------------- 8. 提现 ---------------- */
  section('8. 提现')

  codeIs('提现低于 10 元', await call(riderObj, RIDER1, 'requestWithdraw', { amount: 5 }), 400)
  const big = await call(userObj, PUB, 'publishTask', { ...base, title: '大额结算测试单', amount: 10 })
  await call(payObj, PUB, 'mockPaySuccess', big.data.id)
  await call(riderObj, RIDER1, 'grabTask', big.data.id)
  await call(riderObj, RIDER1, 'markDelivered', big.data.id)
  await call(userObj, PUB, 'confirmReceipt', big.data.id)
  const walletBeforeWd = tableRows(C.COLL.wallets).find((w) => w._id === RIDER1)
  ok('结算后余额 16.65 元', walletBeforeWd.balance_cent === 1665, String(walletBeforeWd.balance_cent))

  codeIs('提现 10 元', await call(riderObj, RIDER1, 'requestWithdraw', { amount: 10 }), 0)
  const walletAfterWd = tableRows(C.COLL.wallets).find((w) => w._id === RIDER1)
  ok('余额扣 1000 分', walletAfterWd.balance_cent === 665, String(walletAfterWd.balance_cent))
  ok('冻结 +1000 分', walletAfterWd.frozen_cent === 1000, String(walletAfterWd.frozen_cent))
  ok('产生提现流水', tableRows(C.COLL.transactions).some((x) => x.user_id === RIDER1 && x.type === 'withdraw' && x.amount_cent === -1000))
  codeIs('提现超余额', await call(riderObj, RIDER1, 'requestWithdraw', { amount: 100 }), 400)

  /* ---------------- 9. 定时任务 ---------------- */
  section('9. 定时任务（自动确认 + 清 nonce）')

  const autoTask = await call(userObj, PUB, 'publishTask', { ...base, title: '自动确认测试单', amount: 10 })
  await call(payObj, PUB, 'mockPaySuccess', autoTask.data.id)
  await call(riderObj, RIDER1, 'grabTask', autoTask.data.id)
  await call(riderObj, RIDER1, 'markDelivered', autoTask.data.id)
  const autoDoc = tableRows(C.COLL.tasks).find((t) => t._id === autoTask.data.id)
  autoDoc.auto_confirm_at = Date.now() - 1000

  tableRows(C.COLL.nonces).push({ _id: 'n_old', key: 'old_nonce', uid: 'x', expire_time: Date.now() - 1000 })
  const cronResult = await cronObj.main()
  ok('定时任务执行成功', cronResult.ok === true)
  ok('过期送达单被自动结算', tableRows(C.COLL.tasks).find((t) => t._id === autoTask.data.id).status === 3)
  ok('清理了过期 nonce', cronResult.nonces_removed >= 1)

  const walletAfterCron = tableRows(C.COLL.wallets).find((w) => w._id === RIDER1)
  ok('自动结算骑手 +9 元', walletAfterCron.balance_cent === 665 + 900, String(walletAfterCron.balance_cent))

  /* ---------------- 10. 我的订单/任务聚合 ---------------- */
  section('10. 我的订单 / 我的任务聚合')

  const pubTasks = await call(userObj, PUB, 'listMyTasks', { role: 'publisher' })
  ok('发布者只看到自己发布的', pubTasks.code === 0 && pubTasks.data.list.every((t) => t.role === 'publisher'))
  const riderTasks = await call(userObj, RIDER1, 'listMyTasks', { role: 'runner' })
  ok('骑手身份只看到自己接的', riderTasks.data.list.every((t) => t.role === 'runner'))
  const strangerTasks = await call(userObj, STRANGER, 'listMyTasks', {})
  ok('陌生人没有订单', strangerTasks.data.list.length === 0)

  const doneOnly = await call(userObj, RIDER1, 'listMyTasks', { role: 'runner', status: 3 })
  ok('按状态过滤', doneOnly.data.list.every((t) => t.status === 3))

  /* ---------------- 11. 工具函数 / nonce / 限流 ---------------- */
  section('11. 工具函数、nonce 与限流')

  ok('10 元 = 1000 分', C.toCents(10) === 1000)
  ok('9.99 元 = 999 分', C.toCents(9.99) === 999)
  ok('1.1+0.2 = 130 分', C.toCents(1.1 + 0.2) === 130)
  ok('分转元', C.yuan(1000) === 10 && C.yuan(999) === 9.99)
  let lowThrew = false
  try { C.toCents(0.5) } catch (e) { lowThrew = true }
  ok('低于 1 元被拒', lowThrew)
  ok('手机号脱敏', C.maskMobile('13800001234') === '138****1234')
  ok('短号脱敏为空', C.maskMobile('123') === '')

  let shortNonce = false
  try { await C.checkNonce({ uid: 'u1' }, 'abc', Date.now()) } catch (e) { shortNonce = true }
  ok('过短 nonce 被拒', shortNonce)

  const nonce = 'n'.repeat(60)
  await C.checkNonce({ uid: 'u1' }, nonce, Date.now())
  ok('首次 nonce 通过', true)
  let dupNonce = false
  try { await C.checkNonce({ uid: 'u1' }, nonce, Date.now()) } catch (e) { dupNonce = e.code === 409 }
  ok('重复 nonce 被拒（409）', dupNonce)

  let expiredNonce = false
  try { await C.checkNonce({ uid: 'u2' }, 'x'.repeat(60), Date.now() - 10 * 60 * 1000) } catch (e) { expiredNonce = true }
  ok('过期 nonce 被拒', expiredNonce)

  await C.rateLimit({ uid: 'u_rate' }, 'act', 2, 60000)
  await C.rateLimit({ uid: 'u_rate' }, 'act', 2, 60000)
  let limited = false
  try { await C.rateLimit({ uid: 'u_rate' }, 'act', 2, 60000) } catch (e) { limited = e.code === 429 }
  ok('窗口内第 3 次被限流（429）', limited)

  /* ---------------- 12. 支付回调 ---------------- */
  section('12. 支付回调（未配置真实支付）')
  codeIs('handleNotify 未配置证书', await call(payObj, '', 'handleNotify', {}, '{}'), 400)

  /* ---------------- 13. 对账 ---------------- */
  section('13. 对账等式')

  for (const wallet of tableRows(C.COLL.wallets)) {
    const income = tableRows(C.COLL.transactions)
      .filter((x) => x.user_id === wallet._id)
      .reduce((a, x) => a + x.amount_cent, 0)
    // withdraw 会扣余额、但不是支出类流水以外的类型；这里只验收入类流水与 income_cent 的关系
    const incomeOnly = tableRows(C.COLL.transactions)
      .filter((x) => x.user_id === wallet._id && x.type === 'income')
      .reduce((a, x) => a + x.amount_cent, 0)
    ok(`钱包 ${wallet._id} 收入流水=income_cent`, incomeOnly === wallet.income_cent, `${incomeOnly} vs ${wallet.income_cent}`)
  }

  const allTx = tableRows(C.COLL.transactions)
  ok('所有流水都有幂等键', allTx.every((x) => !!x.idempotency_key))
  ok('幂等键唯一', new Set(allTx.map((x) => x.idempotency_key)).size === allTx.length)

  /* ---------------- 结果 ---------------- */
  console.log('')
  if (fails.length) {
    console.log(`✗ ${fails.length} 项失败，${pass} 项通过`)
    console.log(fails.map((f) => '  - ' + f).join('\n'))
    process.exit(1)
  }
  console.log(`✓ 全部 ${pass} 项断言通过`)
}

main().catch((e) => {
  console.error('\n测试异常终止：')
  console.error(e)
  process.exit(1)
})
