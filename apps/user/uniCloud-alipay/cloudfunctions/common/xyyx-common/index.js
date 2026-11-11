'use strict'
/**
 * xyyx-common —— 校递达后端公共模块
 *
 * 两个云对象（xyyx-user 用户端 / xyyx-rider 骑手端）都 require 这个模块，保证：
 *   1. 鉴权、参数校验、限流、防重放只有一套实现
 *   2. 字段裁剪（两端口信息隔离）只有一套实现
 *   3. 记账只有一套实现
 *
 * 任何一端都不允许绕过这里直接写库。
 */

const crypto = require('crypto')
const uniIDCommon = require('uni-id-common')

const db = uniCloud.database()
const dbCmd = db.command

/* ------------------------------------------------------------------ */
/* 常量与配置                                                          */
/* ------------------------------------------------------------------ */

const SCHOOL = '浙江中医药大学'

/** 平台抽佣比例。客户端不可传入，只认这里的值 */
const COMMISSION_RATE = 0.1

/** 送达后多久自动确认（小时） */
const AUTO_CONFIRM_HOURS = 24

const STATUS = {
  PENDING: 1, // 待接单（已付款托管）
  ONGOING: 2, // 进行中
  DONE: 3, // 已完成（已结算）
  CANCELLED: 4, // 已取消（已退款）
  DISPUTE: 5 // 售后/纠纷
}

const STATUS_TEXT = {
  1: '待接单',
  2: '进行中',
  3: '已完成',
  4: '已取消',
  5: '售后中'
}

const TASK_TYPE = { 1: '快递代取', 2: '代带餐食', 3: '其他' }

const ROLE = { USER: 'user', RIDER: 'rider', ADMIN: 'admin' }

const COLL = {
  users: 'xyyx-users',
  tasks: 'xyyx-tasks',
  wallets: 'xyyx-wallets',
  transactions: 'xyyx-transactions',
  nonces: 'xyyx-nonces',
  limits: 'xyyx-ratelimits',
  agreements: 'xyyx-agreements',
  reviews: 'xyyx-reviews'
}

const TX_TYPE = {
  ESCROW_IN: 'escrow_in', // 用户支付，钱进托管
  ESCROW_OUT: 'escrow_out', // 托管出账（结算给骑手）
  INCOME: 'income', // 骑手收入
  COMMISSION: 'commission', // 平台佣金
  REFUND: 'refund', // 退款给用户
  WITHDRAW: 'withdraw' // 骑手提现
}

/* ------------------------------------------------------------------ */
/* 错误与返回                                                          */
/* ------------------------------------------------------------------ */

class BizError extends Error {
  constructor(code, msg) {
    super(msg)
    this.code = code
    this.biz = true
  }
}

function ok(data = null, msg = 'ok') {
  return { code: 0, msg, data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

function assert(cond, code, msg) {
  if (!cond) throw new BizError(code, msg)
}

/** 统一包装云对象方法：把 BizError 转成 {code,msg}，把未知异常压成 500 且不泄露堆栈 */
function guard(fn) {
  return async function (...args) {
    try {
      return await fn.apply(this, args)
    } catch (e) {
      if (e && e.biz) return fail(e.code, e.message)
      console.error('[xyyx] 未预期异常:', e && e.message)
      return fail(500, '服务开小差了，请稍后再试')
    }
  }
}

/* ------------------------------------------------------------------ */
/* 鉴权                                                                */
/* ------------------------------------------------------------------ */

/**
 * 解析当前调用者。返回 { uid, role } 或 null。
 * 注意：role 以数据库里的值为准，不信任 token 里的历史值。
 */
async function getAuth(ctx) {
  const token = ctx && typeof ctx.getUniIdToken === 'function' ? ctx.getUniIdToken() : ''
  if (!token) return null
  const uniID = uniIDCommon.createInstance({ clientInfo: ctx.getClientInfo() })
  const payload = await uniID.checkToken(token)
  if (!payload || payload.errCode || !payload.uid) return null

  const uid = payload.uid
  const userRes = await db.collection(COLL.users).doc(uid).get()
  const profile = (userRes.data && userRes.data[0]) || null
  return {
    uid,
    role: (profile && profile.role) || ROLE.USER,
    profile
  }
}

async function requireAuth(ctx) {
  const auth = await getAuth(ctx)
  assert(auth, 401, '请先登录')
  return auth
}

function requireRole(auth, roles) {
  const list = Array.isArray(roles) ? roles : [roles]
  assert(list.includes(auth.role), 403, '当前身份无权执行该操作')
}

/* ------------------------------------------------------------------ */
/* 参数校验                                                            */
/* ------------------------------------------------------------------ */

/** 只保留白名单字段，多余字段直接丢弃（防止客户端塞 status/金额等） */
function pick(source, allowed) {
  const out = {}
  if (!source || typeof source !== 'object') return out
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key]
  }
  return out
}

