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
			<text class="pv-tip">左右滑动 · 点图片关闭</text>
		</view>
	</view>
</template>

<script>
	/**
	 * 自建图片预览页
	 *
	 * 为什么不用 uni.previewImage：它加载本地文件/data URI 时会一直转圈（不同基础库表现还不一样），
	 * 而 <image> 是确定能画的。这里用 swiper + image 自己做全屏预览：
	 *   - 先用缩略图/本地文件秒开，再在后台用云函数分片把原图取回来替换（不阻塞、不转圈）；
	 *   - 左右滑动看同组所有图片；
	 *   - 原图取不到就一直显示缩略图，不会白屏。
	 */
	import { fetchImageToTempFile } from '@/common/image.js'

	export default {
		data() {
			return {
				list: [],
				current: 0,
				role: 'user',
				full: {},
				loading: {},
				failed: {}
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
				if (it.fileID && this.full[it.fileID] && !this.failed[it.fileID]) return this.full[it.fileID]
				return it.src || ''
			},
			onChange(e) {
				this.current = (e && e.detail && e.detail.current) || 0
				this.loadFull(this.current)
			},
			onImgError(it) {
				// 原图加载失败就退回缩略图，别留一块白
				if (it && it.fileID) this.$set(this.failed, it.fileID, true)
			},
			async loadFull(i) {
				const it = this.list[i]
				if (!it || !it.fileID || this.full[it.fileID] || this.loading[it.fileID]) return
				this.$set(this.loading, it.fileID, true)
				try {
					const local = await fetchImageToTempFile(this.role, it.fileID)
					if (local) this.$set(this.full, it.fileID, local)
				} catch (e) {
					// 取不到原图就继续显示缩略图
				} finally {
					this.$set(this.loading, it.fileID, false)
				}
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
		color: rgba(255, 255, 255, 0.6);
		font-size: 21rpx;
	}
</style>
