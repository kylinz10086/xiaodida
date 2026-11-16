<template>
	<view class="page">
		<!-- 顶部品牌区 -->
		<view class="hero">
			<view class="hero-top">
				<view>
					<text class="hero-title">校递达</text>
					<text class="hero-sub">校园快递 · 代取带餐 · 同校互助</text>
				</view>
				<!-- 已登录时只做登录态提示，不再和底部「我的」页签重复；未登录才引导登录 -->
				<view class="hero-badge" :class="{ 'is-on': loggedIn }" @click="loggedIn ? goMine() : openLogin()">
					<text class="badge-dot"></text>
					<text>{{ loggedIn ? '已登录' : '微信登录' }}</text>
				</view>
			</view>
			<view class="hero-school">
				<text class="dot"></text>
				<text>{{ school }}</text>
			</view>
		</view>

		<!-- 未登录时由右上角「微信登录」进入；不再插一条会被卡片遮挡的横条 -->
		<!-- 快捷发布 -->
		<view class="quick-row">
			<view class="quick-card" @tap="clickReleaseRequirments(1)">
				<view class="quick-icon express">取</view>
				<view class="quick-main">代取快递</view>
				<view class="quick-sub">驿站 / 快递柜 → 宿舍</view>
			</view>
			<view class="quick-card" @tap="clickReleaseRequirments(2)">
				<view class="quick-icon meal">带</view>
				<view class="quick-main">代带餐食</view>
				<view class="quick-sub">食堂 → 教室 / 自习</view>
			</view>
		</view>

		<!-- 搜索 -->
		<view class="search-wrap" @click="goToSearch">
			<view class="search-box">
				<text class="search-icon">⌕</text>
				<text class="search-placeholder">搜索任务、地点</text>
			</view>
		</view>

		<!-- 任务市场 -->
		<view class="section-head">
			<text class="section-title">任务市场</text>
			<view class="sort-tabs">
				<view class="sort-tab" :class="{ active: sortType === 'time' }" @click="changeSortType('time')">
					<text>按时间</text>
				</view>
				<view class="sort-tab" :class="{ active: sortType === 'price' }" @click="changeSortType('price')">
					<text>按价格</text>
				</view>
			</view>
		</view>

		<view class="list">
			<view v-if="loading" class="empty-tip"><text>加载中...</text></view>

			<block v-else-if="orderList.length">
				<mission-list-item
					:listData="orderList"
					:grab-mode="grabMode"
					:busy-id="grabBusy"
					:self-id="myId"
					@grab="onGrab">
				</mission-list-item>
			</block>

			<view v-else class="empty-card">
				<view class="empty-icon">📦</view>
				<text class="empty-title">暂时还没有待接的任务</text>
				<text class="empty-sub">发一个试试，同校同学会来帮你</text>
				<view class="empty-btn" @tap="clickReleaseRequirments(1)">发布需求</view>
			</view>
		</view>

		<!-- 骑手入口 -->
		<view class="rider-entry" @click="goRider">
			<view class="rider-left">
				<text class="rider-icon">🛵</text>
				<view>
					<text class="rider-title">我是骑手</text>
					<text class="rider-sub">接单赚零花钱</text>
				</view>
			</view>
			<text class="rider-arrow">›</text>
		</view>

		<wechat-login-modal
			:visible="showLoginModal"
			@close="showLoginModal = false"
			@skip="showLoginModal = false"
			@success="onLoginSuccess">
		</wechat-login-modal>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import MissionListItem from '../components/mission-list-item.vue'
	import WechatLoginModal from '@/components/wechat-login-modal/wechat-login-modal.vue'
	import { isLoggedIn } from '@/common/auth.js'
	import { AGREEMENT_VERSION } from '@/common/agreement.js'
	import { fmtMoney, errText } from '@/common/rider-util.js'

	export default {
		components: { MissionListItem, WechatLoginModal },
		computed: {
			...mapGetters(['getTaskList', 'school', 'getUserInfo', 'commissionRate']),

			/** 当前登录用户 id：用来把「自己发的单」排除掉接单按钮 */
			myId() {
				return (this.getUserInfo && this.getUserInfo._id) || ''
			},

			/** 骑手审核通过（2）才能接单；0/1/3 都只给「查看」 */
			isRider() {
				const p = this.getUserInfo || {}
				return Number(p.rider_status) === 2
			},

			/** 已登录 + 骑手已通过 → 大厅卡片上出现「接单」 */
			grabMode() {
				return this.loggedIn && this.isRider
			},

			orderList() {
				let list = (this.getTaskList || []).map((task) => ({
					id: task._id || task.id,
					thing: task.title || task.thing,
					title: task.title,
					description: task.description,
					money: task.amount !== undefined ? task.amount : task.money,
					time: task.timeText || '',
					type: task.type,
					typeText: task.typeText,
					origin: task.origin,
					destination: task.destination,
					itemSize: task.itemSize,
					timeOption: task.timeOption,
					status: task.status,
					publisherId: task.publisher_id || '',
					createTime: task.create_time
				}))

				if (this.sortType === 'time') {
					list.sort((a, b) => (this.sortOrder === 'desc'
						? (b.createTime || 0) - (a.createTime || 0)
						: (a.createTime || 0) - (b.createTime || 0)))
				} else if (this.sortType === 'price') {
					list.sort((a, b) => (this.sortOrder === 'desc' ? b.money - a.money : a.money - b.money))
				}
				return list
			}
		},
		onShow() {
			// 注意：这里不能用 computed + uni.getStorageSync（不响应式，登录后不刷新）
			this.loggedIn = isLoggedIn()
			this.checkAgreement()
			this.loadTaskList()
			// 刷新资料：决定大厅里要不要显示「接单」（以服务端 rider_status 为准）
			if (this.loggedIn) this.fetchProfile().catch(() => {})
		},
		onPullDownRefresh() {
			this.loadTaskList().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions(['fetchTaskList', 'acceptAgreement', 'fetchProfile']),
			...mapActions('rider', ['grabTask']),

			/** 骑手实得（扣平台服务费），给确认框显示预期收入 */
			incomeOf(item) {
				const money = Number(item && item.money) || 0
				return fmtMoney(money * (1 - (this.commissionRate || 0.08)))
			},

			/** 大厅接单：先二次确认，再走和骑手工作台同一条 grabTask 链路 */
			onGrab(item) {
				if (this.grabBusy) return
				if (!this.loggedIn) {
					this.showLoginModal = true
					return
				}
				uni.showModal({
					title: '确认接单',
					content: `预计收入 ¥${this.incomeOf(item)}，接单后请尽快取件并按时送达。`,
					confirmText: '接单',
					confirmColor: '#34C759',
					success: (res) => {
						if (res.confirm) this.doGrab(item)
					}
				})
			},

			async doGrab(item) {
				this.grabBusy = item.id
				try {
					await this.grabTask(item.id)
					uni.showToast({ title: '接单成功', icon: 'success' })
					await this.loadTaskList()
					// 直接带去骑手详情页，下一步就是取件/送达
					setTimeout(() => {
						uni.navigateTo({ url: '/pages/rider/detail?id=' + item.id })
					}, 500)
				} catch (e) {
					// 最常见的是 409「手慢了」和 429 限流，服务端文案已经很直白
					uni.showToast({ title: errText(e, '接单失败'), icon: 'none' })
					this.loadTaskList()
				} finally {
					this.grabBusy = ''
				}
			},

			checkAgreement() {
				if (uni.getStorageSync('agreed_version') === AGREEMENT_VERSION) return
				uni.showModal({
					title: '先看两份协议',
					content: '下单前需要你同意《用户服务协议》和《隐私政策》。平台只用手机号、位置和订单信息完成跑腿服务，不会拿去做别的事。',
					confirmText: '同意并继续',
					cancelText: '查看协议',
					confirmColor: '#007AFF',
					success: (res) => {
						if (res.confirm) {
							uni.setStorageSync('agreed_version', AGREEMENT_VERSION)
							this.acceptAgreement().catch(() => {})
						} else {
							uni.navigateTo({ url: '/pages/xyyx/agreement/user-agreement' })
						}
					}
				})
			},

			async loadTaskList() {
				this.loading = true
				try {
					await this.fetchTaskList({ status: 1, page: 1, pageSize: 50 })
				} catch (e) {
					// 未登录时大厅也能看，失败就安静地显示空态
				} finally {
					this.loading = false
				}
			},

			clickReleaseRequirments(num) {
				if (!this.loggedIn) {
					this.showLoginModal = true
					this.pendingAction = { type: 'release', num }
					return
				}
				uni.navigateTo({
					url: '/pages/xyyx/release-requirements/release-requirements?item=' + num + '&type=release'
				})
			},

			onLoginSuccess() {
				this.showLoginModal = false
				this.loggedIn = true
				this.loadTaskList()
				if (this.pendingAction && this.pendingAction.type === 'release') {
					const num = this.pendingAction.num
					this.pendingAction = null
					setTimeout(() => {
						uni.navigateTo({
							url: '/pages/xyyx/release-requirements/release-requirements?item=' + num + '&type=release'
						})
					}, 300)
				}
			},

			openLogin() {
				// 用小程序内的品牌登录弹窗，别跳 uni-id 的默认登录页
				// （那个页面是灰底 + 一句「请选择登录方式」，和 App 风格完全两样）
				this.showLoginModal = true
			},

			goToSearch() {
				uni.navigateTo({ url: '/pages/xyyx/search/search' })
			},
			goMine() {
				uni.switchTab({ url: '/pages/xyyx/userinfo/userinfo' })
			},
			goRider() {
				uni.navigateTo({ url: '/pages/rider/center' })
			},
			changeSortType(type) {
				if (this.sortType === type) {
					this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc'
				} else {
					this.sortType = type
					this.sortOrder = 'desc'
				}
			}
		},
		data() {
			return {
				loggedIn: false,
				showLoginModal: false,
				pendingAction: null,
				sortType: 'time',
				sortOrder: 'desc',
				loading: false,
				/** 正在接单的任务 id（按钮显示「接单中…」，同时防连点） */
				grabBusy: ''
			}
		}
	}
