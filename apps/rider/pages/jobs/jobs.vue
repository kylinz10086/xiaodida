<template>
	<view class="page">
		<view class="tabs">
			<view class="tab" :class="{ active: status === 2 }" @click="switchTab(2)">进行中</view>
			<view class="tab" :class="{ active: status === 3 }" @click="switchTab(3)">已完成</view>
			<view class="tab" :class="{ active: status === 0 }" @click="switchTab(0)">全部</view>
		</view>

		<view class="list">
			<view class="card job" v-for="item in list" :key="item._id" @click="goDetail(item._id)">
				<view class="between">
					<text class="tag" :class="'tag-' + item.type">{{ item.typeText }}</text>
					<text class="status-badge" :class="'status-' + item.status">{{ item.statusText }}</text>
				</view>

				<view class="title">{{ item.title }}</view>

				<view class="route">
					<view class="route-line">
						<text class="dot start">起</text>
						<text class="route-text">{{ item.originName }}</text>
					</view>
					<view class="route-line">
						<text class="dot end">终</text>
						<text class="route-text">{{ item.destName }}</text>
					</view>
				</view>

				<view class="between foot">
					<view>
						<text class="price">¥{{ item.money }}</text>
						<text class="muted small"> 可赚 ¥{{ item.income || 0 }}</text>
					</view>
					<view class="actions">
						<view class="btn btn-danger btn-sm" v-if="item.status === 2 && !item.delivered_time" @click.stop="abandon(item._id)">放弃</view>
						<view class="btn btn-primary btn-sm" v-if="item.status === 2 && !item.picked_time" @click.stop="picked(item._id)">已取件</view>
						<view class="btn btn-primary btn-sm" v-if="item.status === 2 && item.picked_time && !item.delivered_time" @click.stop="delivered(item._id)">已送达</view>
						<view class="btn btn-ghost btn-sm" v-if="item.status === 2 && item.delivered_time" @click.stop="goDetail(item._id)">等待确认</view>
					</view>
				</view>
			</view>

			<view class="empty" v-if="!loading && list.length === 0">
				<text>还没有任务</text>
				<text class="small block">去「抢单」看看有没有顺路的</text>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() {
			return { status: 2, loading: false }
		},
		computed: {
			...mapGetters(['jobList']),
			list() {
				return this.jobList
			}
		},
		onShow() {
			this.load()
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions(['fetchJobs', 'markPicked', 'markDelivered', 'abandonTask']),
			async load() {
				this.loading = true
				try {
					await this.fetchJobs({ status: this.status || undefined })
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			switchTab(s) {
				this.status = s
				this.load()
			},
			goDetail(id) {
				uni.navigateTo({ url: '/pages/detail/detail?id=' + id })
			},
			async picked(id) {
				try {
					await this.markPicked(id)
					uni.showToast({ title: '已取件', icon: 'success' })
					this.load()
				} catch (e) {
					uni.showToast({ title: e.message, icon: 'none' })
				}
			},
			async delivered(id) {
				uni.showModal({
					title: '确认送达',
					content: '确认已经送到并交给用户？',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.markDelivered(id)
							uni.showToast({ title: '已送达', icon: 'success' })
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message, icon: 'none' })
						}
					}
				})
			},
			async abandon(id) {
				uni.showModal({
					title: '放弃任务',
					content: '放弃后订单会回到大厅，频繁放弃会影响信用。',
					confirmColor: '#FF3B30',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.abandonTask({ taskId: id, reason: '骑手放弃' })
							uni.showToast({ title: '已放弃', icon: 'none' })
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message, icon: 'none' })
						}
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.tabs {
		display: flex;
		gap: 14rpx;
		padding: 24rpx 24rpx 0;
	}

	.tab {
		flex: 1;
		text-align: center;
		padding: 16rpx 0;
		border-radius: 16rpx;
		font-size: 27rpx;
		background: #fff;
		color: #6e6e73;

		&.active {
			background: #007aff;
			color: #fff;
			font-weight: 600;
		}
	}

	.list {
		padding: 24rpx;
	}

	.status-badge {
		font-size: 22rpx;
		padding: 4rpx 14rpx;
		border-radius: 8rpx;
	}

	.title {
		margin-top: 16rpx;
		font-size: 30rpx;
		font-weight: 600;
	}

	.route {
		margin-top: 16rpx;
		background: #f7f8fa;
		border-radius: 16rpx;
		padding: 14rpx 18rpx;
	}

	.route-line {
		display: flex;
		align-items: center;
		padding: 6rpx 0;
	}

	.dot {
		width: 34rpx;
		height: 34rpx;
		border-radius: 50%;
		color: #fff;
		font-size: 20rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 14rpx;

		&.start {
			background: #34c759;
		}

		&.end {
			background: #ff3b30;
		}
	}

	.route-text {
		font-size: 26rpx;
		color: #3a3a3c;
	}

	.foot {
		margin-top: 20rpx;
	}

	.actions {
		display: flex;
		gap: 12rpx;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10rpx;
	}

	.block {
		display: block;
	}
</style>
