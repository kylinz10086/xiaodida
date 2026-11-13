<template>
	<view class="chat-page">
		<!-- 顶部信息条：对方 + 这单的标题/状态；点一下可以回订单 -->
		<view class="chat-head" @click="goTask">
			<view class="head-avatar" :style="{ background: peerColor }">
				<image v-if="peerAvatar" class="head-avatar-img" :src="peerAvatar" mode="aspectFill"></image>
				<text v-else class="head-avatar-text">{{ initial(peer.nickname) }}</text>
			</view>
			<view class="head-main">
				<view class="head-row">
					<text class="head-name">{{ peer.nickname || '对方' }}</text>
					<text class="head-status">{{ task.status_text || '' }}</text>
				</view>
				<text class="head-task">{{ task.title || '订单沟通' }}</text>
			</view>
			<text class="head-arrow">›</text>
		</view>

		<scroll-view class="chat-body" scroll-y :scroll-into-view="anchor" :scroll-with-animation="true"
			:show-scrollbar="false">
			<view class="notice">
				<text>只在平台内沟通和付款，私下转账不受保护。</text>
			</view>

			<view class="msg-list">
				<block v-for="(m, i) in messages" :key="m._id">
					<view v-if="showTime(i)" class="time-sep">{{ fmtTime(m.create_time) }}</view>

					<!-- 系统提示 -->
					<view v-if="m.type === 'system'" class="sys-msg">
						<text>{{ m.content }}</text>
					</view>

					<!-- 普通消息 -->
					<view v-else class="msg" :class="{ mine: m.from_id === me }">
						<view class="avatar" :style="{ background: m.from_id === me ? myColor : peerColor }">
							<image v-if="m.from_id === me ? myAvatar : peerAvatar" class="avatar-img"
								:src="m.from_id === me ? myAvatar : peerAvatar" mode="aspectFill"></image>
							<text v-else>{{ m.from_id === me ? initial(myName) : initial(peer.nickname) }}</text>
						</view>
						<view class="bubble-wrap">
							<view v-if="m.type === 'image'" class="bubble-img-wrap">
								<image class="bubble-img" :src="bubbleSrc(m)" mode="widthFix" @click="previewImage(m)"></image>
								<text v-if="!bubbleSrc(m)" class="bubble-img-tip">{{ m._imgFailed ? '图片加载失败，点开重试' : '图片加载中…' }}</text>
							</view>
							<view v-else class="bubble">{{ m.content }}</view>
							<text class="send-state" v-if="m.pending">发送中…</text>
							<text class="send-state err" v-else-if="m.failed" @click="resend(m)">发送失败，点此重发</text>
						</view>
					</view>
				</block>
			</view>

			<view id="chat-bottom" class="bottom-anchor"></view>
		</scroll-view>

		<view class="input-bar">
			<scroll-view class="quick-row" scroll-x :show-scrollbar="false" v-if="!draft">
				<text class="quick" v-for="q in quickReplies" :key="q" @click="useQuick(q)">{{ q }}</text>
			</scroll-view>
			<view class="input-row">
				<view class="img-btn" @click="pickImage">＋</view>
				<textarea class="input" v-model="draft" auto-height :maxlength="300" :show-confirm-bar="false"
					confirm-type="send" :cursor-spacing="24" placeholder="说点什么…" @confirm="send"></textarea>
				<view class="send-btn" :class="{ disabled: !canSend }" @click="send">发送</view>
			</view>
		</view>
	</view>
</template>

