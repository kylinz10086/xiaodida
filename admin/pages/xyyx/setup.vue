<template>
	<view class="setup-page">
		<view class="setup-card">
			<view class="setup-title">初始化管理员</view>
			<view class="setup-desc">第一次部署时使用；系统已有管理员时会提示“管理员已存在”。</view>

			<view class="form-item">
				<text class="label">用户名</text>
				<input v-model="username" class="input" placeholder="至少 3 个字符" />
			</view>
			<view class="form-item">
				<text class="label">密码</text>
				<input v-model="password" class="input" password placeholder="至少 6 位，字母+数字" />
			</view>
			<view class="form-item">
				<text class="label">昵称</text>
				<input v-model="nickname" class="input" placeholder="例如：平台管理员" />
			</view>

			<button class="submit-btn" type="primary" :loading="loading" @click="submit">创建管理员</button>
			<button class="link-btn" @click="goLogin">已有管理员，去登录</button>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				username: '',
				password: '',
				nickname: '',
				loading: false
			}
		},
		methods: {
			async submit() {
				if (!this.username || !this.password) {
					return uni.showToast({ title: '请填写用户名和密码', icon: 'none' })
				}
				this.loading = true
				try {
					const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true })
					const res = await uniIdCo.registerAdmin({
						username: this.username,
						password: this.password,
						nickname: this.nickname || this.username
					})
					if (res.errCode) throw new Error(res.errMsg || '创建失败')
					uni.showModal({
						title: '创建成功',
						content: '管理员账号已创建，请用该账号登录。',
						showCancel: false,
						success: () => this.goLogin()
					})
				} catch (e) {
					uni.showModal({
						title: '创建失败',
						content: e.message || '创建失败',
						showCancel: false
					})
				} finally {
					this.loading = false
				}
			},
			goLogin() {
				uni.reLaunch({ url: '/uni_modules/uni-id-pages/pages/login/login-withpwd' })
			}
		}
	}
</script>

<style lang="scss">
	.setup-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f2f2f7;
	}
	.setup-card {
		width: 460px;
		max-width: 90vw;
		background: #fff;
		border-radius: 12px;
		padding: 32px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, .08);
	}
	.setup-title {
		font-size: 24px;
		font-weight: 700;
	}
	.setup-desc {
		margin: 8px 0 24px;
		color: #8a8a8a;
		font-size: 13px;
		line-height: 1.6;
	}
	.form-item {
		margin-bottom: 16px;
	}
	.label {
		display: block;
		margin-bottom: 6px;
		color: #4a4a4a;
		font-size: 13px;
	}
	.input {
		height: 40px;
		border: 1px solid #dcdfe6;
		border-radius: 6px;
		padding: 0 12px;
		font-size: 14px;
	}
	.submit-btn {
		width: 100%;
		margin-top: 8px;
	}
	.link-btn {
		width: 100%;
		margin-top: 10px;
		background: transparent;
		color: #007aff;
		font-size: 13px;
	}
</style>
