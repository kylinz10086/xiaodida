<template>
	<view class="page-container">
		<u-dropdown class="area" :border-bottom="true">
			<u-dropdown-item v-model="value1" :title="options1[value1].label" :options="options1"></u-dropdown-item>
		</u-dropdown>
		<view class="search-wrap" @click="goToSearch">
			<view class="search-box">
				<text class="search-placeholder">搜索订单...</text>
			</view>
		</view>
		<view class="section-header">
			<view class="section-title">
				<view class="title-text">我的订单</view>
				<image class="refresh-icon" :src="imgRefreshSrc" mode="aspectFit" @click="refreshList"></image>
			</view>
			<view class="role-tabs">
				<view 
					class="role-tab" 
					:class="{'active': currentRole === 'all'}" 
					@click="changeRole('all')">
					<text>全部</text>
				</view>
				<view 
					class="role-tab" 
					:class="{'active': currentRole === 'publisher'}" 
					@click="changeRole('publisher')">
					<text>我发布的</text>
				</view>
				<view 
					class="role-tab" 
					:class="{'active': currentRole === 'runner'}" 
					@click="changeRole('runner')">
					<text>我接的单</text>
				</view>
			</view>
			<view class="status-tabs">
				<view 
					class="status-tab" 
					:class="{'active': currentStatus === 'all'}" 
					@click="changeStatus('all')">
					<text>全部</text>
					<text class="count" v-if="statusCounts.all > 0">{{statusCounts.all}}</text>
				</view>
				<view 
					class="status-tab" 
					:class="{'active': currentStatus === 'pending'}" 
					@click="changeStatus('pending')">
					<text>待接单</text>
					<text class="count" v-if="statusCounts.pending > 0">{{statusCounts.pending}}</text>
				</view>
				<view 
					class="status-tab" 
					:class="{'active': currentStatus === 'progress'}" 
					@click="changeStatus('progress')">
					<text>进行中</text>
					<text class="count" v-if="statusCounts.progress > 0">{{statusCounts.progress}}</text>
				</view>
				<view 
					class="status-tab" 
					:class="{'active': currentStatus === 'completed'}" 
					@click="changeStatus('completed')">
					<text>已完成</text>
					<text class="count" v-if="statusCounts.completed > 0">{{statusCounts.completed}}</text>
				</view>
			</view>
		</view>
		<view class="order-list">
			<view class="empty-tip" v-if="orderList.length === 0 && !loading">
				<image class="empty-icon" src="/static/icon/order.png" mode="aspectFit"></image>
				<text class="empty-text">{{emptyText}}</text>
			</view>
			<view class="loading-tip" v-else-if="loading">
				<text>加载中...</text>
			</view>
			<order-list-item v-else :listData="orderList" @refresh="refreshList"></order-list-item>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex';
	import imgRefresh from '../../../static/icon/refresh.png'
	import OrderListItem from '../components/order-list-item.vue'

	export default {
		components: { OrderListItem },
		computed: {
			...mapGetters(['getMyTasks']),
			filteredTasks() {
				let tasks = this.getMyTasks || [];
				if (this.currentRole === 'publisher') {
					tasks = tasks.filter(t => t.role === 'publisher');
				} else if (this.currentRole === 'runner') {
					tasks = tasks.filter(t => t.role === 'runner');
				}
				return tasks;
			},
			statusCounts() {
				const tasks = this.filteredTasks;
				return {
					all: tasks.length,
					pending: tasks.filter(t => t.status === 1).length,
					progress: tasks.filter(t => t.status === 2).length,
					completed: tasks.filter(t => t.status === 3).length
				};
			},
			orderList() {
				let list = this.filteredTasks.map(task => ({
					id: task._id,
					title: task.title,
					thing: task.title,
					description: task.description,
					money: task.money,
					type: task.type,
					typeText: task.typeText,
					status: task.status,
					state: task.status,
					origin: task.origin,
					destination: task.destination,
					itemSize: task.itemSize,
					timeOption: task.timeOption,
					role: task.role,
					orderType: task.role === 'publisher' ? 'published' : 'accepted',
					runnerId: task.runner_id,
					runnerName: task.runner_name,
					publisherId: task.publisher_id,
					publisherName: task.publisher_name,
					time: this.formatTime(task.create_time),
					createTime: task.create_time
				}));

				if (this.currentStatus === 'pending') {
					list = list.filter(item => item.state === 1);
				} else if (this.currentStatus === 'progress') {
					list = list.filter(item => item.state === 2);
				} else if (this.currentStatus === 'completed') {
					list = list.filter(item => item.state === 3);
				}

				list.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
				return list;
			},
			emptyText() {
				const map = { 'all': '暂无订单', 'pending': '暂无待接单订单', 'progress': '暂无进行中订单', 'completed': '暂无已完成订单' };
				return map[this.currentStatus];
			}
		},
		onShow() {
			const filter = uni.getStorageSync('myOrdersFilter');
			if (filter) {
				this.currentRole = filter;
				uni.removeStorageSync('myOrdersFilter');
			}
			this.loadOrders();
		},
		methods: {
			...mapActions(['fetchMyTasks']),
			formatTime(timestamp) {
				if (!timestamp) return '';
				const date = new Date(timestamp);
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
			},
			async loadOrders() {
				this.loading = true;
				try {
					await this.fetchMyTasks();
				} catch (e) {
					console.error('加载订单失败', e);
				} finally {
					this.loading = false;
				}
			},
			goToSearch() {
				uni.navigateTo({ url: '/pages/xyyx/search/search' });
			},
			changeStatus(status) {
				this.currentStatus = status;
			},
			changeRole(role) {
				this.currentRole = role;
			},
			async refreshList() {
				await this.loadOrders();
				uni.showToast({ title: '刷新成功', icon: 'success', duration: 1000 });
			}
		},
		data() {
			return {
				currentRole: 'all',
				currentStatus: 'all',
				loading: false,
				value1: 0,
				options1: [{ label: '浙江中医药大学', value: 0 }],
				imgRefreshSrc: imgRefresh
			};
		}
	}