<script>
	/**
	 * 订单内聊天
	 *
	 * 只有「这单的发布者」和「这单的骑手」能进来 —— 服务端 assertChatMember 会再校验一次。
	 * 没有 websocket，用 4 秒轮询增量拉消息（after=最后一条时间），够两个人聊了。
	 */
	const QUICK = ['我快到了', '放门口就行', '在楼下等你', '稍等一下']

	import { uploadImage, getTempUrls, thumbDataUri, dataUriToTempFile, fetchImageToTempFile } from '@/common/image.js'

	function pad(n) {
		return n < 10 ? '0' + n : '' + n
	}

	/** 只有这几种 src 能直接画出来：内嵌 data URI、本地临时文件、http(s) 链接、本地静态资源 */
	function displayable(src) {
		const s = String(src || '')
		if (!s) return false
		if (s.indexOf('data:image/') === 0) return true
		if (s.indexOf('wxfile://') === 0) return true
		if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return true
		if (s.charAt(0) === '/') return true
		return false
	}

	export default {
		data() {
			return {
				taskId: '',
				role: 'user',
				me: '',
				peer: {},
				task: {},
				messages: [],
				draft: '',
				sending: false,
				loading: false,
				anchor: '',
				timer: null,
				imgMap: {},
				quickReplies: QUICK
			}
		},
		computed: {
			canSend() {
				return !!this.draft.trim() && !this.sending
			},
			myName() {
				const u = uni.getStorageSync('userInfo') || {}
				return u.nickname || '我'
			},
			myAvatar() {
				const u = uni.getStorageSync('userInfo') || {}
				return displayable(u.avatar) ? u.avatar : ''
			},
			peerAvatar() {
				return displayable(this.peer.avatar) ? this.peer.avatar : ''
			},
			peerColor() {
				return this.colorOf(this.peer.nickname)
			},
			myColor() {
				return this.colorOf(this.myName)
			}
		},		onLoad(query) {
			this.taskId = (query && query.taskId) || ''
			this.role = query && query.role === 'rider' ? 'rider' : 'user'
			if (!this.taskId) {
				uni.showToast({ title: '缺少订单号', icon: 'none' })
				setTimeout(() => uni.navigateBack(), 800)
				return
			}
			this.load()
		},
		onShow() {
			if (this.taskId && this.me) {
				this.load()
				this.startPolling()
			}
		},
		onHide() {
			this.stopPolling()
		},
		onUnload() {
			this.stopPolling()
		},
		methods: {
			api() {
				return uniCloud.importObject(this.role === 'rider' ? 'xyyx-rider' : 'xyyx-user', { customUI: true })
			},
			meta() {
				return {
					nonce: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
					timestamp: Date.now()
				}
			},
			async load() {
				if (this.loading) return
				this.loading = true
				try {
					const res = await this.api().getChat(this.taskId)
					if (res.code !== 0) throw new Error(res.msg)
					const d = res.data || {}
					this.me = d.me || ''
					this.peer = d.peer || {}
					this.task = d.task || {}
					this.messages = d.list || []
					this.resolveImages()
					this.syncTitle()
					this.scrollToBottom()
					this.startPolling()
				} catch (e) {
					uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			async poll() {
				// 会话一开始是空的时候也要轮询：对方可能先发消息
				if (this.loading || this.sending) return
				const last = this.messages.length ? this.messages[this.messages.length - 1].create_time : 0
				try {
					const res = await this.api().getChat(this.taskId, { after: last })
					if (res.code !== 0) return
					const list = (res.data && res.data.list) || []
					if (!list.length) return
					const exists = new Set(this.messages.map((m) => m._id))
					const add = list.filter((m) => !exists.has(m._id))
					if (!add.length) return
					this.messages = this.messages.concat(add)
					this.resolveImages()
					this.scrollToBottom()
				} catch (e) {
					// 轮询失败不打扰用户
				}
			},
			startPolling() {
				if (this.timer) return
				this.timer = setInterval(() => this.poll(), 4000)
			},
			stopPolling() {
				if (this.timer) {
					clearInterval(this.timer)
					this.timer = null
				}
			},
			syncTitle() {
				if (this.peer && this.peer.nickname) {
					uni.setNavigationBarTitle({ title: this.peer.nickname })
				}
			},
			scrollToBottom() {
				this.anchor = ''
				this.$nextTick(() => {
					this.anchor = 'chat-bottom'
				})
			},
			imgUrl(fileID) {
				return this.imgMap[fileID] || fileID
			},
			/**
			 * 气泡里图片的 src：
			 * 1. 新消息自带缩略图 data URI（不依赖域名、不会过期）；
			 * 2. 老消息只有 cloud:// fileID，用临时链接兜底；
			 * 3. 都没有就留空（显示灰底，不出现裂图图标）。
			 */
			bubbleSrc(m) {
				if (!m || m.type !== 'image') return ''
				if (displayable(m.thumb)) return m.thumb
				if (displayable(m.content)) return m.content
				const url = this.imgMap[m.content]
				return displayable(url) ? url : ''
			},
			/** 把聊天里没有缩略图的老图片补上：先试临时链接，失败再让云函数分片取原图 */
			async resolveImages() {
				const ids = Array.from(new Set(this.messages
					.filter((m) => m.type === 'image' && typeof m.content === 'string' && m.content.indexOf('cloud://') === 0)
					.map((m) => m.content)
					.filter((id) => !displayable(this.imgMap[id]))))
				if (!ids.length) return
				const map = await getTempUrls(ids)
				if (Object.keys(map).length) {
					this.imgMap = Object.assign({}, this.imgMap, map)
				}
				// 临时链接拿不到（域名没配 / 链接过期）→ 云函数取原图，落成本地临时文件再画
				const missing = ids.filter((id) => !displayable(this.imgMap[id]))
				for (const id of missing.slice(0, 2)) {
					try {
						const local = await fetchImageToTempFile(this.role, id)
						if (local) {
							this.imgMap = Object.assign({}, this.imgMap, { [id]: local })
							this.messages.forEach((m) => {
								if (m.type === 'image' && m.content === id) m._imgFailed = false
							})
						}
					} catch (e) {
						// 标记失败，气泡上给「点开重试」；单张失败不影响其它消息
						this.messages.forEach((m) => {
							if (m.type === 'image' && m.content === id) m._imgFailed = true
						})
					}
				}
			},
			useQuick(q) {
				this.draft = q
			},
			send() {
				this.pushAndSend(this.draft.trim(), 'text')
			},
			pickImage() {
				if (this.sending) return
				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					sourceType: ['album', 'camera'],
					success: async (res) => {
						const path = res.tempFilePaths && res.tempFilePaths[0]
						if (!path) return
						uni.showLoading({ title: '上传中…', mask: true })
						try {
							// 先做一张内嵌缩略图：上屏/对方展示都不依赖云存储域名
							const thumb = await thumbDataUri(path, { width: 480, maxLen: 12000 })
							// 原图传得更清楚一点（1440 宽），点开预览时用
							const fileID = await uploadImage(path, { role: this.role, dir: 'chat', width: 1440, quality: 70 })
							uni.hideLoading()
							this.pushAndSend(fileID, 'image', thumb)
						} catch (e) {
							uni.hideLoading()
							uni.showToast({ title: (e && e.message) || '图片发送失败', icon: 'none' })
						}
					}
				})
			},
			async pushAndSend(content, type, thumb) {
				if (!content || this.sending) return
				this.sending = true
				if (type === 'text') this.draft = ''
				const tempId = 'tmp_' + Date.now()
				const now = Date.now()
				// 先上屏，弱网下也有反馈
				this.messages.push({
					_id: tempId,
					from_id: this.me,
					content,
					type,
					thumb: thumb || '',
					create_time: now,
					pending: true
				})
				this.scrollToBottom()
				try {
					const res = await this.api().sendChat(this.taskId, content, this.meta(), type, thumb || '')
					if (res.code !== 0) throw new Error(res.msg)
					const saved = res.data || {}
					const i = this.messages.findIndex((m) => m._id === tempId)
					if (i >= 0) {
						this.messages.splice(i, 1, {
							_id: saved._id || tempId,
							from_id: this.me,
							content,
							type,
							thumb: saved.thumb || thumb || '',
							create_time: saved.create_time || now
						})
					}
					// 只有没有缩略图的老式消息才需要临时链接兜底
					if (type === 'image' && !thumb) this.resolveImages()
				} catch (e) {
					const m = this.messages.find((x) => x._id === tempId)
					if (m) {
						m.pending = false
						m.failed = true
					}
					uni.showToast({ title: (e && e.message) || '发送失败', icon: 'none' })
				} finally {
					this.sending = false
					this.scrollToBottom()
				}
			},
			resend(m) {
				this.messages = this.messages.filter((x) => x._id !== m._id)
				this.pushAndSend(m.content, m.type || 'text', m.thumb || '')
			},
			/** 点开大图：原图（云函数分片取回、落本地文件）优先，取不到再用缩略图 */
			async previewImage(m) {
				if (!m || m.type !== 'image') return
				const isCloud = typeof m.content === 'string' && m.content.indexOf('cloud://') === 0
				let url = this.imgMap[m.content] || ''
				let lastErr = ''

				// 1. 手头没有可用地址 → 先试临时链接
				if (!displayable(url) && isCloud) {
					const map = await getTempUrls([m.content])
					url = map[m.content] || ''
					if (url) this.imgMap = Object.assign({}, this.imgMap, { [m.content]: url })
				}
				// 2. 还是不行 → 云函数分片取原图，直接落成本地临时文件（多大都能看）
				if (!displayable(url) && isCloud) {
					uni.showLoading({ title: '加载原图…', mask: true })
					try {
						const local = await fetchImageToTempFile(this.role, m.content)
						if (local) {
							url = local
							this.imgMap = Object.assign({}, this.imgMap, { [m.content]: local })
							m._imgFailed = false
						}
					} catch (e) {
						lastErr = (e && e.message) || ''
						url = ''
					}
					uni.hideLoading()
				}
				// 3. 原图打不开 → 缩略图兜底
				if (!displayable(url)) url = displayable(m.thumb) ? m.thumb : ''
				if (!url) {
					uni.showToast({ title: lastErr || '这张图暂时打不开', icon: 'none' })
					return
				}
				// previewImage 对 data URI 支持不稳，先落成本地临时文件再看
				if (url.indexOf('data:image/') === 0) {
					const local = await dataUriToTempFile(url)
					if (local) {
						uni.previewImage({ urls: [local], current: local })
						return
					}
				}
				uni.previewImage({ urls: [url], current: url })
			},
			showTime(i) {
				if (i === 0) return true
				return this.messages[i].create_time - this.messages[i - 1].create_time > 5 * 60 * 1000
			},
			fmtTime(ts) {
				const n = Number(ts) || 0
				if (!n) return ''
				const d = new Date(n)
				const now = new Date()
				const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
				const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
				if (n >= start) return hm
				if (n >= start - 86400000) return '昨天 ' + hm
				if (d.getFullYear() === now.getFullYear()) return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + hm
				return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm
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
			},
			goTask() {
				if (this.role === 'rider') {
					uni.navigateTo({ url: '/pages/rider/detail?id=' + this.taskId })
				} else {
					uni.setStorageSync('currentViewTaskId', this.taskId)
					uni.navigateTo({ url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?type=completed' })
				}
			}
		}
	}
</script>

<style lang="scss">
	.chat-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #f2f3f5;
	}

	.chat-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		padding: 18rpx 24rpx;
		background: #fff;
		border-bottom: 1rpx solid #eef0f3;
	}

	.head-avatar {
		width: 76rpx;
		height: 76rpx;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.head-avatar-img { width: 100%; height: 100%; }
	.head-avatar-text { color: #fff; font-size: 30rpx; font-weight: 600; }

	.head-main {
		flex: 1;
		min-width: 0;
		margin-left: 18rpx;
	}

	.head-row { display: flex; align-items: center; }

	.head-name {
		font-size: 30rpx;
		font-weight: 600;
		color: #1c1f24;
		max-width: 300rpx;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.head-status {
		margin-left: 12rpx;
		font-size: 20rpx;
		color: #1677ff;
		background: rgba(22, 119, 255, 0.08);
		padding: 3rpx 12rpx;
		border-radius: 8rpx;
	}

	.head-task {
		display: block;
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #9aa1ad;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.head-arrow { font-size: 34rpx; color: #c7cbd3; margin-left: 8rpx; }

	.chat-body {
		flex: 1;
		height: 0;
	}

	.notice {
		margin: 18rpx 24rpx 0;
		padding: 12rpx 18rpx;
		background: #fff8e8;
		border-radius: 10rpx;
		font-size: 21rpx;
		color: #9a6200;
		text-align: center;
	}

	.msg-list { padding: 20rpx 24rpx 10rpx; }

	.time-sep {
		text-align: center;
		font-size: 21rpx;
		color: #a7adb8;
		margin: 18rpx 0 14rpx;
	}

	.sys-msg {
		text-align: center;
		margin: 10rpx 0;
	}

	.sys-msg text {
		display: inline-block;
		max-width: 80%;
		font-size: 21rpx;
		color: #8b93a1;
		background: rgba(139, 147, 161, 0.10);
		padding: 8rpx 18rpx;
		border-radius: 8rpx;
	}

	.msg {
		display: flex;
		align-items: flex-start;
		margin-bottom: 20rpx;

		&.mine {
			flex-direction: row-reverse;

			.bubble-wrap { align-items: flex-end; }

			.bubble {
				background: #1677ff;
				color: #fff;
				border-radius: 16rpx 4rpx 16rpx 16rpx;
			}
		}
	}

	.avatar {
		width: 72rpx;
		height: 72rpx;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 28rpx;
		font-weight: 600;
		flex-shrink: 0;
	}

	.avatar-img { width: 100%; height: 100%; }

	.bubble-wrap {
		display: flex;
		flex-direction: column;
		max-width: 68%;
		margin: 0 16rpx;
	}

	.bubble {
		padding: 18rpx 22rpx;
		background: #fff;
		color: #1c1f24;
		font-size: 28rpx;
		line-height: 1.55;
		border-radius: 4rpx 16rpx 16rpx 16rpx;
		word-break: break-all;
	}

	.bubble-img {
		width: 360rpx;
		max-height: 480rpx;
		border-radius: 12rpx;
		background: #e9edf3;
	}

	.bubble-img-wrap {
		position: relative;
		display: inline-block;
		min-width: 200rpx;
		min-height: 200rpx;
		border-radius: 12rpx;
		background: #e9edf3;
	}

	.bubble-img-tip {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		text-align: center;
		font-size: 22rpx;
		color: #9aa1ad;
	}

	.send-state {
		margin-top: 6rpx;
		font-size: 19rpx;
		color: #a7adb8;
	}

	.send-state.err { color: #eb5757; }

	.bottom-anchor { height: 20rpx; }

	.input-bar {
		flex-shrink: 0;
		background: #fff;
		border-top: 1rpx solid #eef0f3;
		padding: 12rpx 20rpx calc(12rpx + env(safe-area-inset-bottom));
	}

	.quick-row {
		white-space: nowrap;
		margin-bottom: 12rpx;
		width: 100%;
	}

	.quick {
		display: inline-block;
		margin-right: 12rpx;
		padding: 8rpx 18rpx;
		border-radius: 20rpx;
		background: #f2f3f5;
		color: #5c6370;
		font-size: 22rpx;
	}

	.input-row {
		display: flex;
		align-items: flex-end;
	}

	.img-btn {
		width: 72rpx;
		height: 76rpx;
		line-height: 72rpx;
		text-align: center;
		font-size: 40rpx;
		color: #5c6370;
		background: #f2f3f5;
		border-radius: 12rpx;
		margin-right: 12rpx;
		flex-shrink: 0;
	}

	.input {
		flex: 1;
		min-height: 76rpx;
		max-height: 260rpx;
		background: #f2f3f5;
		border-radius: 12rpx;
		padding: 18rpx 20rpx;
		font-size: 28rpx;
		line-height: 40rpx;
		box-sizing: border-box;
	}

	.send-btn {
		margin-left: 14rpx;
		width: 120rpx;
		height: 76rpx;
		line-height: 76rpx;
		text-align: center;
		border-radius: 12rpx;
		background: #1677ff;
		color: #fff;
		font-size: 27rpx;
		font-weight: 600;

		&.disabled {
			background: #d6e4ff;
			color: #fff;
		}
	}
</style>
