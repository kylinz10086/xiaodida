'use strict'
/**
 * xyyx-rider —— 骑手端云对象
 *
 * 只暴露「跑腿的人」需要的方法。与用户端严格分离：
 *   - 骑手拿不到用户完整手机号（接单后给脱敏号）
 *   - 骑手拿不到用户昵称以外的身份信息
 *   - 骑手不能确认收货（只有用户能确认），只能标记送达
 *
 * 状态流转：1 待接单 → 2 进行中 → 3 已完成
 *         骑手放弃：2 → 1（重新回到大厅）
 */

const C = require('xyyx-common')

const api = {
  /* ---------------- 资料 ---------------- */

  async getProfile() {
    const auth = await C.requireAuth(this)
    const profile = await C.ensureProfile(auth.uid)
    const wallet = await C.ensureWallet(auth.uid)

    // 骑手侧统计
    const [doneCount, ongoingCount] = await Promise.all([
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.DONE }).count(),
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.ONGOING }).count()
    ])

    return C.ok({
      ...C.myProfile(profile),
      wallet: {
        balance: C.yuan(wallet.balance_cent),
        income: C.yuan(wallet.income_cent),
        withdrawn: C.yuan(wallet.withdrawn_cent)
      },
      rider: {
        status: profile.rider_status || 0,
        done_count: doneCount.total,
        ongoing_count: ongoingCount.total,
        rating: profile.rating || 5,
        rating_count: profile.rider_rating_count || 0
      },
      commission_rate: C.COMMISSION_RATE
    })
  },

  /**
   * 申请成为骑手。
   * 真实姓名、学号只给平台审核用，**永不下发给用户端**（见 common.taskForUser，那里根本不含这些字段）
   */
  async applyRider(data = {}) {
    const auth = await C.requireAuth(this)
    const realName = C.str(data.real_name, { min: 2, max: 20, name: '真实姓名', required: true })
    const studentNo = C.str(data.student_no, { min: 4, max: 20, name: '学号', required: true })
    const mobile = C.str(data.mobile, { max: 11, name: '手机号', required: true })
    C.assert(/^1\d{10}$/.test(mobile), 400, '手机号格式不对')

    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) !== 2, 400, '你已经是骑手了')

    await C.ensureProfile(auth.uid, {
      real_name: realName,
      student_no: studentNo,
      mobile,
      rider_status: 1,
      rider_apply_time: Date.now()
    })
    return C.ok({ status: 1 }, '申请已提交，等待审核')
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

  /* ---------------- 抢单 ---------------- */

  async listHall(params = {}) {
    const auth = await C.requireAuth(this)
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
      list: listRes.data.map((t) => C.taskForRider(t, auth.uid)),
      total: countRes.total,
      page,
      pageSize
    })
  },

  async getTaskDetail(taskId) {
    const auth = await C.requireAuth(this)
    const task = await C.getTask(C.taskIdOf(taskId))
    return C.ok(C.taskForRider(task, auth.uid))
  },

  /** 抢单：用「状态还是待接单」做 CAS，防止两个人同时接到 */
  async grabTask(taskId) {
    const auth = await C.requireAuth(this)
    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) === 2, 403, '你还不是骑手，请先提交申请并通过审核')

    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id !== auth.uid, 400, '不能接自己发布的单')
    C.assert(task.status === C.STATUS.PENDING, 400, '手慢了，这单已经被接走')
    C.assert(task.pay_status === 'paid', 400, '该订单还未支付，不能接')

    const upd = await C.db
      .collection(C.COLL.tasks)
      .where({ _id: id, status: C.STATUS.PENDING })
      .update({
        status: C.STATUS.ONGOING,
        runner_id: auth.uid,
        runner_nickname: profile.nickname || '骑手',
        runner_avatar: profile.avatar || '',
        runner_rating: profile.rating || 5,
        runner_accepted_count: profile.accepted_count || 0,
        accept_time: Date.now()
      })

    C.assert(upd.updated === 1, 409, '手慢了，这单已经被接走')

    await C.rateLimit(auth, 'grab', 30)
    return C.ok({ id }, '抢单成功，请尽快取件')
  },

  /** 标记取到件 */
  async markPicked(taskId) {
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对')

    await C.db.collection(C.COLL.tasks).doc(id).update({ picked_time: Date.now() })
    return C.ok(null, '已取件')
  },

  /** 标记送达（等用户确认；超时自动确认由定时任务处理） */
  async markDelivered(taskId) {
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对')
    C.assert(!task.delivered_time, 400, '已经标记过送达了')

    await C.db.collection(C.COLL.tasks).doc(id).update({
      delivered_time: Date.now(),
      auto_confirm_at: Date.now() + C.AUTO_CONFIRM_HOURS * 3600 * 1000
    })
    return C.ok(null, '已送达，等待用户确认')
  },

  /** 放弃任务：回到大厅 */
  async abandonTask(taskId, reason) {
    const auth = await C.requireAuth(this)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对')
    C.assert(!task.delivered_time, 400, '已送达的单不能放弃，请联系客服')

    const upd = await C.db
      .collection(C.COLL.tasks)
      .where({ _id: id, runner_id: auth.uid, status: C.STATUS.ONGOING })
      .update({
        status: C.STATUS.PENDING,
        runner_id: '',
        runner_nickname: '',
        runner_avatar: '',
        runner_rating: 0,
        runner_accepted_count: 0,
        accept_time: 0,
        picked_time: 0,
        abandon_reason: C.str(reason, { max: 60, name: '放弃原因' }),
        abandon_time: Date.now()
      })
    C.assert(upd.updated === 1, 409, '状态已变化，请刷新')
    return C.ok(null, '已放弃，订单回到大厅')
  },

  /* ---------------- 我的任务 ---------------- */

  async listMyJobs(params = {}) {
    const auth = await C.requireAuth(this)
    const status = params.status ? C.int(params.status, { min: 1, max: 5, name: '状态' }) : 0
    const where = status ? { runner_id: auth.uid, status } : { runner_id: auth.uid }

    const res = await C.db.collection(C.COLL.tasks).where(where).orderBy('accept_time', 'desc').limit(50).get()
    return C.ok({ list: res.data.map((t) => C.taskForRider(t, auth.uid)) })
  },

  /* ---------------- 钱包 ---------------- */

  async getWallet() {
    const auth = await C.requireAuth(this)
    const wallet = await C.ensureWallet(auth.uid)
    const txRes = await C.db
      .collection(C.COLL.transactions)
      .where({ user_id: auth.uid })
      .orderBy('create_time', 'desc')
      .limit(50)
      .get()

    return C.ok({
      balance: C.yuan(wallet.balance_cent),
      income: C.yuan(wallet.income_cent),
      withdrawn: C.yuan(wallet.withdrawn_cent),
      transactions: txRes.data.map((t) => ({
        _id: t._id,
        type: t.type,
        amount: C.yuan(t.amount_cent),
        remark: t.remark,
        create_time: t.create_time
      }))
    })
  },

  /** 提现申请（V1 走人工审核，不自动打款） */
  async requestWithdraw(data = {}) {
    const auth = await C.requireAuth(this)
    const amountCent = C.toCents(data.amount)
    C.assert(amountCent >= 1000, 400, '提现金额不能低于 10 元')

    const wallet = await C.ensureWallet(auth.uid)
    C.assert(wallet.balance_cent >= amountCent, 400, '余额不足')

    const upd = await C.db
      .collection(C.COLL.wallets)
      .where({ _id: auth.uid, balance_cent: C.dbCmd.gte(amountCent) })
      .update({
        balance_cent: C.dbCmd.inc(-amountCent),
        frozen_cent: C.dbCmd.inc(amountCent),
        update_time: Date.now()
      })
    C.assert(upd.updated === 1, 409, '余额已变化，请刷新')

    await C.db.collection(C.COLL.transactions).add(
      C.txDoc({
        type: C.TX_TYPE.WITHDRAW,
        uid: auth.uid,
        taskId: '',
        amountCent: -amountCent,
        remark: '提现申请（审核中）',
        key: `withdraw:${auth.uid}:${Date.now()}`
      })
    )
    return C.ok({ amount: C.yuan(amountCent) }, '提现申请已提交，审核通过后到账')
  },

  /* ---------------- 协议 ---------------- */

  async acceptAgreement(data = {}) {
    const auth = await C.requireAuth(this)
    const version = C.str(data.version, { max: 20, name: '协议版本', required: true })
    await C.db.collection(C.COLL.agreements).add({
      user_id: auth.uid,
      version,
      role: 'rider',
      create_time: Date.now()
    })
    return C.ok(null, '已同意')
  }
}

// 统一兜底：把业务异常(BizError)转成 { code, msg }，未知异常压成 500，
// 否则云函数会直接把异常抛给客户端，前端只能看到「用户函数代码异常」。
module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))