function str(value, { min = 0, max = 200, name = '字段', required = false } = {}) {
  const v = value === undefined || value === null ? '' : String(value).trim()
  if (required) assert(v.length > 0, 400, `${name}不能为空`)
  assert(v.length <= max, 400, `${name}过长（最多 ${max} 字）`)
  assert(v.length >= min, 400, `${name}过短（至少 ${min} 字）`)
  return v
}

function int(value, { min = 0, max = 1e9, name = '字段' } = {}) {
  const n = Number(value)
  assert(Number.isFinite(n) && Number.isInteger(n), 400, `${name}必须是整数`)
  assert(n >= min && n <= max, 400, `${name}超出范围`)
  return n
}

/** 元 → 分（整数） */
function toCents(yuan) {
  const n = Number(yuan)
  assert(Number.isFinite(n) && n > 0, 400, '金额不合法')
  const cents = Math.round(n * 100)
  assert(cents >= 100, 400, '金额不能低于 1 元')
  assert(cents <= 100000, 400, '单笔金额不能超过 1000 元')
  return cents
}

function yuan(cents) {
  return Number(((cents || 0) / 100).toFixed(2))
}

/** 手机号脱敏：138****5678 */
function maskMobile(mobile) {
  const s = String(mobile || '')
  if (s.length < 7) return ''
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}

/* ------------------------------------------------------------------ */
/* 防重放 + 限流                                                       */
/* ------------------------------------------------------------------ */

/**
 * 写接口防重放：nonce + timestamp（5 分钟窗口），nonce 落库去重。
 * 客户端每次写操作都要带一个新的 nonce。
 */
async function checkNonce(auth, nonce, timestamp) {
  const ts = Number(timestamp)
  assert(Number.isFinite(ts), 400, '缺少时间戳')
  const drift = Math.abs(Date.now() - ts)
  assert(drift <= 5 * 60 * 1000, 400, '请求已过期，请重试')

  const key = `${auth.uid}:${String(nonce || '').slice(0, 64)}`
  assert(key.length > 40, 400, '缺少请求标识')

  try {
    await db.collection(COLL.nonces).add({
      key,
      uid: auth.uid,
      create_time: Date.now(),
      expire_time: Date.now() + 10 * 60 * 1000
    })
  } catch (e) {
    // 唯一索引冲突 = 重放
    throw new BizError(409, '请求重复，请勿重复提交')
  }
}

/**
 * 简单限流：按 uid + action 计数，窗口内超过 max 次就拒绝。
 * 存一份计数文档，过期后覆盖。
 */
async function rateLimit(auth, action, max, windowMs = 60 * 1000) {
  const key = `${auth.uid}:${action}`
  const now = Date.now()
  const col = db.collection(COLL.limits)
  const res = await col.where({ key }).get()
  const doc = res.data && res.data[0]

  if (!doc || now > doc.reset_time) {
    if (doc) {
      await col.doc(doc._id).set({ key, count: 1, reset_time: now + windowMs })
    } else {
      await col.add({ key, count: 1, reset_time: now + windowMs })
    }
    return
  }
  if (doc.count >= max) throw new BizError(429, '操作太频繁，请稍后再试')
  await col.doc(doc._id).update({ count: dbCmd.inc(1) })
}

/* ------------------------------------------------------------------ */
/* 用户资料                                                            */
/* ------------------------------------------------------------------ */

async function ensureProfile(uid, patch = {}) {
  const res = await db.collection(COLL.users).doc(uid).get()
  const exists = res.data && res.data[0]
  const now = Date.now()

  if (exists) {
    if (Object.keys(patch).length) {
      await db.collection(COLL.users).doc(uid).update({ ...patch, update_time: now })
      return { ...exists, ...patch }
    }
    return exists
  }

  // 微信登录拿不到昵称头像了（getUserProfile 已废弃），
  // 新用户给一个默认昵称，避免"登录成功了但资料一片空白"看起来像没登录。
  const defaultNick = '同学' + String(Math.floor(1000 + Math.random() * 9000))

  const doc = {
    _id: uid,
    role: ROLE.USER,
    nickname: defaultNick,
    avatar: '',
    mobile: '',
    school: SCHOOL,
    rider_status: 0, // 0 未申请 1 审核中 2 已通过 3 已拒绝
    rating: 5,
    rating_count: 0,
    published_count: 0,
    accepted_count: 0,
    total_income_cent: 0,
    create_time: now,
    update_time: now,
    ...patch
  }
  try {
    await db.collection(COLL.users).add(doc)
  } catch (e) {
    // 并发下可能已被创建，忽略
  }
  return doc
}

