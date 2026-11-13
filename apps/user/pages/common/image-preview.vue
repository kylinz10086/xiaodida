<template>
	<view class="pv" @click="close">
		<swiper class="pv-swiper" :current="current" @change="onChange" :circular="false">
			<swiper-item v-for="(it, i) in list" :key="i" class="pv-item">
				<image class="pv-img" :src="srcOf(it)" mode="aspectFit" @click.stop="close" @error="onImgError(it)"></image>
				<view class="pv-loading" v-if="it.fileID && loading[it.fileID]">
					<text>原图加载中…</text>
				</view>
			</swiper-item>
		</swiper>

		<view class="pv-close" @click.stop="close">×</view>
		<view class="pv-bar" @click.stop>
			<text class="pv-index">{{ current + 1 }} / {{ list.length }}</text>
			<text class="pv-tip" @click.stop="retry">{{ tipText }}</text>
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
	 * 1.11.0 换成「多路径兜底」：一条路失败就自动换下一条，并把每条路失败的原因显示在底部。
	 *   直读(data URI)  → 落盘(本地临时文件) → 临时链接(云存储 URL)
	 * 先画缩略图秒开，原图回来再替换；三条都不行就一直显示缩略图，不会白屏。
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
				err: ''
			}
		},
		computed: {
			tipText() {
				if (this.err) return this.err + '，点此重试'
				const k = this.curKey
				if (k && this.method[k] === 'data') return '原图 · 直读'
				if (k && this.method[k] === 'file') return '原图 · 本地文件'
				if (k && this.method[k] === 'url') return '原图 · 临时链接'
				return '左右滑动 · 点图片关闭'
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
				this.err = ''
				this.loadFull(this.current)
			},
			/** <image> 画不出来：把这条路径记成失败，自动换下一条 */
			onImgError(it) {
				if (!it || !it.fileID) return
				const used = this.method[it.fileID]
				if (used) this.$set(this.failed, it.fileID, used)
				this.$delete(this.full, it.fileID)
				this.$set(this.loading, it.fileID, false)
				this.err = '原图显示失败'
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
					this.$set(this.full, it.fileID, r.src)
					this.$set(this.method, it.fileID, r.method)
					this.err = ''
					return
				}
				this.err = (r.errors || []).join('；') || '原图加载失败'
			},
			retry() {
				const it = this.list[this.current]
				if (!it || !it.fileID) return
				forgetImageSrc(it.fileID)
				this.$delete(this.full, it.fileID)
				this.$delete(this.failed, it.fileID)
				this.$delete(this.method, it.fileID)
				this.err = ''
				this.loadFull(this.current)
			},
			close() {
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

	.pv-loading {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 130rpx;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 22rpx;
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
		color: rgba(255, 255, 255, 0.6);
		font-size: 21rpx;
		text-align: center;
		padding: 0 40rpx;
	}
</style>
