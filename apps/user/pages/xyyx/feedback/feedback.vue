<template>
	<view class="fb-page">
		<view class="fb-tip" v-if="isDelete">
			<text class="fb-tip-title">注销前请确认</text>
			<text class="fb-tip-line">1. 没有进行中的订单；</text>
			<text class="fb-tip-line">2. 钱包余额已经提现；</text>
			<text class="fb-tip-line">3. 注销后昵称、头像、手机号会被删除，订单记录按法律要求保留 3 年。</text>
			<text class="fb-tip-line">提交后我们会在 15 个工作日内处理，处理结果通过你留下的联系方式告知。</text>
		</view>

		<view class="fb-block">
			<text class="fb-label">反馈类型</text>
			<view class="fb-types">
				<view class="fb-type" v-for="t in types" :key="t.value"
					:class="{ active: type === t.value }" @click="type = t.value">{{ t.label }}</view>
			</view>
		</view>

		<view class="fb-block">
			<text class="fb-label">{{ isDelete ? '注销原因（选填）' : '具体情况' }}</text>
			<textarea class="fb-textarea" v-model="content" :maxlength="500"
				:placeholder="isDelete ? '可以说说为什么不用了，方便我们改进' : '写清订单号、时间和你遇到的问题，方便我们尽快定位'"></textarea>
			<text class="fb-count">{{ content.length }}/500</text>
		</view>

		<view class="fb-block">
			<text class="fb-label">联系方式（选填）</text>
			<input class="fb-input" v-model="contact" maxlength="50" placeholder="手机号或微信号，方便我们回复你" />
		</view>

		<view class="fb-submit-wrap">
			<view class="fb-submit" :class="{ disabled: submitting || content.trim().length < 5 }" @click="submit">
				{{ submitting ? '提交中…' : '提交' }}
			</view>
			<text class="fb-note">我们不会把你的反馈内容用于其他用途。</text>
		</view>
	</view>
</template>

<script>
	import { mapActions } from 'vuex'

	export default {
		data() {
			return {
				type: 'suggestion',
				content: '',
				contact: '',
				submitting: false,
				types: [
					{ value: 'suggestion', label: '产品建议' },
					{ value: 'bug', label: '遇到问题' },
					{ value: 'complaint', label: '投诉' },
					{ value: 'delete_account', label: '注销账号' }
				]
			}
		},
		computed: {
			isDelete() {
				return this.type === 'delete_account'
			}
		},
		onLoad(query) {
			if (query && query.type === 'delete_account') this.type = 'delete_account'
			uni.setNavigationBarTitle({ title: this.type === 'delete_account' ? '注销账号' : '意见反馈' })
		},
		watch: {
			type(v) {
				uni.setNavigationBarTitle({ title: v === 'delete_account' ? '注销账号' : '意见反馈' })
			}
		},
		methods: {
			...mapActions(['submitFeedback']),
			submit() {
				if (this.submitting) return
				if (this.content.trim().length < 5) {
					uni.showToast({ title: '请至少写 5 个字', icon: 'none' })
					return
				}
				const doSubmit = () => {
					this.submitting = true
					this.submitFeedback({
						type: this.type,
						content: this.content.trim(),
						contact: this.contact.trim()
					})
						.then((res) => {
							uni.showModal({
								title: this.isDelete ? '已提交注销申请' : '已收到',
								content: (res && res.msg) || '我们会在 15 个工作日内处理',
								showCancel: false,
								confirmText: '知道了',
								success: () => uni.navigateBack()
							})
						})
						.catch((e) => {
							uni.showToast({ title: (e && e.message) || '提交失败，请稍后再试', icon: 'none' })
						})
						.finally(() => {
							this.submitting = false
						})
				}

				if (!this.isDelete) return doSubmit()
				uni.showModal({
					title: '确认提交注销申请？',
					content: '提交后账号资料会在 15 个工作日内删除，期间可以联系客服撤回。',
					confirmText: '提交',
					confirmColor: '#FF3B30',
					success: (r) => {
						if (r.confirm) doSubmit()
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.fb-page {
		min-height: 100vh;
		background: #f2f3f5;
		padding: 24rpx 24rpx 60rpx;
	}

	.fb-tip {
		background: #fff8e8;
		border: 1rpx solid #ffe3b0;
		border-radius: 16rpx;
		padding: 24rpx;
		margin-bottom: 20rpx;
	}

	.fb-tip-title {
		display: block;
		font-size: 27rpx;
		font-weight: 600;
		color: #9a6200;
		margin-bottom: 10rpx;
	}

	.fb-tip-line {
		display: block;
		font-size: 24rpx;
		line-height: 1.7;
		color: #9a6200;
	}

	.fb-block {
		background: #fff;
		border-radius: 16rpx;
		padding: 24rpx;
		margin-bottom: 20rpx;
	}

	.fb-label {
		display: block;
		font-size: 26rpx;
		font-weight: 600;
		color: #1c1f24;
		margin-bottom: 16rpx;
	}

	.fb-types {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
	}

	.fb-type {
		padding: 12rpx 26rpx;
		border-radius: 10rpx;
		font-size: 25rpx;
		color: #4b5563;
		background: #f2f3f5;

		&.active {
			background: #1677ff;
			color: #fff;
			font-weight: 600;
		}
	}

	.fb-textarea {
		width: 100%;
		height: 260rpx;
		font-size: 27rpx;
		line-height: 1.7;
		color: #1c1f24;
		box-sizing: border-box;
	}

	.fb-count {
		display: block;
		text-align: right;
		font-size: 22rpx;
		color: #9aa1ad;
	}

	.fb-input {
		height: 72rpx;
		font-size: 27rpx;
		color: #1c1f24;
	}

	.fb-submit-wrap {
		padding: 20rpx 8rpx 0;
	}

	.fb-submit {
		height: 88rpx;
		line-height: 88rpx;
		text-align: center;
		border-radius: 44rpx;
		background: #1677ff;
		color: #fff;
		font-size: 29rpx;
		font-weight: 600;
		box-shadow: 0 8rpx 20rpx rgba(22, 119, 255, 0.22);

		&.disabled {
			opacity: 0.5;
			box-shadow: none;
		}
	}

	.fb-note {
		display: block;
		margin-top: 16rpx;
		text-align: center;
		font-size: 22rpx;
		color: #9aa1ad;
	}
</style>
