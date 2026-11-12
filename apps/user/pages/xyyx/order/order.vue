<template>
	<view class="page-container">
		<view class="page-head">
			<view class="head-row">
				<text class="head-title">我的订单</text>
				<view class="head-actions">
					<text class="cleanup-link" v-if="unpaidCount > 0" @click="cleanupUnpaid">清理未支付 {{ unpaidCount }}</text>
					<text class="refresh-link" @click="refreshList">刷新</text>
				</view>
			</view>
			<view class="search-box" @click="goToSearch">
				<text class="search-icon">⌕</text>
				<text class="search-placeholder">搜索订单</text>
			</view>
		</view>

		<view class="filter-card">
			<view class="role-tabs">
				<view class="role-tab" :class="{ active: currentRole === 'all' }" @click="changeRole('all')">全部</view>
				<view class="role-tab" :class="{ active: currentRole === 'publisher' }" @click="changeRole('publisher')">我发布的</view>
				<view class="role-tab" :class="{ active: currentRole === 'runner' }" @click="changeRole('runner')">我接的单</view>
			</view>
			<scroll-view class="status-tabs" scroll-x :show-scrollbar="false">
				<view class="status-tab" :class="{ active: currentStatus === 'all' }" @click="changeStatus('all')">
					<text>全部</text>
					<text class="count" v-if="statusCounts.all > 0">{{ statusCounts.all }}</text>
				</view>
				<view class="status-tab" :class="{ active: currentStatus === 'pending' }" @click="changeStatus('pending')">
					<text>待接单</text>
					<text class="count" v-if="statusCounts.pending > 0">{{ statusCounts.pending }}</text>
				</view>
				<view class="status-tab" :class="{ active: currentStatus === 'progress' }" @click="changeStatus('progress')">
					<text>进行中</text>
					<text class="count" v-if="statusCounts.progress > 0">{{ statusCounts.progress }}</text>
				</view>
				<view class="status-tab" :class="{ active: currentStatus === 'completed' }" @click="changeStatus('completed')">
					<text>已完成</text>
					<text class="count" v-if="statusCounts.completed > 0">{{ statusCounts.completed }}</text>
				</view>
			</scroll-view>
		</view>

		<view class="order-list">
			<view class="empty-tip" v-if="orderList.length === 0 && !loading">
				<view class="empty-doc">
					<view class="empty-doc-line w60"></view>
					<view class="empty-doc-line w80"></view>
					<view class="empty-doc-line w40"></view>
				</view>
				<text class="empty-text">{{ emptyText }}</text>
				<text class="empty-sub">发一单试试，或者去首页看看同学的订单</text>
			</view>
			<view class="loading-tip" v-else-if="loading">
				<text>加载中…</text>
			</view>
			<order-list-item v-else :listData="orderList" @refresh="refreshList"></order-list-item>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import OrderListItem from '../components/order-list-item.vue'

	export default {
		components: { OrderListItem },
		computed: {
			...mapGetters(['getMyTasks']),
			filteredTasks() {
				let tasks = this.getMyTasks || []
				if (this.currentRole === 'publisher') {
					tasks = tasks.filter((t) => t.role === 'publisher')
				} else if (this.currentRole === 'runner') {
					tasks = tasks.filter((t) => t.role === 'runner')
				}
				return tasks
			},
			statusCounts() {
				const tasks = this.filteredTasks
				return {
					all: tasks.length,
					pending: tasks.filter((t) => t.status === 1).length,
					progress: tasks.filter((t) => t.status === 2).length,
					completed: tasks.filter((t) => t.status === 3).length
				}
			},
			unpaidCount() {
				return (this.getMyTasks || []).filter(
					(t) => t.role === 'publisher' && t.pay_status === 'unpaid' && t.status === 1
				).length
			},
			orderList() {
				let list = this.filteredTasks.map((task) => ({
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
					createTime: task.create_time,
					// 钱相关：改价待补差价 / 退款进度，列表上要直接看得到
					needPay: task.needPay,
					due: task.due,
					refund: task.refund,
					refundStatus: task.refundStatus,
					refundStatusText: task.refundStatusText,
					refundFailReason: task.refundFailReason,
					refundFee: task.refundFee,
					payStatus: task.payStatus,
					reviewed: task.reviewed
				}))

				if (this.currentStatus === 'pending') {
					list = list.filter((item) => item.state === 1)
				} else if (this.currentStatus === 'progress') {
					list = list.filter((item) => item.state === 2)
				} else if (this.currentStatus === 'completed') {
					list = list.filter((item) => item.state === 3)
				}

				list.sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
				return list
			},
			emptyText() {
				const map = {
					all: '还没有订单',
					pending: '没有待接单的订单',
					progress: '没有进行中的订单',
					completed: '还没有完成的订单'
				}
				return map[this.currentStatus]
			}
		},
		onShow() {
			const filter = uni.getStorageSync('myOrdersFilter')
			if (filter) {
				this.currentRole = filter
				uni.removeStorageSync('myOrdersFilter')
			}
			this.loadOrders()
		},
		methods: {
			...mapActions(['fetchMyTasks', 'cancelUnpaidTasks']),
			formatTime(timestamp) {
				if (!timestamp) return ''
				const date = new Date(timestamp)
				const p = (n) => String(n).padStart(2, '0')
				return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
			},
			async loadOrders() {
				this.loading = true
				try {
					await this.fetchMyTasks()
				} catch (e) {
					console.error('加载订单失败', e)
				} finally {
					this.loading = false
				}
			},
			cleanupUnpaid() {
				uni.showModal({
					title: '清理未支付订单',
					content: `有 ${this.unpaidCount} 个未支付订单，全部取消？不会产生退款流水。`,
					success: async (res) => {
						if (!res.confirm) return
						try {
							const r = await this.cancelUnpaidTasks()
							uni.showToast({ title: (r && r.msg) || '已清理', icon: 'none' })
							await this.loadOrders()
						} catch (e) {
							uni.showToast({ title: e.message || '清理失败', icon: 'none' })
						}
					}
				})
			},
			goToSearch() {
				uni.navigateTo({ url: '/pages/xyyx/search/search' })
			},
			changeStatus(status) {
				this.currentStatus = status
			},
			changeRole(role) {
				this.currentRole = role
			},
			async refreshList() {
				await this.loadOrders()
				uni.showToast({ title: '刷新成功', icon: 'success', duration: 1000 })
			}
		},
		data() {
			return {
				currentRole: 'all',
				currentStatus: 'all',
				loading: false
			}
		}
	}