</script>

<style lang="scss">
	.page {
		background-color: #F2F2F7;
		min-height: 100vh;
		padding-bottom: 160rpx;
	}

	/* 顶部品牌 */
	.hero {
		background: linear-gradient(160deg, #007AFF 0%, #3AA0FF 100%);
		padding: 44rpx 36rpx 64rpx;
		color: #fff;
	}

	.hero-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.hero-title {
		display: block;
		font-size: 48rpx;
		font-weight: 800;
		letter-spacing: 2rpx;
	}

	.hero-sub {
		display: block;
		margin-top: 10rpx;
		font-size: 26rpx;
		opacity: 0.9;
	}

	.hero-badge {
		display: flex;
		align-items: center;
		padding: 8rpx 18rpx;
		border-radius: 30rpx;
		background: rgba(255, 255, 255, 0.2);
		font-size: 22rpx;
	}

	.badge-dot {
		width: 10rpx;
		height: 10rpx;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.7);
		margin-right: 10rpx;
	}

	/* 已登录：绿点 + 实底，和「微信登录」区分开 */
	.hero-badge.is-on {
		background: rgba(255, 255, 255, 0.28);
	}

	.hero-badge.is-on .badge-dot {
		background: #7DFFB0;
	}

	.hero-school {
		display: inline-flex;
		align-items: center;
		margin-top: 24rpx;
		padding: 8rpx 20rpx;
		border-radius: 30rpx;
		background: rgba(255, 255, 255, 0.18);
		font-size: 24rpx;
	}

	.dot {
		width: 10rpx;
		height: 10rpx;
		border-radius: 50%;
		background: #FFD60A;
		margin-right: 10rpx;
	}

	/* 快捷发布 */
	.quick-row {
		display: flex;
		gap: 20rpx;
		padding: 0 24rpx;
		margin-top: 24rpx;
	}

	.quick-card {
		flex: 1;
		background: #fff;
		border-radius: 24rpx;
		padding: 26rpx 24rpx;
		box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.08);

		&:active {
			transform: scale(0.97);
		}
	}

	.quick-icon {
		width: 64rpx;
		height: 64rpx;
		border-radius: 18rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 30rpx;
		font-weight: 700;
		color: #fff;
		margin-bottom: 14rpx;

		&.express { background: #007AFF; }
		&.meal { background: #FF9500; }
	}

	.quick-main {
		font-size: 30rpx;
		font-weight: 700;
		color: #1C1C1E;
	}

	.quick-sub {
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #8E8E93;
	}

	/* 搜索 */
	.search-wrap {
		padding: 24rpx 24rpx 0;
	}

	.search-box {
		display: flex;
		align-items: center;
		height: 76rpx;
		background: #fff;
		border-radius: 38rpx;
		padding: 0 26rpx;
	}

	.search-icon {
		font-size: 32rpx;
		color: #8E8E93;
		margin-right: 12rpx;
	}

	.search-placeholder {
		font-size: 28rpx;
		color: #B0B0B5;
	}

	/* 任务市场 */
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 32rpx 32rpx 16rpx;
	}

	.section-title {
		font-size: 34rpx;
		font-weight: 700;
		color: #1C1C1E;
	}

	.sort-tabs {
		display: flex;
		gap: 12rpx;
	}

	.sort-tab {
		padding: 10rpx 22rpx;
		border-radius: 16rpx;
		font-size: 24rpx;
		color: #007AFF;
		background: rgba(0, 122, 255, 0.1);

		&.active {
			background: #007AFF;
			color: #fff;
		}
	}

	.list {
		padding: 0 24rpx;
	}

	.empty-tip {
		text-align: center;
		padding: 100rpx 0;
		color: #8E8E93;
		font-size: 28rpx;
	}

	.empty-card {
		background: #fff;
		border-radius: 24rpx;
		padding: 56rpx 32rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.empty-icon {
		font-size: 72rpx;
		margin-bottom: 16rpx;
	}

	.empty-title {
		font-size: 30rpx;
		font-weight: 600;
		color: #1C1C1E;
	}

	.empty-sub {
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #8E8E93;
	}

	.empty-btn {
		margin-top: 28rpx;
		padding: 16rpx 56rpx;
		border-radius: 40rpx;
		background: #007AFF;
		color: #fff;
		font-size: 28rpx;
		font-weight: 600;
	}

	/* 骑手入口 */
	.rider-entry {
		margin: 24rpx;
		background: #fff;
		border-radius: 24rpx;
		padding: 28rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.rider-left {
		display: flex;
		align-items: center;
	}

	.rider-icon {
		font-size: 44rpx;
		margin-right: 20rpx;
	}

	.rider-title {
		display: block;
		font-size: 30rpx;
		font-weight: 600;
		color: #1C1C1E;
	}

	.rider-sub {
		display: block;
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #8E8E93;
	}

	.rider-arrow {
		font-size: 36rpx;
		color: #C7C7CC;
	}
</style>