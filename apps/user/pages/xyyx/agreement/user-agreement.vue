<template>
	<view class="doc-page">
		<view class="doc-head">
			<text class="doc-title">用户服务协议</text>
			<text class="doc-version">版本 {{version}}</text>
		</view>
		<view class="doc-body">
			<text class="doc-text">{{content}}</text>
		</view>
		<view class="doc-foot">
			<text class="doc-tip">如对协议内容有疑问，可通过「我的-联系客服」咨询。</text>
		</view>
	</view>
</template>

<script>
	import { USER_AGREEMENT, AGREEMENT_VERSION } from '@/common/agreement.js'

	export default {
		data() {
			return {
				version: AGREEMENT_VERSION,
				content: USER_AGREEMENT
			}
		}
	}
</script>

<style lang="scss">
	@import './user-agreement.scss';
</style>
