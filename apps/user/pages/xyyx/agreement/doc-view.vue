<template>
	<view class="doc-page">
		<view class="doc-head">
			<text class="doc-title">{{ title }}</text>
			<text class="doc-version">版本 {{ version }}　·　{{ date }}</text>
		</view>
		<view class="doc-body">
			<block v-for="(b, i) in blocks" :key="i">
				<text v-if="b.type === 'h'" class="doc-h">{{ b.text }}</text>
				<text v-else-if="b.type === 'li'" class="doc-li">{{ b.text }}</text>
				<text v-else class="doc-p">{{ b.text }}</text>
			</block>
		</view>
		<view class="doc-foot" v-if="foot">
			<text class="doc-tip">{{ foot }}</text>
		</view>
		<view class="doc-foot">
			<text class="doc-tip">如果对条款有疑问，可在「我的 - 意见反馈」里提问。</text>
		</view>
	</view>
</template>

<script>
	/**
	 * 协议正文渲染：把纯文本按行拆成「小节标题 / 段落 / 列表」，
	 * 避免把 `##`、`-` 这些标记原样显示给用户（之前就是这个样子）。
	 */
	function parse(text) {
		const lines = String(text || '').split('\n')
		let i = 0
		// 跳过开头空行、标题行和「版本/生效日期」行（页头已经展示）
		while (i < lines.length && !lines[i].trim()) i++
		if (i < lines.length && !lines[i].startsWith('##')) {
			i++
			while (i < lines.length && (/^\s*$/.test(lines[i]) || /^(版本|生效日期)/.test(lines[i].trim()))) i++
		}
		const out = []
		for (; i < lines.length; i++) {
			const line = lines[i].trim()
			if (!line) continue
			if (line.startsWith('## ')) out.push({ type: 'h', text: line.slice(3) })
			else if (line.startsWith('- ')) out.push({ type: 'li', text: line.slice(2) })
			else out.push({ type: 'p', text: line })
		}
		return out
	}

	export default {
		name: 'DocView',
		props: {
			title: { type: String, default: '' },
			version: { type: String, default: '' },
			date: { type: String, default: '' },
			content: { type: String, default: '' },
			foot: { type: String, default: '' }
		},
		computed: {
			/**
			 * 协议里的费率不要写死：正文用 {{commissionPct}} 占位，
			 * 这里用「当前生效配置」替换掉，后台改了抽佣比例，协议文字自动跟着变。
			 */
			rendered() {
				const settings = this.$store && this.$store.state.profile && this.$store.state.profile.settings
				const rate = settings && typeof settings.commissionRate === 'number' ? settings.commissionRate : null
				// 配置还没拉到时退回当前产品默认值（8%），避免协议里出现空数字
				const pct = rate === null ? '8' : String(Math.round(rate * 100))
				return String(this.content || '').replace(/\{\{commissionPct\}\}/g, pct)
			},
			blocks() {
				return parse(this.rendered)
			}
		}
	}
</script>

<style lang="scss">
	.doc-page {
		min-height: 100vh;
		background: #f2f3f5;
		padding: 24rpx 24rpx 60rpx;
	}

	.doc-head {
		background: #fff;
		border-radius: 20rpx;
		padding: 32rpx 32rpx 28rpx;
		margin-bottom: 16rpx;
	}

	.doc-title {
		display: block;
		font-size: 38rpx;
		font-weight: 700;
		color: #1c1f24;
	}

	.doc-version {
		display: block;
		margin-top: 10rpx;
		font-size: 23rpx;
		color: #9aa1ad;
	}

	.doc-body {
		background: #fff;
		border-radius: 20rpx;
		padding: 12rpx 32rpx 28rpx;
	}

	.doc-h {
		display: block;
		margin-top: 30rpx;
		font-size: 29rpx;
		font-weight: 600;
		color: #1c1f24;
		line-height: 1.5;
	}

	.doc-p {
		display: block;
		margin-top: 12rpx;
		font-size: 27rpx;
		line-height: 1.8;
		color: #3a4049;
	}

	.doc-li {
		display: block;
		margin-top: 8rpx;
		padding-left: 4rpx;
		font-size: 27rpx;
		line-height: 1.75;
		color: #3a4049;
	}

	.doc-foot {
		padding: 24rpx 8rpx 0;
	}

	.doc-tip {
		display: block;
		font-size: 23rpx;
		line-height: 1.7;
		color: #9aa1ad;
	}
</style>
