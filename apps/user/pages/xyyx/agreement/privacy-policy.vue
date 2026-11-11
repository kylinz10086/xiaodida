<template>
	<view class="doc-page">
		<view class="doc-head">
			<text class="doc-title">隐私政策</text>
			<text class="doc-version">版本 {{version}}</text>
		</view>
		<view class="doc-body">
			<text class="doc-text">{{content}}</text>
		</view>
		<view class="doc-foot">
			<text class="doc-tip">我们仅收集为你提供服务所必需的信息，且不会向无关第三方提供。</text>
		</view>
	</view>
</template>

<script>
	import { PRIVACY_POLICY, AGREEMENT_VERSION } from '@/common/agreement.js'

	export default {
		data() {
			return {
				version: AGREEMENT_VERSION,
				content: PRIVACY_POLICY
			}
		}
	}
</script>

<style lang="scss">
	@import './user-agreement.scss';
</style>
