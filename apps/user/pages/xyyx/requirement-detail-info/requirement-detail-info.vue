<template>
	<view class="requirement-detail-info">
		<view class="detail-header">
			<view class="header-top">
				<view class="type-tag" :class="'type-' + taskData.type">
					{{taskData.typeText || '快递'}}
				</view>
				<view class="status-tag" :class="'status-' + taskData.status">
					{{statusText}}
				</view>
			</view>
			<view class="task-title">{{taskData.title}}</view>
			<view class="price-display">
				<text class="price-symbol">¥</text>
				<text class="price-value">{{taskData.money}}</text>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">详细描述</view>
			<view class="section-content">{{taskData.description || '暂无详细描述'}}</view>
		</view>

		<view class="detail-section" v-if="taskData.itemType || taskData.itemSize || taskData.itemWeight">
			<view class="section-title">物品信息</view>
			<view class="info-tags">
				<view class="info-tag" v-if="taskData.itemType">
					<text class="tag-label">类型</text>
					<text class="tag-value">{{taskData.itemType}}</text>
				</view>
				<view class="info-tag" v-if="taskData.itemSize">
					<text class="tag-label">大小</text>
					<text class="tag-value">{{taskData.itemSize}}</text>
				</view>
				<view class="info-tag" v-if="taskData.itemWeight">
					<text class="tag-label">重量</text>
					<text class="tag-value">{{taskData.itemWeight}}</text>
				</view>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">取件地点</view>
			<view class="route-display">
				<view class="route-point">
					<text class="point-icon start">起</text>
					<view class="point-info">
						<text class="point-label">取件地点</text>
						<text class="point-name">{{taskData.origin ? taskData.origin.name : '未设置'}}</text>
					</view>
				</view>
				<view class="route-line"></view>
				<view class="route-point">
					<text class="point-icon end">终</text>
					<view class="point-info">
						<text class="point-label">送达地点</text>
						<text class="point-name">{{taskData.destination ? taskData.destination.name : '未设置'}}</text>
					</view>
				</view>
			</view>
			<view class="route-map-btn" v-if="taskData.origin && taskData.origin.name && taskData.destination && taskData.destination.name" @click="openRouteMap">
				<text>查看路线规划</text>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">时间要求</view>
			<view class="time-display">
				<view class="time-tag" v-if="taskData.timeOption">{{taskData.timeOption}}</view>
				<view class="time-detail" v-if="taskData.deadline && taskData.timeOption === '指定时间'">{{taskData.deadline}}</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.phoneNumber || taskData.wechatId">
			<view class="section-title">联系方式</view>
			<view class="contact-info">
				<view class="contact-item" v-if="taskData.phoneNumber">
					<text class="contact-label">手机号码</text>
					<text class="contact-value">{{taskData.phoneNumber}}</text>
				</view>
				<view class="contact-item" v-if="taskData.wechatId">
					<text class="contact-label">微信号</text>
					<text class="contact-value">{{taskData.wechatId}}</text>
				</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.images && taskData.images.length > 0">
			<view class="section-title">补充图片</view>
			<view class="picture-display">
				<image v-for="(img, index) in taskData.images" :key="index" :src="img" class="preview-image" mode="aspectFill" @click="previewImage(index)"></image>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.remark">
			<view class="section-title">备注信息</view>
			<view class="section-content">{{taskData.remark}}</view>
		</view>

		<view class="detail-section" v-if="taskData.runner_name && taskData.status >= 2">
			<view class="section-title">跑腿员信息</view>
			<view class="runner-info">
				<view class="runner-item">
					<text class="runner-label">接单人</text>
					<text class="runner-value">{{taskData.runner_name}}</text>
				</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.publisher_name">
			<view class="section-title">发布者信息</view>
			<view class="runner-info">
				<view class="runner-item">
					<text class="runner-label">发布人</text>
					<text class="runner-value">{{taskData.publisher_name}}</text>
				</view>
			</view>
		</view>

		<view class="detail-footer">
			<view class="publish-time">发布时间：{{formatTime(taskData.create_time)}}</view>
		</view>

		<view class="action-section" v-if="optionPageType === 'notcomplete' && taskData.role !== 'publisher'">
			<view class="action-btn cancel" @click="goBack">返回</view>
			<view class="action-btn confirm" @click="pickOrder">接单</view>
		</view>

		<view class="action-section" v-if="optionPageType === 'completed'">
			<view class="action-btn cancel" @click="goBack">返回</view>
		</view>

		<view class="action-section" v-if="optionPageType === 'in-transit'">
			<view class="action-btn complete" @click="handleCompleteOrder" v-if="taskData.role === 'runner'">确认完成</view>
			<view class="action-btn abandon" @click="giveupOrder" v-if="taskData.role === 'runner'">放弃订单</view>
			<view class="action-btn confirm" @click="confirmComplete" v-if="taskData.role === 'publisher'">确认完成</view>
			<view class="action-btn cancel" @click="goBack" v-if="taskData.role === 'publisher'">返回</view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex';

	export default {
		data() {
			return {
				optionPageType: 'completed',
				taskId: null
			};
		},
		computed: {
			...mapGetters(['getTaskById', 'getMyTasks', 'getTaskList']),
			taskData() {
				if (!this.taskId) return {};
				return this.getTaskById(this.taskId) || {};
			},
			statusText() {
				const map = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消' };
				return map[this.taskData.status] || '待接单';
			}
		},
		onLoad(option) {
			this.optionPageType = option.type || 'completed';
			this.taskId = uni.getStorageSync('currentViewTaskId');
			if (this.taskId) uni.removeStorageSync('currentViewTaskId');
		},
		methods: {
			...mapActions(['acceptTask', 'completeTask', 'confirmTask', 'abandonTask']),
			formatTime(timestamp) {
				if (!timestamp) return '';
				const date = new Date(timestamp);
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
			},
			goBack() {
				uni.navigateBack({ delta: 1 });
			},
			openRouteMap() {
				if (this.taskData.origin && this.taskData.destination) {
					uni.navigateTo({
						url: '/pages/xyyx/route-detail/route-detail?sposition=' + this.taskData.origin.position + '&eposition=' + this.taskData.destination.position
					});
				}
			},
			pickOrder() {
				if (!this.taskId) return;
				this.acceptTask({ taskId: this.taskId }).then(() => {
					uni.showToast({ duration: 1500, icon: 'success', title: '接单成功！', mask: true });
					setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
				}).catch(err => {
					uni.showToast({ title: err.message || '接单失败', icon: 'none', duration: 2000 });
				});
			},
			handleCompleteOrder() {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？',
					success: (res) => {
						if (res.confirm) {
							this.completeTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'success', title: '订单已完成！', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			confirmComplete() {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？确认后订单将标记为已完成。',
					success: (res) => {
						if (res.confirm) {
							this.confirmTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'success', title: '订单已确认完成！', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			giveupOrder() {
				uni.showModal({
					title: '确认放弃',
					content: '放弃订单将影响您的信用评分，确定要放弃吗？',
					confirmColor: '#ff6b35',
					success: (res) => {
						if (res.confirm) {
							this.abandonTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'none', title: '已放弃订单', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/index/index' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			previewImage(index) {
				uni.previewImage({ urls: this.taskData.images, current: index });
			}
		}
	}
</script>

<style lang="scss">
	.requirement-detail-info { background-color: #F2F2F7; min-height: 100vh; padding-bottom: 140rpx; }
	.detail-header { background-color: #fff; padding: 32rpx; }
	.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
	.type-tag { padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500; background-color: rgba(0, 122, 255, 0.1); color: #007AFF; }
	.status-tag { padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500; background-color: rgba(52, 199, 89, 0.1); color: #34C759; }
	.task-title { font-size: 36rpx; font-weight: 700; margin-bottom: 16rpx; color: #000; }
	.price-display { display: flex; align-items: baseline; }
	.price-symbol { font-size: 28rpx; font-weight: 600; color: #FF9500; }
	.price-value { font-size: 44rpx; font-weight: 700; color: #FF9500; }
	.detail-section { background-color: #fff; margin: 24rpx 32rpx; border-radius: 24rpx; padding: 24rpx 32rpx; }
	.section-title { font-size: 26rpx; font-weight: 600; color: #8E8E93; margin-bottom: 16rpx; text-transform: uppercase; letter-spacing: 1rpx; }
	.section-content { font-size: 28rpx; color: #000; line-height: 1.6; }
	.info-tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
	.info-tag { display: flex; flex-direction: column; padding: 16rpx 24rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.tag-label { font-size: 22rpx; color: #8E8E93; margin-bottom: 8rpx; }
	.tag-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.route-display { background-color: #F2F2F7; border-radius: 16rpx; padding: 20rpx; }
	.route-point { display: flex; align-items: flex-start; }
	.point-icon { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 20rpx; color: #fff; font-size: 20rpx; margin-right: 16rpx; flex-shrink: 0;
		&.start { background-color: #34C759; } &.end { background-color: #FF9500; }
	}
	.point-info { flex: 1; }
	.point-label { font-size: 24rpx; color: #8E8E93; display: block; margin-bottom: 8rpx; }
	.point-name { font-size: 28rpx; color: #000; font-weight: 500; }
	.route-line { width: 4rpx; height: 40rpx; background-color: #E5E5EA; margin-left: 18rpx; margin-top: 8rpx; margin-bottom: 8rpx; }
	.route-map-btn { margin-top: 16rpx; padding: 20rpx; text-align: center; background-color: rgba(0, 122, 255, 0.1); border-radius: 16rpx; color: #007AFF; font-size: 28rpx; font-weight: 500; }
	.time-display { display: flex; align-items: center; gap: 12rpx; }
	.time-tag { padding: 12rpx 24rpx; background-color: rgba(0, 122, 255, 0.1); color: #007AFF; border-radius: 16rpx; font-size: 28rpx; font-weight: 500; }
	.time-detail { font-size: 28rpx; color: #000; }
	.contact-info { display: flex; flex-direction: column; gap: 12rpx; }
	.contact-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.contact-label { font-size: 26rpx; color: #8E8E93; }
	.contact-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.picture-display { display: flex; flex-wrap: wrap; gap: 12rpx; }
	.preview-image { width: 200rpx; height: 200rpx; border-radius: 16rpx; }
	.runner-info { display: flex; flex-direction: column; gap: 12rpx; }
	.runner-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.runner-label { font-size: 26rpx; color: #8E8E93; }
	.runner-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.detail-footer { padding: 20rpx 32rpx; text-align: center; }
	.publish-time { font-size: 24rpx; color: #8E8E93; }
	.action-section { position: fixed; bottom: 0; left: 0; right: 0; background-color: #F2F2F7; padding: 16rpx 32rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); display: flex; gap: 16rpx; }
	.action-btn { flex: 1; height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 16rpx; font-size: 32rpx; font-weight: 600; }
	.action-btn.cancel { background-color: #fff; color: #007AFF; }
	.action-btn.confirm { background-color: #007AFF; color: #fff; }
	.action-btn.complete { background-color: #34C759; color: #fff; }
	.action-btn.abandon { background-color: #fff; color: #FF3B30; }
</style>