</script>

<style lang="scss">
	.page-container {
		background-color: #f2f3f5;
		min-height: 100vh;
		padding-bottom: 160rpx;
	}

	.page-head {
		background: #fff;
		padding: 24rpx 28rpx 20rpx;
	}

	.head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.head-title {
		font-size: 36rpx;
		font-weight: 700;
		color: #1c1f24;
	}

	.head-actions { display: flex; align-items: center; gap: 20rpx; }
	.refresh-link { font-size: 24rpx; color: #1677ff; }
	.cleanup-link { font-size: 23rpx; color: #ff3b30; }

	.search-box {
		display: flex;
		align-items: center;
		height: 70rpx;
		background: #f2f3f5;
		border-radius: 35rpx;
		padding: 0 24rpx;
		margin-top: 20rpx;
	}

	.search-icon { font-size: 30rpx; color: #9aa1ad; margin-right: 10rpx; }
	.search-placeholder { font-size: 26rpx; color: #9aa1ad; }

	.filter-card {
		background: #fff;
		padding: 20rpx 28rpx 22rpx;
		margin-top: 16rpx;
	}

	.role-tabs {
		display: flex;
		gap: 8rpx;
		background: #f2f3f5;
		padding: 6rpx;
		border-radius: 14rpx;
	}

	.role-tab {
		flex: 1;
		text-align: center;
		padding: 14rpx 0;
		border-radius: 10rpx;
		font-size: 26rpx;
		color: #4b5563;

		&.active {
			background: #fff;
			color: #1677ff;
			font-weight: 600;
			box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
		}
	}

	.status-tabs {
		white-space: nowrap;
		margin-top: 18rpx;
		width: 100%;
	}

	.status-tab {
		display: inline-flex;
		align-items: center;
		padding: 10rpx 22rpx;
		margin-right: 12rpx;
		border-radius: 10rpx;
		font-size: 24rpx;
		color: #5c6370;
		background: #f2f3f5;

		&.active { background: #1677ff; color: #fff; font-weight: 600; }

		.count {
			margin-left: 6rpx;
			padding: 0 8rpx;
			border-radius: 10rpx;
			font-size: 19rpx;
			line-height: 30rpx;
			background: rgba(22, 119, 255, 0.12);
			color: #1677ff;
		}

		&.active .count {
			background: rgba(255, 255, 255, 0.26);
			color: #fff;
		}
	}

	.order-list { padding: 20rpx 24rpx 32rpx; }

	.empty-tip {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 110rpx 0 80rpx;
	}

	.empty-doc {
		width: 120rpx;
		height: 140rpx;
		border: 3rpx solid #d8dce3;
		border-radius: 12rpx;
		padding: 26rpx 18rpx;
		box-sizing: border-box;
	}

	.empty-doc-line {
		height: 8rpx;
		border-radius: 4rpx;
		background: #e4e8ee;
		margin-bottom: 14rpx;

		&.w60 { width: 60%; }
		&.w80 { width: 80%; }
		&.w40 { width: 40%; }
	}

	.empty-text {
		margin-top: 26rpx;
		color: #3a4049;
		font-size: 28rpx;
		font-weight: 600;
	}

	.empty-sub {
		margin-top: 10rpx;
		color: #9aa1ad;
		font-size: 23rpx;
	}

	.loading-tip { text-align: center; padding: 100rpx 0; color: #9aa1ad; font-size: 26rpx; }
</style>
