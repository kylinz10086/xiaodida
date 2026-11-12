<template>
	<view class="list-page">
		<view class="list" v-if="conversations.length">
			<view class="conv" v-for="c in conversations" :key="c.task_id" @click="openChat(c)">
				<view class="conv-avatar" :style="{ background: colorOf(c.peer && c.peer.nickname) }">
					<image v-if="c.peer && c.peer.avatar" class="conv-avatar-img" :src="c.peer.avatar" mode="aspectFill"></image>
					<text v-else>{{ initial(c.peer && c.peer.nickname) }}</text>
				</view>
				<view class="conv-main">
					<view class="conv-row">
						<text class="conv-name">{{ (c.peer && c.peer.nickname) || '对方' }}</text>
						<text class="conv-time">{{ fmtTime(c.last && c.last.create_time) }}</text>
					</view>
					<view class="conv-row">
						<text class="conv-last">{{ lastText(c) }}</text>
						<text class="conv-badge" v-if="c.unread > 0">{{ c.unread > 99 ? '99+' : c.unread }}</text>
					</view>
					<text class="conv-task">{{ c.title }}</text>
				</view>
			</view>
		</view>

		<view class="empty" v-else-if="!loading">
			<view class="empty-bubble"></view>
			<text class="empty-title">还没有聊天</text>
			<text class="empty-sub">订单被接单后，就能和对方在这里沟通</text>
		</view>

		<view class="loading" v-else>
			<text>加载中…</text>
		</view>
	</view>
</template>

<script>
	function pad(n) {
		return n < 10 ? '0' + n : '' + n
	}

	export default {
		data() {
			return {
				role: 'user',
				conversations: [],
				loading: false,
				timer: null
			}
		},
		onLoad(query) {
			this.role = query && query.role === 'rider' ? 'rider' : 'user'
		},
		onShow() {
			this.load()
			this.startPolling()
		},
		onHide() {
			this.stopPolling()
		},
		onUnload() {
			this.stopPolling()
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			api() {
				return uniCloud.importObject(this.role === 'rider' ? 'xyyx-rider' : 'xyyx-user', { customUI: true })
			},
			async load() {
				if (this.loading) return
				this.loading = true
				try {
					const res = await this.api().listChats()
					if (res.code !== 0) throw new Error(res.msg)
					this.conversations = (res.data && res.data.list) || []
				} catch (e) {
					uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			startPolling() {
				if (this.timer) return
				this.timer = setInterval(() => this.load(), 10000)
			},
			stopPolling() {
				if (this.timer) {
					clearInterval(this.timer)
					this.timer = null
				}
			},
			openChat(c) {
				uni.navigateTo({ url: '/pages/chat/chat?taskId=' + c.task_id + '&role=' + this.role })
			},
			lastText(c) {
				const last = c.last || {}
				if (last.type === 'system') return last.content
				if (last.type === 'image') return (last.from_me ? '我：' : '') + '[图片]'
				return (last.from_me ? '我：' : '') + (last.content || '')
			},
			fmtTime(ts) {
				const n = Number(ts) || 0
				if (!n) return ''
				const d = new Date(n)
				const now = new Date()
				const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
				if (n >= start) return pad(d.getHours()) + ':' + pad(d.getMinutes())
				if (n >= start - 86400000) return '昨天'
				if (d.getFullYear() === now.getFullYear()) return d.getMonth() + 1 + '/' + d.getDate()
				return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate()
			},
			initial(name) {
				const s = String(name || '?').trim()
				return s ? s.slice(0, 1) : '?'
			},
			colorOf(name) {
				const colors = ['#5b8def', '#f2994a', '#27ae60', '#9b51e0', '#eb5757', '#2d9cdb']
				let sum = 0
				const s = String(name || '')
				for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i)
				return colors[sum % colors.length]
			}
		}
	}
</script>

<style lang="scss">
	.list-page {
		min-height: 100vh;
		background: #f2f3f5;
		padding-bottom: 40rpx;
	}

	.list-head {
		background: #fff;
		padding: 28rpx 28rpx 24rpx;
	}

	.list-title {
		display: block;
		font-size: 38rpx;
		font-weight: 700;
		color: #1c1f24;
	}

	.list-sub {
		display: block;
		margin-top: 8rpx;
		font-size: 23rpx;
		color: #9aa1ad;
	}

	.list { padding-top: 16rpx; }

	.conv {
		display: flex;
		align-items: center;
		background: #fff;
		padding: 24rpx 28rpx;
		border-bottom: 1rpx solid #f4f5f7;

		&:active { background: #fafbfc; }
	}

	.conv-avatar {
		width: 88rpx;
		height: 88rpx;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 34rpx;
		font-weight: 600;
		flex-shrink: 0;
	}

	.conv-avatar-img { width: 100%; height: 100%; }

	.conv-main {
		flex: 1;
		min-width: 0;
		margin-left: 20rpx;
	}

	.conv-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.conv-name {
		font-size: 29rpx;
		font-weight: 600;
		color: #1c1f24;
		max-width: 380rpx;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.conv-time { font-size: 21rpx; color: #a7adb8; }

	.conv-last {
		flex: 1;
		margin-top: 6rpx;
		font-size: 24rpx;
		color: #8b93a1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.conv-badge {
		margin-left: 12rpx;
		min-width: 34rpx;
		height: 34rpx;
		line-height: 34rpx;
		padding: 0 10rpx;
		text-align: center;
		border-radius: 17rpx;
		background: #eb5757;
		color: #fff;
		font-size: 20rpx;
	}

	.conv-task {
		display: block;
		margin-top: 4rpx;
		font-size: 20rpx;
		color: #b0b6c0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 140rpx 0;
	}

	.empty-bubble {
		width: 110rpx;
		height: 84rpx;
		border: 3rpx solid #d8dce3;
		border-radius: 18rpx 18rpx 18rpx 4rpx;
		margin-bottom: 26rpx;
	}

	.empty-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #3a4049;
	}

	.empty-sub {
		margin-top: 10rpx;
		font-size: 23rpx;
		color: #9aa1ad;
	}

	.loading {
		text-align: center;
		padding: 120rpx 0;
		color: #9aa1ad;
		font-size: 25rpx;
	}
</style>
