import Vue from 'vue'
import Vuex from 'vuex'
import { AGREEMENT_VERSION } from '@/common/agreement.js'

Vue.use(Vuex)

// 骑手身份的数据层（一个 App 两种身份）
import rider from './rider'

/**
 * 用户端数据层
 *
 * 所有请求只发往云对象 xyyx-user；骑手端的 xyyx-rider 在这里**不可见**，
 * 这是「两端口隔离」的第一道门（第二道在服务端字段裁剪 taskForUser）。
 *
 * 金额：服务端一律用整数「分」存储，返回时已换算成元（amount）。
 *       前端不要再做金额运算，只负责显示。
 */

const SCHOOL = '浙江中医药大学'

let lifeData = {}
try {
  lifeData = uni.getStorageSync('lifeData')
} catch (e) {}

const saveStateKeys = ['vuex_user', 'vuex_token']
const saveLifeData = function (key, value) {
  if (saveStateKeys.indexOf(key) !== -1) {
    let tmp = uni.getStorageSync('lifeData')
    tmp = tmp ? tmp : {}
    tmp[key] = value
    uni.setStorageSync('lifeData', tmp)
  }
}

function api() {
  try {
    return uniCloud.importObject('xyyx-user', { customUI: true })
  } catch (e) {
    throw new Error('云端未就绪：请先关联 uniCloud 服务空间并部署云对象')
  }
}

function payApi() {
  return uniCloud.importObject('xyyx-pay', { customUI: true })
}

/**
 * 写接口防重放参数：每次写操作生成新的 nonce + 当前时间戳。
 * 服务端 checkNonce 会把 uid+nonce 落到 xyyx-nonces（唯一索引），
 * 5 分钟外或重复提交直接拒绝。
 */
let nonceSeq = 0
function requestMeta() {
  const seq = (++nonceSeq).toString(36)
  const rand = Math.random().toString(36).slice(2, 12)
  return {
    nonce: `n_${Date.now().toString(36)}_${seq}_${rand}`,
    timestamp: Date.now()
  }
}

function withMeta(data = {}) {
  return { ...data, ...requestMeta() }
}

