<template>
	<view class="page" v-if="task">
		<view class="head">
			<view class="between">
				<text class="tag" :class="'tag-' + task.type">{{ task.typeText }}</text>
				<text class="status-badge" :class="'status-' + task.status">{{ task.statusText }}</text>
			</view>
			<view class="title">{{ task.title }}</view>
			<view class="money">
				<text class="price">¥{{ task.money }}</text>
				<text class="income">可赚 ¥{{ task.income || 0 }}</text>
			</view>
		</view>

		<view class="card" v-if="task.description">
			<view class="card-title">任务说明</view>
			<text class="text">{{ task.description }}</text>
		</view>

		<view class="card">
			<view class="card-title">取送路线</view>
			<view class="route-line"><text class="dot start">起</text><text class="route-text">{{ task.origin && task.origin.name }}</text></view>
			<view class="route-line"><text class="dot end">终</text><text class="route-text">{{ task.destination && task.destination.name }}</text></view>
			<view class="route-sub" v-if="task.destination && task.destination.detail">{{ task.destination.detail }}</view>
		</view>

		<view class="card">
			<view class="card-title">任务明细</view>
			<view class="kv"><text class="k">物品类型</text><text class="v">{{ task.item_type || '—' }}</text></view>
			<view class="kv"><text class="k">物品大小</text><text class="v">{{ task.item_size || '—' }}</text></view>
			<view class="kv"><text class="k">预估重量</text><text class="v">{{ task.item_weight || '—' }}</text></view>
			<view class="kv"><text class="k">时间要求</text><text class="v">{{ task.time_option || '尽快' }}</text></view>
			<view class="kv"><text class="k">备注</text><text class="v">{{ task.remark || '无' }}</text></view>
		</view>

		<view class="card">
			<view class="card-title">联系用户</view>
			<block v-if="task.contact">
				<view class="kv"><text class="k">手机号</text><text class="v">{{ task.contact.mobile_masked || '—' }}</text></view>
				<view class="kv" v-if="task.contact.wechat_id"><text class="k">微信号</text><text class="v">{{ task.contact.wechat_id }}</text></view>
				<view class="copy-btn" v-if="task.contact.wechat_id" @click="copyWechat">复制微信号</view>
			</block>
			<text class="muted small" v-else>接单后才能看到联系方式</text>
		</view>

		<view class="actions">
			<view class="btn btn-primary" v-if="task.status === 1" @click="grab">抢单</view>
			<view class="btn btn-primary" v-if="task.status === 2 && !task.picked_time" @click="picked">已取件</view>
			<view class="btn btn-primary" v-if="task.status === 2 && task.picked_time && !task.delivered_time" @click="delivered">已送达</view>
			<view class="btn btn-ghost" v-if="task.status >= 3" @click="back">返回</view>
		</view>
	</view>

	<view class="empty" v-else><text>加载中...</text></view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() { return { id: '' } },
		computed: {
			...mapGetters('rider', ['detail']),
			task() { return this.detail }
		},
		onLoad(q) { this.id = q.id },
		onShow() { if (this.id) this.load() },
		methods: {
			...mapActions('rider', ['fetchDetail', 'grabTask', 'markPicked', 'markDelivered']),
			async load() {
				try { await this.fetchDetail(this.id) }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			},
			back() { uni.navigateBack() },
			copyWechat() { uni.setClipboardData({ data: this.task.contact.wechat_id }) },
			async grab() {
				try { await this.grabTask(this.id); uni.showToast({ title: '抢单成功', icon: 'success' }); this.load() }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			},
			async picked() {
				try { await this.markPicked(this.id); uni.showToast({ title: '已取件', icon: 'success' }); this.load() }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			},
			async delivered() {
				try { await this.markDelivered(this.id); uni.showToast({ title: '已送达', icon: 'success' }); this.load() }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			}
		}
	}
</script>

<style lang="scss">
	.page { padding: 24rpx 24rpx 160rpx; }

	.head {
		background: linear-gradient(150deg, #007aff 0%, #4aa8ff 100%);
		border-radius: 26rpx; padding: 32rpx; color: #fff; margin-bottom: 20rpx;
	}

	.head .tag, .head .status-badge { background: rgba(255, 255, 255, 0.25); color: #fff; }
	.title { margin-top: 18rpx; font-size: 36rpx; font-weight: 700; }
	.money { margin-top: 16rpx; display: flex; align-items: baseline; gap: 20rpx; }
	.head .price, .head .income { color: #fff; }
	.income { font-size: 26rpx; opacity: 0.9; }

	.card { background: #fff; border-radius: 24rpx; padding: 28rpx; margin-bottom: 20rpx; }
	.card-title { font-size: 28rpx; font-weight: 700; margin-bottom: 16rpx; }
	.text { font-size: 28rpx; line-height: 1.65; color: #3a3a3c; }

	.route-line { display: flex; align-items: center; padding: 10rpx 0; }

	.dot {
		width: 40rpx; height: 40rpx; border-radius: 50%; color: #fff; font-size: 22rpx;
		display: flex; align-items: center; justify-content: center; margin-right: 16rpx;
		&.start { background: #34c759; }
		&.end { background: #ff3b30; }
	}

	.route-text { font-size: 28rpx; color: #3a3a3c; }
	.route-sub { margin-top: 8rpx; font-size: 24rpx; color: #8e8e93; }

	.kv { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 27rpx; }
	.k { color: #8e8e93; }
	.v { color: #1c1c1e; text-align: right; flex: 1; margin-left: 24rpx; }

	.copy-btn {
		margin-top: 16rpx; text-align: center; height: 68rpx; line-height: 68rpx;
		border-radius: 16rpx; font-size: 26rpx; color: #007aff; background: rgba(0, 122, 255, 0.08);
	}

	.actions {
		position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 16rpx;
		padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
		background: rgba(255, 255, 255, 0.96); box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.06);
		.btn { flex: 1; height: 80rpx; line-height: 80rpx; font-size: 28rpx; }
	}
</style>
