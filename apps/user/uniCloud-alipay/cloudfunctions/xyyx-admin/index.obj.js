'use strict'
/**
 * xyyx-admin —— 管理后台云对象
 *
 * 只做后台需要的只读列表 + 骑手审核，所有方法必须先通过 requireAdmin：
 *   - 优先 xyyx-users.role === 'admin'
 *   - 没有扩展资料时回退 uni-id-users.role 包含 'admin'
 *
 * 管理后台不直接读数据库（xyyx-users 的 schema 禁止客户端读写），
 * 所有查询/审核都走这里，避免把管理权限散落到前端。
 */

const C = require('xyyx-common')

const UNI_USERS = 'uni-id-users'

const RIDER_STATUS_TEXT = { 0: '未申请', 1: '待审核', 2: '已通过', 3: '已拒绝' }

/** 退款进度 / 退款来源的展示文案 */
const REFUND_STATUS_TEXT = { processing: '退款中', success: '已退款', failed: '退款失败' }
const REFUND_SOURCE_TEXT = {
  cancel: '用户取消订单',
  edit_down: '修改订单降价',
  edit: '修改订单',
  admin: '管理员操作',
  dispute: '售后处理'
}

function roleText(uniUser, profile) {
  const roles = Array.isArray(uniUser && uniUser.role) ? uniUser.role : [uniUser && uniUser.role]
  if (roles.includes('admin')) return '管理员'
  if (profile && profile.role === 'rider') return '骑手'
  return '用户'
}

function timeOf(v) {
  return Number(v) || 0
}

async function profilesByIds(ids) {
  if (!ids.length) return {}
  const res = await C.db.collection(C.COLL.users).where({ _id: C.dbCmd.in(ids) }).get()
  const map = {}
  for (const p of res.data || []) map[p._id] = p
  return map
}

/**
 * 找出「账上写着退过款、但一张退款单都没有」的订单。
 *
 * 老版本取消订单只写了一条 refund 流水 + refund_cent，从没调过微信退款，
 * 这批订单必须补退，否则用户的钱就一直留在平台账上。
 */
async function scanLostRefundTasks(params = {}) {
  const limit = C.int(params.limit || 200, { min: 1, max: 500, name: '条数' })

  const taskRes = await C.db
    .collection(C.COLL.tasks)
    .where({ status: C.STATUS.CANCELLED, refund_cent: C.dbCmd.gt(0) })
    .orderBy('cancel_time', 'desc')
    .limit(limit)
    .get()
  const tasks = taskRes.data || []

  const ids = tasks.map((t) => t._id)
  let refunds = []
  if (ids.length) {
    const rr = await C.db.collection(C.COLL.refunds).where({ task_id: C.dbCmd.in(ids) }).limit(500).get()
    refunds = rr.data || []
  }
  const covered = new Set(refunds.map((r) => r.task_id))

  const missing = tasks
    .filter((t) => !covered.has(t._id))
    .map((t) => ({
      task_id: t._id,
      title: t.title || '',
      amount: C.yuan(t.amount_cent),
      refund: C.yuan(t.refund_cent),
      pay_mode: t.pay_mode || '',
      cancel_time: timeOf(t.cancel_time)
    }))

  return {
    scanned: tasks.length,
    missing,
    total: missing.length,
    lostAmount: C.yuan(missing.reduce((s, m) => s + Math.round(m.refund * 100), 0))
  }
}

