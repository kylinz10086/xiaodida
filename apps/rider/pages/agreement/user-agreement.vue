<template>
	<view class="doc-page">
		<view class="doc-head">
			<text class="doc-title">骑手服务协议</text>
			<text class="doc-version">版本 {{ version }}</text>
		</view>
		<view class="doc-body">
			<text class="doc-text">{{ content }}</text>
		</view>
		<view class="doc-foot">
			<text class="doc-tip">作为骑手，你还需要遵守平台关于送达时效与物品保管的规定。</text>
		</view>
	</view>
</template>

<script>
	import { USER_AGREEMENT, AGREEMENT_VERSION } from '@/common/agreement.js'

	export default {
		data() {
			return { version: AGREEMENT_VERSION, content: USER_AGREEMENT }
		}
	}
</script>

<style lang="scss">
	@import './doc.scss';
</style>
