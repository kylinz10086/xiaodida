<template>
	<view class="pv" @click="close">
		<swiper class="pv-swiper" :current="current" @change="onChange" :circular="false">
			<swiper-item v-for="(it, i) in list" :key="i" class="pv-item">
				<image class="pv-img" :src="srcOf(it)" mode="aspectFit" @click.stop="close" @error="onImgError(it)"></image>
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
				label: ''
			}
		},
		computed: {
			tipText() {
				const it = this.list[this.current]
				if (it && it.fileID && this.broken[it.fileID]) return '点此重试'
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
				return it.src || ''
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
					r = await resolveImageSrc(this.role, it.fileID, { skip })
				} catch (e) {
					r.errors = [(e && e.message) || '图片加载失败']
				}
				this.$set(this.loading, it.fileID, false)
				if (r.src) {
					this.$set(this.broken, it.fileID, false)
					this.$set(this.full, it.fileID, r.src)
					this.$set(this.method, it.fileID, r.method)
					this.flashLabel(r.method)
					return
				}
				// 三条路都失败：如果还有缩略图就先显示缩略图，只留一个「点此重试」
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
				this.$delete(this.full, it.fileID)
				this.$delete(this.failed, it.fileID)
				this.$delete(this.method, it.fileID)
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
