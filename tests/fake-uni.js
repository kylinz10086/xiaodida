'use strict'
/**
 * 云函数测试用的「假 uniCloud」：内存数据库 + 假登录态 + 模块别名。
 *
 * 目的：不用连真实服务空间，就能直接跑 xyyx-common / xyyx-user / xyyx-rider / xyyx-pay
 * 的真实代码，验证金额、状态流转这些不能出错的地方。
 *
 * 用法见 tests/rider-flow.spec.js。
 */

const path = require('path')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const CF = path.join(ROOT, 'apps/user/uniCloud-alipay/cloudfunctions')
const PATHS = {
  common: path.join(CF, 'common/xyyx-common/index.js'),
  user: path.join(CF, 'xyyx-user/index.obj.js'),
  rider: path.join(CF, 'xyyx-rider/index.obj.js'),
  pay: path.join(CF, 'xyyx-pay/index.obj.js')
}

/* ---------------- 内存数据库 ---------------- */

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
  // 真实 _id 是 24~32 位；这里也生成长的，避免被长度校验挡掉
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

/* ---------------- 环境 ---------------- */

function createEnv(options = {}) {
  const state = { uid: options.uid || 'pub-user', lastHttp: null }

  // 关键：database() 必须返回同一个对象。
  // 之前每次调用都新建，云函数在模块加载时取一次、测试脚本又取一次，
  // 两边如果落到不同的闭包里，就会出现「测试写进去了、云函数读不到」的假 bug。
  const dbSingleton = { collection: collectionApi, command }

  global.uniCloud = {
    database: () => dbSingleton,
    // 云存储桩：imageDataOf 会先换临时链接再 httpclient 下载
    getTempFileURL: async ({ fileList }) => ({
      fileList: (fileList || []).map((id) => ({
        fileID: id,
        tempFileURL: 'https://cdn.test/' + encodeURIComponent(id)
      }))
    }),
    downloadFile: async () => ({ fileContent: Buffer.from('fake-image-bytes') }),
    httpclient: {
      request: async (url, opts) => {
        state.lastHttp = { url, body: opts && opts.content ? JSON.parse(opts.content) : null }
        // 图片下载走二进制桩，其余（微信退款/下单）保持原来的 JSON 桩
        if (url && url.indexOf('https://cdn.test/') === 0) {
          return { status: 200, data: Buffer.from('fake-image-bytes') }
        }
        return options.httpResponse
          ? options.httpResponse(url, opts)
          : { status: 200, data: { refund_id: 'wx-refund-1', status: 'SUCCESS', prepay_id: 'prepay-1' } }
      }
    },
    importObject: () => {
      throw new Error('tests must not call other cloud objects')
    }
  }

  const uniIdStub = { createInstance: () => ({ checkToken: async () => ({ uid: state.uid }) }) }

  if (!Module.__xyyxPatched) {
    const origLoad = Module._load
    Module._load = function (request, parent, isMain) {
      if (request === 'uni-id-common') return uniIdStub
      if (request === 'xyyx-common') return origLoad.call(this, PATHS.common, parent, isMain)
      return origLoad.apply(this, arguments)
    }
    Module.__xyyxPatched = true
    Module.__xyyxUniId = uniIdStub
  } else {
    // 复用同一个 stub 对象，只改它的 uid 来源
    Module.__xyyxUniId.createInstance = () => ({ checkToken: async () => ({ uid: state.uid }) })
  }

  // 默认强制 mock 支付，测试不联网
  if (options.mockPay !== false) process.env.XYYX_PAY_FORCE_MOCK = '1'
  else process.env.XYYX_PAY_FORCE_MOCK = ''

  const C = require(PATHS.common)
  const userObj = require(PATHS.user)
  const riderObj = require(PATHS.rider)
  const payObj = require(PATHS.pay)

  let nonceSeq = 0
  const meta = () => ({
    nonce: 'n_' + Date.now().toString(36) + '_' + ++nonceSeq + '_' + 'x'.repeat(40),
    timestamp: Date.now()
  })

  const ctx = {
    getUniIdToken: () => 'fake-token',
    getClientInfo: () => ({})
  }

  return {
    C,
    userObj,
    riderObj,
    payObj,
    ctx,
    meta,
    coll,
    addDoc,
    get: (name, id) => coll(name).get(id),
    setUid: (uid) => { state.uid = uid },
    getUid: () => state.uid,
    get lastHttp() { return state.lastHttp },
    /** 云对象方法统一是 guard 包装过的，这里带上 ctx 调用 */
    call: (fn, ...args) => fn.call(ctx, ...args)
  }
}

module.exports = { createEnv, PATHS }
