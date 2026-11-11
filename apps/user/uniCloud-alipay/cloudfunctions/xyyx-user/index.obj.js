'use strict'
/**
 * xyyx-user —— 用户端云对象（下单的人）
 *
 * 只暴露「下单的人」需要的方法。所有返回给客户端的任务数据都过
 * common.taskForUser() 做字段裁剪：骑手的手机号、学校、真名永远不会下发。
 *
 * 设计要点：
 *   - 金额由客户端传「元」，服务端立刻转成「分」存库，之后只用分
 *   - 状态流转只能通过这里的方法，客户端不能直接改 status
 *   - 结算/退款都在 common 里做，且有幂等保护
 */

const C = require('xyyx-common')

const PUBLISH_ALLOWED = [
  'title',
  'type',
  'description',
  'item_type',
  'item_size',
  'item_weight',
  'time_option',
  'origin',
  'destination',
  'mobile',
  'wechat_id',
  'remark',
  'images'
]

function normalizePlace(obj) {
  if (!obj || typeof obj !== 'object') return { name: '', detail: '', latitude: 0, longitude: 0 }
  return {
    name: C.str(obj.name, { max: 60, name: '地点名称' }),
    detail: C.str(obj.detail, { max: 120, name: '详细地址' }),
    latitude: Number(obj.latitude) || 0,
    longitude: Number(obj.longitude) || 0
  }
}

