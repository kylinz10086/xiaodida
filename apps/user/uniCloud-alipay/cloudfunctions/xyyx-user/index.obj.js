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
  'amount',
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

/** 修改订单允许改的字段（和发布一致，但不允许改状态/支付字段） */
const UPDATE_ALLOWED = PUBLISH_ALLOWED

/**
 * 归一化地点。
 *
 * 兼容两种客户端写法：
 *   1. { name, detail, latitude, longitude }       —— chooseLocation 直接给坐标
 *   2. { name, position: '120.12,30.15' }          —— 发布页原来的写法（经度,纬度）
 *
 * 之前只认第 1 种，而发布页传的是 position 字符串，结果 **坐标全被丢成 0**，
 * 骑手端拿不到经纬度，地图和导航都用不了。
 */
function normalizePlace(obj) {
  if (!obj || typeof obj !== 'object') return { name: '', detail: '', latitude: 0, longitude: 0 }

  let latitude = Number(obj.latitude) || 0
  let longitude = Number(obj.longitude) || 0

  if ((!latitude || !longitude) && typeof obj.position === 'string' && obj.position.indexOf(',') > -1) {
    const parts = obj.position.split(',')
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      longitude = lng
      latitude = lat
    }
  }

  // 经纬度必须在合法范围内，否则地图会直接白屏
  if (latitude > 90 || latitude < -90) latitude = 0
  if (longitude > 180 || longitude < -180) longitude = 0

  return {
    name: C.str(obj.name, { max: 60, name: '地点名称' }),
    detail: C.str(obj.detail, { max: 120, name: '详细地址' }),
    latitude,
    longitude
  }
}