/* ------------------------------------------------------------------ */
/* 字段裁剪（两端口信息隔离的唯一实现）                                  */
/* ------------------------------------------------------------------ */

/**
 * 任务对「用户端」的可见视图
 * 用户看骑手：只给昵称、头像、评分、接单数，绝不给手机号/学校/真名
 */
function taskForUser(task, viewerId) {
  const isPublisher = task.publisher_id === viewerId
  const isRunner = task.runner_id === viewerId
  return {
    _id: task._id,
    title: task.title,
    type: task.type,
    type_text: TASK_TYPE[task.type] || '其他',
    description: task.description,
    amount_cent: task.amount_cent,
    amount: yuan(task.amount_cent),
    commission_cent: task.commission_cent,
    status: task.status,
    status_text: STATUS_TEXT[task.status] || '',
    item_type: task.item_type,
    item_size: task.item_size,
    item_weight: task.item_weight,
    time_option: task.time_option,
    origin: task.origin,
    destination: task.destination,
    remark: task.remark,
    images: task.images || [],
    create_time: task.create_time,
    pay_time: task.pay_time,
    accept_time: task.accept_time,
    delivered_time: task.delivered_time,
    complete_time: task.complete_time,
    cancel_time: task.cancel_time,
    // 联系方式只给发布者自己
    contact: isPublisher
      ? { mobile: task.mobile, wechat_id: task.wechat_id }
      : null,
    role: isPublisher ? 'publisher' : isRunner ? 'runner' : 'visitor',
    rider: task.runner_id
      ? {
          _id: task.runner_id,
          nickname: task.runner_nickname || '骑手',
          avatar: task.runner_avatar || '',
          rating: task.runner_rating || 5,
          accepted_count: task.runner_accepted_count || 0
        }
      : null
  }
}

/**
 * 任务对「骑手端」的可见视图
 * 接单前：不给手机号、不给门牌详情（只给大概位置），不给发布者身份信息
 * 接单后：给脱敏手机号，可以联系
 */
function taskForRider(task, riderId) {
  const isRunner = task.runner_id === riderId
  const accepted = task.status === STATUS.ONGOING || task.status === STATUS.DONE
  return {
    _id: task._id,
    title: task.title,
    type: task.type,
    type_text: TASK_TYPE[task.type] || '其他',
    description: task.description,
    amount_cent: task.amount_cent,
    amount: yuan(task.amount_cent),
    income_cent: task.rider_income_cent || 0,
    income: yuan(task.rider_income_cent || 0),
    status: task.status,
    status_text: STATUS_TEXT[task.status] || '',
    item_type: task.item_type,
    item_size: task.item_size,
    item_weight: task.item_weight,
    time_option: task.time_option,
    // 接单前只给大致地点，接单后才给完整地址
    origin: accepted ? task.origin : { name: task.origin && task.origin.name, detail: '' },
    destination: accepted ? task.destination : { name: task.destination && task.destination.name, detail: '' },
    remark: accepted ? task.remark : '',
    create_time: task.create_time,
    accept_time: task.accept_time,
    delivered_time: task.delivered_time,
    complete_time: task.complete_time,
    // 关键隔离点：接单前没有任何联系方式
    contact: isRunner && accepted
      ? { mobile_masked: maskMobile(task.mobile), wechat_id: task.wechat_id || '' }
      : null,
    mine: isRunner
  }
}

/** 骑手公开资料（给用户看到的） */
function riderPublic(profile) {
  if (!profile) return null
  return {
    _id: profile._id,
    nickname: profile.nickname || '骑手',
    avatar: profile.avatar || '',
    rating: profile.rating || 5,
    accepted_count: profile.accepted_count || 0
  }
}

/** 自己的完整资料（只给自己） */
function myProfile(profile) {
  return {
    _id: profile._id,
    role: profile.role,
    nickname: profile.nickname || '',
    avatar: profile.avatar || '',
    mobile: profile.mobile || '',
    school: profile.school || SCHOOL,
    rider_status: profile.rider_status || 0,
    rating: profile.rating || 5,
    rating_count: profile.rating_count || 0,
    published_count: profile.published_count || 0,
    accepted_count: profile.accepted_count || 0,
    total_income_cent: profile.total_income_cent || 0
  }
}

/* ------------------------------------------------------------------ */
/* 记账（唯一入口）                                                     */
/* ------------------------------------------------------------------ */

async function ensureWallet(uid) {
  const res = await db.collection(COLL.wallets).doc(uid).get()
  if (res.data && res.data[0]) return res.data[0]
  const doc = {
    _id: uid,
    balance_cent: 0,
    frozen_cent: 0,
    income_cent: 0,
    withdrawn_cent: 0,
    update_time: Date.now(),
    create_time: Date.now()
  }
  try {
    await db.collection(COLL.wallets).add(doc)
  } catch (e) {}
  return doc
}

