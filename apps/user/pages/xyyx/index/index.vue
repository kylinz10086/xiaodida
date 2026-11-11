<template>
	<view class="page">
		<!-- 顶部品牌区 -->
		<view class="hero">
			<view class="hero-top">
				<view>
					<text class="hero-title">校递达</text>
					<text class="hero-sub">校园快递 · 代取带餐 · 同校互助</text>
				</view>
				<view class="hero-badge" @click="goMine">
					<text class="badge-dot"></text>
					<text>{{ isLoggedIn ? '已登录' : '未登录' }}</text>
				</view>
			</view>
			<view class="hero-school">
				<text class="dot"></text>
				<text>{{ school }}</text>
			</view>
		</view>

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
				<mission-list-item :listData="orderList"></mission-list-item>
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

	export default {
		components: { MissionListItem, WechatLoginModal },
		computed: {
			...mapGetters(['getTaskList', 'school']),
			isLoggedIn() {
				return !!(uni.getStorageSync('uniIdToken') || uni.getStorageSync('token'))
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
			this.checkAgreement()
			this.loadTaskList()
		},
		onPullDownRefresh() {
			this.loadTaskList().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions(['fetchTaskList', 'acceptAgreement']),

			checkAgreement() {
				if (uni.getStorageSync('agreed_version') === '1.0.0') return
				uni.showModal({
					title: '用户协议与隐私政策',
					content: '为了向你提供校园跑腿服务，需要你同意《用户服务协议》和《隐私政策》。我们只收集手机号、位置、订单等必要信息。',
					confirmText: '同意并继续',
					cancelText: '查看协议',
					confirmColor: '#007AFF',
					success: (res) => {
						if (res.confirm) {
							uni.setStorageSync('agreed_version', '1.0.0')
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
				if (!this.isLoggedIn) {
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
				showLoginModal: false,
				pendingAction: null,
				sortType: 'time',
				sortOrder: 'desc',
				loading: false
			}
		}
	}
</script>

<style lang="scss">
	.page {
		background-color: #F2F2F7;
		min-height: 100vh;
		padding-bottom: 40rpx;
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
		background: #7DFFB0;
		margin-right: 10rpx;
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
		margin-top: -36rpx;
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