</script>

<style lang="scss">
	.page-container {
		background-color: #F2F2F7;
		min-height: 100vh;
	}
	.area>view>view>.u-dropdown__menu__item { background-color: #fff; }
	.search-wrap { background-color: #fff; padding: 16rpx 32rpx; }
	.search-box { display: flex; align-items: center; height: 70rpx; background-color: #f5f7fa; border-radius: 35rpx; padding: 0 24rpx; }
	.search-placeholder { font-size: 28rpx; color: #999; }
	.section-header { padding: 16rpx 32rpx; background-color: #F2F2F7;
		.section-title { display: flex; align-items: center; margin-bottom: 16rpx;
			.title-text { font-size: 34rpx; font-weight: 700; color: #000; }
			.refresh-icon { width: 36rpx; height: 36rpx; margin-left: 16rpx; }
		}
	}
	.role-tabs { display: flex; gap: 12rpx; margin-bottom: 12rpx; }
	.role-tab { padding: 12rpx 24rpx; border-radius: 16rpx; font-size: 26rpx; color: #007AFF; font-weight: 500; background-color: rgba(0, 122, 255, 0.1); flex-shrink: 0;
		&.active { background-color: #007AFF; color: #fff; }
	}
	.status-tabs { display: flex; gap: 12rpx; overflow-x: auto; padding-bottom: 4rpx; }
	.status-tab { display: flex; align-items: center; padding: 12rpx 20rpx; background-color: rgba(0, 122, 255, 0.1); border-radius: 16rpx; font-size: 26rpx; color: #007AFF; font-weight: 500; flex-shrink: 0;
		&.active { background-color: #007AFF; color: #fff; }
		.count { margin-left: 6rpx; padding: 2rpx 10rpx; background-color: #FF3B30; color: #fff; border-radius: 12rpx; font-size: 20rpx; min-width: 28rpx; text-align: center; }
		&.active .count { background-color: rgba(255, 255, 255, 0.3); }
	}
	.order-list { padding: 0 32rpx 32rpx; }
	.empty-tip { display: flex; flex-direction: column; align-items: center; padding: 100rpx 0;
		.empty-icon { width: 120rpx; height: 120rpx; opacity: 0.4; margin-bottom: 24rpx; }
		.empty-text { color: #8E8E93; font-size: 28rpx; }
	}
	.loading-tip { text-align: center; padding: 100rpx 0; color: #8E8E93; font-size: 28rpx; }
</style>
