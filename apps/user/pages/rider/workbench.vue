<template>
	<view class="page">
		<!-- 顶部：身份 + 今日概览（合并成一块，避免页面顶部出现三条割裂的横条） -->
		<view class="head">
			<view class="head-top">
				<view class="head-id">
					<text class="badge">骑手</text>
					<text class="head-status">{{ riderStatusText }}</text>
				</view>
				<view class="head-link" @click="goCenter">
					<text>骑手中心</text>
					<text class="head-arrow">›</text>
				</view>
			</view>

			<view class="stats">
				<view class="stat">
					<text class="stat-num">{{ riderInfo.today_count || 0 }}</text>
					<text class="stat-label">今日完成</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="stat-num">¥{{ money(riderInfo.today_income) }}</text>
					<text class="stat-label">今日收入</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="stat-num">{{ jobSummary.ongoing || riderInfo.ongoing_count || 0 }}</text>
					<text class="stat-label">进行中</text>
				</view>
			</view>
		</view>

		<!-- 两个 tab：压在头部下沿，视觉上把「概览」和「列表」连起来 -->
		<view class="tabs">
			<view class="tab" :class="{ active: tab === 'hall' }" @click="switchTab('hall')">
				<text>抢单大厅</text>
				<text class="tab-num" v-if="hall.length">{{ hall.length }}</text>
			</view>
			<view class="tab" :class="{ active: tab === 'jobs' }" @click="switchTab('jobs')">
				<text>我的任务</text>
				<text class="tab-num" v-if="jobSummary.ongoing">{{ jobSummary.ongoing }}</text>
			</view>
		</view>

		<!-- 未认证提示 -->
		<view class="notice" v-if="riderStatus !== 2" @click="goApply">
			<text class="notice-text">{{ riderStatus === 1 ? '骑手申请审核中，通过后就能抢单了' : '你还不是骑手，点这里申请' }}</text>
			<text class="notice-arrow">›</text>
		</view>

		<!-- ============ 抢单大厅 ============ -->
		<view v-if="tab === 'hall'" class="body">
			<!-- 搜索：就地过滤当前大厅，不走接口，敲一个字就变 -->
			<view class="search">
				<view class="search-box">
					<text class="search-icon">⌕</text>
					<input class="search-input" v-model="keyword" confirm-type="search"
						placeholder="搜索任务、地点" placeholder-class="search-ph"
						@confirm="onSearchConfirm" />
					<view class="search-clear" v-if="keyword" @click="clearKeyword">×</view>
				</view>
			</view>

			<scroll-view class="filters" scroll-x :show-scrollbar="false">
				<view class="filter" :class="{ active: type === 0 }" @click="changeType(0)">全部</view>
				<view class="filter" :class="{ active: type === 1 }" @click="changeType(1)">快递代取</view>
				<view class="filter" :class="{ active: type === 2 }" @click="changeType(2)">代带餐食</view>
				<view class="filter" :class="{ active: type === 3 }" @click="changeType(3)">其他</view>
			</scroll-view>

			<!-- 段落头：和首页「任务市场」同一套排版，标题 + 排序胶囊 -->
			<view class="section-head">
				<view class="section-left">
					<text class="section-title">{{ kw ? '「' + kw + '」' : '可接任务' }}</text>
					<text class="section-count" v-if="hallView.length">{{ hallView.length }} 单</text>
				</view>
				<view class="sort-tabs">
					<view class="sort-tab" :class="{ active: sortBy === 'near' }" @click="setSort('near')">按距离</view>
					<view class="sort-tab" :class="{ active: sortBy === 'time' }" @click="setSort('time')">按时间</view>
					<view class="sort-tab" :class="{ active: sortBy === 'price' }" @click="setSort('price')">按价格</view>
				</view>
			</view>

			<view class="list">
				<!-- 骨架屏：首屏加载时不要白屏 -->
				<block v-if="loading && !hall.length">
					<view class="card skeleton-card" v-for="n in 3" :key="n">
						<view class="skeleton skeleton-line" style="width: 26%"></view>
						<view class="skeleton skeleton-line" style="width: 72%; height: 36rpx"></view>
						<view class="skeleton skeleton-line" style="width: 100%; height: 96rpx"></view>
						<view class="skeleton skeleton-line" style="width: 40%"></view>
					</view>
				</block>

				<view class="task-card" v-for="item in hallView" :key="item._id" @click="goDetail(item._id)">
					<view class="card-head">
						<text class="type-tag" :class="'type-' + item.type">{{ item.typeText }}</text>
						<view class="price-box">
							<view class="price-line">
								<text class="price-sym">¥</text>
								<text class="price-val">{{ money(item.money) }}</text>
							</view>
							<text class="income-tip" v-if="item.income > 0">到手 ¥{{ money(item.income) }}</text>
						</view>
					</view>

					<view class="card-body">
						<text class="task-title">{{ item.title }}</text>
						<text class="task-desc" v-if="item.description">{{ item.description }}</text>

						<view class="task-tags">
							<text class="time-tag">{{ item.timeText }}</text>
							<text class="time-tag">{{ item.timeAgoText }}</text>
						</view>

						<view class="route-info">
							<view class="route-point">
								<text class="point-icon start">起</text>
								<text class="point-text">{{ item.originName || '待确认' }}</text>
							</view>
							<view class="route-arrow"></view>
							<view class="route-point">
								<text class="point-icon end">终</text>
								<text class="point-text">{{ item.destName || '待确认' }}</text>
							</view>
						</view>
					</view>

					<view class="card-foot">
						<view class="foot-meta">
							<text class="dist-chip" v-if="item.distText">{{ item.distText }}</text>
							<text class="walk-tip" v-if="item.walkText">· {{ item.walkText }}</text>
						</view>
						<view class="btn btn-primary grab-btn" :class="{ disabled: busyId === item._id }"
							@click.stop="grab(item)">
							{{ busyId === item._id ? '抢单中…' : '抢单' }}
						</view>
					</view>
				</view>

				<view class="empty-card" v-if="!loading && !hallView.length">
					<block v-if="kw">
						<view class="ec-icon">🔍</view>
						<text class="ec-title">没搜到「{{ kw }}」相关的任务</text>
						<text class="ec-sub">换个关键词，或者清空搜索看全部</text>
						<view class="ec-btn" @click="clearKeyword">清空搜索</view>
					</block>
					<block v-else>
						<view class="ec-icon">🛵</view>
						<text class="ec-title">暂时没有可接的任务</text>
						<text class="ec-sub">下拉刷新，或者换个类型看看</text>
						<view class="ec-btn" @click="refresh">刷新一下</view>
					</block>
				</view>
			</view>
		</view>

		<!-- ============ 我的任务 ============ -->
		<view v-if="tab === 'jobs'" class="body">
			<view class="job-tabs">
				<view class="job-tab" :class="{ active: jobFilter === 0 }" @click="setJobFilter(0)">全部</view>
				<view class="job-tab" :class="{ active: jobFilter === 2 }" @click="setJobFilter(2)">进行中</view>
				<view class="job-tab" :class="{ active: jobFilter === 3 }" @click="setJobFilter(3)">已完成</view>
			</view>

			<view class="list">
				<block v-if="loading && !jobsView.length">
					<view class="card skeleton-card" v-for="n in 2" :key="n">
						<view class="skeleton skeleton-line" style="width: 34%"></view>
						<view class="skeleton skeleton-line" style="width: 100%; height: 96rpx"></view>
					</view>
				</block>

				<view class="card order" v-for="item in jobsView" :key="item._id" @click="goDetail(item._id)">
					<view class="order-top">
						<text class="tag" :class="'tag-' + item.type">{{ item.typeText }}</text>
						<text class="status-badge" :class="'status-' + item.status">{{ item.statusText }}</text>
					</view>

					<text class="order-title">{{ item.title }}</text>

					<view class="route">
						<view class="route-line">
							<text class="dot start">起</text>
							<text class="route-text">{{ item.originName }}</text>
						</view>
						<view class="route-line">
							<text class="dot end">终</text>
							<text class="route-text">{{ item.destName }}</text>
						</view>
					</view>

					<!-- 进度：已接单 → 已取件 → 已送达 -->
					<view class="steps" v-if="item.status === 2">
						<view class="step" :class="{ on: item.step >= 1 }">
							<text class="step-dot">1</text>
							<text class="step-txt">已接单</text>
						</view>
						<view class="step-line" :class="{ on: item.step >= 2 }"></view>
						<view class="step" :class="{ on: item.step >= 2 }">
							<text class="step-dot">2</text>
							<text class="step-txt">已取件</text>
						</view>
						<view class="step-line" :class="{ on: item.step >= 3 }"></view>
						<view class="step" :class="{ on: item.step >= 3 }">
							<text class="step-dot">3</text>
							<text class="step-txt">已送达</text>
						</view>
					</view>

					<view class="order-foot">
						<view class="price-block">
							<view class="price-line">
								<text class="unit">¥</text>
								<text class="price">{{ money(item.money) }}</text>
								<!-- 只有真正结算过才显示实收（扣完平台佣金后的钱），没结算就不显示预估 -->
								<text class="income" v-if="item.status === 3 && item.incomeSettled">已入账 ¥{{ money(item.income) }}</text>
							</view>
							<text class="muted time-line">{{ item.status === 3 ? item.completeText : item.acceptText }}</text>
						</view>

						<view class="actions">
							<view class="btn btn-danger btn-sm" v-if="item.status === 2 && item.step < 3"
								@click.stop="abandon(item)">放弃</view>
							<view class="btn btn-primary btn-sm" v-if="item.status === 2 && item.step < 2"
								:class="{ disabled: busyId === item._id }" @click.stop="picked(item)">
								{{ busyId === item._id ? '处理中…' : '已取件' }}
							</view>
							<view class="btn btn-success btn-sm" v-if="item.status === 2 && item.step === 2"
								:class="{ disabled: busyId === item._id }" @click.stop="delivered(item)">
								{{ busyId === item._id ? '提交中…' : '已送达' }}
							</view>
							<!-- 已送达但还没结算（等用户确认的模式下）：给个明确状态，不让人反复点 -->
							<view class="btn btn-grey btn-sm" v-if="item.status === 2 && item.step === 3" @click.stop="goDetail(item._id)">
								等用户确认
							</view>
							<view class="btn btn-ghost btn-sm" v-if="item.status === 3" @click.stop="goDetail(item._id)">
								查看
							</view>
						</view>
					</view>
				</view>

				<view class="empty" v-if="!loading && !jobsView.length">
					<view class="empty-badge">📦</view>
					<text class="empty-title">还没有接过任务</text>
					<text class="empty-tip">大厅里有顺路的单子，接一单试试</text>
					<view class="empty-btn" @click="switchTab('hall')">去抢单大厅</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { getLocation, distanceMeters, formatDistance, formatWalk, timeAgo, fmtMoney, errText } from '@/common/rider-util.js'
	import { askProofImage } from '@/common/image.js'

	export default {
		data() {
			return {
				tab: 'hall',
				jobFilter: 0,
				type: 0,
				sortBy: 'time',
				keyword: '',
				loading: false,
				myLoc: null
			}
		},
		computed: {
			...mapGetters('rider', ['hallList', 'jobList', 'jobSummary', 'riderStatus', 'riderStatusText', 'riderInfo', 'busyId']),
			hall() { return this.hallList },

			/** 搜索词：去掉首尾空格，空串代表没在搜 */
			kw() { return String(this.keyword || '').trim() },

			/** 空格分隔的多个词，全部命中才算匹配（「食堂 奶茶」= 两样都沾） */
			kwTerms() {
				return this.kw ? this.kw.toLowerCase().split(/\s+/).filter(Boolean) : []
			},

			/** 大厅：先按搜索词过滤，再算距离 → 按距离/时间排序 */
			hallView() {
				const terms = this.kwTerms
				const src = terms.length ? this.hall.filter((t) => this.matchTask(t, terms)) : this.hall
				const list = src.map((t) => {
					const d = this.myLoc
						? distanceMeters(this.myLoc.latitude, this.myLoc.longitude, t.origin && t.origin.latitude, t.origin && t.origin.longitude)
						: -1
					return {
						...t,
						dist: d,
						distText: d >= 0 ? formatDistance(d) : '',
						walkText: d >= 0 ? (d > 3000 ? '距离较远' : '步行约' + formatWalk(d)) : '',
						timeAgoText: timeAgo(t.create_time)
					}
				})
				if (this.sortBy === 'near') {
					return list.sort((a, b) => (a.dist < 0 ? 1 : b.dist < 0 ? -1 : a.dist - b.dist))
				}
				if (this.sortBy === 'price') {
					return list.sort((a, b) => b.income - a.income)
				}
				return list
			},
			jobsView() {
				if (!this.jobFilter) return this.jobList
				return this.jobList.filter((t) => t.status === this.jobFilter)
			}
		},
		onShow() {
			this.loadProfile()
			this.load()
			this.refreshLocation()
		},
		onPullDownRefresh() {
			Promise.all([this.loadProfile(), this.load(), this.refreshLocation(true)])
				.finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions('rider', ['fetchProfile', 'fetchHall', 'fetchJobs', 'grabTask', 'markPicked', 'markDelivered', 'abandonTask']),

			/**
			 * 只搜卡片上真能看见的内容：标题、描述、类型、取件点、送达点。
			 * 门牌和备注接单前服务端压根不下发，搜进来只会让人对着卡片找不到关键词。
			 */
			taskText(t) {
				return [t.title, t.description, t.typeText, t.originName, t.destName]
					.filter(Boolean)
					.join(' ')
					.toLowerCase()
			},

			matchTask(t, terms) {
				const hay = this.taskText(t)
				return terms.every((k) => hay.indexOf(k) >= 0)
			},

			onSearchConfirm() { uni.hideKeyboard() },

			clearKeyword() {
				this.keyword = ''
				uni.hideKeyboard()
			},

			money(v) { return fmtMoney(v) },

			async loadProfile() {
				try { await this.fetchProfile() } catch (e) { /* 未登录时静默，路由守卫会拦 */ }
			},

			async refreshLocation(force) {
				const hadLoc = !!this.myLoc
				const loc = await getLocation(force)
				this.myLoc = loc
				// 第一次拿到定位时默认按距离排；之后用户自己点了按时间/按价格就不要再抢回来
				if (loc && !hadLoc && this.sortBy === 'time' && this.tab === 'hall') this.sortBy = 'near'
			},

			/** 定位失败时引导去设置页打开，而不是只在控制台报错 */
			askLocation() {
				if (this.myLoc) {
					this.refreshLocation(true)
					return
				}
				getLocation(true).then((loc) => {
					if (loc) {
						this.myLoc = loc
						this.sortBy = 'near'
						uni.showToast({ title: '定位成功', icon: 'none' })
						return
					}
					uni.showModal({
						title: '需要定位权限',
						content: '开启定位后可以显示每一单到你当前位置的距离，方便挑顺路的单。',
						confirmText: '去开启',
						confirmColor: '#007AFF',
						success: (r) => {
							if (!r.confirm) return
							uni.openSetting({
								success: () => getLocation(true).then((l) => {
									if (l) {
										this.myLoc = l
										this.sortBy = 'near'
									}
								})
							})
						}
					})
				})
			},

			async load() {
				this.loading = true
				try {
					if (this.tab === 'hall') await this.fetchHall({ type: this.type || undefined, pageSize: 30 })
					else await this.fetchJobs({ status: this.jobFilter || undefined })
				} catch (e) {
					uni.showToast({ title: errText(e, '加载失败'), icon: 'none' })
				} finally {
					this.loading = false
				}
			},

			refresh() {
				this.load()
			},

			changeType(t) {
				if (this.type === t) return
				this.type = t
				this.load()
			},

			switchTab(t) {
				if (this.tab === t) return
				this.tab = t
				this.load()
			},

			setSort(s) {
				// 没定位时「按距离」没有可排的东西，先要权限；拿到定位后 askLocation 里会自己切过来
				if (s === 'near' && !this.myLoc) {
					this.askLocation()
					return
				}
				this.sortBy = s
			},

			setJobFilter(f) {
				this.jobFilter = f
				this.load()
			},

			goCenter() { uni.navigateTo({ url: '/pages/rider/center' }) },
			goApply() { uni.navigateTo({ url: '/pages/rider/apply' }) },
			goDetail(id) { uni.navigateTo({ url: '/pages/rider/detail?id=' + id }) },

			grab(item) {
				if (this.busyId) return
				if (this.riderStatus !== 2) { this.goApply(); return }
				const dist = item.distText ? `距取件点约 ${item.distText}，` : ''
				uni.showModal({
					title: '确认抢单',
					content: `${dist}抢单后请尽快取件并按时送达。`,
					confirmText: '抢单',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.grabTask(item._id)
							uni.showToast({ title: '抢单成功', icon: 'success' })
							// 抢完直接切到「我的任务」，少一次点击
							this.tab = 'jobs'
							this.jobFilter = 2
							await this.load()
						} catch (e) {
							uni.showToast({ title: errText(e, '抢单失败'), icon: 'none' })
							this.load()
						}
					}
				})
			},

			async picked(item) {
				if (this.busyId) return
				const shot = await askProofImage({ role: 'rider' })
				if (shot === null) return
				const proof = shot ? shot.fileID : ''
				const thumb = shot ? shot.thumb : ''
				try {
					await this.markPicked({ taskId: item._id, proof, thumb })
					uni.showToast({ title: '已取件，请尽快送达', icon: 'none' })
					await this.load()
				} catch (e) {
					uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
					this.load()
				}
			},

			delivered(item) {
				if (this.busyId) return
				uni.showModal({
					title: '确认送达',
					content: '确认已经把这单交到用户手上？确认后订单完成，扣除平台服务费后的收入会立刻进入你的钱包。',
					confirmText: '已送达',
					confirmColor: '#34C759',
					success: async (r) => {
						if (!r.confirm) return
						const shot = await askProofImage({ role: 'rider' })
						if (shot === null) return
						const proof = shot ? shot.fileID : ''
						const thumb = shot ? shot.thumb : ''
						try {
							const res = await this.markDelivered({ taskId: item._id, proof, thumb })
							const d = (res && res.data) || {}
							if (d.settled) {
								uni.showModal({
									title: '订单已完成',
									content: `收入 ¥${fmtMoney(d.income)} 已到账，可在「我的收入」里提现。`,
									showCancel: false,
									confirmText: '知道了',
									confirmColor: '#007AFF'
								})
							} else if (d.awaiting_payment) {
								uni.showModal({
									title: '已送达，待用户结清',
									content: (res && res.msg) || '用户还没补差价，付完后会自动结算。',
									showCancel: false,
									confirmText: '知道了',
									confirmColor: '#007AFF'
								})
							} else {
								uni.showToast({ title: (res && res.msg) || '已送达', icon: 'none' })
							}
							await this.load()
							this.loadProfile()
						} catch (e) {
							uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
							this.load()
						}
					}
				})
			},

			abandon(item) {
				if (this.busyId) return
				uni.showModal({
					title: '放弃任务',
					content: '放弃后订单会回到大厅给其他骑手，一天内放弃超过 5 单会被临时限制接单。',
					confirmText: '放弃',
					confirmColor: '#FF3B30',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.abandonTask({ taskId: item._id, reason: '骑手放弃' })
							uni.showToast({ title: '已放弃', icon: 'none' })
							await this.load()
							this.loadProfile()
						} catch (e) {
							uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
							this.load()
						}
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.page {
		min-height: 100vh;
		background: #f2f3f5;
		padding-bottom: 40rpx;
	}

	/* ---------- 头部 ---------- */
	.head {
		background: linear-gradient(150deg, #1677ff 0%, #3f9bff 62%, #6cb6ff 100%);
		padding: 26rpx 32rpx 104rpx;
		color: #fff;
	}

	.head-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.head-id { display: flex; align-items: center; }

	.badge {
		background: rgba(255, 255, 255, 0.22);
		border: 1rpx solid rgba(255, 255, 255, 0.35);
		color: #fff;
		font-size: 21rpx;
		font-weight: 600;
		padding: 5rpx 14rpx;
		border-radius: 8rpx;
		margin-right: 14rpx;
	}

	.head-status { font-size: 27rpx; font-weight: 500; }

	.head-link {
		display: flex;
		align-items: center;
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.9);
	}

	.head-arrow { margin-left: 4rpx; font-size: 28rpx; }

	.stats {
		display: flex;
		align-items: center;
		margin-top: 36rpx;
	}

	.stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-num {
		font-size: 44rpx;
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: 1rpx;
	}

	.stat-label {
		margin-top: 8rpx;
		font-size: 21rpx;
		color: rgba(255, 255, 255, 0.78);
	}

	.stat-line {
		width: 1rpx;
		height: 48rpx;
		background: rgba(255, 255, 255, 0.25);
	}

	/* ---------- tab ---------- */
	.tabs {
		display: flex;
		gap: 8rpx;
		background: #fff;
		margin: -64rpx 24rpx 0;
		padding: 8rpx;
		border-radius: 20rpx;
		box-shadow: 0 8rpx 24rpx rgba(22, 119, 255, 0.10);
		position: relative;
		z-index: 2;
	}

	.tab {
		flex: 1;
		height: 76rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 14rpx;
		font-size: 28rpx;
		color: #5c6370;
		transition: background 0.15s;

		&.active {
			background: #1677ff;
			color: #fff;
			font-weight: 600;
		}
	}

	.tab-num {
		margin-left: 8rpx;
		min-width: 30rpx;
		height: 30rpx;
		line-height: 30rpx;
		text-align: center;
		font-size: 19rpx;
		border-radius: 15rpx;
		padding: 0 8rpx;
		background: #eef3ff;
		color: #1677ff;
	}

	.tab.active .tab-num {
		background: rgba(255, 255, 255, 0.26);
		color: #fff;
	}

	/* ---------- 提示 ---------- */
	.notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #fff8e8;
		border: 1rpx solid #ffe3b0;
		color: #9a6200;
		padding: 20rpx 24rpx;
		border-radius: 14rpx;
		margin: 20rpx 24rpx 0;
		font-size: 24rpx;
	}

	.notice-arrow { font-size: 28rpx; }

	/* ---------- 筛选 ---------- */
	.body { padding-top: 20rpx; }

	/* ---------- 搜索 ---------- */
	.search { padding: 0 24rpx; }

	.search-box {
		display: flex;
		align-items: center;
		height: 76rpx;
		background: #fff;
		border-radius: 38rpx;
		padding: 0 22rpx 0 26rpx;
	}

	.search-icon {
		font-size: 32rpx;
		line-height: 1;
		color: #8b93a1;
		margin-right: 12rpx;
		flex-shrink: 0;
	}

	/* 输入框默认带 1.8em 左右的左右内边距，压掉才不会和图标/清除键错位 */
	.search-input {
		flex: 1;
		min-width: 0;
		height: 76rpx;
		padding: 0;
		font-size: 27rpx;
		color: #1c1f24;
	}

	.search-ph {
		font-size: 27rpx;
		color: #b0b6c0;
	}

	.search-clear {
		width: 40rpx;
		height: 40rpx;
		line-height: 36rpx;
		text-align: center;
		border-radius: 50%;
		background: #e8ebf0;
		color: #8b93a1;
		font-size: 28rpx;
		margin-left: 12rpx;
		flex-shrink: 0;
	}

	/* 类型筛选：和首页「按时间/按价格」同一种胶囊 */
	.filters {
		margin-top: 20rpx;
		white-space: nowrap;
		padding: 0 24rpx;
		box-sizing: border-box;
		width: 100%;
	}

	.filter {
		display: inline-block;
		margin-right: 12rpx;
		padding: 10rpx 22rpx;
		border-radius: 16rpx;
		font-size: 24rpx;
		color: #1677ff;
		background: rgba(22, 119, 255, 0.10);

		&.active {
			background: #1677ff;
			color: #fff;
			font-weight: 600;
		}
	}

	/* ---------- 段落头（对齐首页「任务市场」） ---------- */
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 26rpx 24rpx 0;
	}

	.section-left {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
	}

	.section-title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1c1f24;
		max-width: 280rpx;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.section-count {
		flex-shrink: 0;
		margin-left: 12rpx;
		font-size: 22rpx;
		color: #8b93a1;
	}

	.sort-tabs { display: flex; gap: 12rpx; flex-shrink: 0; }

	.sort-tab {
		padding: 10rpx 20rpx;
		border-radius: 16rpx;
		font-size: 24rpx;
		color: #1677ff;
		background: rgba(22, 119, 255, 0.10);

		&.active {
			background: #1677ff;
			color: #fff;
			font-weight: 600;
		}
	}

	.job-tabs {
		display: flex;
		gap: 12rpx;
		padding: 0 24rpx;
	}

	.job-tab {
		flex: 1;
		text-align: center;
		padding: 14rpx 0;
		border-radius: 12rpx;
		font-size: 26rpx;
		color: #5c6370;
		background: #fff;

		&.active { background: #1677ff; color: #fff; font-weight: 600; }
	}

	/* ---------- 列表 ---------- */
	.list { padding: 18rpx 24rpx 0; }

	/* ---------- 大厅任务卡（对齐首页任务市场卡片） ---------- */
	.task-card {
		background: #fff;
		border-radius: 24rpx;
		margin-bottom: 16rpx;
		padding: 24rpx;
	}

	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 14rpx;
	}

	.type-tag {
		padding: 8rpx 20rpx;
		border-radius: 16rpx;
		font-size: 24rpx;
		font-weight: 500;

		&.type-1 { background: rgba(22, 119, 255, 0.10); color: #1677ff; }
		&.type-2 { background: rgba(255, 149, 0, 0.10); color: #ff9500; }
		&.type-3 { background: rgba(52, 199, 89, 0.10); color: #34c759; }
	}

	.price-box {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.price-sym { font-size: 24rpx; font-weight: 500; color: #ff9500; }

	.price-val {
		font-size: 36rpx;
		font-weight: 700;
		color: #ff9500;
		line-height: 1;
	}

	.income-tip {
		margin-top: 6rpx;
		font-size: 20rpx;
		color: #12a150;
	}

	.card-body { margin-bottom: 14rpx; }

	.task-title {
		display: block;
		font-size: 32rpx;
		font-weight: 600;
		color: #1c1c1e;
		line-height: 1.4;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.task-desc {
		margin-top: 10rpx;
		font-size: 26rpx;
		color: #8e8e93;
		line-height: 1.5;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.task-tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 14rpx; }

	.time-tag {
		padding: 6rpx 16rpx;
		background: #f2f2f7;
		border-radius: 12rpx;
		font-size: 22rpx;
		color: #8e8e93;
	}

	.route-info {
		display: flex;
		align-items: center;
		margin-top: 14rpx;
		padding: 14rpx 16rpx;
		background: #f2f2f7;
		border-radius: 16rpx;
	}

	.route-point { display: flex; align-items: center; flex: 1; min-width: 0; }

	.point-icon {
		width: 36rpx;
		height: 36rpx;
		line-height: 36rpx;
		text-align: center;
		border-radius: 18rpx;
		font-size: 20rpx;
		color: #fff;
		margin-right: 10rpx;
		flex-shrink: 0;

		&.start { background: #34c759; }
		&.end { background: #ff9500; }
	}

	.point-text {
		font-size: 24rpx;
		color: #1c1c1e;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		max-width: 190rpx;
	}

	.route-arrow {
		flex-shrink: 0;
		width: 30rpx;
		height: 4rpx;
		margin: 0 12rpx;
		background: #e5e5ea;
		position: relative;

		&::after {
			content: '';
			position: absolute;
			right: -8rpx;
			top: -6rpx;
			width: 0;
			height: 0;
			border-left: 10rpx solid #e5e5ea;
			border-top: 7rpx solid transparent;
			border-bottom: 7rpx solid transparent;
		}
	}

	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 14rpx;
		padding-top: 14rpx;
		border-top: 1rpx solid #f0f1f3;
	}

	.foot-meta { display: flex; align-items: center; min-width: 0; }

	.dist-chip {
		margin-right: 6rpx;
		font-size: 24rpx;
		font-weight: 700;
		color: #12a150;
	}

	.walk-tip { font-size: 22rpx; color: #9aa1ad; }

	.order { padding: 26rpx 26rpx 22rpx; }

	.order-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.order-meta { display: flex; align-items: baseline; }

	.order-title {
		display: block;
		margin-top: 14rpx;
		font-size: 31rpx;
		font-weight: 600;
		color: #1c1f24;
		line-height: 1.45;
	}

	.order-desc {
		display: block;
		margin-top: 4rpx;
		font-size: 24rpx;
		color: #8b93a1;
		line-height: 1.5;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
	}

	.route {
		margin-top: 18rpx;
		padding: 16rpx 18rpx;
		background: #f7f8fa;
		border-radius: 12rpx;
	}

	.route-line {
		display: flex;
		align-items: center;

		& + .route-line { margin-top: 12rpx; }
	}

	.dot {
		width: 30rpx;
		height: 30rpx;
		line-height: 30rpx;
		text-align: center;
		border-radius: 8rpx;
		font-size: 18rpx;
		color: #fff;
		margin-right: 14rpx;
		flex-shrink: 0;
	}

	.dot.start { background: #12a150; }
	.dot.end { background: #ff5a4e; }

	.route-text {
		flex: 1;
		font-size: 26rpx;
		color: #3a4049;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.order-foot {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-top: 20rpx;
	}

	.price-block { flex: 1; min-width: 0; }
	.price-line { display: flex; align-items: baseline; }

	.unit {
		font-size: 24rpx;
		font-weight: 600;
		color: #ff6a1a;
	}

	.price {
		margin-left: 2rpx;
		font-size: 40rpx;
		font-weight: 700;
		color: #ff6a1a;
		line-height: 1;
	}

	.income {
		margin-left: 12rpx;
		font-size: 20rpx;
		color: #12a150;
		background: rgba(18, 161, 80, 0.08);
		padding: 4rpx 10rpx;
		border-radius: 6rpx;
	}

	.time-line {
		display: block;
		margin-top: 8rpx;
		font-size: 21rpx;
		color: #9aa1ad;
	}

	.grab-btn {
		height: 64rpx;
		padding: 0 36rpx;
		border-radius: 16rpx;
		font-size: 26rpx;
		font-weight: 500;
		flex-shrink: 0;
	}

	.actions { display: flex; gap: 12rpx; flex-shrink: 0; }

	/* ---------- 进度 ---------- */
	.steps {
		display: flex;
		align-items: center;
		margin-top: 18rpx;
		padding: 16rpx 6rpx 0;
		border-top: 1rpx solid #f0f1f3;
	}

	.step {
		display: flex;
		align-items: center;
		color: #c3c8d1;

		&.on { color: #1677ff; }
	}

	.step-dot {
		width: 30rpx;
		height: 30rpx;
		line-height: 30rpx;
		text-align: center;
		border-radius: 50%;
		font-size: 18rpx;
		background: #eceef2;
		color: #fff;
		margin-right: 8rpx;
	}

	.step.on .step-dot { background: #1677ff; }
	.step-txt { font-size: 20rpx; }

	.step-line {
		flex: 1;
		height: 2rpx;
		background: #eceef2;
		margin: 0 10rpx;

		&.on { background: #1677ff; }
	}

	/* ---------- 空态 ---------- */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 100rpx 0 80rpx;
	}

	.empty-badge {
		width: 120rpx;
		height: 120rpx;
		line-height: 120rpx;
		text-align: center;
		font-size: 56rpx;
		border-radius: 50%;
		background: #fff;
		margin-bottom: 22rpx;
	}

	.empty-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #3a4049;
	}

	.empty-tip {
		margin-top: 8rpx;
		font-size: 23rpx;
		color: #9aa1ad;
	}

	.empty-btn {
		margin-top: 28rpx;
		padding: 14rpx 44rpx;
		border-radius: 30rpx;
		border: 1rpx solid #1677ff;
		color: #1677ff;
		font-size: 25rpx;
		background: #fff;
	}

	/* 大厅空态：和首页「暂时还没有待接的任务」那张白卡一致 */
	.empty-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		background: #fff;
		border-radius: 24rpx;
		padding: 56rpx 32rpx;
	}

	.ec-icon {
		font-size: 72rpx;
		line-height: 1;
		margin-bottom: 16rpx;
	}

	.ec-title {
		font-size: 30rpx;
		font-weight: 600;
		color: #1c1c1e;
		text-align: center;
	}

	.ec-sub {
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #8e8e93;
		text-align: center;
	}

	.ec-btn {
		margin-top: 28rpx;
		padding: 16rpx 56rpx;
		border-radius: 40rpx;
		background: #1677ff;
		color: #fff;
		font-size: 28rpx;
		font-weight: 600;
	}
</style>
