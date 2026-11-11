<template>
	<view class="page">
		<view class="profile">
			<view class="avatar">{{ avatarText }}</view>
			<view class="info">
				<text class="name">{{ profile.nickname || '未设置昵称' }}</text>
				<text class="status">{{ riderStatusText }}</text>
			</view>
		</view>

		<view class="stats">
			<view class="stat">
				<text class="num">{{ (profile.rider && profile.rider.done_count) || 0 }}</text>
				<text class="label">已完成</text>
			</view>
			<view class="stat">
				<text class="num">{{ (profile.rider && profile.rider.ongoing_count) || 0 }}</text>
				<text class="label">进行中</text>
			</view>
			<view class="stat">
				<text class="num">{{ (profile.rider && profile.rider.rating) || 5 }}</text>
				<text class="label">评分</text>
			</view>
		</view>

		<view class="group">
			<view class="cell" @click="go('/pages/wallet/wallet')">
				<text>我的收入</text>
				<view class="row">
					<text class="muted small">¥{{ (profile.wallet && profile.wallet.balance) || 0 }}</text>
					<text class="arrow">›</text>
				</view>
			</view>
			<view class="cell" @click="go('/pages/apply/apply')" v-if="riderStatus !== 2">
				<text>申请成为骑手</text>
				<text class="arrow">›</text>
			</view>
			<view class="cell" @click="editNickname">
				<text>修改昵称</text>
				<view class="row">
					<text class="muted small">{{ profile.nickname || '未设置' }}</text>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>

		<view class="group">
			<view class="cell" @click="go('/pages/agreement/user-agreement')">
				<text>骑手服务协议</text>
				<text class="arrow">›</text>
			</view>
			<view class="cell" @click="go('/pages/agreement/privacy-policy')">
				<text>隐私政策</text>
				<text class="arrow">›</text>
			</view>
			<view class="cell" @click="logout">
				<text class="danger">退出登录</text>
				<text class="arrow">›</text>
			</view>
		</view>

		<view class="footer">
			<text class="muted small">校递达骑手端 · 仅服务浙江中医药大学</text>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		computed: {
			...mapGetters(['profile', 'riderStatus']),
			avatarText() {
				return (this.profile.nickname || '骑').slice(0, 1)
			},
			riderStatusText() {
				return { 0: '未认证骑手', 1: '审核中', 2: '已认证骑手', 3: '审核未通过' }[this.riderStatus] || '未认证骑手'
			}
		},
		onShow() {
			this.fetchProfile().catch(() => {})
		},
		methods: {
			...mapActions(['fetchProfile', 'updateProfile']),
			go(url) {
				uni.navigateTo({ url })
			},
			editNickname() {
				uni.showModal({
					title: '修改昵称',
					editable: true,
					placeholderText: '请输入昵称',
					content: this.profile.nickname || '',
					success: async (r) => {
						if (!r.confirm) return
						const nickname = (r.content || '').trim()
						if (!nickname) return
						try {
							await this.updateProfile({ nickname })
							uni.showToast({ title: '已保存', icon: 'success' })
						} catch (e) {
							uni.showToast({ title: e.message, icon: 'none' })
						}
					}
				})
			},
			logout() {
				uni.removeStorageSync('uniIdToken')
				uni.reLaunch({ url: '/pages/hall/hall' })
			}
		}
	}
</script>

<style lang="scss">
	.page {
		padding-bottom: 60rpx;
	}

	.profile {
		display: flex;
		align-items: center;
		padding: 48rpx 36rpx;
		background: linear-gradient(160deg, #007aff 0%, #3aa0ff 100%);
		color: #fff;
	}

	.avatar {
		width: 116rpx;
		height: 116rpx;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.28);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 46rpx;
		font-weight: 700;
		margin-right: 24rpx;
	}

	.info {
		display: flex;
		flex-direction: column;
	}

	.name {
		font-size: 38rpx;
		font-weight: 700;
	}

	.status {
		margin-top: 10rpx;
		font-size: 24rpx;
		opacity: 0.9;
	}

	.stats {
		display: flex;
		background: #fff;
		margin: -28rpx 24rpx 0;
		border-radius: 24rpx;
		padding: 28rpx 0;
		box-shadow: 0 6rpx 24rpx rgba(0, 0, 0, 0.06);
		position: relative;
	}

	.stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;

		& + & {
			border-left: 1rpx solid #efeff4;
		}
	}

	.num {
		font-size: 36rpx;
		font-weight: 700;
	}

	.label {
		margin-top: 8rpx;
		font-size: 23rpx;
		color: #8e8e93;
	}

	.group {
		background: #fff;
		border-radius: 24rpx;
		margin: 24rpx;
		padding: 0 28rpx;
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 28rpx 0;
		font-size: 28rpx;
		border-bottom: 1rpx solid #f4f4f6;

		&:last-child {
			border-bottom: none;
		}
	}

	.arrow {
		color: #c7c7cc;
		margin-left: 12rpx;
	}

	.danger {
		color: #ff3b30;
	}

	.footer {
		text-align: center;
		margin-top: 40rpx;
	}
</style>
