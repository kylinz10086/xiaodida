<template>
	<view class="page">
		<view class="hero">
			<view class="hero-top">
				<text class="hero-title">骑手中心</text>
				<text class="hero-status">{{ statusText }}</text>
			</view>
			<view class="hero-stats">
				<view class="stat">
					<text class="num">{{ (profile.rider && profile.rider.done_count) || 0 }}</text>
					<text class="label">已完成</text>
				</view>
				<view class="stat">
					<text class="num">{{ (profile.rider && profile.rider.ongoing_count) || 0 }}</text>
					<text class="label">进行中</text>
				</view>
				<view class="stat">
					<text class="num">¥{{ (profile.wallet && profile.wallet.balance) || 0 }}</text>
					<text class="label">可提现</text>
				</view>
			</view>
		</view>

		<view class="card">
			<view class="row" @click="go('/pages/rider/workbench')">
				<text class="row-label">🛵 抢单大厅 / 我的任务</text>
				<text class="arrow">›</text>
			</view>
			<view class="row" @click="go('/pages/rider/wallet')">
				<text class="row-label">💰 我的收入</text>
				<text class="arrow">›</text>
			</view>
			<view class="row" v-if="riderStatus !== 2" @click="go('/pages/rider/apply')">
				<text class="row-label">📝 申请成为骑手</text>
				<text class="arrow">›</text>
			</view>
			<view class="row" @click="go('/pages/xyyx/agreement/user-agreement')">
				<text class="row-label">骑手服务协议</text>
				<text class="arrow">›</text>
			</view>
			<view class="row" @click="go('/pages/xyyx/agreement/privacy-policy')">
				<text class="row-label">隐私政策</text>
				<text class="arrow">›</text>
			</view>
		</view>

		<view class="tips">
			<text class="tips-title">怎么开始接单</text>
			<text class="tips-item">1. 先申请成为骑手（需审核）</text>
			<text class="tips-item">2. 审核通过后进「抢单大厅」抢单</text>
			<text class="tips-item">3. 取件 → 送达 → 等用户确认，钱进钱包</text>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		computed: {
			...mapGetters('rider', ['profile', 'riderStatus']),
			statusText() {
				return { 0: '未认证', 1: '审核中', 2: '已认证骑手', 3: '审核未通过' }[this.riderStatus] || '未认证'
			}
		},
		onShow() {
			this.fetchProfile().catch(() => {})
		},
		methods: {
			...mapActions('rider', ['fetchProfile']),
			go(url) { uni.navigateTo({ url }) }
		}
	}
</script>

<style lang="scss">
	.page { padding: 24rpx; }

	.hero {
		background: linear-gradient(160deg, #007aff 0%, #3aa0ff 100%);
		border-radius: 24rpx; padding: 32rpx; color: #fff; margin-bottom: 20rpx;
	}

	.hero-top { display: flex; align-items: center; justify-content: space-between; }
	.hero-title { font-size: 36rpx; font-weight: 700; }

	.hero-status {
		font-size: 22rpx; padding: 6rpx 18rpx; border-radius: 20rpx;
		background: rgba(255, 255, 255, 0.25);
	}

	.hero-stats { display: flex; margin-top: 28rpx; }
	.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
	.num { font-size: 38rpx; font-weight: 700; }
	.label { margin-top: 6rpx; font-size: 22rpx; opacity: 0.9; }

	.card { background: #fff; border-radius: 24rpx; padding: 0 28rpx; }

	.row {
		display: flex; align-items: center; justify-content: space-between;
		padding: 28rpx 0; border-bottom: 1rpx solid #f4f4f6; font-size: 28rpx;
		&:last-child { border-bottom: none; }
	}

	.row-label { color: #1c1c1e; }
	.arrow { color: #c7c7cc; }

	.tips { padding: 32rpx 12rpx; display: flex; flex-direction: column; gap: 10rpx; }
	.tips-title { font-size: 26rpx; font-weight: 700; color: #1c1c1e; }
	.tips-item { font-size: 24rpx; color: #8e8e93; }
</style>
