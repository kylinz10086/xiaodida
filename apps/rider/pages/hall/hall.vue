<template>
	<view class="page">
		<!-- 顶部收益概览 -->
		<view class="hero">
			<view class="hero-row">
				<view class="hero-item">
					<text class="hero-num">{{todayCount}}</text>
					<text class="hero-label">今日可接</text>
				</view>
				<view class="hero-item">
					<text class="hero-num">¥{{wallet.income || 0}}</text>
					<text class="hero-label">累计收入</text>
				</view>
				<view class="hero-item">
					<text class="hero-num">{{riderStatusText}}</text>
					<text class="hero-label">骑手状态</text>
				</view>
			</view>
		</view>

		<!-- 未通过审核的提示 -->
		<view class="notice" v-if="riderStatus !== 2" @click="goApply">
			<text class="notice-text">{{ riderStatus === 1 ? '骑手申请审核中，通过后即可抢单' : '你还不是骑手，点这里申请' }}</text>
			<text class="notice-arrow">›</text>
		</view>

		<!-- 类型筛选 -->
		<view class="filters">
			<view class="filter" :class="{ active: type === 0 }" @click="changeType(0)">全部</view>
			<view class="filter" :class="{ active: type === 1 }" @click="changeType(1)">快递代取</view>
			<view class="filter" :class="{ active: type === 2 }" @click="changeType(2)">代带餐食</view>
			<view class="filter" :class="{ active: type === 3 }" @click="changeType(3)">其他</view>
		</view>

		<!-- 任务列表 -->
		<view class="list">
			<view class="card order" v-for="item in list" :key="item._id" @click="goDetail(item._id)">
				<view class="between">
					<text class="tag" :class="'tag-' + item.type">{{ item.typeText }}</text>
					<view class="right">
						<text class="price">¥{{ item.money }}</text>
						<text class="muted small">可赚 ¥{{ item.income || calcIncome(item.money) }}</text>
					</view>
				</view>

				<view class="title">{{ item.title }}</view>
				<view class="desc" v-if="item.description">{{ item.description }}</view>

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

				<view class="between foot">
					<text class="muted small">{{ item.timeOption || '尽快送达' }}</text>
					<view class="btn btn-primary btn-sm" @click.stop="grab(item._id)">抢单</view>
				</view>
			</view>

			<view class="empty" v-if="!loading && list.length === 0">
				<text>暂时没有可接的任务</text>
				<text class="small block">下拉刷新试试</text>
			</view>
			<view class="empty" v-if="loading"><text>加载中...</text></view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() {
			return {
				type: 0,
				loading: false
			}
		},
		computed: {
			...mapGetters(['hallList', 'wallet', 'riderStatus', 'commissionRate']),
			list() {
				return this.hallList
			},
			todayCount() {
				return this.hallList.length
			},
			riderStatusText() {
				return { 0: '未申请', 1: '审核中', 2: '已认证', 3: '已拒绝' }[this.riderStatus] || '未知'
			}
		},
		onShow() {
			this.checkAgreement()
			this.load()
			this.loadProfile()
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions(['fetchHall', 'fetchProfile', 'fetchWallet', 'grabTask', 'acceptAgreement']),
			/** 合规：首次进入必须先同意骑手服务协议与隐私政策 */
			checkAgreement() {
				if (uni.getStorageSync('rider_agreed_version') === '1.0.0') return
				uni.showModal({
					title: '骑手服务协议',
					content: '接单前请先阅读并同意《骑手服务协议》和《隐私政策》。你的真实姓名与学号仅用于平台审核，不会展示给其他用户。',
					confirmText: '同意并继续',
					cancelText: '查看协议',
					confirmColor: '#007AFF',
					success: (res) => {
						if (res.confirm) {
							uni.setStorageSync('rider_agreed_version', '1.0.0')
							this.acceptAgreement().catch(() => {})
						} else {
							uni.navigateTo({ url: '/pages/agreement/user-agreement' })
						}
					}
				})
			},
			calcIncome(money) {
				return (Number(money || 0) * (1 - this.commissionRate)).toFixed(2)
			},
			loadProfile() {
				this.fetchProfile().catch(() => {})
				this.fetchWallet().catch(() => {})
			},
			async load() {
				this.loading = true
				try {
					await this.fetchHall({ type: this.type || undefined, pageSize: 30 })
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			changeType(t) {
				this.type = t
				this.load()
			},
			goDetail(id) {
				uni.navigateTo({ url: '/pages/detail/detail?id=' + id })
			},
			goApply() {
				uni.navigateTo({ url: '/pages/apply/apply' })
			},
			async grab(id) {
				if (this.riderStatus !== 2) {
					this.goApply()
					return
				}
				uni.showModal({
					title: '确认抢单',
					content: '抢单后请尽快取件并按时送达，超时会影响信用。',
					confirmText: '抢单',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.grabTask(id)
							uni.showToast({ title: '抢单成功', icon: 'success' })
							this.load()
							setTimeout(() => uni.switchTab({ url: '/pages/jobs/jobs' }), 700)
						} catch (e) {
							uni.showToast({ title: e.message || '抢单失败', icon: 'none' })
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
		padding-bottom: 40rpx;
	}

	.hero {
		background: linear-gradient(160deg, #007aff 0%, #3aa0ff 100%);
		padding: 32rpx 24rpx 56rpx;
	}

	.hero-row {
		display: flex;
	}

	.hero-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		color: #fff;
	}

	.hero-num {
		font-size: 40rpx;
		font-weight: 700;
	}

	.hero-label {
		margin-top: 8rpx;
		font-size: 22rpx;
		opacity: 0.85;
	}

	.notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #fff7e6;
		border: 1rpx solid #ffe0a3;
		color: #ad6800;
		padding: 20rpx 24rpx;
		border-radius: 16rpx;
		margin: -24rpx 24rpx 0;
		font-size: 26rpx;
	}

	.notice-arrow {
		color: #ad6800;
	}

	.filters {
		display: flex;
		gap: 14rpx;
		padding: 24rpx 24rpx 0;
		overflow-x: auto;
	}

	.filter {
		flex-shrink: 0;
		padding: 12rpx 24rpx;
		border-radius: 16rpx;
		font-size: 26rpx;
		color: #007aff;
		background: rgba(0, 122, 255, 0.1);

		&.active {
			background: #007aff;
			color: #fff;
		}
	}

	.list {
		padding: 24rpx;
	}

	.right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.title {
		margin-top: 16rpx;
		font-size: 32rpx;
		font-weight: 600;
	}

	.desc {
		margin-top: 8rpx;
		font-size: 26rpx;
		color: #6e6e73;
	}

	.route {
		margin-top: 18rpx;
		background: #f7f8fa;
		border-radius: 16rpx;
		padding: 14rpx 18rpx;
	}

	.route-line {
		display: flex;
		align-items: center;
		padding: 6rpx 0;
	}

	.dot {
		width: 34rpx;
		height: 34rpx;
		border-radius: 50%;
		color: #fff;
		font-size: 20rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 14rpx;

		&.start {
			background: #34c759;
		}

		&.end {
			background: #ff3b30;
		}
	}

	.route-text {
		font-size: 26rpx;
		color: #3a3a3c;
	}

	.foot {
		margin-top: 20rpx;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10rpx;
	}
</style>
