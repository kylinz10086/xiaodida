'use strict'
/**
 * xyyx-rider —— 骑手端云对象
 *
 * 只暴露「跑腿的人」需要的方法。与用户端严格分离：
 *   - 接单前骑手拿不到任何手机号、看不到门牌详情（只能看地点名 + 坐标估距离）
 *   - 接单后才给完整手机号（要打电话）与门牌详情
 *   - 骑手不能确认收货之外的操作，状态流转只能通过这里的方法
 *
 * 状态流转：1 待接单 → 2 进行中（已接单）→ 3 已完成（已结算）
 *         骑手放弃：2 → 1（重新回到大厅）
 *
 * 完成订单的两种模式，见 common.AUTO_SETTLE_ON_DELIVER：
 *   true （默认）骑手点「已送达」即完成并结算 —— 校园跑腿只有骑手能证明送到，
 *                否则用户一忙订单就永远卡在「进行中」，骑手也拿不到钱。
 *   false        旧的「等用户确认」两段式，24 小时后由 xyyx-cron 兜底结算。
 */

const C = require('xyyx-common')

const RIDER_STATUS_TEXT = ['未申请', '审核中', '已认证', '已拒绝']

/** 今天 0 点（北京时间 UTC+8，云函数时区可能是 UTC，这里显式换算） */
function todayStart() {
  const OFFSET = 8 * 3600 * 1000
  const now = Date.now()
  return Math.floor((now + OFFSET) / 86400000) * 86400000 - OFFSET
}

/** 学号必须是 15 位数字：4 位学年 + 6 位学院专业号 + 5 位班级学号 */
function assertStudentNo(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim()
  C.assert(/^\d+$/.test(raw), 400, '学号只能填数字')
  C.assert(C.STUDENT_NO_RE.test(raw), 400, `学号应为 15 位数字（共 ${raw.length} 位），格式：学年4位 + 学院专业6位 + 班级学号5位`)
  return raw
}

