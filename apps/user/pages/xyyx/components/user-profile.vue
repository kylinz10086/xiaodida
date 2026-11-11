<template>
	<view class="profile-container">
		<view class="profile-header">
			<view class="avatar-section">
				<image class="avatar-img" src="/static/icon/avatar.png" mode="aspectFill"></image>
				<view class="user-detail">
					<view class="username">{{userName}}</view>
					<view class="user-id">ID: {{userId}}</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		name: 'UserProfile',
		computed: {
			userName() {
				return this.$store.state.vuex_user?.name || '未登录用户';
			},
			userId() {
				return this.$store.state.vuex_user?.id || '---';
			}
		},
		props: {
			user: {
				type: Object,
				default: () => ({
					nickname: '未认证用户',
					isvalid: false
				})
			},
		},
		data() {
			return {
				screenWidth: this.screenWidth,
				screenHeight: this.screenHeight
			}
		},
		methods: {
			checkLogin() {
				uni.navigateTo({
					url: '/pages/oyyl-index/oyyl-index'
				});
			}
		},
	}
</script>

<style lang="scss">
	.profile-container {
		padding: 48rpx 32rpx 32rpx;
		background-color: #F2F2F7;
	}
	
	.profile-header {
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	
	.avatar-section {
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	
	.avatar-img {
		width: 96rpx;
		height: 96rpx;
		border-radius: 48rpx;
	}
	
	.user-detail {
		margin-left: 24rpx;
	}
	
	.username {
		font-size: 34rpx;
		font-weight: 600;
		color: #000;
		margin-bottom: 4rpx;
	}
	
	.user-id {
		font-size: 26rpx;
		color: #8E8E93;
	}
</style>
