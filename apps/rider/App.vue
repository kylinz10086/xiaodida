<script>
	export default {
		onLaunch() {
			// 记录一次启动，方便判断是不是首次进入（合规弹窗用）
			const key = 'rider_launched'
			if (!uni.getStorageSync(key)) {
				uni.setStorageSync(key, 1)
			}
		},
		onShow() {},
		onHide() {}
	}
</script>

<style lang="scss">
	@import './uni.scss';

	page {
		background-color: #f2f2f7;
		color: #1c1c1e;
		font-size: 28rpx;
	}

	view,
	text {
		box-sizing: border-box;
	}

	.card {
		background: #fff;
		border-radius: 24rpx;
		padding: 28rpx;
		margin-bottom: 20rpx;
	}

	.row {
		display: flex;
		align-items: center;
	}

	.between {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.muted {
		color: #8e8e93;
	}

	.small {
		font-size: 24rpx;
	}

	.price {
		color: #ff3b30;
		font-weight: 700;
	}

	.btn {
		height: 84rpx;
		line-height: 84rpx;
		text-align: center;
		border-radius: 42rpx;
		font-size: 30rpx;
		font-weight: 600;
	}

	.btn-primary {
		background: #007aff;
		color: #fff;
	}

	.btn-ghost {
		background: #fff;
		color: #007aff;
		border: 1rpx solid rgba(0, 122, 255, 0.35);
	}

	.btn-danger {
		background: #fff;
		color: #ff3b30;
		border: 1rpx solid rgba(255, 59, 48, 0.35);
	}

	.btn-sm {
		height: 60rpx;
		line-height: 60rpx;
		padding: 0 28rpx;
		border-radius: 30rpx;
		font-size: 26rpx;
	}

	.empty {
		padding: 140rpx 0;
		text-align: center;
		color: #8e8e93;
	}

	.tag {
		display: inline-block;
		padding: 6rpx 16rpx;
		border-radius: 10rpx;
		font-size: 22rpx;
		font-weight: 600;
	}

	.tag-1 {
		color: #007aff;
		background: rgba(0, 122, 255, 0.1);
	}

	.tag-2 {
		color: #ff9500;
		background: rgba(255, 149, 0, 0.12);
	}

	.tag-3 {
		color: #34c759;
		background: rgba(52, 199, 89, 0.12);
	}

	.status-1 {
		color: #ff9500;
		background: rgba(255, 149, 0, 0.12);
	}

	.status-2 {
		color: #007aff;
		background: rgba(0, 122, 255, 0.1);
	}

	.status-3 {
		color: #34c759;
		background: rgba(52, 199, 89, 0.12);
	}

	.status-4 {
		color: #8e8e93;
		background: rgba(142, 142, 147, 0.12);
	}

	.status-5 {
		color: #ff3b30;
		background: rgba(255, 59, 48, 0.12);
	}
</style>
