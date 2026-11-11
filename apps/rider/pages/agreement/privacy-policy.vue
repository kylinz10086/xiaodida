<template>
	<view class="doc-page">
		<view class="doc-head">
			<text class="doc-title">隐私政策</text>
			<text class="doc-version">版本 {{ version }}</text>
		</view>
		<view class="doc-body">
			<text class="doc-text">{{ content }}</text>
		</view>
		<view class="doc-foot">
			<text class="doc-tip">你的真实姓名与学号仅用于平台审核，不会展示给其他用户。</text>
		</view>
	</view>
</template>

<script>
	import { PRIVACY_POLICY, AGREEMENT_VERSION } from '@/common/agreement.js'

	export default {
		data() {
			return { version: AGREEMENT_VERSION, content: PRIVACY_POLICY }
		}
	}
</script>

<style lang="scss">
	@import './doc.scss';
</style>
