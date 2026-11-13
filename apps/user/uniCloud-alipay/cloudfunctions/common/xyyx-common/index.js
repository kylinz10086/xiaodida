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

/**
 * 默认值 = 代码兜底。真实生效值来自数据库 `xyyx-settings` 集合里 _id 为 `app` 的那条文档。
 * 后台「系统设置」页改了立刻生效（每个云函数实例缓存 60 秒）。
 *
 * 为什么不写死在代码里：抽佣比例、退款通道费率这类东西要随运营调整，
 * 写死一次就得改代码 + 重新部署一轮，太慢也容易漏。
 */
const DEFAULT_SETTINGS = {
  /** 平台抽佣比例（骑手收入 = 订单金额 × (1 - 该值)） */
  commissionRate: 0.08,
  /**
   * 退款时扣除的支付通道费率。
   * 默认 0 = 全额原路退回（当前产品选择）。
   * 想收 0.6% 就改成 0.006，改完立即生效，代码不用动。
   */
  refundFeeRate: 0,
  /** 送达后多少小时自动确认（两段式模式下生效） */
  autoConfirmHours: 24,
  /** 骑手点「已送达」是否立刻完成并结算 */
  autoSettleOnDeliver: true,
  /** 订单金额区间（元） */
  minOrderYuan: 1,
  maxOrderYuan: 1000,
  /** 单笔提现下限（元）
   *  1.11.3 起从 3 元降到 1 元：学生单笔收入常常就几块钱，3 元门槛等于提不出来。
   *  真正的风控不靠这个门槛，靠单笔上限 / 单日次数 / 单日累计 / 冷却。 */
  minWithdrawYuan: 1,
  /** 抢单频率限制：每分钟最多几次 */
  grabPerMinute: 30,
  /** 放弃订单限制：每天最多几次 */
  abandonPerDay: 5,
  /** 客服联系方式（展示用，可留空） */
  supportMobile: '',
  /** 公告/下线提示（留空表示正常营业） */
  notice: ''
}

const SETTINGS_TTL = 60 * 1000
/** 配置结构版本：改了默认值、又需要老配置跟着变时 +1，loadSettings 里做一次性迁移 */
const SETTINGS_VERSION = 2
let _settings = null
let _settingsAt = 0

function clampNumber(v, def, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS
  const src = raw || {}
  return {
    commissionRate: clampNumber(src.commissionRate, d.commissionRate, 0, 0.5),
    refundFeeRate: clampNumber(src.refundFeeRate, d.refundFeeRate, 0, 0.2),
    autoConfirmHours: clampNumber(src.autoConfirmHours, d.autoConfirmHours, 1, 168),
    autoSettleOnDeliver:
      src.autoSettleOnDeliver === undefined ? d.autoSettleOnDeliver : !!src.autoSettleOnDeliver,
    minOrderYuan: clampNumber(src.minOrderYuan, d.minOrderYuan, 0.01, 1000),
    maxOrderYuan: clampNumber(src.maxOrderYuan, d.maxOrderYuan, 1, 10000),
    minWithdrawYuan: clampNumber(src.minWithdrawYuan, d.minWithdrawYuan, 0, 10000),
    grabPerMinute: clampNumber(src.grabPerMinute, d.grabPerMinute, 1, 600),
    abandonPerDay: clampNumber(src.abandonPerDay, d.abandonPerDay, 0, 100),
    supportMobile: String(src.supportMobile || d.supportMobile).slice(0, 20),
    notice: String(src.notice || d.notice).slice(0, 200)
  }
}

/**
 * 同步读配置。
 * 云对象方法入口（guard）会先 loadSettings 一次，所以方法内部直接同步读没问题；
 * 没加载过 / 读库失败时返回默认值，业务不会因为配置表挂了而不可用。
 */
function S() {
  return _settings || DEFAULT_SETTINGS
}

/** 从数据库重新加载配置（force=true 跳过缓存；后台保存后用它立即生效） */
async function loadSettings(force) {
  const now = Date.now()
  if (!force && _settings && now - _settingsAt < SETTINGS_TTL) return _settings
  try {
    const res = await db.collection(COLL.settings).doc('app').get()
    const doc = (res.data && res.data[0]) || null

    if (!doc) {
      // 配置表里还没有这条文档：把默认值写进去，
      // 这样以后在后台改配置就有「数据源」，而不是永远吃代码里的默认值
      _settings = normalizeSettings({})
      await db
        .collection(COLL.settings)
        .doc('app')
        .set({
          ..._settings,
          settings_version: SETTINGS_VERSION,
          create_time: now,
          update_time: now,
          update_by: 'system'
        })
        .catch(() => {})
    } else if (doc.update_by === 'system' && !sameSettings(doc, DEFAULT_SETTINGS)) {
      // 这条是系统自动种下的、没人改过 → 代码默认值变了就跟着刷新
      // （后台一旦保存过，update_by 变成管理员 uid，就再也不动它了）
      _settings = normalizeSettings({})
      await db
        .collection(COLL.settings)
        .doc('app')
        .set({
          ..._settings,
          settings_version: SETTINGS_VERSION,
          create_time: doc.create_time || now,
          update_time: now,
          update_by: 'system'
        })
        .catch(() => {})
    } else {
      _settings = normalizeSettings(doc)
      // 后台保存过的配置不会被代码默认值覆盖，所以「改了默认值要生效」得走一次性迁移。
      // 这里只动需要变的项，管理员调过的其它配置原样保留。
      if (Number(doc.settings_version) < SETTINGS_VERSION) {
        _settings.minWithdrawYuan = 1
        await db
          .collection(COLL.settings)
          .doc('app')
          .update({
            minWithdrawYuan: 1,
            settings_version: SETTINGS_VERSION,
            update_time: now
          })
          .catch(() => {})
      }
    }
  } catch (e) {
    // 集合不存在 / 网络异常：退回默认值，并推后缓存时间，避免每次都撞库
    _settings = normalizeSettings({})
  }
  _settingsAt = now
  return _settings
}

/** 两个配置对象在「可调项」上是否完全一致 */
function sameSettings(a, b) {
  const keys = Object.keys(DEFAULT_SETTINGS)
  return keys.every((k) => String(a[k]) === String(b[k]))
}

/** 后台保存配置：合并 + 校验 + 落库 + 立即生效 */
async function saveSettings(patch, operator) {
  const current = await loadSettings(true)
  const merged = normalizeSettings({ ...current, ...(patch || {}) })
  const now = Date.now()
  try {
    await db.collection(COLL.settings).doc('app').set({
      ...merged,
      update_time: now,
      update_by: operator || ''
    })
  } catch (e) {
    throw new BizError(500, '配置保存失败：请先创建 yyx-settings 集合（或上传 database/db_init.json）')
  }
  _settings = merged
  _settingsAt = now
  return merged
}

/** 下发给客户端的配置（只放公开项，别把内部风控参数吐出去） */
function publicSettings() {
  const s = S()
  return {
    commissionRate: s.commissionRate,
    refundFeeRate: s.refundFeeRate,
    minOrderYuan: s.minOrderYuan,
    maxOrderYuan: s.maxOrderYuan,
    minWithdrawYuan: s.minWithdrawYuan,
    autoSettleOnDeliver: s.autoSettleOnDeliver,
    supportMobile: s.supportMobile,
    notice: s.notice
  }
}

/** 平台抽佣比例兜底值（实际用 S().commissionRate） */
const COMMISSION_RATE = DEFAULT_SETTINGS.commissionRate

/** 退款通道费率兜底值（实际用 S().refundFeeRate） */
const REFUND_FEE_RATE = DEFAULT_SETTINGS.refundFeeRate

/** 退款手续费（分）：按毛额算，四舍五入到分 */
function refundFeeOf(amountCent) {
  const rate = S().refundFeeRate
  const gross = Math.max(0, Math.round(Number(amountCent) || 0))
  if (!rate || gross <= 0) return 0
  // 至少留 1 分给用户，避免小额单退成 0
  const fee = Math.round(gross * rate)
  return Math.min(fee, Math.max(0, gross - 1))
}

/** 扣完手续费后实际退给用户的钱（分） */
function refundNetOf(amountCent) {
  const gross = Math.max(0, Math.round(Number(amountCent) || 0))
  return gross - refundFeeOf(gross)
}

/** 送达后多久自动确认（小时，兜底值） */
const AUTO_CONFIRM_HOURS = DEFAULT_SETTINGS.autoConfirmHours

