<template>
	<view class="page">
		<!-- 身份条 -->
		<view class="identity" @click="goCenter">
			<view class="identity-left">
				<text class="badge">骑手</text>
				<text class="identity-text">{{ statusText }}</text>
			</view>
			<text class="identity-arrow">骑手中心 ›</text>
		</view>

		<!-- 未认证提示 -->
		<view class="notice" v-if="riderStatus !== 2" @click="goApply">
			<text class="notice-text">{{ riderStatus === 1 ? '申请审核中，通过后即可抢单' : '你还不是骑手，点这里申请' }}</text>
			<text class="notice-arrow">›</text>
		</view>

		<!-- 两个 tab -->
		<view class="tabs">
			<view class="tab" :class="{ active: tab === 'hall' }" @click="switchTab('hall')">抢单大厅</view>
			<view class="tab" :class="{ active: tab === 'jobs' }" @click="switchTab('jobs')">我的任务</view>
		</view>

		<!-- 大厅 -->
		<view v-if="tab === 'hall'" class="list">
			<view class="card order" v-for="item in hall" :key="item._id" @click="goDetail(item._id)">
				<view class="between">
					<text class="tag" :class="'tag-' + item.type">{{ item.typeText }}</text>
					<view class="right">
						<text class="price">¥{{ item.money }}</text>
						<text class="muted small">可赚 ¥{{ item.income || 0 }}</text>
					</view>
				</view>
				<view class="title">{{ item.title }}</view>
				<view class="route">
					<view class="route-line"><text class="dot start">起</text><text class="route-text">{{ item.originName }}</text></view>
					<view class="route-line"><text class="dot end">终</text><text class="route-text">{{ item.destName }}</text></view>
				</view>
				<view class="between foot">
					<text class="muted small">{{ item.timeOption || '尽快送达' }}</text>
					<view class="btn btn-primary btn-sm" @click.stop="grab(item._id)">抢单</view>
				</view>
			</view>
			<view class="empty" v-if="hall.length === 0"><text>暂时没有可接的任务</text></view>
		</view>

		<!-- 我的任务 -->
		<view v-if="tab === 'jobs'" class="list">
			<view class="card order" v-for="item in jobs" :key="item._id" @click="goDetail(item._id)">
				<view class="between">
					<text class="tag" :class="'tag-' + item.type">{{ item.typeText }}</text>
					<text class="status-badge" :class="'status-' + item.status">{{ item.statusText }}</text>
				</view>
				<view class="title">{{ item.title }}</view>
				<view class="route">
					<view class="route-line"><text class="dot start">起</text><text class="route-text">{{ item.originName }}</text></view>
					<view class="route-line"><text class="dot end">终</text><text class="route-text">{{ item.destName }}</text></view>
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
						<view class="btn btn-ghost btn-sm" v-if="item.status === 2 && item.delivered_time" @click.stop="goDetail(item._id)">等确认</view>
					</view>
				</view>
			</view>
			<view class="empty" v-if="jobs.length === 0"><text>还没有接过任务</text></view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() {
			return { tab: 'hall', loading: false }
		},
		computed: {
			...mapGetters('rider', ['hallList', 'jobList', 'riderStatus']),
			hall() { return this.hallList },
			jobs() { return this.jobList },
			statusText() {
				return { 0: '未认证', 1: '审核中', 2: '已认证', 3: '审核未通过' }[this.riderStatus] || '未认证'
			}
		},
		onShow() {
			this.loadProfile()
			this.load()
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions('rider', ['fetchProfile', 'fetchHall', 'fetchJobs', 'grabTask', 'markPicked', 'markDelivered', 'abandonTask']),
			loadProfile() { this.fetchProfile().catch(() => {}) },
			async load() {
				this.loading = true
				try {
					if (this.tab === 'hall') await this.fetchHall({ pageSize: 30 })
					else await this.fetchJobs({})
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			switchTab(t) {
				this.tab = t
				this.load()
			},
			goCenter() { uni.navigateTo({ url: '/pages/rider/center' }) },
			goApply() { uni.navigateTo({ url: '/pages/rider/apply' }) },
			goDetail(id) { uni.navigateTo({ url: '/pages/rider/detail?id=' + id }) },
			async grab(id) {
				if (this.riderStatus !== 2) { this.goApply(); return }
				uni.showModal({
					title: '确认抢单',
					content: '抢单后请尽快取件并按时送达。',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.grabTask(id)
							uni.showToast({ title: '抢单成功', icon: 'success' })
							this.tab = 'jobs'
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message || '抢单失败', icon: 'none' })
							this.load()
						}
					}
				})
			},
			async picked(id) {
				try { await this.markPicked(id); uni.showToast({ title: '已取件', icon: 'success' }); this.load() }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			},
			async delivered(id) {
				uni.showModal({
					title: '确认送达',
					content: '确认已经送到并交给用户？',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try { await this.markDelivered(id); uni.showToast({ title: '已送达', icon: 'success' }); this.load() }
						catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
					}
				})
			},
			async abandon(id) {
				uni.showModal({
					title: '放弃任务',
					content: '放弃后订单回到大厅。',
					confirmColor: '#FF3B30',
					success: async (r) => {
						if (!r.confirm) return
						try { await this.abandonTask({ taskId: id, reason: '骑手放弃' }); uni.showToast({ title: '已放弃', icon: 'none' }); this.load() }
						catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.page { padding-bottom: 40rpx; }

	.identity {
		display: flex; align-items: center; justify-content: space-between;
		padding: 24rpx 28rpx; background: #fff;
	}

	.identity-left { display: flex; align-items: center; }

	.badge {
		background: #007aff; color: #fff; font-size: 22rpx; font-weight: 700;
		padding: 6rpx 16rpx; border-radius: 10rpx; margin-right: 16rpx;
	}

	.identity-text { font-size: 28rpx; color: #1c1c1e; }
	.identity-arrow { font-size: 24rpx; color: #007aff; }

	.notice {
		display: flex; align-items: center; justify-content: space-between;
		background: #fff7e6; border: 1rpx solid #ffe0a3; color: #ad6800;
		padding: 20rpx 24rpx; border-radius: 16rpx; margin: 16rpx 24rpx 0; font-size: 26rpx;
	}

	.tabs { display: flex; gap: 14rpx; padding: 20rpx 24rpx 0; }

	.tab {
		flex: 1; text-align: center; padding: 16rpx 0; border-radius: 16rpx;
		font-size: 27rpx; background: #fff; color: #6e6e73;
		&.active { background: #007aff; color: #fff; font-weight: 600; }
	}

	.list { padding: 24rpx; }
	.right { display: flex; flex-direction: column; align-items: flex-end; }
	.title { margin-top: 16rpx; font-size: 30rpx; font-weight: 600; }

	.route { margin-top: 16rpx; background: #f7f8fa; border-radius: 16rpx; padding: 14rpx 18rpx; }
	.route-line { display: flex; align-items: center; padding: 6rpx 0; }

	.dot {
		width: 34rpx; height: 34rpx; border-radius: 50%; color: #fff; font-size: 20rpx;
		display: flex; align-items: center; justify-content: center; margin-right: 14rpx;
		&.start { background: #34c759; }
		&.end { background: #ff3b30; }
	}

	.route-text { font-size: 26rpx; color: #3a3a3c; }
	.foot { margin-top: 20rpx; }
	.actions { display: flex; gap: 12rpx; }
	.status-badge { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 8rpx; }
</style>
