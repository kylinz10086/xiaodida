<template>
	<view class="pv" @click="close">
		<swiper class="pv-swiper" :current="current" @change="onChange" :circular="false">
			<swiper-item v-for="(it, i) in list" :key="i" class="pv-item">
				<!-- 原图取不到时不要给黑屏：有缩略图就先放大缩略图，连缩略图都没有才显示占位卡片 -->
				<image v-if="srcOf(it)" class="pv-img" :src="srcOf(it)" mode="aspectFit" @click.stop="close"
					@error="onImgError(it)"></image>
				<view v-else class="pv-empty" @click.stop>
					<text class="pv-empty-title">这张图打不开</text>
					<text class="pv-empty-sub">{{ whyOf(it) || '图片数据已丢失' }}</text>
					<view class="pv-empty-btn" @click.stop="retry">重新加载</view>
				</view>
				<text v-if="thumbOnly(it)" class="pv-badge">原图已失效 · 当前是缩略图</text>
			</swiper-item>
		</swiper>

		<view class="pv-close" @click.stop="close">×</view>
		<view class="pv-bar" @click.stop>
			<text class="pv-index">{{ current + 1 }} / {{ list.length }}</text>
			<text class="pv-tip" v-if="tipText" @click.stop="retry">{{ tipText }}</text>
		</view>
	</view>
</template>

<script>
	/**
	 * 自建图片预览页
	 *
	 * 为什么不用 uni.previewImage：它加载本地文件/data URI 时会一直转圈（不同基础库表现还不一样），
	 * 而 <image> 是确定能画的。
	 *
	 * 原图解析交给 resolveImageSrc()：直读(data URI) → 落盘(本地文件) → 临时链接(url)，
	 * 一条失败自动换下一条。**图片能正常显示时不显示任何提示文字**，
	 * 只有当前这张确实打不开时才出现「点此重试」。
	 */
	import { resolveImageSrc, forgetImageSrc } from '@/common/image.js'

	export default {
		data() {
			return {
				list: [],
				current: 0,
				role: 'user',
				full: {},
				loading: {},
				// 某个 fileID 上「已经失败过的方式」，重试时跳过它
				failed: {},
				method: {},
				// 当前这张彻底打不开（三条路都失败）才提示
				broken: {},
				// 走的是哪条路（短暂显示后就隐藏，别一直挂着）
				label: '',
				// 打不开的具体原因（三条路各自的报错），显示在提示条上便于报障
				why: {},
				// 连缩略图都画不出来（原图、缩略图全挂）
				thumbBroken: {}
			}
		},
		computed: {
			tipText() {
				const it = this.list[this.current]
				if (it && it.fileID && this.broken[it.fileID]) {
					// 还有缩略图就不是「打不开」，只是原图没了
					if (this.srcOf(it) && !this.thumbBroken[it.fileID]) return '原图已失效 · 可点此重试'
					return '打不开 · 点此重试'
				}
				return this.label
			},
			curKey() {
				const it = this.list[this.current]
				return (it && it.fileID) || ''
			}
		},
		onLoad() {
			const d = uni.getStorageSync('__imagePreview') || {}
			this.list = (d.list || []).slice(0, 40)
			this.role = d.role === 'rider' ? 'rider' : 'user'
			const n = this.list.length
			this.current = n ? Math.min(Math.max(0, Number(d.current) || 0), n - 1) : 0
			this.loadFull(this.current)
		},
		methods: {
			srcOf(it) {
				if (!it) return ''
				if (it.fileID && this.full[it.fileID]) return this.full[it.fileID]
				if (it.fileID && this.thumbBroken[it.fileID]) return ''
				return it.src || ''
			},
			/** 现在显示的是缩略图（原图取不到） */
			thumbOnly(it) {
				if (!it || !it.fileID) return false
				if (this.full[it.fileID] || this.thumbBroken[it.fileID]) return false
				return !!(this.broken[it.fileID] && it.src)
			},
			/** 把服务端那串报错翻译成人话 */
			whyOf(it) {
				if (!it || !it.fileID) return ''
				const raw = String(this.why[it.fileID] || '')
				if (!raw) return ''
				if (/0B|内容异常|不存在|已被删除/.test(raw)) return '云存储里已经没有这张图了，只能让对方重发'
				if (/token|登录/.test(raw)) return '登录状态失效，重新进一次小程序再试'
				if (/超时|timeout/i.test(raw)) return '网络超时，稍后再试'
				return raw.slice(0, 40)
			},
			onChange(e) {
				this.current = (e && e.detail && e.detail.current) || 0
				this.label = ''
				this.loadFull(this.current)
			},
			/**
			 * <image> 画不出来。
			 * 只处理「当前这张」：swiper 里其它页的图还在解析中，报错是正常的，不能拿来当失败提示。
			 */
			onImgError(it) {
				if (!it || !it.fileID) return
				const cur = this.list[this.current]
				if (!cur || cur.fileID !== it.fileID) return
				// 刚才画的是原图 → 换路径重试；刚才画的就是缩略图 → 连缩略图都坏了，给占位卡片
				if (!this.full[it.fileID]) {
					this.$set(this.thumbBroken, it.fileID, true)
					this.$set(this.broken, it.fileID, true)
					if (!this.why[it.fileID]) this.$set(this.why, it.fileID, '缩略图也画不出来')
					return
				}
				const used = this.method[it.fileID]
				if (used) this.$set(this.failed, it.fileID, used)
				this.$delete(this.full, it.fileID)
				this.$set(this.loading, it.fileID, false)
				this.loadFull(this.current)
			},
			async loadFull(i) {
				const it = this.list[i]
				if (!it || !it.fileID) return
				if (this.full[it.fileID] || this.loading[it.fileID]) return
				const skip = {}
				if (this.failed[it.fileID]) skip[this.failed[it.fileID]] = true
				this.$set(this.loading, it.fileID, true)
				let r = { src: '', method: '', errors: [] }
				try {
					// 全屏看的是大图：强制落成本地文件，别把 600KB 的 data URI 塞进 setData
				r = await resolveImageSrc(this.role, it.fileID, { skip, preferFile: true })
				} catch (e) {
					r.errors = [(e && e.message) || '图片加载失败']
				}
				this.$set(this.loading, it.fileID, false)
				if (r.src) {
					this.$set(this.broken, it.fileID, false)
					this.$set(this.full, it.fileID, r.src)
					this.$set(this.method, it.fileID, r.method)
					if (i === this.current) this.flashLabel(r.method)
					// 预取左右两张：滑过去时基本是秒开
					this.loadFull(i + 1)
					this.loadFull(i - 1)
					return
				}
				// 三条路都失败：如果还有缩略图就先显示缩略图，只留一个「点此重试」
				this.$set(this.why, it.fileID, (r.errors || []).join('；'))
				this.$set(this.broken, it.fileID, true)
				this.label = ''
			},
			/** 路径提示只闪一下，不长期占屏 */
			flashLabel(method) {
				const text = method === 'file' ? '原图' : method === 'url' ? '原图 · 链接' : '原图'
				this.label = text
				clearTimeout(this._labelTimer)
				this._labelTimer = setTimeout(() => {
					this.label = ''
				}, 1500)
			},
			retry() {
				const it = this.list[this.current]
				if (!it || !it.fileID) return
				forgetImageSrc(it.fileID)
				this.$delete(this.thumbBroken, it.fileID)
				this.$delete(this.full, it.fileID)
				this.$delete(this.failed, it.fileID)
				this.$delete(this.method, it.fileID)
				this.$set(this.why, it.fileID, '')
				this.$set(this.broken, it.fileID, false)
				this.label = ''
				this.loadFull(this.current)
			},
			close() {
				clearTimeout(this._labelTimer)
				uni.navigateBack({
					fail: () => uni.redirectTo({ url: '/pages/xyyx/index/index' })
				})
			}
		}
	}