/** 骑手点「已送达」是否立刻结算（兜底值；实际用 S().autoSettleOnDeliver） */
const AUTO_SETTLE_ON_DELIVER = DEFAULT_SETTINGS.autoSettleOnDeliver

/** 学号规则：4 位入学学年 + 6 位学院专业号 + 5 位班级学号 = 15 位 */
const STUDENT_NO_RE = /^\d{15}$/

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

/** 退款单/订单上的退款进度文案 */
const REFUND_STATUS_TEXT = {
  '': '',
  none: '',
  processing: '退款中',
  partial: '部分退款',
  done: '已退款',
  failed: '退款失败'
}

const ROLE = { USER: 'user', RIDER: 'rider', ADMIN: 'admin' }

const COLL = {
  users: 'xyyx-users',
  tasks: 'xyyx-tasks',
  wallets: 'xyyx-wallets',
  transactions: 'xyyx-transactions',
  nonces: 'xyyx-nonces',
  limits: 'xyyx-ratelimits',
  agreements: 'xyyx-agreements',
  reviews: 'xyyx-reviews',
  // 退款单：每一次「退钱」都是一条独立记录。微信退款是异步的，
  // 靠这张表追踪 processing → success / failed，支持重试与后台排查。
  refunds: 'xyyx-refunds',
  // 支付单：每一次「发起支付」都登记一条，微信回调只带 out_trade_no，
  // 靠这张表才能保证「一笔迟到的支付」也一定能找到它属于哪个订单。
  payorders: 'xyyx-payorders',
  // 运行的配置（抽佣比例、退款费率、金额区间…），一条 _id='app' 的文档
  settings: 'xyyx-settings',
  // 订单内聊天（用户 ↔ 骑手），只允许订单双方读写，全部走云对象
  messages: 'xyyx-messages',
  // 图片字节直存：上传时顺手把压缩后的小图 base64 存一份，
  // 看图和云存储 / CDN 域名 / 本地文件系统全部解耦（小程序端最稳的方式）。
  images: 'xyyx-images',
  // 提现单：每笔提现一条，记录微信转账状态（待确认/成功/失败），
  // 失败自动冲正余额，后台可核查、可重发。
  withdrawals: 'xyyx-withdrawals'
}

