<template>
	<view>
		<u-action-sheet :list="orderOperationList" @click="clickOperation" v-model="showOrderOperation"></u-action-sheet>
		<view class="order-card" v-for="item in listData" :key="item.id" @click="handleClickOrder(item)" @longpress="longpress(item)">
			<view class="card-header">
				<view class="type-tag" :class="'type-' + item.type">
					{{item.typeText || '快递'}}
				</view>
				<view class="status-tag" :class="'status-' + item.state">
					<view class="status-dot"></view>
					<text>{{stateToText(item.state)}}</text>
				</view>
			</view>
			<view class="card-body">
				<view class="order-title">{{item.thing || item.title}}</view>
				<view class="order-desc" v-if="item.description">{{item.description}}</view>
				<view class="order-tags">
					<text class="tag" v-if="item.itemSize">{{item.itemSize}}</text>
					<text class="tag" v-if="item.timeOption">{{item.timeOption}}</text>
					<text class="tag role-tag" :class="item.orderType" v-if="item.orderType">
						{{item.orderType === 'published' ? '我发布的' : '我接的单'}}
					</text>
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
				<view class="price-box">
					<text class="price-symbol">¥</text>
					<text class="price-value">{{item.money}}</text>
				</view>
				<view class="action-area">
					<view class="time-info">
						<text class="publish-time">{{item.time}}</text>
					</view>
					<view class="action-btns">
						<view 
							class="action-btn primary" 
							v-if="item.orderType === 'published' && item.state === 1"
							@click.stop="editOrder(item)">
							修改
						</view>
						<view 
							class="action-btn warning" 
							v-if="item.orderType === 'published' && item.state === 1"
							@click.stop="cancelOrderTask(item)">
							取消
						</view>
						<view 
							class="action-btn success" 
							v-if="item.orderType === 'published' && item.state === 2"
							@click.stop="confirmCompleteByPublisher(item)">
							确认完成
						</view>
						<view 
							class="action-btn success" 
							v-if="item.orderType === 'accepted' && item.state === 2"
							@click.stop="completeOrderTask(item)">
							完成
						</view>
						<view 
							class="action-btn warning" 
							v-if="item.orderType === 'accepted' && item.state === 2"
							@click.stop="giveupOrder(item)">
							放弃
						</view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapActions } from 'vuex';
	
	export default {
		name: 'OrderListItem',
		props: ['listData'],
		methods: {
			...mapActions(['completeTask', 'confirmTask', 'cancelTask', 'abandonTask']),
			stateToText(num) {
				const map = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消' };
				return map[num] || '待接单';
			},
			clickOperation(index) {
				this.showOrderOperation = false;
				if (this.currentPressItem.state == 1 && index == 0) {
					uni.navigateTo({ url: '/pages/xyyx/release-requirements/release-requirements?item=1&type=edit' });
				} else if (index == 1) {
					uni.navigateTo({ url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?type=completed' });
				}
			},
			handleClickOrder(item) {
				uni.setStorageSync('currentViewTaskId', item.id);
				const typeMap = { 1: 'notcomplete', 2: 'in-transit', 3: 'completed' };
				const pageType = typeMap[item.state] || 'completed';
				uni.navigateTo({
					url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?item=' + (item.type || 1) + '&type=' + pageType
				});
			},
			editOrder(item) {
				uni.setStorageSync('currentEditTaskId', item.id);
				uni.navigateTo({
					url: '/pages/xyyx/release-requirements/release-requirements?item=' + (item.type || 1) + '&type=edit'
				});
			},
			completeOrderTask(item) {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？',
					success: (res) => {
						if (res.confirm) {
							this.completeTask({ taskId: item.id }).then(() => {
								uni.showToast({ title: '订单已完成', icon: 'success', duration: 1500 });
								this.$emit('refresh');
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none' });
							});
						}
					}
				});
			},
			confirmCompleteByPublisher(item) {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？确认后订单将标记为已完成。',
					success: (res) => {
						if (res.confirm) {
							this.confirmTask({ taskId: item.id }).then(() => {
								uni.showToast({ title: '订单已确认完成', icon: 'success', duration: 1500 });
								this.$emit('refresh');
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none' });
							});
						}
					}
				});
			},
			cancelOrderTask(item) {
				uni.showModal({
					title: '确认取消',
					content: '确认取消该订单吗？取消后订单将从任务市场移除。',
					success: (res) => {
						if (res.confirm) {
							this.cancelTask({ taskId: item.id, reason: '发布者取消' }).then(() => {
								uni.showToast({ title: '订单已取消', icon: 'success', duration: 1500 });
								this.$emit('refresh');
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none' });
							});
						}
					}
				});
			},
			giveupOrder(item) {
				uni.showModal({
					title: '确认放弃',
					content: '放弃订单将影响您的信用评分，确定要放弃吗？',
					confirmColor: '#ff6b35',
					success: (res) => {
						if (res.confirm) {
							this.abandonTask({ taskId: item.id }).then(() => {
								uni.showToast({ title: '已放弃订单', icon: 'none', duration: 1500 });
								this.$emit('refresh');
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none' });
							});
						}
					}
				});
			},
			longpress(item) {
				this.showOrderOperation = true;
				this.currentPressItem = item;
				if (item.state == 1) {
					this.orderOperationList = [{ text: '修改', color: 'blue', fontSize: 34 }, { text: '详情', fontSize: 34 }];
				} else {
					this.orderOperationList = [{ text: '修改', color: 'gray', fontSize: 34, subText: '只能修改未被接单的订单' }, { text: '详情', fontSize: 34 }];
				}
			}
		},
		data() {
			return {
				orderOperationList: [{ text: '修改', color: 'blue', fontSize: 34 }, { text: '详情', fontSize: 34 }],
				showOrderOperation: false,
				currentPressItem: { type: 1 }
			}
		}
	}