</script>

<style lang="scss">
	.pv {
		position: fixed;
		left: 0;
		right: 0;
		top: 0;
		bottom: 0;
		background: #000;
	}

	/* 原图和缩略图都取不到时的占位卡片，别给用户看黑屏 */
	.pv-empty {
		position: absolute;
		left: 0;
		right: 0;
		top: 36%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 60rpx;
	}

	.pv-empty-title { font-size: 30rpx; color: #e8eaee; }

	.pv-empty-sub {
		margin-top: 14rpx;
		font-size: 23rpx;
		line-height: 1.6;
		color: #8b9099;
		text-align: center;
	}

	.pv-empty-btn {
		margin-top: 28rpx;
		padding: 12rpx 40rpx;
		border: 1rpx solid #4a4f57;
		border-radius: 999rpx;
		font-size: 24rpx;
		color: #cfd3d9;
	}

	/* 原图失效、正在放大缩略图时给个提示，别让人以为图就是这么糊 */
	.pv-badge {
		position: absolute;
		left: 50%;
		bottom: 130rpx;
		transform: translateX(-50%);
		padding: 8rpx 22rpx;
		background: rgba(0, 0, 0, 0.55);
		border-radius: 999rpx;
		font-size: 21rpx;
		color: #ffd9a8;
	}

	.pv-swiper {
		width: 100vw;
		height: 100vh;
	}

	.pv-item {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.pv-img {
		width: 100vw;
		height: 100vh;
	}

	.pv-close {
		position: fixed;
		top: calc(24rpx + env(safe-area-inset-top));
		right: 28rpx;
		width: 64rpx;
		height: 64rpx;
		line-height: 58rpx;
		text-align: center;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.45);
		color: #fff;
		font-size: 44rpx;
		z-index: 10;
	}

	.pv-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(30rpx + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		align-items: center;
		z-index: 10;
	}

	.pv-index {
		color: #fff;
		font-size: 26rpx;
		font-weight: 600;
		text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.6);
	}

	.pv-tip {
		margin-top: 10rpx;
		color: rgba(255, 255, 255, 0.5);
		font-size: 21rpx;
		text-align: center;
		padding: 0 40rpx;
	}
</style>
