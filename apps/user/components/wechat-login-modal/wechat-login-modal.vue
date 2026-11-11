<template>
	<view class="login-modal" v-if="visible" @touchmove.stop.prevent>
		<view class="modal-mask" @click="onClose"></view>
		<view class="modal-content">
			<view class="modal-header">
				<view class="header-bg"></view>
				<view class="header-info">
					<image class="logo" src="/static/icon/logo1.png" mode="aspectFit"></image>
					<view class="brand">
						<text class="title">校递达</text>
						<text class="subtitle">校园快递代取服务平台</text>
					</view>
				</view>
			</view>
			
			<view class="modal-body">
				<view class="welcome-section">
					<text class="welcome-title">欢迎使用校递达</text>
					<text class="welcome-desc">登录后即可发布任务、接单赚钱</text>
				</view>
				
				<button class="wechat-btn" :class="{'disabled': !agree, 'loading': loading}" @click="onWechatLogin">
					<image class="wechat-icon" src="/static/img/weixin.png" mode="aspectFit"></image>
					<text>{{ loading ? '登录中...' : '微信一键登录' }}</text>
				</button>
				
				<view class="agreement">
					<view class="checkbox" @click="agree = !agree">
						<view class="check-icon" :class="{'checked': agree}">
							<text v-if="agree">✓</text>
						</view>
					</view>
					<text class="agreement-text">登录即表示同意</text>
					<text class="agreement-link" @click="goToAgreement('user')">《用户服务协议》</text>
					<text class="agreement-text">和</text>
					<text class="agreement-link" @click="goToAgreement('privacy')">《隐私政策》</text>
				</view>
				
				<view class="skip-login" @click="onSkip">
					<text>暂不登录，先逛逛</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
export default {
	name: 'WechatLoginModal',
	props: {
		visible: {
			type: Boolean,
			default: false
		}
	},
	data() {
		return {
			agree: false,
			loading: false
		}
	},
	methods: {
		onClose() {
			this.$emit('close')
		},
		onSkip() {
			this.$emit('skip')
		},
		async onWechatLogin() {
			if (!this.agree) {
				uni.showToast({
					title: '请先同意用户协议',
					icon: 'none'
				})
				return
			}
			
			if (this.loading) return
			this.loading = true
			
			uni.showLoading({ title: '登录中...', mask: true })
			
			try {
				const loginRes = await new Promise((resolve, reject) => {
					uni.login({
						provider: 'weixin',
						success: (res) => resolve(res),
						fail: (err) => reject(err)
					})
				})
				
				if (!loginRes.code) {
					throw new Error('获取登录凭证失败')
				}
				
				const uniIdCo = uniCloud.importObject("uni-id-co", { customUI: true })
				
				const result = await uniIdCo.loginByWeixin({
					code: loginRes.code
				})
				
				uni.hideLoading()
				
				if (result.errCode) {
					throw new Error(result.errMsg || '登录失败')
				}
				
				const token = result.token || result.newToken?.token
				if (token) {
					uni.setStorageSync('uniIdToken', token)
					uni.setStorageSync('token', token)
					
					const userInfo = result.userInfo || {}
					const userData = {
						avatar: userInfo.avatar || userInfo.avatar_file?.url || '/static/icon/head1.png',
						nickname: userInfo.nickname || '微信用户',
						mobile: userInfo.mobile || '',
						uid: result.uid
					}
					uni.setStorageSync('userInfo', userData)
					this.$store.dispatch('setUserData', userData)
					this.$store.dispatch('setUserToken', token)
					
					uni.showToast({ title: '登录成功', icon: 'success' })
					setTimeout(() => {
						this.$emit('success', result)
					}, 500)
				} else {
					throw new Error('登录返回数据异常')
				}
			} catch (err) {
				uni.hideLoading()
				console.error('登录失败:', err)
				uni.showToast({
					title: err.message || err.errMsg || '登录失败，请重试',
					icon: 'none',
					duration: 3000
				})
			} finally {
				this.loading = false
			}
		},
		goToAgreement(type) {
			uni.showToast({ title: '功能开发中', icon: 'none' })
		}
	}
}
</script>

<style lang="scss" scoped>
.login-modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
}

.modal-mask {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.65);
}

.modal-content {
	position: relative;
	width: 620rpx;
	background-color: #fff;
	border-radius: 32rpx;
	overflow: hidden;
	animation: modalIn 0.3s ease-out;
	box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.2);
}

@keyframes modalIn {
	from {
		opacity: 0;
		transform: scale(0.9) translateY(40rpx);
	}
	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}

.modal-header {
	position: relative;
	height: 200rpx;
	
	.header-bg {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 100%;
		background: linear-gradient(135deg, #4A90E2 0%, #357ABD 50%, #2E6BB0 100%);
		border-radius: 0 0 50% 50% / 0 0 30rpx 30rpx;
	}
	
	.header-info {
		position: relative;
		display: flex;
		align-items: center;
		padding: 40rpx 40rpx;
		
		.logo {
			width: 100rpx;
			height: 100rpx;
			border-radius: 20rpx;
			box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.2);
			background-color: #fff;
		}
		
		.brand {
			margin-left: 24rpx;
			
			.title {
				display: block;
				font-size: 40rpx;
				font-weight: 700;
				color: #fff;
				letter-spacing: 2rpx;
			}
			
			.subtitle {
				display: block;
				font-size: 22rpx;
				color: rgba(255, 255, 255, 0.85);
				margin-top: 6rpx;
			}
		}
	}
}

.modal-body {
	padding: 32rpx 40rpx 48rpx;
}

.welcome-section {
	text-align: center;
	margin-bottom: 40rpx;
	
	.welcome-title {
		display: block;
		font-size: 36rpx;
		font-weight: 600;
		color: #1a1a1a;
		margin-bottom: 8rpx;
	}
	
	.welcome-desc {
		display: block;
		font-size: 26rpx;
		color: #999;
	}
}

.wechat-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 96rpx;
	background: linear-gradient(135deg, #07C160 0%, #06AD56 100%);
	border-radius: 48rpx;
	border: none;
	box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.35);
	transition: all 0.2s;
	
	&::after {
		border: none;
	}
	
	&:active {
		transform: scale(0.98);
		box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.3);
	}
	
	&.disabled {
		opacity: 0.6;
		box-shadow: none;
	}
	
	&.loading {
		opacity: 0.8;
	}
	
	.wechat-icon {
		width: 44rpx;
		height: 44rpx;
		margin-right: 16rpx;
	}
	
	text {
		font-size: 32rpx;
		font-weight: 500;
		color: #fff;
		letter-spacing: 1rpx;
	}
}

.agreement {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 28rpx;
	flex-wrap: wrap;
	
	.checkbox {
		margin-right: 8rpx;
	}
	
	.check-icon {
		width: 32rpx;
		height: 32rpx;
		border: 2rpx solid #ddd;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		
		&.checked {
			background-color: #07C160;
			border-color: #07C160;
		}
		
		text {
			font-size: 20rpx;
			color: #fff;
			font-weight: bold;
		}
	}
	
	.agreement-text {
		font-size: 22rpx;
		color: #999;
	}
	
	.agreement-link {
		font-size: 22rpx;
		color: #4A90E2;
	}
}

.skip-login {
	text-align: center;
	margin-top: 24rpx;
	padding: 16rpx 0;
	
	text {
		font-size: 26rpx;
		color: #999;
		position: relative;
		
		&::after {
			content: '';
			position: absolute;
			bottom: -4rpx;
			left: 0;
			right: 0;
			height: 1rpx;
			background-color: #ccc;
		}
	}
}
</style>