const api = {
  async overview() {
    await C.requireAdmin(this)
    const [users, riders, pending, tasks, refunds, refundFail] = await Promise.all([
      C.db.collection(UNI_USERS).count(),
      C.db.collection(C.COLL.users).where({ rider_status: 2 }).count(),
      C.db.collection(C.COLL.users).where({ rider_status: 1 }).count(),
      C.db.collection(C.COLL.tasks).count(),
      C.db.collection(C.COLL.refunds).count(),
      C.db.collection(C.COLL.refunds).where({ status: 'failed' }).count()
    ])
    return C.ok({
      users: users.total,
      riders: riders.total,
      pendingRiders: pending.total,
      tasks: tasks.total,
      refunds: refunds.total,
      refundFailed: refundFail.total
    })
  },

  /**
   * 退款记录（只读，用来核对「钱到底退没退」）
   * params: { status: ''|processing|success|failed, page, pageSize, keyword }
   */
  async listRefunds(params = {}) {
    await C.requireAdmin(this)
    const page = C.int(params.page || 1, { min: 1, max: 9999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 100, name: '每页条数' })
    const status = String(params.status || '')
    const keyword = String(params.keyword || '').trim().toLowerCase()

    const where = status ? { status } : {}
    const res = await C.db
      .collection(C.COLL.refunds)
      .where(where)
      .orderBy('create_time', 'desc')
      .limit(500)
      .get()

    const rows = (res.data || []).map((r) => ({
      _id: r._id,
      task_id: r.task_id || '',
      user_id: r.user_id || '',
      out_refund_no: r.out_refund_no || '',
      amount: C.yuan(r.amount_cent),
      amount_cent: r.amount_cent || 0,
      reason: r.reason || '',
      source: r.source || '',
      source_text: REFUND_SOURCE_TEXT[r.source || ''] || r.source || '',
      mode: r.mode || '',
      mode_text: r.mode === 'wechat' ? '微信原路退回' : '退回余额',
      status: r.status || '',
      status_text: REFUND_STATUS_TEXT[r.status || ''] || r.status || '',
      fail_reason: r.fail_reason || '',
      parts: r.parts || [],
      create_time: timeOf(r.create_time),
      finish_time: timeOf(r.finish_time)
    }))

    const filtered = keyword
      ? rows.filter((r) =>
          [r.task_id, r.user_id, r.out_refund_no, r.reason]
            .some((v) => String(v || '').toLowerCase().includes(keyword))
        )
      : rows

    const total = filtered.length
    const start = (page - 1) * pageSize
    return C.ok({
      list: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      summary: {
        total: rows.length,
        failed: rows.filter((r) => r.status === 'failed').length,
        processing: rows.filter((r) => r.status === 'processing').length,
        amount: C.yuan(rows.filter((r) => r.status === 'success').reduce((s, r) => s + r.amount_cent, 0))
      }
    })
  },

  /**
   * 提现记录（1.11.0 起读 yyx-withdrawals：带微信转账真实状态）
   *
   * 提现已经接了微信「商家转账到零钱」，每笔都有一条提现单：
   *   pending/WAIT_USER_CONFIRM/TRANSFERING → 在途
   *   SUCCESS → 已到账
   *   FAIL/CANCELLED/EXPIRED → 失败（rolled_back=true 表示钱已退回余额）
   * 老数据只有 withdraw 流水（没有提现单），一并列出来，标成「历史记账」。
   */
  async listWithdrawals(params = {}) {
    await C.requireAdmin(this)
    const page = C.int(params.page || 1, { min: 1, max: 9999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 100, name: '每页条数' })
    const keyword = String(params.keyword || '').trim().toLowerCase()
    const stateFilter = String(params.state || '').trim()

    const stateText = (s) => {
      const map = {
        pending: '提交中',
        ACCEPTED: '已受理',
        TRANSFERING: '转账中',
        PROCESSING: '转账中',
        WAIT_USER_CONFIRM: '待确认收款',
        SUCCESS: '已到账',
        FAIL: '转账失败',
        CANCELLED: '已取消',
        CANCELING: '取消中',
        EXPIRED: '已过期'
      }
      return map[s] || s || '历史记账'
    }

    let rows = []
    try {
      const res = await C.db
        .collection(C.COLL.withdrawals)
        .orderBy('create_time', 'desc')
        .limit(500)
        .get()
      rows = res.data || []
    } catch (e) {
      rows = []
    }

    // 老流水兜底：没有提现单的历史提现
    let legacy = []
    try {
      const txRes = await C.db
        .collection(C.COLL.transactions)
        .where({ type: C.TX_TYPE.WITHDRAW })
        .orderBy('create_time', 'desc')
        .limit(300)
        .get()
      const known = new Set(rows.map((r) => String(r.user_id) + ':' + (Number(r.amount_cent) || 0)))
      legacy = (txRes.data || [])
        .filter((t) => (Number(t.amount_cent) || 0) < 0)
        .filter((t) => !known.has(String(t.user_id) + ':' + Math.abs(Number(t.amount_cent) || 0)))
        .map((t) => ({
          _id: t._id,
          user_id: t.user_id || '',
          amount_cent: Math.abs(Number(t.amount_cent) || 0),
          state: '',
          fail_reason: '',
          legacy: true,
          create_time: t.create_time
        }))
    } catch (e) {
      legacy = []
    }

    const merged = rows
      .map((r) => ({
        _id: r._id,
        user_id: r.user_id || '',
        amount_cent: Number(r.amount_cent) || 0,
        state: r.state || '',
        rolled_back: Boolean(r.rolled_back),
        fail_reason: r.fail_reason || '',
        transfer_bill_no: r.transfer_bill_no || '',
        source: r.source || 'user',
        legacy: false,
        create_time: r.create_time
      }))
      .concat(legacy)

    const profileMap = await profilesByIds(Array.from(new Set(merged.map((r) => r.user_id).filter(Boolean))))

    const all = merged
      .sort((a, b) => (Number(b.create_time) || 0) - (Number(a.create_time) || 0))
      .map((r) => {
        const p = profileMap[r.user_id] || {}
        return {
          _id: r._id,
          out_bill_no: r.legacy ? '' : r._id,
          user_id: r.user_id,
          nickname: p.nickname || '未知用户',
          mobile: C.maskMobile(p.mobile || ''),
          amount: C.yuan(r.amount_cent),
          amount_cent: r.amount_cent,
          state: r.state,
          state_text: r.legacy ? '历史记账（无转账单）' : stateText(r.state),
          rolled_back: r.rolled_back,
          fail_reason: r.fail_reason,
          transfer_bill_no: r.transfer_bill_no,
          source: r.source,
          legacy: r.legacy,
          can_retry: !r.legacy && ['FAIL', 'CANCELLED', 'EXPIRED'].indexOf(r.state) >= 0,
          create_time: timeOf(r.create_time)
        }
      })

    const keywordHit = keyword
      ? all.filter((r) => [r.user_id, r.nickname, r.out_bill_no, r.fail_reason].some((v) => String(v || '').toLowerCase().includes(keyword)))
      : all
    const filtered = stateFilter ? keywordHit.filter((r) => r.state === stateFilter) : keywordHit

    const start = (page - 1) * pageSize
    return C.ok({
      list: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      summary: {
        count: filtered.length,
        amount: C.yuan(filtered.reduce((s, r) => s + r.amount_cent, 0)),
        success: filtered.filter((r) => r.state === 'SUCCESS').length,
        inflight: filtered.filter((r) => ['pending', 'ACCEPTED', 'TRANSFERING', 'PROCESSING', 'WAIT_USER_CONFIRM'].indexOf(r.state) >= 0).length,
        failed: filtered.filter((r) => ['FAIL', 'CANCELLED', 'EXPIRED'].indexOf(r.state) >= 0).length,
        returned: filtered.filter((r) => r.rolled_back).length
      }
    })
  },

  /** 后台触发一次在途提现状态同步（等同定时任务里那一步，方便手动核对） */
  async syncWithdrawals() {
    await C.requireAdmin(this)
    const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
    const r = await pay.syncWithdrawals()
    return C.ok(r.data || {}, r.msg || '已同步')
  },

  /** 后台重发一笔失败/过期的提现（钱之前已经退回余额，这里重新扣一次再发起转账） */
  async reissueWithdraw(params = {}) {
    const auth = await C.requireAdmin(this)
    const no = C.str(params.outBillNo || params._id, { min: 6, max: 64, name: '提现单号', required: true })
    const res = await C.db.collection(C.COLL.withdrawals).doc(no).get()
    const doc = res.data && res.data[0]
    C.assert(doc, 404, '提现单不存在')
    C.assert(['FAIL', 'CANCELLED', 'EXPIRED'].indexOf(doc.state) >= 0, 400, '只有失败/取消/过期的提现才能重发')

    const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
    const r = await pay.reissueWithdraw({ outBillNo: no, operator: auth.uid })
    return C.ok(r.data || {}, r.msg || '已重新发起转账')
  },

  /**
   * 管理员手动重试一笔失败的退款（钱退不出去时人工兜一下）
   */
  async retryRefund(params = {}) {
    const auth = await C.requireAdmin(this)
    const refundId = C.str(params.refundId || params._id, { min: 8, max: 64, name: '退款单号', required: true })
    const res = await C.db.collection(C.COLL.refunds).doc(refundId).get()
    const refund = res.data && res.data[0]
    C.assert(refund, 404, '退款单不存在')
    C.assert(refund.status !== 'success', 400, '这笔已经退成功了')

    // 重新登记一次（失败时已经把额度还回去了，这里重新占用）
    const task = await C.getTask(refund.task_id)
    const retry = await C.beginRefund({
      task,
      amountCent: refund.amount_cent,
      reason: refund.reason || '管理员重试退款',
      source: refund.source || 'admin',
      operator: auth.uid
    })
    return C.ok({ refundId: retry.refundId, needWxRefund: retry.needWxRefund }, '已重新发起退款')
  },

  /**
   * 扫描「账上写着退过款、但其实一张退款单都没有」的历史订单。
   *
   * 背景：老版本的取消退款只在流水表写了一条 refund 记录、把 refund_cent 加上去，
   * 从来没调用过微信退款接口。这批订单在系统里看起来「已退款」，
   * 用户的钱其实还在平台账上 —— 就是这次反馈「1 块钱没退」的那批。
   *
   * 判定依据：status=已取消 且 refund_cent>0 且 yyx-refunds 里查不到该订单的退款单。
   */
  async scanLostRefunds(params = {}) {
    await C.requireAdmin(this)
    return C.ok(await scanLostRefundTasks(params))
  },

  /**
   * 给上面扫出来的订单补退。
   * 必须带 confirm=true 才真的动钱，否则只返回预检结果。
   */
  async repairLostRefunds(params = {}) {
    const auth = await C.requireAdmin(this)
    const preview = await scanLostRefundTasks(params)
    if (params.confirm !== true) {
      return C.ok(preview, '这是预检结果（不会动钱），传 confirm=true 才真正退款')
    }

    const list = preview.missing || []
    const done = []

    for (const item of list) {
      try {
        const task = await C.getTask(item.task_id)
        const amountCent = Number(task.refund_cent) || 0
        if (!amountCent) continue

        // 老数据把 refund_cent 记成「已退」，但根本没退过。
        // 先清掉这个假账，否则 beginRefund 会认为「可退金额已经用完了」。
        await C.db.collection(C.COLL.tasks).doc(task._id).update({
          refund_cent: 0,
          refund_status: '',
          refund_fail_reason: '',
          update_time: Date.now()
        })
        task.refund_cent = 0
        task.refund_status = ''

        const r = await C.beginRefund({
          task,
          amountCent,
          reason: '历史订单补退（旧版本只记账未退款）',
          source: 'admin',
          operator: auth.uid
        })
        done.push({ task_id: item.task_id, amount: r.amount, status: r.status, refundId: r.refundId })
      } catch (e) {
        done.push({ task_id: item.task_id, error: (e && e.message) || '补退失败' })
      }
    }

    const okCount = done.filter((d) => !d.error).length
    return C.ok({ count: done.length, ok: okCount, done }, `已补退 ${okCount} 笔，失败 ${done.length - okCount} 笔`)
  },

  /**
   * 读取系统配置（抽佣比例、退款通道费率、金额区间、提现下限…）
   * 返回「当前生效值 + 代码兜底默认值」，方便后台做「恢复默认」。
   */
  async getSettings() {
    await C.requireAdmin(this)
    const current = await C.loadSettings(true)
    return C.ok({
      current,
      defaults: C.DEFAULT_SETTINGS,
      /** 金额区间之类的元值，顺便算好分，前端不用再乘 100 */
      derived: {
        minOrderCent: Math.round(current.minOrderYuan * 100),
        maxOrderCent: Math.round(current.maxOrderYuan * 100),
        minWithdrawCent: Math.round(current.minWithdrawYuan * 100)
      }
    })
  },

  /**
   * 保存系统配置。只接受白名单字段，数值会被 clamp 到合理区间（normalizeSettings），
   * 存完立即生效（内存缓存同步刷新，其它实例 60 秒内生效）。
   */
  async updateSettings(params = {}) {
    const auth = await C.requireAdmin(this)
    const patch = C.pick(params, Object.keys(C.DEFAULT_SETTINGS))
    C.assert(Object.keys(patch).length > 0, 400, '没有要修改的配置')

    // 抽佣/退款费率支持两种写法：0.05 或 5（百分比），大于 1 的按百分比理解
    if (patch.commissionRate !== undefined && Number(patch.commissionRate) > 1) {
      patch.commissionRate = Number(patch.commissionRate) / 100
    }
    if (patch.refundFeeRate !== undefined && Number(patch.refundFeeRate) > 1) {
      patch.refundFeeRate = Number(patch.refundFeeRate) / 100
    }

    const saved = await C.saveSettings(patch, auth.uid)
    return C.ok(saved, '已保存，立即生效')
  },

  /** 恢复默认配置 */
  async resetSettings() {
    const auth = await C.requireAdmin(this)
    const saved = await C.saveSettings(C.DEFAULT_SETTINGS, auth.uid)
    return C.ok(saved, '已恢复默认配置')
  },

  /**
   * 用户列表（uni-id-users 为主，xyyx-users 补充骑手资料）
   * params: { page, pageSize, keyword }
   */
  async listUsers(params = {}) {
    await C.requireAdmin(this)
    const page = C.int(params.page || 1, { min: 1, max: 9999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 100, name: '每页条数' })
    const keyword = String(params.keyword || '').trim().toLowerCase()

    // 开发期数据量可控；先取最近 1000 个账号，再在内存里补资料/搜索/分页。
    const uniRes = await C.db.collection(UNI_USERS)
      .orderBy('register_date', 'desc')
      .limit(1000)
      .get()
    const uniUsers = uniRes.data || []
    const ids = uniUsers.map((u) => u._id)
    const pMap = await profilesByIds(ids)

    let rows = uniUsers.map((u) => {
      const p = pMap[u._id] || {}
      const roles = Array.isArray(u.role) ? u.role : [u.role]
      return {
        _id: u._id,
        username: u.username || '',
        nickname: p.nickname || u.nickname || '',
        mobile: p.mobile || u.mobile || '',
        role: roles.filter(Boolean),
        roleText: roleText(u, p),
        status: u.status === undefined ? 0 : u.status,
        register_date: timeOf(u.register_date) || timeOf(p.create_time),
        last_login_date: timeOf(u.last_login_date),
        rider_status: p.rider_status || 0,
        rider_status_text: RIDER_STATUS_TEXT[p.rider_status || 0] || '未申请',
        real_name: p.real_name || '',
        // 学号完整下发（15 位），另外给一份分段展示串，后台表格不会再挤成一团
        student_no: C.parseStudentNo(p.student_no).digits,
        student_no_display: C.parseStudentNo(p.student_no).display,
        rider_apply_time: timeOf(p.rider_apply_time)
      }
    })

    if (keyword) {
      // 学号可能被粘成「2025 122114 04009」或 15 位连写，两种都要能搜到
      const keywordNoSpace = keyword.replace(/\s+/g, '')
      rows = rows.filter((r) =>
        [r.username, r.nickname, r.mobile, r._id, r.real_name, r.student_no]
          .some((v) => String(v || '').toLowerCase().includes(keyword)) ||
        (keywordNoSpace && String(r.student_no || '').includes(keywordNoSpace))
      )
    }

    const total = rows.length
    const start = (page - 1) * pageSize
    return C.ok({
      list: rows.slice(start, start + pageSize),
      total,
      page,
      pageSize
    })
  },

  /**
   * 骑手申请列表
   * params: { status: 0全部|1待审核|2已通过|3已拒绝, page, pageSize }
   */
  async listRiders(params = {}) {
    await C.requireAdmin(this)
    const status = params.status ? C.int(params.status, { min: 1, max: 3, name: '状态' }) : 0
    const page = C.int(params.page || 1, { min: 1, max: 9999, name: '页码' })
    const pageSize = C.int(params.pageSize || 20, { min: 1, max: 100, name: '每页条数' })

    const where = status ? { rider_status: status } : { rider_status: C.dbCmd.in([1, 2, 3]) }
    const res = await C.db.collection(C.COLL.users)
      .where(where)
      .orderBy('rider_apply_time', 'desc')
      .limit(1000)
      .get()
    const rows = (res.data || []).map((p) => {
      const student = C.parseStudentNo(p.student_no)
      return {
        _id: p._id,
        nickname: p.nickname || '',
        mobile: p.mobile || '',
        real_name: p.real_name || '',
        student_no: student.digits,
        student_no_display: student.display,
        student_no_valid: student.valid,
        rider_status: p.rider_status || 0,
        rider_status_text: RIDER_STATUS_TEXT[p.rider_status || 0] || '未申请',
        rider_apply_time: timeOf(p.rider_apply_time),
        rider_review_time: timeOf(p.rider_review_time),
        rider_reject_reason: p.rider_reject_reason || ''
      }
    })
    const total = rows.length
    const start = (page - 1) * pageSize
    return C.ok({
      list: rows.slice(start, start + pageSize),
      total,
      page,
      pageSize
    })
  },

  /**
   * 审核骑手
   * params: { userId, action: 'approve'|'reject', reason }
   */
  async reviewRider(params = {}) {
    const auth = await C.requireAdmin(this)
    const userId = C.str(params.userId || params._id, { min: 1, max: 64, name: '用户ID', required: true })
    const action = String(params.action || '')
    C.assert(action === 'approve' || action === 'reject', 400, 'action 只能是 approve / reject')
    const reason = C.str(params.reason, { max: 100, name: '拒绝原因' })

    const res = await C.db.collection(C.COLL.users).doc(userId).get()
    const profile = (res.data && res.data[0]) || null
    C.assert(profile, 404, '用户不存在')

    const now = Date.now()
    if (action === 'approve') {
      C.assert(profile.rider_status === 1 || profile.rider_status === 3, 400, '该用户不是待审核/已拒绝状态')
      await C.db.collection(C.COLL.users).doc(userId).update({
        rider_status: 2,
        role: profile.role === 'admin' ? 'admin' : 'rider',
        rider_approved_time: now,
        rider_review_time: now,
        rider_review_by: auth.uid,
        rider_reject_reason: ''
      })
      return C.ok({ status: 2 }, '已通过骑手审核')
    }

    C.assert(profile.rider_status === 1 || profile.rider_status === 2, 400, '该用户不是待审核/已通过状态')
    await C.db.collection(C.COLL.users).doc(userId).update({
      rider_status: 3,
      rider_review_time: now,
      rider_review_by: auth.uid,
      rider_reject_reason: reason || '审核未通过'
    })
    return C.ok({ status: 3 }, '已拒绝骑手申请')
  }
}

module.exports = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, C.guard(fn)]))
