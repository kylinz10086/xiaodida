<template>
	<view class="page">
		<view class="card">
			<view class="card-title">申请成为骑手</view>
			<text class="muted small tip">仅限浙江中医药大学在校学生。信息只用于平台审核，不会展示给其他用户。</text>

			<view class="field">
				<text class="label">真实姓名</text>
				<input class="input" v-model="form.real_name" placeholder="与学号一致" maxlength="20" />
			</view>
			<view class="field">
				<text class="label">学号</text>
				<input class="input" v-model="form.student_no" placeholder="用于身份核验" maxlength="20" />
			</view>
			<view class="field">
				<text class="label">手机号</text>
				<input class="input" v-model="form.mobile" type="number" maxlength="11" placeholder="方便用户联系你" />
			</view>

			<view class="agree" @click="agreed = !agreed">
				<view class="checkbox" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</view>
				<text class="agree-text">我已阅读并同意</text>
				<text class="link" @click.stop="go('/pages/agreement/user-agreement')">《骑手服务协议》</text>
				<text class="link" @click.stop="go('/pages/agreement/privacy-policy')">《隐私政策》</text>
			</view>

			<view class="btn btn-primary submit" @click="submit">提交申请</view>
		</view>

		<view class="card" v-if="riderStatus === 1">
			<view class="card-title">审核中</view>
			<text class="muted small">你的申请已提交，平台会在 1 个工作日内审核。通过后即可在「抢单大厅」接单。</text>
		</view>

		<view class="card" v-if="riderStatus === 3">
			<view class="card-title">审核未通过</view>
			<text class="muted small">可以修改信息后重新提交，或联系平台客服处理。</text>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() {
			return {
				agreed: false,
				form: { real_name: '', student_no: '', mobile: '' }
			}
		},
		computed: {
			...mapGetters(['riderStatus', 'profile'])
		},
		onShow() {
			if (this.profile.mobile) this.form.mobile = this.profile.mobile
		},
		methods: {
			...mapActions(['applyRider', 'acceptAgreement']),
			go(url) {
				uni.navigateTo({ url })
			},
			async submit() {
				if (!this.agreed) {
					uni.showToast({ title: '请先阅读并同意协议', icon: 'none' })
					return
				}
				if (!this.form.real_name || !this.form.student_no || !/^1\d{10}$/.test(this.form.mobile)) {
					uni.showToast({ title: '请完整填写信息', icon: 'none' })
					return
				}
				try {
					await this.acceptAgreement()
					await this.applyRider(this.form)
					uni.showToast({ title: '已提交，等待审核', icon: 'success' })
					setTimeout(() => uni.navigateBack(), 900)
				} catch (e) {
					uni.showToast({ title: e.message || '提交失败', icon: 'none' })
				}
			}
		}
	}
</script>

<style lang="scss">
	.page {
		padding: 24rpx;
	}

	.card-title {
		font-size: 32rpx;
		font-weight: 700;
		margin-bottom: 12rpx;
	}

	.tip {
		display: block;
		margin-bottom: 24rpx;
		line-height: 1.5;
	}

	.field {
		margin-bottom: 22rpx;
	}

	.label {
		display: block;
		font-size: 26rpx;
		color: #6e6e73;
		margin-bottom: 10rpx;
	}

	.input {
		height: 84rpx;
		background: #f7f8fa;
		border-radius: 14rpx;
		padding: 0 22rpx;
		font-size: 28rpx;
	}

	.agree {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8rpx;
		margin: 8rpx 0 28rpx;
		font-size: 24rpx;
	}

	.checkbox {
		width: 34rpx;
		height: 34rpx;
		border-radius: 8rpx;
		border: 2rpx solid #c7c7cc;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22rpx;
		color: #fff;

		&.checked {
			background: #007aff;
			border-color: #007aff;
		}
	}

	.agree-text {
		color: #6e6e73;
	}

	.link {
		color: #007aff;
	}

	.submit {
		margin-top: 8rpx;
	}
</style>
