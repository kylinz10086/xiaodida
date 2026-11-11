import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

/**
 * 骑手端数据层
 *
 * 只调 xyyx-rider。用户端的 xyyx-user 在这里不可见，这是两端口隔离的第一道门；
 * 第二道在服务端 taskForRider()：接单前拿不到任何手机号，接单后只给脱敏号。
 *
 * 所有金额服务端已换算成元（amount / income），前端只显示。
 */

function api() {
	try {
		return uniCloud.importObject('xyyx-rider', { customUI: true })
	} catch (e) {
		throw new Error('云端未就绪：请先关联 uniCloud 服务空间并部署云对象')
	}
}

const STATUS_TEXT = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消', 5: '售后中' }

function mapTask(t) {
	return {
		...t,
		id: t._id,
		money: t.amount,
		income: t.income,
		typeText: t.type_text,
		statusText: t.status_text || STATUS_TEXT[t.status] || '',
		originName: (t.origin && t.origin.name) || '',
		destName: (t.destination && t.destination.name) || '',
		time: t.create_time
	}
}

const store = new Vuex.Store({
	state: {
		profile: {},
		hall: [],
		jobs: [],
		detail: null,
		wallet: { balance: 0, income: 0, withdrawn: 0, transactions: [] }
	},

	getters: {
		isLogin() {
			return !!uni.getStorageSync('uniIdToken')
		},
		isRider: (state) => (state.profile.rider && state.profile.rider.status) === 2,
		riderStatus: (state) => (state.profile.rider && state.profile.rider.status) || 0,
		hallList: (state) => state.hall,
		jobList: (state) => state.jobs,
		detail: (state) => state.detail,
		wallet: (state) => state.wallet,
		profile: (state) => state.profile,
		commissionRate: (state) => state.profile.commission_rate || 0.1
	},

	mutations: {
		SET_PROFILE(state, p) {
			state.profile = p || {}
		},
		SET_HALL(state, list) {
			state.hall = list
		},
		SET_JOBS(state, list) {
			state.jobs = list
		},
		SET_DETAIL(state, t) {
			state.detail = t
		},
		SET_WALLET(state, w) {
			state.wallet = w
		}
	},

	actions: {
		async fetchProfile({ commit }) {
			const res = await api().getProfile()
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_PROFILE', res.data)
			return res.data
		},

		async applyRider({ dispatch }, data) {
			const res = await api().applyRider(data)
			if (res.code !== 0) throw new Error(res.msg)
			await dispatch('fetchProfile')
			return res
		},

		async updateProfile({ dispatch }, data) {
			const res = await api().updateProfile(data)
			if (res.code !== 0) throw new Error(res.msg)
			await dispatch('fetchProfile')
			return res
		},

		async fetchHall({ commit }, params = {}) {
			const res = await api().listHall(params)
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_HALL', (res.data.list || []).map(mapTask))
			return res.data
		},

		async fetchDetail({ commit }, taskId) {
			const res = await api().getTaskDetail(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			const t = mapTask(res.data)
			commit('SET_DETAIL', t)
			return t
		},

		async grabTask({ dispatch }, taskId) {
			const res = await api().grabTask(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async markPicked(_, taskId) {
			const res = await api().markPicked(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async markDelivered(_, taskId) {
			const res = await api().markDelivered(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async abandonTask(_, { taskId, reason }) {
			const res = await api().abandonTask(taskId, reason)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async fetchJobs({ commit }, params = {}) {
			const res = await api().listMyJobs(params)
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_JOBS', (res.data.list || []).map(mapTask))
			return res.data
		},

		async fetchWallet({ commit }) {
			const res = await api().getWallet()
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_WALLET', res.data)
			return res.data
		},

		async requestWithdraw(_, amount) {
			const res = await api().requestWithdraw({ amount })
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async acceptAgreement() {
			const res = await api().acceptAgreement({ version: '1.0.0' })
			if (res.code !== 0) throw new Error(res.msg)
			return res
		}
	}
})

export default store