const api = {
  /* ---------------- 资料 ---------------- */

  async getProfile() {
    const auth = await C.requireAuth(this)
    const profile = await C.ensureProfile(auth.uid)
    const wallet = await C.ensureWallet(auth.uid)
    const start = todayStart()

    // 骑手侧统计（数据量小，直接取最近 200 单在内存里算，避免依赖聚合能力）
    const [doneRes, ongoingRes, todayRes] = await Promise.all([
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.DONE }).count(),
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.ONGOING }).count(),
      C.db.collection(C.COLL.tasks)
        .where({ runner_id: auth.uid, status: C.STATUS.DONE, complete_time: C.dbCmd.gte(start) })
        .limit(200)
        .get()
    ])

    const todayList = todayRes.data || []
    const todayIncomeCent = todayList.reduce((sum, t) => sum + (Number(t.rider_income_cent) || 0), 0)

    return C.ok({
      ...C.myProfile(profile),
      wallet: {
        balance: C.yuan(wallet.balance_cent),
        income: C.yuan(wallet.income_cent),
        withdrawn: C.yuan(wallet.withdrawn_cent),
        frozen: C.yuan(wallet.frozen_cent)
      },
      rider: {
        status: profile.rider_status || 0,
        status_text: RIDER_STATUS_TEXT[profile.rider_status || 0] || '未申请',
        done_count: doneRes.total,
        ongoing_count: ongoingRes.total,
        today_count: todayList.length,
        today_income: C.yuan(todayIncomeCent),
        rating: profile.rating || 5,
        rating_count: profile.rider_rating_count || 0
      },
      commission_rate: C.S().commissionRate,
      // 把这些也下发，骑手端不用再写死任何数字
      settings: C.publicSettings(),
      auto_settle_on_deliver: C.S().autoSettleOnDeliver
    })
  },

  /**
   * 申请成为骑手。
   * 真实姓名、学号只给平台审核用，**永不下发给用户端**（见 common.taskForUser，那里根本不含这些字段）
   * 但会完整回给本人（骑手中心要能看到自己填的学号是不是全的）。
   */
  async applyRider(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const realName = C.str(data.real_name, { min: 2, max: 20, name: '真实姓名', required: true })
    const studentNo = assertStudentNo(data.student_no)
    const mobile = C.str(data.mobile, { max: 11, name: '手机号', required: true })
    C.assert(/^1\d{10}$/.test(mobile), 400, '手机号格式不对')

    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) !== 2, 400, '你已经是骑手了')

    await C.ensureProfile(auth.uid, {
      real_name: realName,
      student_no: studentNo,
      student_info: C.parseStudentNo(studentNo),
      mobile,
      rider_status: 1,
      rider_apply_time: Date.now(),
      rider_reject_reason: ''
    })

    // 冷启动规则：平台还没有任何一个「已通过」的骑手时，第一个申请直接通过。
    // 否则新部署的环境没人能审核，骑手永远进不来（管理后台还没做）。
    const approvedCount = await C.db.collection(C.COLL.users).where({ rider_status: 2 }).count()
    if (!approvedCount.total) {
      await C.ensureProfile(auth.uid, { rider_status: 2, rider_approved_time: Date.now() })
      return C.ok({ status: 2, auto: true }, '你是平台第一位骑手，已自动通过审核')
    }

    return C.ok({ status: 1 }, '申请已提交，等待审核')
  },

  /**
   * 修正认证信息（真实姓名 / 学号 / 手机号）。
   *
   * 为什么需要：审核通过以后 applyRider 会被「你已经是骑手了」挡住，
   * 于是早期用 8 位学号（或者填错的学号）注册的骑手永远改不回来 ——
   * 表现出来就是「学号显示不完整」，其实是库里的值本来就不全。
   * 这里允许本人补全，状态不变（已通过仍然是已通过），只记一次修改时间。
   */
  async updateRiderInfo(data = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const realName = C.str(data.real_name, { min: 2, max: 20, name: '真实姓名', required: true })
    const studentNo = assertStudentNo(data.student_no)
    const mobile = C.str(data.mobile, { max: 11, name: '手机号' })
    if (mobile) C.assert(/^1\d{10}$/.test(mobile), 400, '手机号格式不对')

    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) > 0, 400, '请先提交骑手申请')

    const patch = {
      real_name: realName,
      student_no: studentNo,
      student_info: C.parseStudentNo(studentNo),
      rider_info_update_time: Date.now()
    }
    if (mobile) patch.mobile = mobile
    await C.ensureProfile(auth.uid, patch)

    return C.ok(C.parseStudentNo(studentNo), '认证信息已更新')
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

  /* ---------------- 抢单 ---------------- */

  async listHall(params = {}) {
    const auth = await C.requireAuth(this)
    const page = C.int(params.page || 1, { min: 1, max: 999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 50, name: '每页条数' })
    const type = params.type ? C.int(params.type, { min: 1, max: 3, name: '类型' }) : 0

    // 自己发的单不进大厅（否则点进去只能看到「不能接自己发布的单」）
    const where = {
      status: C.STATUS.PENDING,
      pay_status: 'paid',
      publisher_id: C.dbCmd.neq(auth.uid)
    }
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
  async grabTask(taskId, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const profile = await C.ensureProfile(auth.uid)
    C.assert((profile.rider_status || 0) === 2, 403, '你还不是骑手，请先提交申请并通过审核')

    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.publisher_id !== auth.uid, 400, '不能接自己发布的单')
    C.assert(task.status === C.STATUS.PENDING, 400, '手慢了，这单已经被接走')
    C.assert(task.pay_status === 'paid', 400, '该订单还未支付，不能接')
    // 涨价改单还没补差价的单不会出现在大厅，这里再兜一层，
    // 防止有人拿着 taskId 直接调接口把没付清的单抢走
    C.assert(C.dueCentOf(task) === 0, 400, '该订单还没付清，暂时不能接')

    // 限流必须在写库之前：之前放在 update 之后，被限流的骑手会看到「操作太频繁」，
    // 但单其实已经落到他名下了，于是又重新抢一次 → 越抢越乱。
    await C.rateLimit(auth, 'grab', C.S().grabPerMinute)

    // 用当前生效的抽佣比例算预期收入；写死 C.COMMISSION_RATE 会在后台改比例后对不上
    const incomeCent = Math.round((Number(task.amount_cent) || 0) * (1 - C.S().commissionRate))
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
        accept_time: Date.now(),
        picked_time: 0,
        delivered_time: 0,
        rider_income_cent: 0
      })

    C.assert(upd.updated === 1, 409, '手慢了，这单已经被接走')

    // 聊天里留一条系统提示；失败不影响抢单
    await C.chatSystem({ ...task, runner_id: auth.uid }, '骑手已接单，可以开始沟通了')

    return C.ok({ id, income: C.yuan(incomeCent) }, `抢单成功，预计可赚 ¥${C.yuan(incomeCent)}`)
  },

  /** 标记取到件 */
  async markPicked(taskId, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对，可能已完成或已被取消')
    // 幂等：重复点不报错，直接告诉他已经取过件了（弱网重试很常见）
    if (task.picked_time) return C.ok({ picked_time: task.picked_time }, '已经标记过取件了')

    const upd = await C.db
      .collection(C.COLL.tasks)
      .where({ _id: id, runner_id: auth.uid, status: C.STATUS.ONGOING })
      .update({ picked_time: Date.now() })
    C.assert(upd.updated === 1, 409, '状态已变化，请下拉刷新')

    return C.ok(null, '已取件，记得尽快送到')
  },

  /**
   * 标记送达。
   *
   * AUTO_SETTLE_ON_DELIVER=true 时，这一步直接把订单结算掉：
   * 订单 → 已完成、扣平台佣金、骑手收入立刻进钱包。
   * 这正是「接单之后无法完成订单」的修复点 —— 以前点完送达状态还是「进行中」，
   * 只能等用户确认或 24 小时定时任务，用户一忙这单就永远完不成。
   */
  async markDelivered(taskId, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单已结束，不需要再点送达')
    C.assert(!task.delivered_time, 400, '已经标记过送达了')
    // 没取件就送达 = 跳步骤，会让用户看到「还没取货就已送达」，这里挡住
    C.assert(task.picked_time > 0, 400, '请先点「已取件」，再到送达点')

    const now = Date.now()
    const upd = await C.db
      .collection(C.COLL.tasks)
      .where({ _id: id, runner_id: auth.uid, status: C.STATUS.ONGOING })
      .update({
        delivered_time: now,
        // 即便送达即结算，也留一个时间戳：用户 24 小时内可以申诉/售后
        auto_confirm_at: now + C.S().autoConfirmHours * 3600 * 1000
      })
    C.assert(upd.updated === 1, 409, '状态已变化，请下拉刷新')

    await C.chatSystem(task, '骑手已标记送达')

    if (!C.S().autoSettleOnDeliver) {
      return C.ok({ status: C.STATUS.ONGOING, need_confirm: true, settled: false }, '已送达，等待用户确认收货')
    }

    // 用户中途涨价改单、还没补差价时不能结算：
    // 这时托管里只有旧价格的钱，按新价格结算会让平台垫钱。
    // 先把送达时间记上，等用户付完差价（due_cent 归 0）由定时任务自动结算。
    const dueCent = C.dueCentOf(task)
    if (dueCent > 0) {
      return C.ok(
        {
          status: C.STATUS.ONGOING,
          settled: false,
          need_confirm: false,
          awaiting_payment: true,
          due: C.yuan(dueCent)
        },
        `已送达。用户还有 ¥${C.yuan(dueCent)} 差价未支付，付完后系统会自动结算到你钱包`
      )
    }

    try {
      const r = await C.settleTask({ ...task, delivered_time: now }, `rider:${auth.uid}`)
      return C.ok(
        {
          status: C.STATUS.DONE,
          settled: true,
          need_confirm: false,
          income: C.yuan(r.riderIncome),
          commission: C.yuan(r.commission)
        },
        `订单已完成，收入 ¥${C.yuan(r.riderIncome)} 已到账`
      )
    } catch (e) {
      // 并发下可能已经被别处结算过（用户确认 / 定时任务）：这不是失败
      if (e && e.code === 409) {
        const latest = await C.getTask(id)
        return C.ok(
          { status: latest.status, settled: latest.status === C.STATUS.DONE, need_confirm: false, income: C.yuan(latest.rider_income_cent) },
          '订单已完成'
        )
      }
      throw e
    }
  },

  /** 放弃任务：回到大厅 */
  async abandonTask(taskId, reason, meta = {}) {
    const auth = await C.requireAuth(this)
    await C.checkNonce(auth, meta.nonce, meta.timestamp)
    const id = C.taskIdOf(taskId)
    const task = await C.getTask(id)
    C.assert(task.runner_id === auth.uid, 403, '这不是你的单')
    C.assert(task.status === C.STATUS.ONGOING, 400, '订单状态不对')
    C.assert(!task.delivered_time, 400, '已送达的单不能放弃，请联系客服')

    // 频繁放弃要有成本：一天内放弃超过 5 单就不让接了，避免恶意占单
    await C.rateLimit(auth, 'abandon', C.S().abandonPerDay, 24 * 3600 * 1000)

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
        delivered_time: 0,
        abandon_reason: C.str(reason, { max: 60, name: '放弃原因' }),
        abandon_time: Date.now()
      })
    C.assert(upd.updated === 1, 409, '状态已变化，请刷新')
    await C.chatSystem(task, '骑手已放弃这一单，订单已回到大厅')
    return C.ok(null, '已放弃，订单回到大厅')
  },

  /* ---------------- 我的任务 ---------------- */

  async listMyJobs(params = {}) {
    const auth = await C.requireAuth(this)
    const status = params.status ? C.int(params.status, { min: 1, max: 5, name: '状态' }) : 0
    const where = status ? { runner_id: auth.uid, status } : { runner_id: auth.uid }

    const [res, ongoingRes, doneRes] = await Promise.all([
      C.db.collection(C.COLL.tasks).where(where).orderBy('accept_time', 'desc').limit(50).get(),
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.ONGOING }).count(),
      C.db.collection(C.COLL.tasks).where({ runner_id: auth.uid, status: C.STATUS.DONE }).count()
    ])

    return C.ok({
      list: res.data.map((t) => C.taskForRider(t, auth.uid)),
      summary: { ongoing: ongoingRes.total, done: doneRes.total }
    })
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
      frozen: C.yuan(wallet.frozen_cent),
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
    await C.checkNonce(auth, data.nonce, data.timestamp)
    const amountCent = C.toCents(data.amount)
    const minWithdrawCent = Math.round(C.S().minWithdrawYuan * 100)
    C.assert(amountCent >= minWithdrawCent, 400, `提现金额不能低于 ${C.S().minWithdrawYuan} 元`)

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

  /* ---------------- 订单内聊天 ---------------- */

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
      role: 'rider',
      create_time: Date.now()
    })
    return C.ok(null, '已同意')
  }
}

// 统一兜底：把业务异常(BizError)转成 { code, msg }，未知异常压成 500，
// 否则云函数会直接把异常抛给客户端，前端只能看到「用户函数代码异常」。
module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))
