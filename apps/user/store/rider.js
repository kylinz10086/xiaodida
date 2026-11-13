import Vue from 'vue'
import { parseStudentNo } from '@/common/rider-util.js'
import { AGREEMENT_VERSION } from '@/common/agreement.js'

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

/** 写接口防重放参数（同用户端 store/index.js） */
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

/**
 * 服务端 taskForRider 的字段映射。
 * 注意：以前漏了 time_option → 页面里写 item.timeOption 一直取不到值，
 * 「尽快送达」永远显示默认文案，这里统一补上 timeText。
 */
function mapTask(t) {
	const picked = Number(t.picked_time) || 0
	const delivered = Number(t.delivered_time) || 0
	let step = 0 // 0 待接单 1 已接单 2 已取件 3 已送达
	if (t.status === 1) step = 0
	else if (t.status === 2) step = delivered ? 3 : picked ? 2 : 1
	else step = 3

	return {
		...t,
		id: t._id,
		money: t.amount,
		income: t.income || 0,
		incomeSettled: !!t.income_settled,
		typeText: t.type_text,
		statusText: t.status_text || STATUS_TEXT[t.status] || '',
		originName: (t.origin && t.origin.name) || '',
		destName: (t.destination && t.destination.name) || '',
		timeText: t.time_option || '尽快送达',
		createText: formatTime(t.create_time),
		acceptText: formatTime(t.accept_time),
		pickedText: formatTime(picked),
		deliveredText: formatTime(delivered),
		completeText: formatTime(t.complete_time),
		step,
		stepText: ['待接单', '已接单', '已取件', '已送达'][step] || ''
	}
}

/** 资料归一化：把学号拆成可以「分组显示」的结构，避免 15 位数字糊在一起 */
function mapProfile(p) {
	const profile = p || {}
	const student = parseStudentNo(profile.student_no)
	return {
		...profile,
		studentNoDigits: student.digits,
		studentNoGrouped: student.grouped,
		studentNoValid: student.valid,
		studentNoYear: student.year,
		studentNoMajor: student.major,
		studentNoClass: student.classNo
	}
}

