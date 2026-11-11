import Vue from 'vue'

/**
 * 骑手身份的数据层（Vuex 命名空间模块 rider）
 *
 * 一个 App 两种身份：用户身份走 store/index.js 的根状态（云对象 xyyx-user），
 * 骑手身份走这个模块（云对象 xyyx-rider）。两个云对象在服务端互相看不到对方的方法，
 * 字段裁剪也在服务端做，所以合并成一个 App 不影响隔离。
 *
 * 用法：mapGetters('rider', [...]) / mapActions('rider', [...])
 */

function api() {
	return uniCloud.importObject('xyyx-rider', { customUI: true })
}

const STATUS_TEXT = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消', 5: '售后中' }

function formatTime(ts) {
	if (!ts) return ''
	const d = new Date(ts)
	const p = (n) => (n < 10 ? '0' + n : n)
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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
		timeText: formatTime(t.create_time)
	}
}

export default {
	namespaced: true,

	state: {
		profile: {},
		hall: [],
		jobs: [],
		detail: null,
		wallet: { balance: 0, income: 0, withdrawn: 0, transactions: [] }
	},

	getters: {
		isRider: (s) => ((s.profile.rider && s.profile.rider.status) === 2),
		riderStatus: (s) => (s.profile.rider && s.profile.rider.status) || 0,
		hallList: (s) => s.hall,
		jobList: (s) => s.jobs,
		detail: (s) => s.detail,
		wallet: (s) => s.wallet,
		profile: (s) => s.profile,
		commissionRate: (s) => s.profile.commission_rate || 0.1
	},

	mutations: {
		SET_PROFILE(s, p) { s.profile = p || {} },
		SET_HALL(s, list) { s.hall = list },
		SET_JOBS(s, list) { s.jobs = list },
		SET_DETAIL(s, t) { s.detail = t },
		SET_WALLET(s, w) { s.wallet = w }
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

		async acceptAgreement() {
			const res = await api().acceptAgreement({ version: '1.0.0' })
			if (res.code !== 0) throw new Error(res.msg)
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

		async grabTask(ctx, taskId) {
			const res = await api().grabTask(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async markPicked(ctx, taskId) {
			const res = await api().markPicked(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async markDelivered(ctx, taskId) {
			const res = await api().markDelivered(taskId)
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		async abandonTask(ctx, { taskId, reason }) {
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

		async requestWithdraw(ctx, amount) {
			const res = await api().requestWithdraw({ amount })
			if (res.code !== 0) throw new Error(res.msg)
			return res
		}
	}
}