const STATUS_TEXT = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消', 5: '售后中' }

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => (n < 10 ? '0' + n : n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 把服务端订单映射成页面习惯的字段 */
function mapTask(t) {
  return {
    ...t,
    id: t._id,
    thing: t.title,
    money: t.amount,
    typeText: t.type_text,
    statusText: t.status_text || STATUS_TEXT[t.status] || '',
    itemSize: t.item_size,
    timeOption: t.time_option,
    timeText: formatTime(t.create_time),
    riderName: t.rider ? t.rider.nickname : '',
    time: t.create_time,
    // —— 钱：修改订单/退款相关 ——
    paid: t.paid || 0,
    due: t.due || 0,
    refund: t.refund || 0,
    refundStatus: t.refund_status || '',
    refundStatusText: t.refund_status_text || '',
    refundFailReason: t.refund_fail_reason || '',
    // 退款手续费（平台留下），详情页要说明白
    refundFee: t.refund_fee || 0,
    payStatus: t.pay_status || '',
    /** 还差差价没付 */
    needPay: Number(t.due_cent || 0) > 0,
    /** 有退款在途或已退 */
    hasRefund: Number(t.refund_cent || 0) > 0
  }
}

const store = new Vuex.Store({
  modules: { rider },
  state: {
    vuex_user: lifeData.vuex_user ? lifeData.vuex_user : { id: '', name: '', usertype: 0 },
    vuex_token: lifeData.vuex_token ? lifeData.vuex_token : '',
    profile: {},
    hall: [],
    myTasks: [],
    detail: null,
    payMode: 'mock',
    agreementVersion: AGREEMENT_VERSION
  },

  getters: {
    school: () => SCHOOL,
    agreementVersion: (state) => state.agreementVersion,
    userToken: (state) => state.vuex_token || uni.getStorageSync('uniIdToken') || '',
    isLogin() {
      return !!(uni.getStorageSync('uniIdToken') || uni.getStorageSync('token'))
    },
    getTaskList: (state) => state.hall,
    getMyTasks: (state) => state.myTasks,
    /** 兼容老页面命名：搜索页用的是 getMyOrders，这里补个别名，别再返回 undefined */
    getMyOrders: (state) => state.myTasks,
    getMyPublishedTasks: (state) => state.myTasks.filter((t) => t.role === 'publisher'),
    getDetail: (state) => state.detail,
    /**
     * 按 id 查订单。
     * 详情页一直在用 `getTaskById`，但 store 里从来没定义过这个 getter，
     * 结果详情页一进去就 TypeError（白屏），这里补上。
     */
    getTaskById: (state) => (id) => {
      if (!id) return null
      const all = [...state.myTasks, ...state.hall, ...(state.detail ? [state.detail] : [])]
      return all.find((t) => t && (t._id === id || t.id === id)) || null
    },
    getUserInfo: (state) => state.profile,
    getUserStats(state) {
      const p = state.profile
      return {
        published_count: p.published_count || 0,
        accepted_count: p.accepted_count || 0,
        total_income: (p.wallet && p.wallet.income) || 0
      }
    },
    commissionRate: (state) => state.profile.commission_rate || 0.05
  },

  mutations: {
    $uStore(state, payload) {
      const nameArr = payload.name.split('.')
      if (nameArr.length >= 2) {
        let obj = state[nameArr[0]]
        for (let i = 1; i < nameArr.length - 1; i++) obj = obj[nameArr[i]]
        obj[nameArr[nameArr.length - 1]] = payload.value
      } else {
        state[payload.name] = payload.value
      }
      saveLifeData(nameArr[0], state[nameArr[0]])
    },
    SET_HALL(state, list) {
      state.hall = list
    },
    SET_MY_TASKS(state, list) {
      state.myTasks = list
    },
    SET_PROFILE(state, p) {
      state.profile = p || {}
    },
    SET_DETAIL(state, t) {
      state.detail = t
    },
    SET_PAY_MODE(state, m) {
      state.payMode = m
    }
  },

  actions: {
    /* ---------- 登录态 ---------- */
    async setUserToken({ commit }, token) {
      commit('$uStore', { name: 'vuex_token', value: token })
      uni.setStorageSync('token', token)
    },

    /**
     * 登录成功后把用户资料放进 Vuex。
     * 之前 App.vue / 登录弹窗都会 dispatch 这个 action，但 store 里根本没定义，
     * 导致登录请求明明成功了，回调却抛 "unknown action type: setUserData"。
     */
    async setUserData({ commit }, user) {
      commit('$uStore', { name: 'vuex_user', value: user || {} })
    },

    logout({ commit }) {
      commit('SET_PROFILE', {})
      commit('SET_MY_TASKS', [])
      commit('SET_HALL', [])
      commit('$uStore', { name: 'vuex_user', value: {} })
      commit('$uStore', { name: 'vuex_token', value: '' })
      uni.removeStorageSync('userInfo')
      uni.removeStorageSync('token')
      uni.removeStorageSync('uniIdToken')
    },

    /* ---------- 资料 ---------- */
    async fetchProfile({ commit }) {
      const res = await api().getProfile()
      if (res.code !== 0) throw new Error(res.msg)
      commit('SET_PROFILE', res.data)
      uni.setStorageSync('userInfo', res.data)
      return res.data
    },

    async updateProfile({ dispatch }, data) {
      const res = await api().updateProfile(withMeta(data))
      if (res.code !== 0) throw new Error(res.msg)
      await dispatch('fetchProfile')
      return res
    },

    /** 兼容旧页面命名：userinfo 页 dispatch 的是 updateUserInfo */
    async updateUserInfo({ dispatch }, data) {
      return dispatch('updateProfile', data)
    },

    /* ---------- 大厅 ---------- */
    async fetchHall({ commit }, params = {}) {
      const res = await api().listHall(params)
      if (res.code !== 0) throw new Error(res.msg)
      commit('SET_HALL', (res.data.list || []).map(mapTask))
      return res.data
    },

    async fetchDetail({ commit }, taskId) {
      const res = await api().getTaskDetail(taskId)
      if (res.code !== 0) throw new Error(res.msg)
      const mapped = mapTask(res.data)
      commit('SET_DETAIL', mapped)
      return mapped
    },

    /* ---------- 下单与支付 ---------- */
    async publishTask(_, data) {
      const res = await api().publishTask(withMeta(data))
      if (res.code !== 0) throw new Error(res.msg)
      return res.data
    },

    /**
     * 修改订单（原地更新，不再是「取消旧的 + 重新下单」）。
     *
     * 服务端会算好差价：
     *   - 降价：登记退款单 → 这里接着调 xyyx-pay.refundTask 把钱原路退回
     *   - 涨价：返回 needPay=true，调用方再走 payOrder 补差价
     */
    async updateTask({ dispatch }, data) {
      const res = await api().updateTask(withMeta(data))
      if (res.code !== 0) throw new Error(res.msg)
      const info = res.data || {}
      // 服务端已经在同一次请求里提交了微信退款；只有它没退成功（状态还是 processing/failed）
      // 才由客户端补一刀，再失败就交给定时任务
      if (info.refundId && info.refundStatus !== 'success') {
        await dispatch('submitRefund', info.refundId)
      }
      return { ...info, msg: res.msg }
    },

    /**
     * 把服务端登记好的退款单真正提交给微信。
     * 失败不抛错：服务端定时任务会重试，用户不该因为退款慢一点就看不到结果。
     */
    async submitRefund(_, refundId) {
      if (!refundId) return null
      try {
        const r = await payApi().refundTask(refundId)
        if (r.code !== 0) console.warn('[refund] 微信退款提交失败：', r.msg)
        return r
      } catch (e) {
        console.warn('[refund] 微信退款提交异常：', e && e.message)
        return null
      }
    },

    /**
     * 单独支付一笔订单（全款或涨价差价）。
     * 金额由服务端决定，客户端只负责唤起支付。
     */
    async payOrder({ dispatch }, { taskId, cancelOnFail = false }) {
      try {
        const payData = await dispatch('createPayment', taskId)
        if (payData.mode === 'wechat') {
          await dispatch('payWithWechat', payData)
        } else {
          const ok = await new Promise((resolve) => {
            uni.showModal({
              title: payData.isTopup ? '补付差价' : '模拟支付',
              content: payData.isTopup
                ? `本次只需补付差价 ¥${payData.amount}。\n当前未配置微信商户证书，将模拟支付。`
                : `当前未配置微信商户证书，将模拟支付 ¥${payData.amount}。\n确认后订单进入大厅。`,
              confirmText: '确认支付',
              cancelText: '取消',
              success: (r) => resolve(!!r.confirm),
              fail: () => resolve(false)
            })
          })
          if (!ok) throw new Error('已取消支付')
          await dispatch('mockPay', taskId)
        }
        return payData
      } catch (e) {
        if (cancelOnFail) {
          try {
            await dispatch('cancelTask', { taskId, reason: '支付未完成，自动取消' })
          } catch (cancelErr) {
            console.warn('支付失败后自动取消失败', cancelErr)
          }
        }
        throw e
      }
    },

    /**
     * 下单 + 支付一条龙。
     * 配置了商户证书走微信支付，没配置走模拟支付（仅开发环境，服务端会二次校验）。
     */
    async publishAndPay({ dispatch }, data) {
      const created = await dispatch('publishTask', data)
      await dispatch('payOrder', { taskId: created.id, cancelOnFail: true })
      return created
    },

    /**
     * 发起支付：直接调 xyyx-pay（不要绕 xyyx-user）
     * 原因：云函数里再 importObject 别的云对象时会丢掉客户端 token，
     * 导致支付对象里所有 requireAuth 都判成「未登录」。
     */
    async createPayment({ commit }, taskId) {
      const res = await payApi().createJsapiOrder({ taskId, ...requestMeta() })
      if (res.code !== 0) throw new Error(res.msg)
      commit('SET_PAY_MODE', res.data.mode)
      return res.data
    },

    /** 真实微信支付；返回 true 表示支付流程已走完 */
    async payWithWechat(_, payData) {
      if (!payData || payData.mode !== 'wechat') return false
      const p = payData.payParams
      await new Promise((resolve, reject) => {
        uni.requestPayment({
          provider: 'wxpay',
          timeStamp: p.timeStamp,
          nonceStr: p.nonceStr,
          package: p.package,
          signType: p.signType,
          paySign: p.paySign,
          success: resolve,
          fail: (e) => reject(new Error(e.errMsg || '支付失败'))
        })
      })
      return true
    },

    /** 开发环境模拟支付（服务端在配置了真实支付时会拒绝） */
    async mockPay(_, taskId) {
      const res = await payApi().mockPaySuccess(taskId, requestMeta())
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    /* ---------- 订单操作 ---------- */
    async fetchMyTasks({ commit }, params = {}) {
      const res = await api().listMyTasks(params)
      if (res.code !== 0) throw new Error(res.msg)
      commit('SET_MY_TASKS', (res.data.list || []).map(mapTask))
      return res.data
    },

    async cancelTask({ dispatch }, { taskId, reason }) {
      const res = await api().cancelTask(taskId, reason, requestMeta())
      if (res.code !== 0) throw new Error(res.msg)
      // 服务端已经提交过微信退款；没成功才由客户端再推一次（失败由定时任务兜底）
      if (res.data && res.data.refundId && res.data.refundStatus !== 'success') {
        await dispatch('submitRefund', res.data.refundId)
      }
      return res
    },

    async cancelUnpaidTasks(_ctx) {
      const res = await api().cancelUnpaidTasks(requestMeta())
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    async confirmReceipt(_, taskId) {
      const res = await api().confirmReceipt(taskId, requestMeta())
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    async submitReview(_, data) {
      const res = await api().submitReview(withMeta(data))
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    /** 反馈 / 注销申请，都落到 xyyx-feedback */
    async submitFeedback(_, data) {
      const res = await api().submitFeedback(withMeta(data))
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    /* ---------- 订单内聊天 ---------- */
    async listChats() {
      const res = await api().listChats()
      if (res.code !== 0) throw new Error(res.msg)
      return (res.data && res.data.list) || []
    },

    async chatUnread(_, taskId) {
      const res = await api().chatUnread(taskId)
      if (res.code !== 0) throw new Error(res.msg)
      return (res.data && res.data.unread) || 0
    },

    async acceptAgreement({ state }) {
      const res = await api().acceptAgreement({ version: state.agreementVersion, ...requestMeta() })
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    /* ---------- 兼容旧页面的别名 ---------- */
    async fetchTaskList({ dispatch }, params = {}) {
      return dispatch('fetchHall', params)
    },
    async fetchUserInfo({ dispatch }) {
      return dispatch('fetchProfile')
    },

    /**
     * 用户端不该有「接单/完成/放弃」这三种动作——它们属于骑手端。
     * 老页面里还留着这些按钮，这里给明确提示，而不是让 Vuex 抛 "unknown action type"。
     */
    async acceptTask() {
      throw new Error('接单请使用「校递达骑手端」')
    },
    async completeTask() {
      throw new Error('完成订单请在骑手端操作')
    },
    async abandonTask() {
      throw new Error('放弃订单请在骑手端操作')
    },
    /** 发布者的「确认完成」= 确认收货，触发结算 */
    async confirmTask({ dispatch }, { taskId }) {
      return dispatch('confirmReceipt', taskId)
    }
  }
})

export default store