</script>

<style lang="scss">
	.order-card { background-color: #fff; border-radius: 24rpx; margin-bottom: 16rpx; padding: 24rpx; }
	.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
	.type-tag { padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500;
		&.type-1 { background-color: rgba(0, 122, 255, 0.1); color: #007AFF; }
		&.type-2 { background-color: rgba(255, 149, 0, 0.1); color: #FF9500; }
		&.type-3 { background-color: rgba(52, 199, 89, 0.1); color: #34C759; }
		&.type-4 { background-color: rgba(142, 142, 147, 0.1); color: #8E8E93; }
	}
	.status-tag { display: flex; align-items: center; padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500;
		.status-dot { width: 12rpx; height: 12rpx; border-radius: 50%; margin-right: 8rpx; }
		&.status-1 { background-color: rgba(255, 149, 0, 0.1); color: #FF9500; .status-dot { background-color: #FF9500; animation: pulse 1.5s infinite; } }
		&.status-2 { background-color: rgba(0, 122, 255, 0.1); color: #007AFF; .status-dot { background-color: #007AFF; animation: pulse 1s infinite; } }
		&.status-3 { background-color: rgba(52, 199, 89, 0.1); color: #34C759; .status-dot { background-color: #34C759; } }
		&.status-4 { background-color: rgba(142, 142, 147, 0.1); color: #8E8E93; .status-dot { background-color: #8E8E93; } }
	}
	@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
	.card-body { margin-bottom: 16rpx; }
	.order-title { font-size: 32rpx; font-weight: 600; color: #000; margin-bottom: 12rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.order-desc { font-size: 26rpx; color: #8E8E93; margin-bottom: 16rpx; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
	.order-tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 16rpx; }
	.tag { padding: 6rpx 16rpx; background-color: #F2F2F7; border-radius: 12rpx; font-size: 22rpx; color: #8E8E93; }
	.role-tag { &.published { background-color: rgba(0, 122, 255, 0.1); color: #007AFF; } &.accepted { background-color: rgba(255, 149, 0, 0.1); color: #FF9500; } }
	.route-info { display: flex; align-items: center; padding: 16rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.route-point { display: flex; align-items: center; flex: 1; }
	.point-icon { width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; border-radius: 18rpx; font-size: 20rpx; color: #fff; margin-right: 12rpx;
		&.start { background-color: #34C759; } &.end { background-color: #FF9500; }
	}
	.point-text { font-size: 24rpx; color: #000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180rpx; }
	.route-arrow { width: 40rpx; height: 4rpx; background-color: #E5E5EA; margin: 0 16rpx; position: relative;
		&::after { content: ''; position: absolute; right: -8rpx; top: -6rpx; width: 0; height: 0; border-left: 12rpx solid #E5E5EA; border-top: 8rpx solid transparent; border-bottom: 8rpx solid transparent; }
	}
	.card-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16rpx; border-top: 0.5rpx solid #E5E5EA; }
	.price-box { display: flex; align-items: baseline; }
	.price-symbol { font-size: 26rpx; color: #FF9500; font-weight: 500; }
	.price-value { font-size: 36rpx; color: #FF9500; font-weight: 700; }
	.action-area { display: flex; align-items: center; gap: 16rpx; }
	.time-info { display: flex; align-items: center; }
	.publish-time { font-size: 24rpx; color: #8E8E93; }
	.action-btns { display: flex; gap: 12rpx; }
	.action-btn { padding: 12rpx 24rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500;
		&.primary { background-color: #007AFF; color: #fff; }
		&.success { background-color: #34C759; color: #fff; }
		&.warning { background-color: #fff; color: #FF9500; border: 1rpx solid #FF9500; }
	}
</style>