function txDoc({ type, uid, taskId, amountCent, remark, key }) {
  return {
    type,
    user_id: uid,
    task_id: taskId || '',
    amount_cent: amountCent,
    remark: remark || '',
    idempotency_key: key,
    create_time: Date.now()
  }
}

/**
 * 结算一单：把托管里的钱拆成「骑手收入」和「平台佣金」
 * 幂等：靠 tasks.status 的 CAS + transactions.idempotency_key 唯一索引
 */
async function settleTask(task, operatorUid) {
  assert(task.status === STATUS.ONGOING, 400, '当前状态不能结算')

  const amount = task.amount_cent
  const commission = Math.round(amount * COMMISSION_RATE)
  const riderIncome = amount - commission

  const wallet = await ensureWallet(task.runner_id)

  // 用「状态必须还是 2」做 CAS，防止重复结算
  const upd = await db
    .collection(COLL.tasks)
    .where({ _id: task._id, status: STATUS.ONGOING })
    .update({
      status: STATUS.DONE,
      commission_cent: commission,
      rider_income_cent: riderIncome,
      complete_time: Date.now(),
      complete_by: operatorUid
    })

  if (!upd.updated) throw new BizError(409, '订单状态已变化，请刷新后重试')

  await db.collection(COLL.wallets).doc(wallet._id).update({
    balance_cent: dbCmd.inc(riderIncome),
    income_cent: dbCmd.inc(riderIncome),
    update_time: Date.now()
  })

  await Promise.all([
    db.collection(COLL.transactions).add(
      txDoc({
        type: TX_TYPE.INCOME,
        uid: task.runner_id,
        taskId: task._id,
        amountCent: riderIncome,
        remark: `完成订单收入（已扣平台佣金 ${yuan(commission)} 元）`,
        key: `income:${task._id}`
      })
    ),
    db.collection(COLL.transactions).add(
      txDoc({
        type: TX_TYPE.COMMISSION,
        uid: 'platform',
        taskId: task._id,
        amountCent: commission,
        remark: '平台佣金',
        key: `commission:${task._id}`
      })
    ),
    db.collection(COLL.transactions).add(
      txDoc({
        type: TX_TYPE.ESCROW_OUT,
        uid: task.publisher_id,
        taskId: task._id,
        amountCent: -amount,
        remark: '托管出账',
        key: `escrow_out:${task._id}`
      })
    ),
    db.collection(COLL.users).doc(task.runner_id).update({
      accepted_count: dbCmd.inc(1),
      total_income_cent: dbCmd.inc(riderIncome),
      update_time: Date.now()
    })
  ])

  return { commission, riderIncome }
}

/** 取消并退款（只有未接单时可以） */
async function refundTask(task, reason) {
  assert(task.status === STATUS.PENDING, 400, '当前状态不能取消')

  const upd = await db
    .collection(COLL.tasks)
    .where({ _id: task._id, status: STATUS.PENDING })
    .update({
      status: STATUS.CANCELLED,
      cancel_time: Date.now(),
      cancel_reason: reason || '用户取消',
      refund_cent: task.amount_cent
    })
  if (!upd.updated) throw new BizError(409, '订单状态已变化，请刷新后重试')

  await db.collection(COLL.transactions).add(
    txDoc({
      type: TX_TYPE.REFUND,
      uid: task.publisher_id,
      taskId: task._id,
      amountCent: task.amount_cent,
      remark: `取消退款：${reason || '用户取消'}`,
      key: `refund:${task._id}`
    })
  )
  await db.collection(COLL.users).doc(task.publisher_id).update({ update_time: Date.now() })
  return { refund: task.amount_cent }
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function taskIdOf(value) {
  const id = String(value || '').trim()
  assert(id.length >= 8 && id.length <= 64, 400, '订单号不合法')
  return id
}

async function getTask(taskId) {
  const res = await db.collection(COLL.tasks).doc(taskId).get()
  const task = res.data && res.data[0]
  assert(task, 404, '订单不存在')
  return task
}

module.exports = {
  db,
  dbCmd,
  SCHOOL,
  COMMISSION_RATE,
  AUTO_CONFIRM_HOURS,
  STATUS,
  STATUS_TEXT,
  TASK_TYPE,
  ROLE,
  COLL,
  TX_TYPE,
  BizError,
  ok,
  fail,
  assert,
  guard,
  getAuth,
  requireAuth,
  requireRole,
  pick,
  str,
  int,
  toCents,
  yuan,
  maskMobile,
  checkNonce,
  rateLimit,
  ensureProfile,
  taskForUser,
  taskForRider,
  riderPublic,
  myProfile,
  ensureWallet,
  txDoc,
  settleTask,
  refundTask,
  taskIdOf,
  getTask
}
