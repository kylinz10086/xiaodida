<template>
	<view class="legal-page">
		<view class="legal-group">
			<text class="legal-group-title">协议与政策</text>
			<view class="legal-card">
				<view class="legal-item" @click="open('/pages/xyyx/agreement/user-agreement')">
					<view class="legal-left">
						<text class="legal-name">用户服务协议</text>
						<text class="legal-desc">下单、付款、退款、售后</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
				<view class="legal-item" @click="open('/pages/xyyx/agreement/privacy-policy')">
					<view class="legal-left">
						<text class="legal-name">隐私政策</text>
						<text class="legal-desc">收集什么、怎么用、存多久</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
				<view class="legal-item" @click="open('/pages/xyyx/agreement/runner-agreement')">
					<view class="legal-left">
						<text class="legal-name">跑腿服务协议</text>
						<text class="legal-desc">骑手接单、结算与责任</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
				<view class="legal-item" @click="open('/pages/xyyx/agreement/guidelines')">
					<view class="legal-left">
						<text class="legal-name">骑手准则</text>
						<text class="legal-desc">取件、送达、禁运品、处罚</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
			</view>
		</view>

		<view class="legal-group">
			<text class="legal-group-title">规则公示</text>
			<view class="legal-card">
				<view class="legal-item" @click="open('/pages/xyyx/agreement/platform-rules')">
					<view class="legal-left">
						<text class="legal-name">平台规则摘要</text>
						<text class="legal-desc">服务范围、收费、处罚</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
				<view class="legal-item" @click="open('/pages/xyyx/agreement/algorithm')">
					<view class="legal-left">
						<text class="legal-name">算法公示</text>
						<text class="legal-desc">大厅排序与接单撮合</text>
					</view>
					<text class="legal-arrow">›</text>
				</view>
			</view>
		</view>

		<view class="legal-foot">
			<text class="legal-tip">以上条款适用于校递达小程序的全部服务，版本 {{ version }}。</text>
			<text class="legal-tip">对条款有疑问，可在「我的 - 意见反馈」里提问。</text>
		</view>
	</view>
</template>

<script>
	import { AGREEMENT_VERSION } from '@/common/agreement.js'

	export default {
		data() {
			return {
				version: AGREEMENT_VERSION
			}
		},
		methods: {
			open(url) {
				if (url) uni.navigateTo({ url })
			}
		}
	}
</script>

<style lang="scss">
	.legal-page {
		min-height: 100vh;
		background: #f2f3f5;
		padding: 24rpx 24rpx 60rpx;
	}

	.legal-group { margin-bottom: 24rpx; }

	.legal-group-title {
		display: block;
		padding: 0 8rpx 12rpx;
		font-size: 24rpx;
		color: #9aa1ad;
	}

	.legal-card {
		background: #fff;
		border-radius: 20rpx;
		overflow: hidden;
	}

	.legal-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 28rpx 32rpx;
		border-bottom: 1rpx solid #f2f3f5;

		&:last-child { border-bottom: none; }
		&:active { background: #fafbfc; }
	}

	.legal-left { display: flex; flex-direction: column; }

	.legal-name {
		font-size: 29rpx;
		color: #1c1f24;
		font-weight: 500;
	}

	.legal-desc {
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #9aa1ad;
	}

	.legal-arrow {
		font-size: 34rpx;
		color: #c7cbd3;
	}

	.legal-foot { padding: 16rpx 8rpx; }

	.legal-tip {
		display: block;
		font-size: 23rpx;
		color: #9aa1ad;
		line-height: 1.7;
	}
</style>