const api = {
  /* ---------------- 资料 ---------------- */

  async getProfile() {
    const auth = await C.requireAuth(this)
    const profile = await C.ensureProfile(auth.uid)
    const wallet = await C.ensureWallet(auth.uid)
    return C.ok({
      ...C.myProfile(profile),
      wallet: { balance: C.yuan(wallet.balance_cent), income: C.yuan(wallet.income_cent) },
      school: C.SCHOOL,
      commission_rate: C.S().commissionRate,
      // 退款时扣除的通道费率，客户端要用它在下单/取消时把话说清楚
      refund_fee_rate: C.S().refundFeeRate,
      // 全部可调配置一次性下发，前端不要再写死任何费率/区间
      settings: C.publicSettings()
    })
  },

  async updateProfile(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
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
    await C.checkNonce(auth, data.nonce, data.timestamp)
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
      // 钱相关的初始化：paid_cent / payments 由支付回调累加，
      // due_cent 是「涨价改单后还差多少」，refund_cent 是「一共退了多少」
      paid_cent: 0,
      due_cent: 0,
      refund_cent: 0,
      refund_status: '',
      payments: [],
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
      create_time: Date.now(),
      update_count: 0
    }

    C.assert(task.mobile && /^1\d{10}$/.test(task.mobile), 400, '请填写正确的手机号，骑手需要联系你')

    const res = await C.db.collection(C.COLL.tasks).add(task)
    await C.db.collection(C.COLL.users).doc(auth.uid).update({ published_count: C.dbCmd.inc(1) })
    return C.ok({ id: res.id, amount: C.yuan(amountCent) }, '下单成功，请完成支付')
  },

  /* ---------------- 支付 ---------------- */

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

  /* ---------------- 修改订单 ---------------- */

  /**
   * 修改订单（原地更新，不再「取消 + 重新下一单」）。
   *
   * 以前的做法是：取消旧单 → 退款 → 重新下单一笔新的 → 再全额付一次。
   * 一旦退款那一步没真正退（只写了流水），用户就会发现自己付了两次钱：
   * 1 元的单改成 3 元，红包里少了 4 元。
   *
   * 现在改成：
   *   - 只改字段，订单号不变，历史、聊天、评价都还挂在同一单上；
   *   - 降价   → 差额立刻原路退回（走 xyyx-pay 的微信退款）；
   *   - 涨价   → 只补差价（due_cent），补完才算付清，补款前这单不进大厅；
   *   - 同价   → 纯改信息，一分钱不动。
   */
  async updateTask(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)

    const id = C.taskIdOf(data.taskId || data.id || data._id)
    const task = await C.getTask(id)
    C.assert(task.publisher_id === auth.uid, 403, '只能修改自己发布的订单')
    C.assert(
      task.status === C.STATUS.PENDING,
      400,
      task.status === C.STATUS.ONGOING ? '骑手已经接单了，不能再修改，请联系客服' : '当前订单状态不能修改'
    )

    const input = C.pick(data, UPDATE_ALLOWED)
    const patch = {}
    let changed = false

    if ('title' in input) {
      patch.title = C.str(input.title, { min: 4, max: 40, name: '任务标题', required: true })
      changed = true
    }
    if ('type' in input) {
      const type = C.int(input.type || 1, { min: 1, max: 3, name: '任务类型' })
      patch.type = type
      patch.type_text = C.TASK_TYPE[type]
      changed = true
    }
    if ('description' in input) {
      patch.description = C.str(input.description, { max: 300, name: '任务描述' })
      changed = true
    }
    if ('item_type' in input) {
      patch.item_type = C.str(input.item_type, { max: 20, name: '物品类型' })
      changed = true
    }
    if ('item_size' in input) {
      patch.item_size = C.str(input.item_size, { max: 20, name: '物品大小' })
      changed = true
    }
    if ('item_weight' in input) {
      patch.item_weight = C.str(input.item_weight, { max: 20, name: '重量' })
      changed = true
    }
    if ('time_option' in input) {
      patch.time_option = C.str(input.time_option, { max: 30, name: '时间要求' })
      changed = true
    }
    if ('remark' in input) {
      patch.remark = C.str(input.remark, { max: 200, name: '备注' })
      changed = true
    }
    if ('origin' in input) {
      patch.origin = normalizePlace(input.origin)
      changed = true
    }
    if ('destination' in input) {
      patch.destination = normalizePlace(input.destination)
      changed = true
    }
    if ('wechat_id' in input) {
      patch.wechat_id = C.str(input.wechat_id, { max: 40, name: '微信号' })
      changed = true
    }
    if ('images' in input) {
      patch.images = Array.isArray(input.images) ? input.images.slice(0, 6).map((x) => String(x).slice(0, 300)) : []
      changed = true
    }
    if ('mobile' in input) {
      const mobile = C.str(input.mobile, { max: 11, name: '手机号', required: true })
      C.assert(/^1\d{10}$/.test(mobile), 400, '手机号格式不对')
      patch.mobile = mobile
      changed = true
    }

    // —— 金额：和服务端算出来的「净已付」做差，不信任客户端任何金额 ——
    const oldAmount = Number(task.amount_cent) || 0
    let newAmount = oldAmount
    if ('amount' in input) {
      newAmount = C.toCents(input.amount)
      patch.amount_cent = newAmount
      changed = true
    }

    C.assert(changed, 400, '没有要修改的内容')

    const netPaid = Math.max(0, C.paidCentOf(task) - C.refundedCentOf(task))
    const diff = newAmount - netPaid
    let money = { diffCent: 0, dueCent: 0, refund: null }

    if (netPaid <= 0) {
      // 还没付过钱：改价只是改价，付款时按新价收，不存在补/退
      patch.due_cent = 0
    } else if (diff > 0) {
      // 涨价：只补差价，补款前 pay_status 变 partial（大厅只认 paid，所以不会被抢）
      patch.due_cent = diff
      patch.pay_status = 'partial'
      money.dueCent = diff
      money.diffCent = diff
    } else if (diff < 0) {
      // 降价：把多收的钱退回去
      patch.due_cent = 0
      patch.pay_status = 'paid'
      money.diffCent = diff
    } else {
      // 同价，或者本来就没付清 → 不动钱
      patch.pay_status = netPaid > 0 ? 'paid' : task.pay_status
      patch.due_cent = diff > 0 ? diff : 0
    }

    // 降价：先把退款登记/提交好，再改价。
    // 反过来的话，退款登记失败就会出现「价格已经降了、钱没退」的烂账。
    if (money.diffCent < 0) {
      money.refund = await C.beginRefund({
        task,
        amountCent: -money.diffCent,
        reason: `修改订单降价退款（¥${C.yuan(oldAmount)} → ¥${C.yuan(newAmount)}）`,
        source: 'edit_down',
        operator: auth.uid
      })
    }

    await C.db.collection(C.COLL.tasks).doc(id).update({
      ...patch,
      update_time: Date.now(),
      update_count: C.dbCmd.inc(1)
    })

    let msg = '已修改'
    if (money.dueCent > 0) {
      msg = `已修改，需补付差价 ¥${C.yuan(money.dueCent)}`
    } else if (money.refund) {
      const st = money.refund.status
      if (st === 'success') {
        msg =
          money.refund.mode === 'balance'
            ? `已修改，差价 ¥${money.refund.amount} 已退回账户余额`
            : `已修改，差价 ¥${money.refund.amount} 已原路退回微信`
      } else if (st === 'failed') {
        msg = `已修改，但差价退款失败：${money.refund.failReason || '未知原因'}，客服会人工处理`
      } else {
        msg = `已修改，差价 ¥${money.refund.amount} 退款处理中`
      }
    }

    return C.ok({
      id,
      amount: C.yuan(newAmount),
      oldAmount: C.yuan(oldAmount),
      diff: C.yuan(Math.abs(money.diffCent)),
      due: C.yuan(money.dueCent),
      needPay: money.dueCent > 0,
      payAmount: C.yuan(money.dueCent),
      refund: money.refund ? money.refund.amount : '',
      refundFee: money.refund ? money.refund.fee : '',
      refundId: money.refund ? money.refund.refundId : '',
      refundStatus: money.refund ? money.refund.status : '',
      refundMode: money.refund ? money.refund.mode : '',
      failReason: money.refund ? money.refund.failReason || '' : ''
    }, msg)
  },

  /* ---------------- 取消 ---------------- */

  async cancelTask(taskId, reason, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const task = await C.getTask(C.taskIdOf(taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能取消自己的订单')
    C.assert(task.status === C.STATUS.PENDING, 400, '订单已被接单，请联系客服处理')

    const r = await C.refundTask(task, C.str(reason, { max: 60, name: '取消原因' }) || '用户取消')

    // 退款是在这次请求里就提交的，所以能直接告诉用户「退了没有」，
    // 而不是永远一句「将原路退回」
    let msg = '已取消'
    if (r.refund > 0) {
      if (r.refundStatus === 'success') {
        msg =
          r.mode === 'balance'
            ? `已取消，¥${r.refund} 已退回账户余额`
            : `已取消，¥${r.refund} 已原路退回微信`
      } else if (r.refundStatus === 'failed') {
        msg = `已取消，但退款失败：${r.failReason || '未知原因'}，客服会人工处理`
      } else {
        msg = `已取消，¥${r.refund} 退款处理中，系统会自动重试`
      }
    }
    return C.ok(r, msg)
  },

  /**
   * 批量取消自己所有「未支付」的订单。
   * 支付失败/用户中途退出会留下未支付单，这里一次性清理，不产生退款流水。
   */
  async cancelUnpaidTasks(meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const res = await C.db
      .collection(C.COLL.tasks)
      .where({
        publisher_id: auth.uid,
        pay_status: 'unpaid',
        status: C.STATUS.PENDING,
        // 只清理 10 分钟前的未支付单，避免把刚付完、回调还没到的单误取消
        create_time: C.dbCmd.lt(Date.now() - 10 * 60 * 1000)
      })
      .update({
        status: C.STATUS.CANCELLED,
        cancel_time: Date.now(),
        cancel_reason: '支付未完成，批量清理'
      })
    return C.ok({ updated: res.updated || 0 }, `已清理 ${res.updated || 0} 个未支付订单`)
  },

  /* ---------------- 确认收货 ---------------- */

  async confirmReceipt(taskId, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const task = await C.getTask(C.taskIdOf(taskId))
    C.assert(task.publisher_id === auth.uid, 403, '只能确认自己的订单')

    // 骑手点「已送达」时如果已经自动结算（AUTO_SETTLE_ON_DELIVER），
    // 用户再点确认收货不应该报「订单状态不对」，否则用户会以为出错了。
    if (task.status === C.STATUS.DONE) {
      return C.ok({ riderIncome: C.yuan(task.rider_income_cent), commission: C.yuan(task.commission_cent), already: true }, '订单已完成')
    }

    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对，不能确认收货')
    C.assert(task.pay_status === 'paid', 400, '订单还未支付')
    // 必须骑手先点「已送达」。否则接单后立刻确认收货 = 提前把托管款结算给骑手。
    C.assert(task.delivered_time > 0, 400, '骑手还没标记送达')

    const r = await C.settleTask(task, auth.uid)
    return C.ok(r, '已确认收货')
  },

  /* ---------------- 评价 ---------------- */

  async submitReview(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
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

  /* ---------------- 订单内聊天 ---------------- */

  /** 拉消息（after>0 为增量轮询）；打开即已读 */
  async getChat(taskId, opts = {}) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    return C.ok(await C.chatMessages(task, auth, opts))
  },

  async sendChat(taskId, content, meta = {}, type = 'text') {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const task = await C.getTask(C.taskIdOf(taskId))
    return C.ok(await C.chatSend(task, auth, content, { type }), '已发送')
  },

  async chatUnread(taskId) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    return C.ok(await C.chatUnread(task, auth.uid))
  },

  async listChats() {
    const auth = await C.requireAuth(this)
    return C.ok(await C.chatConversations(auth.uid))
  },

  /* ---------------- 协议 ---------------- */

  async acceptAgreement(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const version = C.str(data.version, { max: 20, name: '协议版本', required: true })
    await C.db.collection(C.COLL.agreements).add({
      user_id: auth.uid,
      version,
      role: 'user',
      create_time: Date.now()
    })
    return C.ok(null, '已同意')
  },

  /* ---------------- 反馈 / 注销申请 ---------------- */

  /**
   * 提交反馈。注销申请也走这里（type=delete_account），
   * 这样客服只需要看一个地方，不用在后台多开一张表。
   *
   * 注销不在这里直接删数据：先人工核对有没有进行中的订单、未提现余额，
   * 核对完再按隐私政策承诺的 15 个工作日处理。
   */
  async submitFeedback(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const type = C.str(data.type || 'suggestion', { max: 20, name: '反馈类型' })
    const allowed = ['suggestion', 'complaint', 'bug', 'delete_account']
    C.assert(allowed.includes(type), 400, '反馈类型不对')
    const content = C.str(data.content, { min: 5, max: 500, name: '反馈内容', required: true })
    const contact = C.str(data.contact, { max: 50, name: '联系方式' })

    await C.rateLimit(auth, 'feedback', 5, 10 * 60 * 1000)

    // 注销申请先拦一下：有进行中的单或没提完的钱，删了会出问题
    if (type === 'delete_account') {
      const asPublisher = await C.db
        .collection(C.COLL.tasks)
        .where({ status: C.STATUS.ONGOING, publisher_id: auth.uid })
        .count()
      const asRunner = await C.db
        .collection(C.COLL.tasks)
        .where({ status: C.STATUS.ONGOING, runner_id: auth.uid })
        .count()
      C.assert(!(asPublisher.total > 0 || asRunner.total > 0), 400, '还有进行中的订单，完成或取消后再申请注销')
      const wallet = await C.db.collection(C.COLL.wallets).doc(auth.uid).get()
      const w = (wallet.data && wallet.data[0]) || {}
      C.assert(!(Number(w.balance_cent) > 0 || Number(w.frozen_cent) > 0), 400, '钱包里还有余额，提现后再申请注销')
      await C.db.collection(C.COLL.users).doc(auth.uid).update({ deletion_requested_at: Date.now() })
    }

    await C.db.collection('xyyx-feedback').add({
      user_id: auth.uid,
      type,
      content,
      contact,
      status: 'new',
      create_time: Date.now()
    })

    return C.ok(
      null,
      type === 'delete_account' ? '注销申请已提交，我们会在 15 个工作日内处理' : '已收到，我们会在 15 个工作日内答复'
    )
  }
}

// 统一兜底：把业务异常(BizError)转成 { code, msg }，未知异常压成 500，
// 否则云函数会直接把异常抛给客户端，前端只能看到「用户函数代码异常」。
module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))