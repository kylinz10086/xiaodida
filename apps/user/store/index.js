import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

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
const AGREEMENT_VERSION = '1.0.0'

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
    time: t.create_time
  }
}

const store = new Vuex.Store({
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
    getMyPublishedTasks: (state) => state.myTasks.filter((t) => t.role === 'publisher'),
    getDetail: (state) => state.detail,
    getUserInfo: (state) => state.profile,
    getUserStats(state) {
      const p = state.profile
      return {
        published_count: p.published_count || 0,
        accepted_count: p.accepted_count || 0,
        total_income: (p.wallet && p.wallet.income) || 0
      }
    },
    commissionRate: (state) => state.profile.commission_rate || 0.1
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

    logout({ commit }) {
      commit('SET_PROFILE', {})
      commit('SET_MY_TASKS', [])
      commit('SET_HALL', [])
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
      const res = await api().updateProfile(data)
      if (res.code !== 0) throw new Error(res.msg)
      await dispatch('fetchProfile')
      return res
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
      const res = await api().publishTask(data)
      if (res.code !== 0) throw new Error(res.msg)
      return res.data
    },

    /**
     * 下单 + 支付一条龙。
     * 配置了商户证书走微信支付，没配置走模拟支付（仅开发环境，服务端会二次校验）。
     */
    async publishAndPay({ dispatch }, data) {
      const created = await dispatch('publishTask', data)
      const payData = await dispatch('createPayment', created.id)
      if (payData.mode === 'wechat') {
        await dispatch('payWithWechat', payData)
      } else {
        await dispatch('mockPay', created.id)
      }
      return created
    },

    async createPayment({ commit }, taskId) {
      const res = await api().createPayment(taskId)
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
      const res = await payApi().mockPaySuccess(taskId)
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

    async cancelTask(_, { taskId, reason }) {
      const res = await api().cancelTask(taskId, reason)
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    async confirmReceipt(_, taskId) {
      const res = await api().confirmReceipt(taskId)
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    async submitReview(_, data) {
      const res = await api().submitReview(data)
      if (res.code !== 0) throw new Error(res.msg)
      return res
    },

    async acceptAgreement({ state }) {
      const res = await api().acceptAgreement({ version: state.agreementVersion })
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