const TX_TYPE = {
  ESCROW_IN: 'escrow_in', // 用户支付，钱进托管
  ESCROW_OUT: 'escrow_out', // 托管出账（结算给骑手）
  INCOME: 'income', // 骑手收入
  COMMISSION: 'commission', // 平台佣金
  REFUND: 'refund', // 退款给用户（净额）
  REFUND_FEE: 'refund_fee', // 退款时扣下的支付通道手续费（平台留存）
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
      // 每次调用前确保配置是最新的（内部有 60 秒缓存，不会常驻打库）。
      // 这样后台改了抽佣比例/退款费率，最迟 1 分钟内所有方法都用新值。
      await loadSettings()
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
  let payload
  try {
    const uniID = uniIDCommon.createInstance({ clientInfo: ctx.getClientInfo() })
    payload = await uniID.checkToken(token)
  } catch (e) {
    // 过期/伪造/畸形 token 不能让 guard 兜成 500，统一按未登录处理
    return null
  }
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

/**
 * 管理员鉴权：优先看 xyyx-users.role；没有该扩展资料时回退到 uni-id-users.role。
 * 管理后台用 uni-id 账号登录，不强制要求先有 xyyx-users 记录。
 */
async function requireAdmin(ctx) {
  const auth = await getAuth(ctx)
  assert(auth, 401, '请先登录')
  if (auth.role === ROLE.ADMIN) return auth

  const token = typeof ctx.getUniIdToken === 'function' ? ctx.getUniIdToken() : ''
  const uniID = uniIDCommon.createInstance({ clientInfo: ctx.getClientInfo() })
  const payload = await uniID.checkToken(token)
  assert(payload && !payload.errCode && payload.uid, 401, '登录已失效')

  const res = await db.collection('uni-id-users').doc(auth.uid).field({ role: true }).get()
  const user = (res.data && res.data[0]) || {}
  const roles = Array.isArray(user.role) ? user.role : [user.role]
  assert(roles.includes(ROLE.ADMIN), 403, '需要管理员权限')
  return { ...auth, role: ROLE.ADMIN }
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

/**
 * 图片缩略图（data URI）校验。
 *
 * 小程序 <image> 加载 http 图片要走 downloadFile 域名白名单，云存储的 CDN 域名
 * 没配置就整片裂图，临时链接还会过期。所以聊天图片、留痕图片都在发送时
 * 带一张内嵌的缩略图，展示只靠它；原图另存在云存储，点开预览才用。
 */
const IMAGE_THUMB_MAX = 20000
const IMAGE_THUMB_RE = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/

function imageThumb(value, opts = {}) {
  const v = value === undefined || value === null ? '' : String(value).trim()
  if (!v) return ''
  assert(v.length <= (opts.max || IMAGE_THUMB_MAX), 400, `${opts.name || '图片缩略图'}过大`)
  assert(IMAGE_THUMB_RE.test(v), 400, `${opts.name || '图片缩略图'}格式不对`)
  return v
}

/**
 * 头像取值：压缩后的 data URI（主要形态）、本地静态路径或 http 链接。
 *
 * 公众号/小程序头像上传走了两条老路都不通：临时文件路径别人看不到、
 * cloud:// 需要临时链接且会过期。所以客户端把头像压到 240px 再存成 data URI，
 * 这里放宽长度上限（24KB）并校验格式，避免又变成「存了个谁也显示不出来的字符串」。
 */
const AVATAR_MAX = 16000
/** 高清头像：只在 getProfile / 我的页用，列表接口不下发 */
const AVATAR_HD_MAX = 150000
const AVATAR_RE = /^(?:data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+|\/static\/[^\s]+|https?:\/\/[^\s]+)$/

function avatarValue(value, name = '头像', max = AVATAR_MAX) {
  const v = value === undefined || value === null ? '' : String(value).trim()
  if (!v) return ''
  assert(v.length <= max, 400, `${name}太大，换一张小一点的图片`)
  assert(AVATAR_RE.test(v), 400, `${name}格式不对`)
  return v
}

/** 元 → 分（整数）。金额区间来自配置表，后台可调 */
function toCents(yuan) {
  const n = Number(yuan)
  assert(Number.isFinite(n) && n > 0, 400, '金额不合法')
  const cents = Math.round(n * 100)
  const s = S()
  const minCent = Math.round(s.minOrderYuan * 100)
  const maxCent = Math.round(s.maxOrderYuan * 100)
  assert(cents >= minCent, 400, `金额不能低于 ${s.minOrderYuan} 元`)
  assert(cents <= maxCent, 400, `单笔金额不能超过 ${s.maxOrderYuan} 元`)
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

/**
 * 学号解析。
 *
 * 学校学号是 15 位定长编码，例：202512211404009
 *   2025    入学学年
 *   122114  学院 + 专业号
 *   04009   班级 + 班内学号
 *
 * 之所以单独解析：审核的人要一眼看出「哪个学院、哪个班」，
 * 前端也不能再把这串数字截断/换行显示成两截。
 */
function parseStudentNo(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim()
  const digits = raw.replace(/\s+/g, '')
  if (!STUDENT_NO_RE.test(digits)) {
    return { raw, digits, valid: false, year: '', major: '', class_no: '', display: raw, error: '学号应为 15 位数字' }
  }
  const year = digits.slice(0, 4)
  const major = digits.slice(4, 10)
  const classNo = digits.slice(10)
  return {
    raw,
    digits,
    valid: true,
    year,
    major,
    class_no: classNo,
    // 展示用：2025 学年 · 122114 · 04009
    display: `${year} 学年 · ${major} · ${classNo}`
  }
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
function taskForUser(task, viewerId, opts = {}) {
  const isPublisher = task.publisher_id === viewerId
  const isRunner = task.runner_id === viewerId
  // 门牌详情/备注属于隐私：只有发布者本人和接单者能看到，游客（大厅里其他人）只看地点名
  const canSeeDetail = isPublisher || isRunner
  // 缩略图只在详情接口下发：列表里一次几十单，带上 base64 会把返回体撑爆
  const withThumbs = !!opts.detail && canSeeDetail
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
    pay_status: task.pay_status,
    // —— 钱相关：这几个字段是「修改订单 / 退款」的前端依据 ——
    paid_cent: paidCentOf(task),
    paid: yuan(paidCentOf(task)),
    /** 涨价后待补的差价（分/元），0 表示已付清 */
    due_cent: dueCentOf(task),
    due: yuan(dueCentOf(task)),
    // 退款三个口径：gross=从支付里扣掉多少，net=用户实际到手，fee=平台留下的通道费
    refund_cent: refundedNetCentOf(task),
    refund: yuan(refundedNetCentOf(task)),
    refund_gross_cent: refundedCentOf(task),
    refund_gross: yuan(refundedCentOf(task)),
    refund_fee_cent: Math.max(0, Number(task.refund_fee_cent) || 0),
    refund_fee: yuan(Number(task.refund_fee_cent) || 0),
    refund_status: task.refund_status || '',
    refund_status_text: REFUND_STATUS_TEXT[task.refund_status || ''] || '',
    /** 退款失败的具体原因，直接展示给用户/运营 */
    refund_fail_reason: task.refund_fail_reason || '',
    pay_mode: task.pay_mode || '',
    /** 已付清（可以撤单退款/正常结算） */
    paid_off: dueCentOf(task) === 0 && paidCentOf(task) > 0,
    item_type: task.item_type,
    item_size: task.item_size,
    item_weight: task.item_weight,
    time_option: task.time_option,
    origin: canSeeDetail
      ? task.origin
      : { name: task.origin && task.origin.name, detail: '', latitude: 0, longitude: 0 },
    destination: canSeeDetail
      ? task.destination
      : { name: task.destination && task.destination.name, detail: '', latitude: 0, longitude: 0 },
    remark: canSeeDetail ? task.remark : '',
    images: task.images || [],
    // 图片缩略图（data URI）：详情页直接画，不依赖云存储域名/临时链接
    image_thumbs: withThumbs ? task.image_thumbs || [] : [],
    // 取件/送达留痕：只有订单双方能看，纠纷时当证据
    pick_proof: canSeeDetail ? task.pick_proof || '' : '',
    deliver_proof: canSeeDetail ? task.deliver_proof || '' : '',
    pick_proof_thumb: withThumbs ? task.pick_proof_thumb || '' : '',
    deliver_proof_thumb: withThumbs ? task.deliver_proof_thumb || '' : '',
    create_time: task.create_time,
    pay_time: task.pay_time,
    accept_time: task.accept_time,
    picked_time: task.picked_time || 0,
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
 * 接单前：不给手机号、不给门牌详情（只给大概位置 + 坐标算距离），不给发布者身份信息
 * 接单后：给完整手机号（要打电话联系）、门牌详情、坐标
 */
function taskForRider(task, riderId, opts = {}) {
  const isRunner = task.runner_id === riderId
  // 只有「接单者本人」在订单进行中/完成后才解锁完整地址和联系方式。
  // 只看状态会让别的骑手通过 detail 接口看到别人订单的门牌和备注。
  const accepted = isRunner && (task.status === STATUS.ONGOING || task.status === STATUS.DONE)
  const withThumbs = !!opts.detail && accepted

  // 待接单时 rider_income_cent 还不存在，前端「可赚」会显示 ¥0。
  // 这里按平台抽佣预算出预期收入，已结算的则用真实结算值。
  const amountCent = Number(task.amount_cent) || 0
  const settledIncome = Number(task.rider_income_cent) || 0
  const incomeCent = settledIncome || Math.round(amountCent * (1 - S().commissionRate))

  // 坐标：大厅里也要给，骑手要按距离挑单；门牌/备注仍然只给接单者。
  const place = (p) => {
    const src = p || {}
    return {
      name: src.name || '',
      detail: accepted ? src.detail || '' : '',
      latitude: Number(src.latitude) || 0,
      longitude: Number(src.longitude) || 0
    }
  }

  return {
    _id: task._id,
    title: task.title,
    type: task.type,
    type_text: TASK_TYPE[task.type] || '其他',
    description: task.description,
    amount_cent: amountCent,
    amount: yuan(amountCent),
    commission_cent: Number(task.commission_cent) || Math.round(amountCent * S().commissionRate),
    income_cent: incomeCent,
    income: yuan(incomeCent),
    /** 收入是否已经结算进钱包 */
    income_settled: settledIncome > 0,
    status: task.status,
    status_text: STATUS_TEXT[task.status] || '',
    item_type: task.item_type,
    item_size: task.item_size,
    item_weight: task.item_weight,
    time_option: task.time_option,
    origin: place(task.origin),
    destination: place(task.destination),
    images: task.images || [],
    image_thumbs: withThumbs ? task.image_thumbs || [] : [],
    pick_proof: accepted ? task.pick_proof || '' : '',
    deliver_proof: accepted ? task.deliver_proof || '' : '',
    pick_proof_thumb: withThumbs ? task.pick_proof_thumb || '' : '',
    deliver_proof_thumb: withThumbs ? task.deliver_proof_thumb || '' : '',
    remark: accepted ? task.remark || '' : '',
    create_time: task.create_time,
    accept_time: task.accept_time,
    picked_time: task.picked_time,
    delivered_time: task.delivered_time,
    complete_time: task.complete_time,
    auto_confirm_at: task.auto_confirm_at || 0,
    abandon_reason: task.abandon_reason || '',
    // 关键隔离点：接单前没有任何联系方式；接单后给完整手机号（骑手要打电话）
    contact: isRunner && accepted
      ? { mobile: task.mobile || '', mobile_masked: maskMobile(task.mobile), wechat_id: task.wechat_id || '' }
      : null,
    mine: isRunner,
    /** 送达后是否还要等用户确认（false=送达即完成） */
    need_confirm: !S().autoSettleOnDeliver
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
  // 学号、真实姓名只回给本人（审核信息），并且完整回给本人：
  // 之前 myProfile 里根本没有这两个字段，骑手在自己资料页看不到完整学号，
  // 审核后台又只能看到一串挤在一起的数字，很容易被当成「少了几位」。
  const student = parseStudentNo(profile.student_no)
  return {
    _id: profile._id,
    role: profile.role,
    nickname: profile.nickname || '',
    avatar: profile.avatar || '',
    // 高清头像只在「我的」页用；列表/聊天用压缩过的 avatar，避免返回体过大
    avatar_hd: profile.avatar_hd || '',
    mobile: profile.mobile || '',
    school: profile.school || SCHOOL,
    real_name: profile.real_name || '',
    student_no: student.digits || '',
    student_no_display: student.display,
    student_info: {
      valid: student.valid,
      year: student.year,
      major: student.major,
      class_no: student.class_no
    },
    rider_status: profile.rider_status || 0,
    rider_status_text: ['未申请', '审核中', '已通过', '已拒绝'][profile.rider_status || 0] || '未申请',
    rider_reject_reason: profile.rider_reject_reason || '',
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
  const commission = Math.round(amount * S().commissionRate)
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

/* ------------------------------------------------------------------ */
/* 订单金额：一笔订单可能有多笔支付（全款 + 涨价补的差价）              */
/* ------------------------------------------------------------------ */

/**
 * task.payments = [{ no, cent, type, time, refunded }]
 *   no       微信 out_trade_no（我们自己生成，≤32 位，必须全局唯一）
 *   cent     这笔实际扣了多少（分）
 *   refunded 这笔已经退了多少（分）
 *
 * 为什么不用「一个订单一个 out_trade_no」：
 *   修改订单把价格从 1 元调到 3 元时，只需要补 2 元差价，
 *   但微信支付要求每次支付用不同的 out_trade_no，
 *   所以补差价必须是一笔新的支付 —— 而退款要按「原支付单」退，
 *   于是必须记住每笔支付各自退了多少，才能既不重复退也不漏退。
 */
function paymentsOf(task) {
  const list = task && task.payments
  return Array.isArray(list) ? list.filter((p) => p && Number(p.cent) > 0) : []
}

/** 订单实际收到的钱（分） */
function paidCentOf(task) {
  const list = paymentsOf(task)
  if (list.length) return list.reduce((s, p) => s + Number(p.cent || 0), 0)
  // 兼容老数据：老订单只有一笔支付，pay_status 就能推出来
  const status = task && task.pay_status
  if (status === 'paid' || status === 'refunded' || status === 'refunding') return Number(task.amount_cent) || 0
  return 0
}

/** 已经退回去的钱（分） */
function refundedCentOf(task) {
  const list = paymentsOf(task)
  if (list.length) return list.reduce((s, p) => s + Number(p.refunded || 0), 0)
  return Math.max(0, Number(task && task.refund_cent) || 0)
}

/** 还差多少钱没付（涨价后待补的差价）。0 表示已付清 */
function dueCentOf(task) {
  return Math.max(0, Number(task && task.due_cent) || 0)
}

/** 还能退多少钱（分） */
function refundableCentOf(task) {
  return Math.max(0, paidCentOf(task) - refundedCentOf(task))
}

/**
 * 用户实际到手的退款（分）= 毛额 - 通道费。
 * 老数据没有 refund_net_cent，就退回用 refund_cent。
 */
function refundedNetCentOf(task) {
  const explicit = Number(task && task.refund_net_cent)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  return refundedCentOf(task)
}

/** 微信 out_trade_no：≤32 位、同一商户号下唯一 */
function newPayNo(isTopup) {
  const rand = crypto.randomBytes(4).toString('hex')
  const ts = Date.now().toString(36)
  return `${isTopup ? 'T' : 'P'}${ts}${rand}`
}

/** 微信要求 out_refund_no 全局唯一 */
function newRefundNo() {
  const rand = crypto.randomBytes(4).toString('hex')
  const ts = Date.now().toString(36)
  return `R${ts}${rand}`
}

/**
 * 把一次退款金额摊到具体的支付单上。
 * 从最新的一笔开始退（补的差价通常原封未动），返回每笔退多少。
 */
function allocateRefund(task, amountCent) {
  const list = paymentsOf(task)
  const parts = []
  let remain = Math.round(Number(amountCent) || 0)

  for (let i = list.length - 1; i >= 0 && remain > 0; i--) {
    const p = list[i]
    const can = Math.max(0, Number(p.cent) - Number(p.refunded || 0))
    if (!can) continue
    const take = Math.min(can, remain)
    // total 必须带上「这笔支付当时的金额」，微信要求 refund ≤ total ≤ 原支付金额。
    // 订单改过价之后 task.amount_cent 已经变了，不能拿它当 total。
    parts.push({ no: p.no, cent: take, index: i, total: Number(p.cent) || take })
    remain -= take
  }

  if (!list.length && remain > 0) {
    // 老订单：只有一笔支付，out_trade_no 就是订单号。
    // 老数据没有 payments，实付金额用 paidCentOf（≤ 当前订单金额），
    // 否则改过价的老订单会算出 refund > total，微信直接拒绝退款。
    const paid = paidCentOf(task)
    parts.push({ no: task._id, cent: remain, index: -1, total: Math.max(paid, remain) })
    remain = 0
  }
  return { parts, unmatched: remain }
}

/** 按 sign(+1/-1) 增减「这笔支付已退多少」 */
async function applyPaymentRefunded(taskId, task, parts, sign) {
  const list = paymentsOf(task).map((p) => ({ ...p }))
  if (!list.length) return
  for (const part of parts || []) {
    const p = list[part.index]
    if (!p) continue
    p.refunded = Math.max(0, Number(p.refunded || 0) + sign * Number(part.cent || 0))
  }
  await db.collection(COLL.tasks).doc(taskId).update({ payments: list, update_time: Date.now() })
}

/**
 * 发起退款（登记 + 记账）。真正的「把钱打回用户微信」由 xyyx-pay.refundTask 执行。
 *
 * 拆两步的原因：
 *   1. 微信退款是异步的，先落一条 processing 记录，成功了再改 success，
 *      中途失败（网络/证书/余额不足）可以重试，不会出现「钱没了、记录也没了」；
 *   2. 没有配置商户证书的环境（mock 支付）没有真实资金流，直接把钱退回余额，
 *      保证账面上不丢钱。
 */
async function beginRefund({ task, amountCent, reason, source = 'cancel', operator = '' }) {
  // amountCent 是「从托管里拿出来的毛额」，真正退给用户的是扣完通道费的净额
  const gross = Math.round(Number(amountCent) || 0)
  assert(gross > 0, 400, '退款金额必须大于 0')

  const refundable = refundableCentOf(task)
  assert(gross <= refundable, 400, `退款金额超过可退金额（可退 ${yuan(refundable)} 元）`)

  // 同一订单同时只允许一笔退款在途，避免重复退
  if (task.refund_status === 'processing') {
    throw new BizError(409, '有一笔退款正在处理中，请稍后再试')
  }

  const mode = task.pay_mode === 'wechat' ? 'wechat' : 'balance'
  const refundNo = newRefundNo()
  const now = Date.now()
  const { parts, unmatched } = allocateRefund(task, gross)
  assert(unmatched === 0, 500, '没有找到可退款的支付记录')

  // 手续费按整笔退款的毛额算；净额摊到各笔支付上（尾差放在最后一笔）
  const fee = refundFeeOf(gross)
  const net = gross - fee
  let left = net
  const netParts = parts.map((p, i) => {
    const isLast = i === parts.length - 1
    const share = isLast ? left : Math.max(0, Math.round((p.cent / gross) * net))
    left -= share
    return { ...p, net: share }
  })
  // 极端情况下（四舍五入把 left 走偏）修正最后一笔
  if (netParts.length) {
    const sumNet = netParts.reduce((s, p) => s + p.net, 0)
    netParts[netParts.length - 1].net += net - sumNet
  }

  const doc = {
    task_id: task._id,
    user_id: task.publisher_id,
    out_refund_no: refundNo,
    // amount_cent 记「毛额」（对应从支付单里扣掉多少），net_cent 是用户实际到手的钱
    amount_cent: gross,
    fee_cent: fee,
    net_cent: net,
    reason: String(reason || '').slice(0, 60) || '订单退款',
    source,
    mode,
    // 统一先记 processing：真正的「退成功」由 finishRefund 落地，
    // 这样余额退款和微信退款走的是同一条收尾逻辑，pay_status/refund_status 不会两套写法。
    status: 'processing',
    // 每笔支付：cent 是毛额（占用可退额度），net 是实际退给微信的金额
    parts: netParts.map((p) => ({
      no: p.no,
      cent: p.cent,
      net: p.net,
      total: p.total,
      index: p.index,
      status: 'pending',
      wx_refund_id: ''
    })),
    operator: operator || '',
    create_time: now,
    update_time: now
  }

  let added
  try {
    added = await db.collection(COLL.refunds).add(doc)
  } catch (e) {
    // 新环境常见：集合还没建。给出能直接照做的提示，而不是笼统的「服务开小差了」
    throw new BizError(
      500,
      '退款登记失败：请先在 uniCloud 控制台创建 xyyx-refunds 集合（或上传 database/db_init.json），再重试'
    )
  }
  const refundId = added.id

  // 记账 + 订单上的退款汇总
  //   refund_cent      记毛额（保证「可退额度」不会被手续费重复占用）
  //   refund_net_cent  记到手金额（界面显示用的是这个）
  //   refund_fee_cent  记手续费（平台留存，单独一笔流水，可对账）
  await Promise.all([
    db.collection(COLL.transactions).add(
      txDoc({
        type: TX_TYPE.REFUND,
        uid: task.publisher_id,
        taskId: task._id,
        amountCent: net,
        remark: `${doc.reason}（退回 ¥${yuan(net)}${fee > 0 ? `，扣通道费 ¥${yuan(fee)}` : ''}）`,
        key: `refund:${refundNo}`
      })
    ),
    fee > 0
      ? db.collection(COLL.transactions).add(
          txDoc({
            type: TX_TYPE.REFUND_FEE,
            uid: 'platform',
            taskId: task._id,
            amountCent: fee,
            remark: '退款通道手续费（0.6%）',
            key: `refund_fee:${refundNo}`
          })
        )
      : Promise.resolve(null),
    db.collection(COLL.tasks).doc(task._id).update({
      refund_cent: dbCmd.inc(gross),
      refund_net_cent: dbCmd.inc(net),
      refund_fee_cent: dbCmd.inc(fee),
      refund_status: 'processing',
      refund_fail_reason: '',
      update_time: now
    }),
    applyPaymentRefunded(task._id, task, parts, 1)
  ])

  // mock 模式没有真实资金流，把钱退到用户余额，保证账面不丢
  if (mode === 'balance') {
    const wallet = await ensureWallet(task.publisher_id)
    await Promise.all([
      db.collection(COLL.wallets).doc(wallet._id).update({
        balance_cent: dbCmd.inc(net),
        update_time: now
      }),
      db.collection(COLL.refunds).doc(refundId).update({
        remark: '已退回账户余额（未开通微信商户支付）'
      })
    ])
    // 与微信退款走同一条收尾：把退款单/订单状态一次性更新到位
    await finishRefund({ refundId, status: 'success' })
  } else {
    // 微信退款：**在当前这次请求里就提交给微信**，不要再等客户端补一刀、
    // 也不要等定时任务（以前要等最多 10 分钟，用户会觉得「退款没用」）。
    // 失败也不抛错：退款单留在 processing，定时任务会继续重试。
    await executeRefund(refundId)
  }

  const finalRefund = await getRefund(refundId)
  return {
    refundId,
    outRefundNo: refundNo,
    // amount 是用户实际到手的金额（界面直接显示这个）
    amount: yuan(net),
    amountCent: net,
    gross: yuan(gross),
    fee: yuan(fee),
    feeCent: fee,
    netCent: net,
    mode,
    status: (finalRefund && finalRefund.status) || 'processing',
    failReason: (finalRefund && finalRefund.fail_reason) || '',
    needWxRefund: false,
    executed: !!(finalRefund && finalRefund.status === 'success')
  }
}

/**
 * 补建「丢失的退款单」。
 *
 * 场景：退款单登记那一刻 yyx-refunds 集合还不存在，结果钱没退、退款单也没落库，
 * 但订单上的 refund_cent / refund_status 已经被写成「退款中/已退」——纯假账。
 * 这里把假账清掉（含每笔支付的已退额度），再按实付金额重新登记并退款。
 */
async function repairOrphanRefund(task, reason) {
  const reset = paymentsOf(task).map((p) => ({ ...p, refunded: 0 }))
  await db.collection(COLL.tasks).doc(task._id).update({
    refund_cent: 0,
    refund_status: '',
    refund_fail_reason: '',
    payments: reset,
    // 已取消的订单钱其实还在托管里，改回 paid 才能重新退
    ...(task.status === STATUS.CANCELLED ? { pay_status: 'paid' } : {}),
    update_time: Date.now()
  })

  const fresh = await getTask(task._id)
  const amount = paidCentOf(fresh)
  assert(amount > 0, 400, '这个订单没有可退的实付金额')

  return beginRefund({
    task: fresh,
    amountCent: amount,
    reason: reason || '退款单丢失，自动补建',
    source: 'repair',
    operator: 'auto'
  })
}

/** 订单是否处于「本该有一笔退款」的状态（用它决定能不能自愈补建） */
function looksRefunding(task) {
  if (!task) return false
  if (task.refund_status === 'processing' || task.refund_status === 'failed') return true
  if (task.pay_status === 'refunding') return true
  return task.status === STATUS.CANCELLED && Number(task.refund_cent) > 0
}

/** 读一张退款单 */
async function getRefund(refundId) {
  try {
    const res = await db.collection(COLL.refunds).doc(String(refundId)).get()
    return (res.data && res.data[0]) || null
  } catch (e) {
    return null
  }
}

/**
 * 立刻把退款单推给微信。
 *
 * 为什么放在 common 里、用 importObject 调 xyyx-pay：
 *   - 退款的资金操作必须写在一处（pay 里有商户私钥和签名），不能复制；
 *   - 云函数调云对象会丢客户端 token，但退款方法本来就不需要用户身份，
 *     pay-notify 早就在用同样的方式调 xyyx-pay；
 *   - 失败不抛异常，退款单保持 processing，由 xyyx-cron 重试。
 */
async function executeRefund(refundId) {
  if (typeof uniCloud === 'undefined' || typeof uniCloud.importObject !== 'function') {
    return { ok: false, msg: '当前环境不支持调用支付云对象' }
  }
  try {
    const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
    const r = await pay.refundTask(refundId)
    if (r && r.code === 0) return { ok: true, msg: r.msg || '已退款' }
    return { ok: false, msg: (r && r.msg) || '退款提交失败' }
  } catch (e) {
    console.warn('[xyyx] 退款提交异常，交给定时任务重试：', e && e.message)
    return { ok: false, msg: (e && e.message) || '退款提交异常' }
  }
}

/**
 * 退款执行完成（或失败）后回写订单与退款单。
 * 由 xyyx-pay.refundTask / 微信退款回调调用。
 */
async function finishRefund({ refundId, status, failReason, parts }) {
  const res = await db.collection(COLL.refunds).doc(refundId).get()
  const refund = res.data && res.data[0]
  assert(refund, 404, '退款单不存在')
  if (refund.status === 'success' && status === 'success') return refund

  const taskRes = await db.collection(COLL.tasks).doc(refund.task_id).get()
  const task = taskRes.data && taskRes.data[0]
  const now = Date.now()

  // 失败的退款要把「已退」预占的额度还回去，否则这笔钱以后再也退不了
  if (status === 'failed' && refund.status !== 'failed' && task) {
    await Promise.all([
      applyPaymentRefunded(task._id, task, refund.parts || [], -1),
      db.collection(COLL.tasks).doc(task._id).update({
        // 毛额/净额/手续费三个口径一起回滚，否则手续费会被重复扣
        refund_cent: dbCmd.inc(-(Number(refund.amount_cent) || 0)),
        refund_net_cent: dbCmd.inc(-(Number(refund.net_cent) || 0)),
        refund_fee_cent: dbCmd.inc(-(Number(refund.fee_cent) || 0)),
        update_time: now
      })
    ])
  }

  await db.collection(COLL.refunds).doc(refundId).update({
    status,
    parts: parts || (refund.parts || []).map((p) => ({
      ...p,
      status: status === 'success' ? 'success' : status
    })),
    fail_reason: status === 'failed' ? String(failReason || '').slice(0, 200) : '',
    finish_time: status === 'success' ? now : 0,
    update_time: now
  })

  if (!task) return { ...refund, status }

  // 重新读一次，拿到最新的已付/已退金额
  const latest = await getTask(task._id)
  const fully = refundedCentOf(latest) >= paidCentOf(latest)
  const patch = {
    refund_status: status === 'success' ? (fully ? 'done' : 'partial') : 'failed',
    update_time: now
  }
  if (status === 'success') patch.refund_fail_reason = ''
  // 全额退款后这单实际上已经没有钱了：不管有没有取消，都不能再当成「已付款」的单
  // （否则它还满足 pay_status='paid' 的条件，会重新出现在抢单大厅里）
  if (status === 'success' && fully) {
    patch.pay_status = 'refunded'
  }
  await db.collection(COLL.tasks).doc(task._id).update(patch)
  return { ...refund, status }
}

/**
 * 退款失败：只把「没退成功的那几笔」的额度还回去。
 * 部分成功时不能整笔回滚，否则账面上会少算已经退出去的钱。
 */
async function failRefund({ refundId, parts, failReason }) {
  const res = await db.collection(COLL.refunds).doc(refundId).get()
  const refund = res.data && res.data[0]
  assert(refund, 404, '退款单不存在')

  const taskRes = await db.collection(COLL.tasks).doc(refund.task_id).get()
  const task = taskRes.data && taskRes.data[0]

  const list = parts && parts.length ? parts : refund.parts || []
  const failed = list.filter((p) => p && p.status !== 'success')
  const failedCent = failed.reduce((s, p) => s + (Number(p.cent) || 0), 0)
  const failedNet = failed.reduce((s, p) => s + (Number(p.net != null ? p.net : p.cent) || 0), 0)
  const failedFee = Math.max(0, failedCent - failedNet)
  const now = Date.now()

  await db.collection(COLL.refunds).doc(refundId).update({
    status: 'failed',
    parts: list,
    fail_reason: String(failReason || '').slice(0, 200),
    retry_count: Number(refund.retry_count || 0) + 1,
    update_time: now
  })

  if (task && failedCent > 0) {
    await applyPaymentRefunded(task._id, task, failed, -1)
    const patch = {
      refund_cent: dbCmd.inc(-failedCent),
      refund_net_cent: dbCmd.inc(-failedNet),
      refund_fee_cent: dbCmd.inc(-failedFee),
      refund_status: 'failed',
      // 把失败原因写回订单，前端能直接显示「为什么没退成」，
      // 而不是只显示一个「退款失败」让人猜
      refund_fail_reason: String(failReason || '').slice(0, 120),
      update_time: now
    }
    // 订单已取消但钱没退出去：说明钱还在平台托管里，改回 paid，
    // 这样它还能继续被重试/被后台补退，而不是显示成「已退款」
    if (task.status === STATUS.CANCELLED) patch.pay_status = 'paid'
    await db.collection(COLL.tasks).doc(task._id).update(patch)
  }
  return { refundId, failedCent, failed: failed.map((p) => p.no) }
}

/**
 * 取消并退款（只有未接单时可以）。
 * 返回结果带 needWxRefund，客户端据此再调 xyyx-pay.refundTask 真正把钱退回去。
 */
async function refundTask(task, reason, source) {
  assert(task.status === STATUS.PENDING, 400, '当前状态不能取消')

  const reasonText = reason || '用户取消'
  const due = dueCentOf(task)
  const alreadyPaid = paidCentOf(task) > 0

  // 状态先落库：CAS 保证并发下只有一次能改成功
  const upd = await db
    .collection(COLL.tasks)
    .where({ _id: task._id, status: STATUS.PENDING })
    .update({
      status: STATUS.CANCELLED,
      // 待补差价的单没付清，取消后按「有支付」处理，剩余部分继续退
      pay_status: alreadyPaid ? 'refunding' : 'unpaid',
      due_cent: 0,
      cancel_time: Date.now(),
      cancel_reason: reasonText
    })
  if (!upd.updated) throw new BizError(409, '订单状态已变化，请刷新后重试')

  let refund = null
  if (alreadyPaid && refundableCentOf(task) > 0) {
    try {
      refund = await beginRefund({
        task,
        amountCent: refundableCentOf(task),
        reason: `取消退款：${reasonText}`,
        source: source || 'cancel',
        operator: 'system'
      })
    } catch (e) {
      // 退款没登记成功（例如 yyx-refunds 集合还没建）→ 把订单恢复成待接单。
      // 绝不能出现「订单取消了、钱没退、也没有任何退款记录」这种状态。
      await db
        .collection(COLL.tasks)
        .doc(task._id)
        .update({
          status: STATUS.PENDING,
          pay_status: task.pay_status || 'paid',
          cancel_time: 0,
          cancel_reason: '',
          update_time: Date.now()
        })
        .catch(() => {})
      throw e
    }
  }

  await db.collection(COLL.users).doc(task.publisher_id).update({ update_time: Date.now() })
  return {
    refund: refund ? refund.amount : 0,
    refundId: refund ? refund.refundId : '',
    // 现在退款是在这次请求里就提交给微信的，needWxRefund 恒为 false；
    // 保留这个字段是为了兼容还没更新的客户端版本。
    needWxRefund: false,
    mode: refund ? refund.mode : '',
    refundStatus: refund ? refund.status : '',
    failReason: refund ? refund.failReason || '' : '',
    // 没付清就取消：剩下的差价不用再补了
    due_cleared: yuan(due)
  }
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

/* ------------------------------------------------------------------ */
/* 图片上传（服务端中转，绕开小程序 uploadFile 域名白名单）              */
/* ------------------------------------------------------------------ */

/**
 * 客户端把图片压成 base64 传给云函数，这里写临时文件再传云存储。
 *
 * 为什么不用客户端 uniCloud.uploadFile：
 * 真机上 uploadFile 直传 OSS，需要在小程序后台把 OSS 域名加进 uploadFile 合法域名；
 * 没加就报 `url not in domain list`。服务端中转只走 callFunction 的 request 域名，
 * 不需要额外配置，代价是流量经过云函数（图片限制 900KB）。
 */
async function uploadImageBase64(base64, opts = {}) {
	const raw = String(base64 || '')
	const b64 = raw.replace(/^data:image\/\w+;base64,/, '')
	assert(b64, 400, '图片数据为空')

	let buf
	try {
		buf = Buffer.from(b64, 'base64')
	} catch (e) {
		throw new BizError(400, '图片数据无效')
	}
	assert(buf.length > 0, 400, '图片数据无效')
	assert(buf.length <= 900 * 1024, 413, '图片太大，请压缩后再传')

	const ext = String(opts.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
	const dir = String(opts.dir || 'misc').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'misc'
	const tmp = `/tmp/xyyx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

	// 云函数运行时只有 /tmp 可写
	const fs = require('fs')
	fs.writeFileSync(tmp, buf)
	try {
		const res = await uniCloud.uploadFile({
			filePath: tmp,
			cloudPath: `xyyx/${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
		})
		assert(res && res.fileID, 500, '上传失败')
		// 顺手把字节直存一份：客户端看图时只走数据库，不碰云存储和域名白名单
		const saved = await saveImageData(res.fileID, b64, { size: buf.length, uid: opts.uid })
		return { fileID: res.fileID, size: buf.length, stored: Boolean(saved) }
	} finally {
		try {
			fs.unlinkSync(tmp)
		} catch (e) {}
	}
}

/* ------------------------------------------------------------------ */
/* 读取图片（服务端中转，解决小程序 downloadFile 域名白名单）            */
/* ------------------------------------------------------------------ */

/**
 * 把云存储里的图片读出来，分片以 base64 返回给客户端。
 *
 * 为什么不直接让 <image> 加载临时链接：
 * 小程序加载网络图片走 downloadFile 域名白名单，云存储 CDN 域名没配置就整片裂图；
 * 临时链接还会过期。这里由云函数把图片取回来，客户端只走 callFunction 的 request 域名
 * （这个域名一定配过，否则连登录都做不了），再把 base64 落成本地临时文件显示 / 预览。
 *
 * 为什么分片：云函数返回值有大小上限，单张图 base64 后很容易超。按 192KB 一片返回，
 * 客户端拼起来就行 —— 所以「多大都能看」，不再有 600KB 这种人为限制。
 */
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
/** 必须是 3 的倍数：base64 分片拼接时中间不会出现 '=' 填充，最后一片才可能有 */
const IMAGE_CHUNK = 192 * 1024
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

// 同一个云函数实例里缓存最近读过的图，避免分片请求每次都重新下载整张
const _imgCache = new Map()
const IMG_CACHE_TTL = 5 * 60 * 1000
const IMG_CACHE_MAX = 6

function imgCacheGet(id) {
  const hit = _imgCache.get(id)
  if (!hit) return null
  if (Date.now() - hit.at > IMG_CACHE_TTL) {
    _imgCache.delete(id)
    return null
  }
  return hit
}

function imgCacheSet(id, entry) {
  if (_imgCache.size >= IMG_CACHE_MAX) {
    const oldest = _imgCache.keys().next().value
    _imgCache.delete(oldest)
  }
  _imgCache.set(id, entry)
}

function extOfPath(p) {
  const m = String(p || '').split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/)
  return m ? m[1].toLowerCase() : 'jpg'
}

/** httpclient 的 data 可能是 Buffer / ArrayBuffer / base64 字符串，统一成 Buffer */
function toBuffer(data) {
  if (!data) return null
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer)
  if (typeof data === 'string') {
    const s = data.trim()
    // 有些运行时会返回 base64 文本；先按 base64 试，解不出再按二进制
    if (s.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(s)) {
      const b = Buffer.from(s, 'base64')
      if (b.length > 16) return b
    }
    return Buffer.from(data, 'binary')
  }
  return null
}

/** 用文件头判断是不是真的图片（下载错内容时能及时发现，而不是丢给 <image> 白屏） */
function isImageBuffer(buf) {
  if (!buf || buf.length < 12) return false
  if (buf[0] === 0xff && buf[1] === 0xd8) return true // jpeg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true // png
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true // gif
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true
  return false
}

async function downloadUrlAsBuffer(url, dataType = 'buffer') {
  const res = await uniCloud.httpclient.request(url, {
    method: 'GET',
    dataType,
    timeout: 20000
  })
  return toBuffer(res && res.data)
}

/** 从云存储把整张图读回来（先 downloadFile，再临时链接 + httpclient，两条路都校验文件头） */
async function fetchImageBuffer(id) {
  if (/^cloud:\/\//.test(id)) {
    // 失败原因要带回去：不同云空间对 downloadFile / 临时链接的支持不一样，
    // 只报「图片读取失败」在真机上根本没法判断是哪一步挂了。
    const why = []

    // 1. 云函数端直接下载（返回 Buffer，最可靠）
    try {
      const f = await uniCloud.downloadFile({ fileID: id })
      const buf = toBuffer(f && f.fileContent)
      if (isImageBuffer(buf)) return buf
      why.push('downloadFile内容异常(' + (buf ? buf.length + 'B' : '空') + ')')
    } catch (e) {
      why.push('downloadFile:' + ((e && e.message) || '失败'))
    }

    // 2. 服务端换临时链接再下载；不同服务空间返回的字段名可能是 tempFileURL 或 url
    let url = ''
    try {
      const r = await uniCloud.getTempFileURL({ fileList: [id] })
      const row = (r && r.fileList && r.fileList[0]) || {}
      url = row.tempFileURL || row.url || ''
      if (!url) why.push('临时链接为空' + (row.status ? '(' + row.status + ')' : ''))
    } catch (e) {
      why.push('getTempFileURL:' + ((e && e.message) || '失败'))
    }
    if (url) {
      for (const type of ['buffer', 'arraybuffer']) {
        try {
          const buf = await downloadUrlAsBuffer(url, type)
          if (isImageBuffer(buf)) return buf
          why.push(type + '内容异常')
        } catch (e) {
          why.push(type + '下载:' + ((e && e.message) || '失败'))
        }
      }
    }
    throw new BizError(404, '图片读取失败（' + why.join('；').slice(0, 150) + '）')
  }

  // 直接是 http 链接
  for (const type of ['buffer', 'arraybuffer']) {
    try {
      const buf = await downloadUrlAsBuffer(id, type)
      if (isImageBuffer(buf)) return buf
    } catch (e) {}
  }
  throw new BizError(404, '图片读取失败，请重试')
}

async function loadImageBuffer(id) {
  const hit = imgCacheGet(id)
  if (hit) return hit

  const buf = await fetchImageBuffer(id)
  assert(buf && buf.length, 404, '图片不存在或已被删除')
  assert(buf.length <= IMAGE_MAX_BYTES, 413, '图片太大，暂时打不开')
  const entry = { buf, mime: MIME_BY_EXT[extOfPath(id)] || 'image/jpeg', at: Date.now() }
  imgCacheSet(id, entry)
  return entry
}

/* ------------------------------------------------------------------ */
/* 图片字节直存数据库（解决小程序端「看图」这一整条链路）                */
/* ------------------------------------------------------------------ */

/**
 * 为什么要把图片字节也存一份进数据库
 *
 * 之前客户端看图是这条链路：callFunction 分片取 base64 → 写本地文件 → <image src=本地路径>。
 * 真机上这条链路任何一环出问题都是「黑屏 / 图片加载失败」，而且现场根本看不出是哪一环：
 *   - 云函数从云存储 downloadFile / 换临时链接读图，不同云空间支持程度不一样；
 *   - <image> 加载网络图要 downloadFile 域名白名单，临时链接还会过期；
 *   - 本地写文件失败（配额、路径、base64 编码）也很常见。
 *
 * 现在把「看图」收敛成一条最不容易出错的路径：
 *   上传时顺手把压缩后的图 base64 存进 xyyx-images（键 = md5(fileID)）；
 *   看图时直接从数据库切片返回，客户端拼成 data URI 交给 <image> —— 
 *   不碰云存储、不碰域名白名单、不碰本地文件系统。
 * 头像一直用 data URI，在所有端都能正常显示，这条路径和头像完全一样，只是分片取。
 *
 * 老图（没有直存记录的）仍然走云存储读取，读成功后自动补存一份，下次直接命中。
 */

/** base64 超过这个长度就不进库了（文档太大不划算，改走云存储兜底） */
const IMG_DB_MAX_B64 = 620000
/** 直存路径的分片长度：必须是 4 的倍数（base64 每 4 个字符一组，切开才能直接拼接）
 *  1.11.3 从 160KB 提到 400KB：大多数聊天图（200~400KB）一次往返就取完，
 *  加上客户端并发取剩余分片，大图从 5 次串行（3~5 秒）压到 1~2 次往返。 */
const IMG_DB_CHUNK = 400000
/** 直存记录保留天数，cron 里清理 */
const IMG_DB_KEEP_DAYS = 120

function b64OfBuf(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('base64') : ''
}

/** base64 解码后的字节数（算 size 用，别用 length×3/4，会差几个字节） */
function b64ByteLen(b64) {
  const s = String(b64 || '')
  if (!s) return 0
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return Math.floor((s.length / 4) * 3) - pad
}

function imgKeyOf(fileID) {
  return 'i_' + crypto.createHash('md5').update(String(fileID || '')).digest('hex').slice(0, 28)
}

async function imgDocOf(fileID) {
  const id = String(fileID || '')
  if (!id) return null
  try {
    const r = await db.collection(COLL.images).doc(imgKeyOf(id)).get()
    const d = r.data && r.data[0]
    if (d && d.b64) return d
  } catch (e) {
    // 集合还没建（新环境）当作没有直存记录，走云存储兜底
  }
  return null
}

/** 把一张图的 base64 存进数据库（失败不影响主流程） */
async function saveImageData(fileID, base64, extra = {}) {
  const id = String(fileID || '').trim()
  const raw = String(base64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  if (!id || !raw) return ''
  if (raw.length > IMG_DB_MAX_B64) return ''
  const key = imgKeyOf(id)
  const now = Date.now()
  const doc = {
    file_id: id.slice(0, 500),
    b64: raw,
    mime: extra.mime || MIME_BY_EXT[extOfPath(id)] || 'image/jpeg',
    size: Number(extra.size) || b64ByteLen(raw),
    user_id: extra.uid || '',
    create_time: now,
    update_time: now
  }
  try {
    const upd = await db.collection(COLL.images).where({ _id: key }).update(doc)
    if (!upd || !upd.updated) {
      await db
        .collection(COLL.images)
        .add(Object.assign({ _id: key }, doc))
    }
    return key
  } catch (e) {
    // 集合不存在 / 文档超限 都不该把上传搞挂
    console.warn('[xyyx-common] 图片直存失败：', e && e.message)
    return ''
  }
}

/** 从一段 base64 里按 4 字符对齐切一片出来 */
function b64ChunkOf(b64, offset, unit) {
  const len = b64.length
  const start = Math.min(len, Math.max(0, Number(offset) || 0))
  // 起点必须 4 对齐，否则前一片末尾补的 '=' 会跑到中间，拼出来就是坏图
  const s = start - (start % 4)
  const e = Math.min(len, s + unit)
  return {
    base64: b64.slice(s, e),
    offset: s,
    chunk: e - s,
    done: e >= len
  }
}

/**
 * 取一片图片数据。offset=0 是起点；返回 done=true 表示最后一片。
 * 客户端把每片的 base64 直接拼起来即可。
 *
 * 优先直存库（source='db'），没有再读云存储并补存（source='store'）。
 */
async function imageDataOf(fileID, offset = 0) {
  const id = String(fileID || '').trim()
  assert(id, 400, '缺少图片地址')
  assert(/^cloud:\/\//.test(id) || /^https?:\/\//.test(id), 400, '图片地址不对')

  const start = Math.max(0, Number(offset) || 0)

  // 1. 数据库直存：不依赖云存储读取
  const doc = await imgDocOf(id)
  if (doc) {
    const b64 = doc.b64
    assert(start < b64.length, 400, '图片偏移量超出范围')
    const part = b64ChunkOf(b64, start, IMG_DB_CHUNK)
    return {
      base64: part.base64,
      mime: doc.mime || 'image/jpeg',
      size: Number(doc.size) || b64ByteLen(b64),
      offset: part.offset,
      chunk: part.chunk,
      done: part.done,
      source: 'db'
    }
  }

  // 2. 老图：从云存储读回来，顺手补存，下次就直接命中数据库
  const { buf, mime } = await loadImageBuffer(id)
  const b64 = b64OfBuf(buf)
  assert(b64, 404, '图片读取失败，请重试')
  const part = b64ChunkOf(b64, start, IMG_DB_CHUNK)
  if (part.done) {
    // 整个文件都在手里了才补存，避免把半张图存进去
    saveImageData(id, b64, { mime, size: buf.length }).catch(() => {})
  }
  return {
    base64: part.base64,
    mime,
    size: buf.length,
    offset: part.offset,
    chunk: part.chunk,
    done: part.done,
    source: 'store'
  }
}

/** 清理很久没人看的直存图片（cron 调用），避免数据库无限长 */
async function cleanImageData(days = IMG_DB_KEEP_DAYS) {
  const before = Date.now() - Math.max(1, Number(days) || IMG_DB_KEEP_DAYS) * 86400000
  try {
    const r = await db.collection(COLL.images).where({ create_time: dbCmd.lt(before) }).remove()
    return (r && r.deleted) || 0
  } catch (e) {
    return 0
  }
}

/* ------------------------------------------------------------------ */
/* 订单内聊天（用户 ↔ 骑手）                                            */
/* ------------------------------------------------------------------ */
/**
 * 聊天只允许「这一单的发布者」和「这一单的骑手」两个人。
 * 没接单之前骑手端拿不到聊天入口，服务端这里再挡一次。
 */
function chatPeerOf(task, uid) {
  if (task.publisher_id === uid) return task.runner_id || ''
  if (task.runner_id === uid) return task.publisher_id || ''
  return ''
}

function assertChatMember(task, uid) {
  const peer = chatPeerOf(task, uid)
  assert(peer, 403, '订单还没人接，暂时不能聊天')
  return peer
}

async function chatPeerInfo(task, peerId) {
  let profile = {}
  try {
    profile = await ensureProfile(peerId)
  } catch (e) {
    profile = {}
  }
  const isRunnerPeer = task.runner_id === peerId
  return {
    _id: peerId,
    nickname: profile.nickname || (isRunnerPeer ? task.runner_nickname : task.publisher_nickname) || '对方',
    avatar: profile.avatar || (isRunnerPeer ? task.runner_avatar : task.publisher_avatar) || ''
  }
}

/** 拉取消息。after 有值时增量拉（轮询用），同时把对方发来的未读标记为已读 */
async function chatMessages(task, auth, opts = {}) {
  const uid = auth.uid
  const peerId = assertChatMember(task, uid)
  const limit = int(opts.limit || 50, { min: 1, max: 100, name: '条数' })
  const after = Number(opts.after) || 0

  const where = { task_id: task._id }
  if (after > 0) where.create_time = dbCmd.gt(after)

  // after=0 是「首次进入」：取最近 N 条（倒序查再翻转），否则长会话会只看到最早的一屏
  const base = db.collection(COLL.messages).where(where)
  const res =
    after > 0
      ? await base.orderBy('create_time', 'asc').limit(limit).get()
      : await base.orderBy('create_time', 'desc').limit(limit).get()
  const rows = after > 0 ? res.data || [] : (res.data || []).slice().reverse()

  // 打开会话就算已读（after>0 的轮询也一样）
  await db
    .collection(COLL.messages)
    .where({ task_id: task._id, to_id: uid, read_at: 0 })
    .update({ read_at: Date.now() })

  const peer = await chatPeerInfo(task, peerId)

  return {
    me: uid,
    peer,
    task: {
      _id: task._id,
      title: task.title,
      status: task.status,
      status_text: STATUS_TEXT[task.status] || '',
      role: task.publisher_id === uid ? 'publisher' : 'runner'
    },
    list: rows.map((m) => ({
      _id: m._id,
      from_id: m.from_id,
      content: m.content,
      type: m.type || 'text',
      // 图片消息自带的缩略图（data URI）；老消息没有这个字段，前端用临时链接兜底
      thumb: m.thumb || '',
      create_time: m.create_time,
      read_at: m.read_at || 0
    })),
    unread: 0
  }
}

async function chatUnread(task, uid) {
  assertChatMember(task, uid)
  const res = await db
    .collection(COLL.messages)
    .where({ task_id: task._id, to_id: uid, read_at: 0 })
    .count()
  return { unread: res.total || 0 }
}

async function chatSend(task, auth, content, opts = {}) {
  const uid = auth.uid
  const peerId = assertChatMember(task, uid)
  const type = opts.type === 'image' ? 'image' : 'text'
  const text =
    type === 'image'
      ? str(content, { min: 5, max: 300, name: '图片地址', required: true })
      : str(content, { min: 1, max: 300, name: '消息', required: true }).trim()
  assert(text, 400, type === 'image' ? '图片地址不能为空' : '消息不能为空')
  // 缩略图只对图片消息有意义；文本消息塞进来直接丢弃
  const thumb = type === 'image' ? imageThumb(opts.thumb) : ''

  await rateLimit(auth, 'chat', 30)

  const doc = {
    task_id: task._id,
    from_id: uid,
    to_id: peerId,
    content: text,
    type,
    read_at: 0,
    create_time: Date.now()
  }
  if (thumb) doc.thumb = thumb
  const res = await db.collection(COLL.messages).add(doc)
  return {
    _id: res.id,
    from_id: uid,
    content: text,
    type: doc.type,
    thumb,
    create_time: doc.create_time,
    read_at: 0
  }
}

/** 订单被接单 / 放弃时插一条系统提示，聊天记录能看出上下文 */
async function chatSystem(task, content) {
  if (!task || !task._id) return null
  try {
    const res = await db.collection(COLL.messages).add({
      task_id: task._id,
      from_id: 'system',
      to_id: task.publisher_id,
      content: String(content).slice(0, 120),
      type: 'system',
      read_at: 0,
      create_time: Date.now()
    })
    return res.id
  } catch (e) {
    return null
  }
}

/**
 * 会话列表：最近聊过的订单，按最后一条消息倒序。
 * 消息表里只存 task_id，所以这里再补一次订单和对方昵称。
 */
async function chatConversations(uid, limit = 30) {
  const fromRes = await db
    .collection(COLL.messages)
    .where({ from_id: uid })
    .orderBy('create_time', 'desc')
    .limit(200)
    .get()
  const toRes = await db
    .collection(COLL.messages)
    .where({ to_id: uid })
    .orderBy('create_time', 'desc')
    .limit(200)
    .get()

  const rows = [...(fromRes.data || []), ...(toRes.data || [])]
  const latest = new Map()
  for (const m of rows) {
    const cur = latest.get(m.task_id)
    if (!cur || m.create_time > cur.create_time) latest.set(m.task_id, m)
  }

  const taskIds = Array.from(latest.keys()).slice(0, limit)
  if (!taskIds.length) return { list: [] }

  const taskRes = await db
    .collection(COLL.tasks)
    .where({ _id: dbCmd.in(taskIds) })
    .get()
  const taskMap = new Map((taskRes.data || []).map((t) => [t._id, t]))

  const list = []
  for (const id of taskIds) {
    const task = taskMap.get(id)
    if (!task) continue
    if (task.publisher_id !== uid && task.runner_id !== uid) continue
    const peerId = task.publisher_id === uid ? task.runner_id : task.publisher_id
    if (!peerId) continue
    const last = latest.get(id)
    const unreadRes = await db
      .collection(COLL.messages)
      .where({ task_id: id, to_id: uid, read_at: 0 })
      .count()
    const peer = await chatPeerInfo(task, peerId)
    list.push({
      task_id: id,
      title: task.title,
      status: task.status,
      status_text: STATUS_TEXT[task.status] || '',
      peer,
      last: {
        content: (last && last.content) || '',
        type: (last && last.type) || 'text',
        create_time: (last && last.create_time) || 0,
        from_me: !!(last && last.from_id === uid)
      },
      unread: unreadRes.total || 0
    })
  }

  list.sort((a, b) => (b.last.create_time || 0) - (a.last.create_time || 0))
  return { list }
}

module.exports = {
  db,
  dbCmd,
  SCHOOL,
  COMMISSION_RATE,
  AUTO_CONFIRM_HOURS,
  AUTO_SETTLE_ON_DELIVER,
  DEFAULT_SETTINGS,
  S,
  publicSettings,
  loadSettings,
  saveSettings,
  normalizeSettings,
  STUDENT_NO_RE,
  STATUS,
  STATUS_TEXT,
  TASK_TYPE,
  REFUND_STATUS_TEXT,
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
  requireAdmin,
  pick,
  str,
  int,
  imageThumb,
  IMAGE_THUMB_MAX,
  avatarValue,
  AVATAR_MAX,
  AVATAR_HD_MAX,
  toCents,
  yuan,
  maskMobile,
  parseStudentNo,
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
  paymentsOf,
  paidCentOf,
  dueCentOf,
  refundedCentOf,
  refundedNetCentOf,
  refundableCentOf,
  REFUND_FEE_RATE,
  refundFeeOf,
  refundNetOf,
  newPayNo,
  newRefundNo,
  allocateRefund,
  applyPaymentRefunded,
  beginRefund,
  finishRefund,
  failRefund,
  repairOrphanRefund,
  looksRefunding,
  getRefund,
  executeRefund,
  taskIdOf,
  getTask,
  chatPeerOf,
  assertChatMember,
  chatMessages,
  chatUnread,
  chatSend,
  chatSystem,
  chatConversations,
  uploadImageBase64,
  imageDataOf,
  saveImageData,
  cleanImageData,
  IMAGE_MAX_BYTES,
  IMAGE_CHUNK,
  IMAGE_DB_MAX_B64: IMG_DB_MAX_B64
}
