<template>
	<view class="page" v-if="task">
		<!-- 头部：状态 + 金额 -->
		<view class="head">
			<view class="r-between">
				<text class="tag" :class="'tag-' + task.type">{{ task.typeText }}</text>
				<text class="status-badge" :class="'status-' + task.status">{{ task.statusText }}</text>
			</view>
			<view class="head-title">{{ task.title }}</view>
			<view class="head-money">
				<text class="head-price"><text class="unit">¥</text>{{ task.money }}</text>
				<!-- 结算后才显示实收；没结算不显示「可赚」，避免和抽佣后的实际到账不一致 -->
				<text class="head-income" v-if="task.status === 3 && task.incomeSettled">已入账 ¥{{ task.income }}</text>
			</view>
			<view class="head-meta" v-if="task.stepText">
				<text>{{ task.stepText }}</text>
				<text v-if="task.createText"> · 发布于 {{ task.createText }}</text>
			</view>
		</view>

		<!-- 地图 + 导航 -->
		<view class="card map-card" v-if="mapData">
			<view class="r-between">
				<text class="card-title mini">路线地图</text>
				<text class="map-hint">{{ routeDistanceText }}</text>
			</view>
			<map class="map" :latitude="mapData.latitude" :longitude="mapData.longitude" :markers="mapData.markers"
				:polyline="mapData.polyline" :scale="mapData.scale" show-location></map>
		</view>

		<!-- 取送路线 + 一键导航 -->
		<view class="card">
			<view class="card-title">取送路线</view>

			<view class="place" @click="nav(task.origin, '取件点')">
				<text class="dot start">起</text>
				<view class="place-body">
					<text class="place-name">{{ (task.origin && task.origin.name) || '待确认' }}</text>
					<text class="place-detail" v-if="task.origin && task.origin.detail">{{ task.origin.detail }}</text>
					<text class="place-detail muted" v-else>{{ task.mine ? '（该地点未填详细地址）' : '接单后显示详细地址' }}</text>
				</view>
				<text class="nav-btn" v-if="hasCoord(task.origin)">导航</text>
			</view>

			<view class="place" @click="nav(task.destination, '送达点')">
				<text class="dot end">终</text>
				<view class="place-body">
					<text class="place-name">{{ (task.destination && task.destination.name) || '待确认' }}</text>
					<text class="place-detail" v-if="task.destination && task.destination.detail">{{ task.destination.detail }}</text>
					<text class="place-detail muted" v-else>{{ task.mine ? '（该地点未填详细地址）' : '接单后显示详细地址' }}</text>
				</view>
				<text class="nav-btn" v-if="hasCoord(task.destination)">导航</text>
			</view>
		</view>

		<!-- 联系用户：接单后才给完整号码 -->
		<view class="card">
			<view class="card-title">联系用户</view>
			<block v-if="task.contact">
				<view class="kv"><text class="k">手机号</text><text class="v r-mono">{{ task.contact.mobile || task.contact.mobile_masked || '—' }}</text></view>
				<view class="kv" v-if="task.contact.wechat_id">
					<text class="k">微信号</text><text class="v">{{ task.contact.wechat_id }}</text>
				</view>
				<view class="contact-actions">
					<view class="btn btn-primary btn-sm" @click="call">拨打电话</view>
					<view class="btn btn-ghost btn-sm" @click="goChat">
						发消息<text class="chat-dot" v-if="chatUnread > 0">{{ chatUnread > 99 ? '99+' : chatUnread }}</text>
					</view>
					<view class="btn btn-ghost btn-sm" v-if="task.contact.wechat_id" @click="copyWechat">复制微信号</view>
				</view>
			</block>
			<text class="muted r-small" v-else>接单后才能看到联系方式</text>
		</view>

		<!-- 任务说明 -->
		<view class="card" v-if="task.description">
			<view class="card-title">任务说明</view>
			<text class="text">{{ task.description }}</text>
		</view>

		<!-- 明细 -->
		<view class="card">
			<view class="card-title">任务明细</view>
			<view class="kv"><text class="k">物品类型</text><text class="v">{{ task.item_type || '—' }}</text></view>
			<view class="kv"><text class="k">物品大小</text><text class="v">{{ task.item_size || '—' }}</text></view>
			<view class="kv"><text class="k">预估重量</text><text class="v">{{ task.item_weight || '—' }}</text></view>
			<view class="kv"><text class="k">时间要求</text><text class="v">{{ task.timeText || '尽快' }}</text></view>
			<view class="kv"><text class="k">备注</text><text class="v">{{ task.remark || '无' }}</text></view>
			<view class="kv"><text class="k">订单编号</text><text class="v r-mono">{{ shortId }}</text></view>
		</view>

		<!-- 进度时间线 -->
		<view class="card" v-if="task.status !== 1">
			<view class="card-title">订单进度</view>
			<view class="timeline">
				<view class="tl-item" :class="{ on: !!task.accept_time }">
					<text class="tl-dot"></text>
					<view class="tl-body">
						<text class="tl-title">已接单</text>
						<text class="tl-time">{{ task.acceptText || '—' }}</text>
					</view>
				</view>
				<view class="tl-item" :class="{ on: !!task.picked_time }">
					<text class="tl-dot"></text>
					<view class="tl-body">
						<text class="tl-title">已取件</text>
						<text class="tl-time">{{ task.pickedText || '待取件' }}</text>
					</view>
				</view>
				<view class="tl-item" :class="{ on: !!task.delivered_time }">
					<text class="tl-dot"></text>
					<view class="tl-body">
						<text class="tl-title">已送达</text>
						<text class="tl-time">{{ task.deliveredText || '待送达' }}</text>
					</view>
				</view>
				<view class="tl-item" :class="{ on: task.status === 3 }">
					<text class="tl-dot"></text>
					<view class="tl-body">
						<text class="tl-title">已完成</text>
						<text class="tl-time">{{ task.status === 3 ? (task.completeText || '已结算') : '送达后自动结算' }}</text>
					</view>
				</view>
			</view>
		</view>

		<view class="safe-bottom"></view>

		<!-- 底部动作条 -->
		<view class="actions">
			<block v-if="task.status === 1">
				<view class="btn btn-primary btn-block" :class="{ disabled: busyId === task._id }" @click="grab">
					{{ busyId === task._id ? '抢单中…' : '抢单' }}
				</view>
			</block>

			<block v-else-if="task.status === 2">
				<view class="btn btn-danger" style="flex: 0 0 200rpx" v-if="task.step < 3"
					:class="{ disabled: busyId === task._id }" @click="abandon">放弃</view>
				<view class="btn btn-primary" v-if="task.step < 2" :class="{ disabled: busyId === task._id }" @click="picked">
					{{ busyId === task._id ? '处理中…' : '我已取件' }}
				</view>
				<view class="btn btn-success" v-else-if="task.step === 2" :class="{ disabled: busyId === task._id }" @click="delivered">
					{{ busyId === task._id ? '提交中…' : '我已送达' }}
				</view>
				<view class="btn btn-grey" v-else>已送达 · 等用户确认</view>
			</block>

			<block v-else-if="task.status === 3">
				<view class="btn btn-ghost" @click="goWallet">查看收入</view>
				<view class="btn btn-primary" @click="back">返回列表</view>
			</block>

			<block v-else>
				<view class="btn btn-ghost btn-block" @click="back">返回</view>
			</block>
		</view>
	</view>

	<view class="empty" v-else>
		<text class="empty-emoji">⏳</text>
		<text>加载中…</text>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { buildMap, navigateTo, callPhone, copyText, distanceMeters, formatDistance, formatWalk, getLocation, errText } from '@/common/rider-util.js'
	import { askProofImage } from '@/common/image.js'

	export default {
		data() {
			return { id: '', loading: false, myLoc: null, chatUnread: 0 }
		},
		computed: {
			...mapGetters('rider', ['detail', 'busyId']),
			task() { return this.detail },

			mapData() {
				if (!this.task) return null
				// 只有拿到坐标才画地图；用户下单没选坐标时这里返回 null，页面自动隐藏地图卡
				return buildMap(this.task, this.myLoc)
			},

			/** 起点到终点的直线距离（不是路径距离，标题里写清楚） */
			routeDistanceText() {
				if (!this.task) return ''
				const o = this.task.origin || {}
				const d = this.task.destination || {}
				const m = distanceMeters(o.latitude, o.longitude, d.latitude, d.longitude)
				if (m < 0) return ''
				return `直线约 ${formatDistance(m)} · 步行约 ${formatWalk(m)}`
			},

			shortId() {
				const id = (this.task && this.task._id) || ''
				return id ? id.slice(-8).toUpperCase() : '—'
			}
		},
		onLoad(q) {
			this.id = q && q.id ? q.id : ''
			if (!this.id) {
				uni.showToast({ title: '缺少订单号', icon: 'none' })
			}
		},
		onShow() {
			if (this.id) {
				this.load()
				this.loadChatUnread()
			}
			// 地图上顺手标出「我」的位置，方便判断先取还是先送
			getLocation().then((loc) => { this.myLoc = loc })
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions('rider', ['fetchDetail', 'grabTask', 'markPicked', 'markDelivered', 'abandonTask']),

			async loadChatUnread() {
				try {
					this.chatUnread = await this.$store.dispatch('rider/chatUnread', this.id)
				} catch (e) {
					this.chatUnread = 0
				}
			},
			goChat() {
				uni.navigateTo({ url: '/pages/chat/chat?taskId=' + this.id + '&role=rider' })
			},

			async load() {
				this.loading = true
				try {
					await this.fetchDetail(this.id)
				} catch (e) {
					uni.showToast({ title: errText(e, '加载失败'), icon: 'none' })
				} finally {
					this.loading = false
				}
			},

			back() { uni.navigateBack() },
			goWallet() { uni.navigateTo({ url: '/pages/rider/wallet' }) },

			hasCoord(place) {
				return !!(place && place.latitude && place.longitude)
			},

			nav(place, label) {
				navigateTo(place, label)
			},

			call() {
				if (!this.task || !this.task.contact) return
				callPhone(this.task.contact.mobile, '用户手机号：')
			},

			copyWechat() {
				copyText(this.task.contact.wechat_id, '微信号已复制')
			},

			grab() {
				if (this.busyId) return
				uni.showModal({
					title: '确认抢单',
					content: '抢单后请尽快取件并按时送达。',
					confirmText: '抢单',
					confirmColor: '#007AFF',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.grabTask(this.id)
							uni.showToast({ title: '抢单成功', icon: 'success' })
							await this.load()
						} catch (e) {
							uni.showToast({ title: errText(e, '抢单失败'), icon: 'none' })
							this.load()
						}
					}
				})
			},

			async picked() {
				if (this.busyId) return
				const shot = await askProofImage({ role: 'rider' })
				if (shot === null) return
				const proof = shot ? shot.fileID : ''
				const thumb = shot ? shot.thumb : ''
				try {
					await this.markPicked({ taskId: this.id, proof, thumb })
					uni.showToast({ title: '已取件，请尽快送达', icon: 'none' })
					await this.load()
				} catch (e) {
					uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
					this.load()
				}
			},

			delivered() {
				if (this.busyId) return
				uni.showModal({
					title: '确认送达',
					content: '确认已把物品交到用户手上？确认后订单完成，扣除平台服务费后的收入会立刻进入你的钱包。',
					confirmText: '已送达',
					confirmColor: '#34C759',
					success: async (r) => {
						if (!r.confirm) return
						const shot = await askProofImage({ role: 'rider' })
						if (shot === null) return
						const proof = shot ? shot.fileID : ''
						const thumb = shot ? shot.thumb : ''
						try {
							const res = await this.markDelivered({ taskId: this.id, proof, thumb })
							const d = (res && res.data) || {}
							uni.showModal({
								title: d.settled ? '订单已完成' : d.awaiting_payment ? '已送达，待用户结清' : '已送达',
								content: d.settled
									? `收入 ¥${d.income} 已到账，可在「我的收入」里提现。`
									: (res && res.msg) || '已标记送达，等待用户确认收货。',
								showCancel: false,
								confirmText: '知道了',
								confirmColor: '#007AFF'
							})
							await this.load()
						} catch (e) {
							uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
							this.load()
						}
					}
				})
			},

			abandon() {
				if (this.busyId) return
				uni.showModal({
					title: '放弃任务',
					content: '放弃后订单会退回大厅给其他骑手，一天内放弃超过 5 单会被临时限制接单。',
					confirmText: '放弃',
					confirmColor: '#FF3B30',
					success: async (r) => {
						if (!r.confirm) return
						try {
							await this.abandonTask({ taskId: this.id, reason: '骑手放弃' })
							uni.showToast({ title: '已放弃', icon: 'none' })
							setTimeout(() => uni.navigateBack(), 600)
						} catch (e) {
							uni.showToast({ title: errText(e, '操作失败'), icon: 'none' })
						}
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.page {
		padding: 24rpx 24rpx 0;
		min-height: 100vh;
		background: #f2f2f7;
	}

	.head {
		background: linear-gradient(150deg, #007aff 0%, #4aa8ff 100%);
		border-radius: 26rpx;
		padding: 30rpx;
		color: #fff;
		margin-bottom: 20rpx;
	}

	.head .tag,
	.head .status-badge {
		background: rgba(255, 255, 255, 0.22);
		color: #fff;
	}

	.head-title {
		margin-top: 18rpx;
		font-size: 36rpx;
		font-weight: 700;
		line-height: 1.4;
	}

	.head-money {
		margin-top: 14rpx;
		display: flex;
		align-items: baseline;
		gap: 20rpx;
	}

	.head-price {
		font-size: 46rpx;
		font-weight: 700;
		color: #fff;
	}

	.head-price .unit { font-size: 26rpx; margin-right: 2rpx; }

	.head-income {
		font-size: 25rpx;
		color: #fff;
		opacity: 0.92;
	}

	.head-meta {
		margin-top: 10rpx;
		font-size: 22rpx;
		opacity: 0.85;
	}

	.map-card { padding: 22rpx 22rpx 0; }

	.card-title.mini {
		margin-bottom: 12rpx;
		font-size: 27rpx;
	}

	.map-hint {
		font-size: 22rpx;
		color: #8e8e93;
		font-weight: 400;
	}

	.map {
		width: 100%;
		height: 320rpx;
		border-radius: 16rpx;
		margin-bottom: 22rpx;
	}

	.place {
		display: flex;
		align-items: flex-start;
		padding: 14rpx 0;
		border-bottom: 1rpx solid #f6f6f8;

		&:last-of-type { border-bottom: none; }
	}

	.place-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		margin-top: 2rpx;
	}

	.place-name {
		font-size: 29rpx;
		font-weight: 600;
		color: #1c1c1e;
	}

	.place-detail {
		margin-top: 6rpx;
		font-size: 24rpx;
		color: #6e6e73;
		line-height: 1.5;
	}

	.nav-btn {
		flex-shrink: 0;
		margin-left: 16rpx;
		padding: 8rpx 20rpx;
		border-radius: 20rpx;
		font-size: 23rpx;
		color: #007aff;
		background: rgba(0, 122, 255, 0.1);
	}

	.contact-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 16rpx;
		margin-top: 18rpx;
	}

	.chat-dot {
		margin-left: 8rpx;
		min-width: 28rpx;
		height: 28rpx;
		line-height: 28rpx;
		padding: 0 8rpx;
		border-radius: 14rpx;
		background: #ff3b30;
		color: #fff;
		font-size: 18rpx;
		font-weight: 600;
	}

	.text {
		font-size: 28rpx;
		line-height: 1.65;
		color: #3a3a3c;
	}

	.timeline { padding-left: 6rpx; }

	.tl-item {
		display: flex;
		align-items: flex-start;
		position: relative;
		padding-bottom: 26rpx;

		&:last-child { padding-bottom: 0; }
	}

	.tl-dot {
		width: 16rpx;
		height: 16rpx;
		border-radius: 50%;
		background: #e2e2e8;
		margin: 10rpx 18rpx 0 0;
		flex-shrink: 0;
		z-index: 2;
	}

	.tl-item.on .tl-dot { background: #34c759; }

	/* 竖线：连到下一个点 */
	.tl-item:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 7rpx;
		top: 24rpx;
		bottom: 0;
		width: 2rpx;
		background: #ececf1;
	}

	.tl-item.on:not(:last-child)::after { background: rgba(52, 199, 89, 0.35); }

	.tl-body { display: flex; flex-direction: column; }
	.tl-title { font-size: 27rpx; color: #1c1c1e; }
	.tl-item.on .tl-title { font-weight: 600; }
	.tl-time { margin-top: 4rpx; font-size: 22rpx; color: #8e8e93; }

	.safe-bottom { height: calc(160rpx + env(safe-area-inset-bottom)); }

	.actions {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		gap: 16rpx;
		padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
		background: rgba(255, 255, 255, 0.97);
		box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.05);

		.btn {
			flex: 1;
			height: 88rpx;
			font-size: 29rpx;
		}
	}
</style>