export default {
	namespaced: true,

	state: {
		profile: {},
		hall: [],
		jobs: [],
		jobSummary: { ongoing: 0, done: 0 },
		detail: null,
		wallet: { balance: 0, income: 0, withdrawn: 0, frozen: 0, transactions: [] },
		// 抢单/取件/送达 正在进行中的订单 id，用于按钮 loading 与防重复点击
		busyId: ''
	},

	getters: {
		isRider: (s) => ((s.profile.rider && s.profile.rider.status) === 2),
		riderStatus: (s) => (s.profile.rider && s.profile.rider.status) || 0,
		// 状态文案优先用服务端给的 status_text，没有就按 status 数字兜底：
		// 之前只看 status_text，服务端没下发时（或还没重新部署时）就一直显示「未认证」，
		// 于是出现「明明已经审核通过，左上角却写未认证」的错位。
		riderStatusText: (s) => {
			const r = s.profile.rider || {}
			if (r.status_text) return r.status_text
			return ['未申请', '审核中', '已认证', '已拒绝'][Number(r.status) || 0] || '未认证'
		},
		riderInfo: (s) => s.profile.rider || {},
		hallList: (s) => s.hall,
		jobList: (s) => s.jobs,
		jobSummary: (s) => s.jobSummary,
		detail: (s) => s.detail,
		wallet: (s) => s.wallet,
		profile: (s) => s.profile,
		busyId: (s) => s.busyId,
		commissionRate: (s) => s.profile.commission_rate || 0.08,
		/** 送达后是否还要等用户确认（服务端开关 AUTO_SETTLE_ON_DELIVER 决定） */
		needConfirm: (s) => s.profile.auto_settle_on_deliver === false
	},

	mutations: {
		SET_PROFILE(s, p) { s.profile = mapProfile(p) },
		SET_HALL(s, list) { s.hall = list },
		SET_JOBS(s, list) { s.jobs = list },
		SET_JOB_SUMMARY(s, summary) { s.jobSummary = summary || { ongoing: 0, done: 0 } },
		SET_DETAIL(s, t) { s.detail = t },
		SET_WALLET(s, w) { s.wallet = w },
		SET_BUSY(s, id) { s.busyId = id },

		/**
		 * 就地补一个订单的字段（详情 + 我的任务 + 大厅三处同步）。
		 *
		 * 为什么需要：取件/送达成功后会重新拉详情，但如果服务端（还没重新部署的那一版）
		 * 没有返回 picked_time，页面就永远停在「我已取件」那一步，看起来像「点了没反应」。
		 * 这里拿写接口的返回值先把本地状态推进一格，服务端下一次刷新再覆盖。
		 */
		PATCH_TASK(s, { id, patch }) {
			const pick = (t) => (t && t._id === id ? mapTask({ ...t, ...patch }) : t)
			if (s.detail && s.detail._id === id) s.detail = mapTask({ ...s.detail, ...patch })
			s.jobs = (s.jobs || []).map(pick)
			s.hall = (s.hall || []).map(pick)
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
			const res = await api().applyRider(withMeta(data))
			if (res.code !== 0) throw new Error(res.msg)
			await dispatch('fetchProfile')
			return res
		},

		async updateProfile({ dispatch }, data) {
			const res = await api().updateProfile(withMeta(data))
			if (res.code !== 0) throw new Error(res.msg)
			await dispatch('fetchProfile')
			return res
		},

		/** 修正真实姓名 / 学号 / 手机号（审核通过后也能改，用于补全不足 15 位的学号） */
		async updateRiderInfo({ dispatch }, data) {
			const res = await api().updateRiderInfo(withMeta(data))
			if (res.code !== 0) throw new Error(res.msg)
			await dispatch('fetchProfile')
			return res
		},

		async acceptAgreement() {
			const res = await api().acceptAgreement({ version: AGREEMENT_VERSION, ...requestMeta() })
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

		async grabTask({ commit }, taskId) {
			commit('SET_BUSY', taskId)
			try {
				const res = await api().grabTask(taskId, requestMeta())
				if (res.code !== 0) throw new Error(res.msg)
				commit('PATCH_TASK', { id: taskId, patch: { status: 2, accept_time: Date.now() } })
				return res
			} finally {
				commit('SET_BUSY', '')
			}
		},

		async markPicked({ commit }, payload) {
			const taskId = typeof payload === 'string' ? payload : payload && payload.taskId
			const proof = typeof payload === 'string' ? '' : (payload && payload.proof) || ''
			const thumb = typeof payload === 'string' ? '' : (payload && payload.thumb) || ''
			commit('SET_BUSY', taskId)
			try {
				const res = await api().markPicked(taskId, requestMeta(), proof, thumb)
				if (res.code !== 0) throw new Error(res.msg)
				// 立刻把本地状态推进到「已取件」，不等下一次拉取
				commit('PATCH_TASK', { id: taskId, patch: { picked_time: (res.data && res.data.picked_time) || Date.now() } })
				return res
			} finally {
				commit('SET_BUSY', '')
			}
		},

		/**
		 * 送达。服务端在 AUTO_SETTLE_ON_DELIVER 模式下会顺手结算，
		 * 返回值里的 data.income / data.settled 用来给骑手弹「收入已到账」。
		 */
		async markDelivered({ commit }, payload) {
			const taskId = typeof payload === 'string' ? payload : payload && payload.taskId
			const proof = typeof payload === 'string' ? '' : (payload && payload.proof) || ''
			const thumb = typeof payload === 'string' ? '' : (payload && payload.thumb) || ''
			commit('SET_BUSY', taskId)
			try {
				const res = await api().markDelivered(taskId, requestMeta(), proof, thumb)
				if (res.code !== 0) throw new Error(res.msg)
				const d = (res.data && res.data) || {}
				const now = Date.now()
				commit('PATCH_TASK', {
					id: taskId,
					patch: {
						delivered_time: now,
						status: d.status || 2,
						// 结算成功的话顺便把实收和完成时间补上，页面立刻能显示「已入账」
						rider_income_cent: d.settled ? Math.round(Number(d.income || 0) * 100) : 0,
						complete_time: d.settled ? now : 0
					}
				})
				return res
			} finally {
				commit('SET_BUSY', '')
			}
		},

		async abandonTask({ commit }, { taskId, reason }) {
			commit('SET_BUSY', taskId)
			try {
				const res = await api().abandonTask(taskId, reason, requestMeta())
				if (res.code !== 0) throw new Error(res.msg)
				return res
			} finally {
				commit('SET_BUSY', '')
			}
		},

		async fetchJobs({ commit }, params = {}) {
			const res = await api().listMyJobs(params)
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_JOBS', (res.data.list || []).map(mapTask))
			commit('SET_JOB_SUMMARY', res.data.summary)
			return res.data
		},

		async fetchWallet({ commit }) {
			const res = await api().getWallet()
			if (res.code !== 0) throw new Error(res.msg)
			commit('SET_WALLET', res.data)
			return res.data
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

		/**
		 * 提现走 xyyx-pay（要调微信「商家转账到零钱」，支付证书只在那边）。
		 * 返回里带 package_info 时，页面要用 wx.requestMerchantTransfer 拉起确认收款。
		 */
		async requestWithdraw(ctx, amount) {
			const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
			const res = await pay.requestWithdraw({ amount, ...requestMeta() })
			if (res.code !== 0) throw new Error(res.msg)
			return res
		},

		/** 查询提现转账状态（确认收款后轮询） */
		async queryWithdraw(_, outBillNo) {
			const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
			const res = await pay.queryWithdraw(outBillNo)
			if (res.code !== 0) throw new Error(res.msg)
			return res.data || {}
		},

		/** 我的提现记录（带微信转账状态：待确认/已到账/失败已退回） */
		async fetchWithdrawals(_, limit = 8) {
			const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
			const res = await pay.myWithdrawals(limit)
			if (res.code !== 0) throw new Error(res.msg)
			return (res.data && res.data.list) || []
		}
	}
}