module.exports = {
  /* ---------------- 资料 ---------------- */

  async getProfile() {
    const auth = await C.requireAuth(this)
    const profile = await C.ensureProfile(auth.uid)
    const wallet = await C.ensureWallet(auth.uid)
    return C.ok({
      ...C.myProfile(profile),
      wallet: { balance: C.yuan(wallet.balance_cent), income: C.yuan(wallet.income_cent) },
      school: C.SCHOOL,
      commission_rate: C.COMMISSION_RATE
    })
  },

  async updateProfile(data = {}) {
    const auth = await C.requireAuth(this)
    const allowed = C.pick(data, ['nickname', 'avatar', 'mobile'])
    const patch = {}
    if ('nickname' in allowed) patch.nickname = C.str(allowed.nickname, { max: 20, name: '昵称', required: true })
    if ('avatar' in allowed) patch.avatar = C.str(allowed.avatar, { max: 300, name: '头像' })
    if ('mobile' in allowed) {
      const mobile = C.str(allowed.mobile, { max: 11, name: '手机号' })
      if (mobile) C.assert(/^1\d{10}$/.test(mobile), 400, '手机号格式不对')
      patch.mobile = mobile
    }
    C.assert(Object.keys(patch).length > 0, 400, '没有要更新的内容')
    await C.ensureProfile(auth.uid, patch)
    return C.ok(null, '已保存')
  },

  /* ---------------- 发布 ---------------- */

  async publishTask(data = {}) {
    const auth = await C.requireAuth(this)
    await C.rateLimit(auth, 'publish', 10)

    const input = C.pick(data, PUBLISH_ALLOWED)
    const title = C.str(input.title, { min: 4, max: 40, name: '任务标题', required: true })
    const type = C.int(input.type || 1, { min: 1, max: 3, name: '任务类型' })
    const amountCent = C.toCents(input.amount)
    const profile = await C.ensureProfile(auth.uid)

    const task = {
      title,
      type,
      type_text: C.TASK_TYPE[type],
      description: C.str(input.description, { max: 300, name: '任务描述' }),
      amount_cent: amountCent,
      item_type: C.str(input.item_type, { max: 20, name: '物品类型' }),
      item_size: C.str(input.item_size, { max: 20, name: '物品大小' }),
      item_weight: C.str(input.item_weight, { max: 20, name: '重量' }),
      time_option: C.str(input.time_option, { max: 30, name: '时间要求' }),
      origin: normalizePlace(input.origin),
      destination: normalizePlace(input.destination),
      mobile: C.str(input.mobile || profile.mobile, { max: 11, name: '手机号' }),
      wechat_id: C.str(input.wechat_id, { max: 40, name: '微信号' }),
      remark: C.str(input.remark, { max: 200, name: '备注' }),
      images: Array.isArray(input.images) ? input.images.slice(0, 6).map((x) => String(x).slice(0, 300)) : [],
      status: C.STATUS.PENDING,
      pay_status: 'unpaid',
      school: C.SCHOOL,
      publisher_id: auth.uid,
      publisher_nickname: profile.nickname || '校园用户',
      publisher_avatar: profile.avatar || '',
      runner_id: '',
      create_time: Date.now()
    }

    C.assert(task.mobile && /^1\d{10}$/.test(task.mobile), 400, '请填写正确的手机号，骑手需要联系你')

    const res = await C.db.collection(C.COLL.tasks).add(task)
    await C.db.collection(C.COLL.users).doc(auth.uid).update({ published_count: C.dbCmd.inc(1) })
    return C.ok({ id: res.id, amount: C.yuan(amountCent) }, '下单成功，请完成支付')
  },

  /* ---------------- 支付 ---------------- */

  async createPayment(taskId) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能支付自己的订单')
    C.assert(task.status === C.STATUS.PENDING, 400, '订单状态不允许支付')
    C.assert(task.pay_status !== 'paid', 400, '订单已支付')

    // 支付逻辑单独放 xyyx-pay，业务对象不碰商户密钥
    const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
    const res = await pay.createJsapiOrder({ taskId: task._id, amountCent: task.amount_cent })
    C.assert(res && res.code === 0, 500, (res && res.msg) || '下单失败')
    return C.ok(res.data)
  },

  /* ---------------- 大厅 ---------------- */

  async listHall(params = {}) {
    const auth = await C.getAuth(this)
    const viewerId = auth ? auth.uid : ''

    const page = C.int(params.page || 1, { min: 1, max: 999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 50, name: '每页条数' })
    const type = params.type ? C.int(params.type, { min: 1, max: 3, name: '类型' }) : 0

    const where = { status: C.STATUS.PENDING, pay_status: 'paid' }
    if (type) where.type = type

    const [countRes, listRes] = await Promise.all([
      C.db.collection(C.COLL.tasks).where(where).count(),
      C.db.collection(C.COLL.tasks)
        .where(where)
        .orderBy('create_time', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ])

    return C.ok({
      list: listRes.data.map((t) => C.taskForUser(t, viewerId)),
      total: countRes.total,
      page,
      pageSize
    })
  },

  async getTaskDetail(taskId) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    return C.ok(C.taskForUser(task, auth.uid))
  },

  async listMyTasks(params = {}) {
    const auth = await C.requireAuth(this)
    const role = ['publisher', 'runner'].includes(params.role) ? params.role : 'all'
    const status = params.status ? C.int(params.status, { min: 1, max: 5, name: '状态' }) : 0

    const base =
      role === 'publisher'
        ? { publisher_id: auth.uid }
        : role === 'runner'
          ? { runner_id: auth.uid }
          : C.dbCmd.or({ publisher_id: auth.uid }, { runner_id: auth.uid })
    const where = status ? C.dbCmd.and(base, { status }) : base

    const res = await C.db.collection(C.COLL.tasks).where(where).orderBy('create_time', 'desc').limit(50).get()
    return C.ok({ list: res.data.map((t) => C.taskForUser(t, auth.uid)) })
  },

  /* ---------------- 取消 ---------------- */

  async cancelTask(taskId, reason) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能取消自己的订单')
    C.assert(task.status === C.STATUS.PENDING, 400, '订单已被接单，请联系客服处理')

    const r = await C.refundTask(task, C.str(reason, { max: 60, name: '取消原因' }) || '用户取消')
    return C.ok(r, '已取消，退款将原路退回')
  },

  /* ---------------- 确认收货 ---------------- */

  async confirmReceipt(taskId) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能确认自己的订单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单还没送达')

    const r = await C.settleTask(task, auth.uid)
    return C.ok(r, '已确认收货')
  },

  /* ---------------- 评价 ---------------- */

  async submitReview(data = {}) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(data.taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能评价自己的订单')
    C.assert(task.status === C.STATUS.DONE, 400, '订单未完成，不能评价')

    const score = C.int(data.score, { min: 1, max: 5, name: '评分' })
    const content = C.str(data.content, { max: 200, name: '评价内容' })

    const exists = await C.db.collection(C.COLL.reviews).where({ task_id: task._id, from_id: auth.uid }).get()
    C.assert(!(exists.data && exists.data.length), 400, '已经评价过了')

    await C.db.collection(C.COLL.reviews).add({
      task_id: task._id,
      from_id: auth.uid,
      to_id: task.runner_id,
      score,
      content,
      create_time: Date.now()
    })

    if (task.runner_id) {
      const rider = await C.ensureProfile(task.runner_id)
      const count = (rider.rider_rating_count || 0) + 1
      const rating = Number((((rider.rating || 5) * (count - 1) + score) / count).toFixed(2))
      await C.db.collection(C.COLL.users).doc(task.runner_id).update({ rating, rider_rating_count: count })
    }
    return C.ok(null, '感谢评价')
  },

  /* ---------------- 协议 ---------------- */

  async acceptAgreement(data = {}) {
    const auth = await C.requireAuth(this)
    const version = C.str(data.version, { max: 20, name: '协议版本', required: true })
    await C.db.collection(C.COLL.agreements).add({
      user_id: auth.uid,
      version,
      role: 'user',
      create_time: Date.now()
    })
    return C.ok(null, '已同意')
  }
}
