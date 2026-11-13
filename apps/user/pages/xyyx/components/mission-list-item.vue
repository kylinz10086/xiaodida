<template>
	<view>
		<view class="task-card" v-for="item in listData" :key="item.id" @click="clickMissionOrder(item)">
			<view class="card-header">
				<view class="type-tag" :class="'type-' + item.type">
					{{item.typeText || '快递'}}
				</view>
				<view class="price-box">
					<text class="price-symbol">¥</text>
					<text class="price-value">{{ money(item.money) }}</text>
				</view>
			</view>
			<view class="card-body">
				<view class="task-title">{{item.thing || item.title}}</view>
				<view class="task-desc" v-if="item.description">{{item.description}}</view>
				<view class="task-tags">
					<text class="tag" v-if="item.itemSize">{{item.itemSize}}</text>
					<text class="tag" v-if="item.timeOption">{{item.timeOption}}</text>
				</view>
				<view class="route-info" v-if="item.origin && item.origin.name">
					<view class="route-point">
						<text class="point-icon start">起</text>
						<text class="point-text">{{item.origin.name}}</text>
					</view>
					<view class="route-arrow"></view>
					<view class="route-point">
						<text class="point-icon end">终</text>
						<text class="point-text">{{item.destination ? item.destination.name : ''}}</text>
					</view>
				</view>
			</view>
			<view class="card-footer">
				<view class="time-info">
					<text class="publish-time">{{item.timeText || item.time}}</text>
				</view>
				<view class="action-btn" @click.stop="clickMissionOrder(item)">查看</view>
			</view>
		</view>
	</view>
</template>

<script>
	/**
	 * 任务卡片（用户端）
	 *
	 * 用户端只「看」不「抢」——抢单是骑手端的事，所以这里没有接单按钮。
	 */
	import { fmtMoney } from '@/common/rider-util.js'

	export default {
		name: 'MissionListItem',
		props: ['listData'],
		methods: {
			money(v) { return fmtMoney(v) },
			clickMissionOrder(item) {
				uni.setStorageSync('currentViewTaskId', item.id);
				uni.navigateTo({
					url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?type=notcomplete'
				});
			}
		}
	}
</script>

<style lang="scss">
	.task-card {
		background-color: #fff;
		border-radius: 24rpx;
		margin-bottom: 16rpx;
		padding: 24rpx;
	}
	
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16rpx;
	}
	
	.type-tag {
		padding: 8rpx 20rpx;
		border-radius: 16rpx;
		font-size: 24rpx;
		font-weight: 500;
		
		&.type-1 {
			background-color: rgba(0, 122, 255, 0.1);
			color: #007AFF;
		}
		&.type-2 {
			background-color: rgba(255, 149, 0, 0.1);
			color: #FF9500;
		}
		&.type-3 {
			background-color: rgba(52, 199, 89, 0.1);
			color: #34C759;
		}
		&.type-4 {
			background-color: rgba(142, 142, 147, 0.1);
			color: #8E8E93;
		}
	}
	
	.price-box {
		display: flex;
		align-items: baseline;
	}
	
	.price-symbol {
		font-size: 26rpx;
		color: #FF9500;
		font-weight: 500;
	}
	
	.price-value {
		font-size: 36rpx;
		color: #FF9500;
		font-weight: 700;
	}
	
	.card-body {
		margin-bottom: 16rpx;
	}
	
	.task-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #000;
		margin-bottom: 12rpx;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.task-desc {
		font-size: 26rpx;
		color: #8E8E93;
		margin-bottom: 16rpx;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	
	.task-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
		margin-bottom: 16rpx;
	}
	
	.tag {
		padding: 6rpx 16rpx;
		background-color: #F2F2F7;
		border-radius: 12rpx;
		font-size: 22rpx;
		color: #8E8E93;
	}
	
	.route-info {
		display: flex;
		align-items: center;
		padding: 16rpx;
		background-color: #F2F2F7;
		border-radius: 16rpx;
	}
	
	.route-point {
		display: flex;
		align-items: center;
		flex: 1;
	}
	
	.point-icon {
		width: 36rpx;
		height: 36rpx;
		line-height: 36rpx;
		text-align: center;
		border-radius: 18rpx;
		font-size: 20rpx;
		color: #fff;
		margin-right: 12rpx;
		
		&.start {
			background-color: #34C759;
		}
		&.end {
			background-color: #FF9500;
		}
	}
	
	.point-text {
		font-size: 24rpx;
		color: #000;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 180rpx;
	}
	
	.route-arrow {
		width: 40rpx;
		height: 4rpx;
		background-color: #E5E5EA;
		margin: 0 16rpx;
		position: relative;
		
		&::after {
			content: '';
			position: absolute;
			right: -8rpx;
			top: -6rpx;
			width: 0;
			height: 0;
			border-left: 12rpx solid #E5E5EA;
			border-top: 8rpx solid transparent;
			border-bottom: 8rpx solid transparent;
		}
	}
	
	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 16rpx;
		border-top: 0.5rpx solid #E5E5EA;
	}
	
	.time-info {
		display: flex;
		align-items: center;
	}
	
	.publish-time {
		font-size: 24rpx;
		color: #8E8E93;
	}
	
	.action-btn {
		padding: 12rpx 40rpx;
		background-color: #007AFF;
		color: #fff;
		border-radius: 16rpx;
		font-size: 26rpx;
		font-weight: 500;
	}
</style>
