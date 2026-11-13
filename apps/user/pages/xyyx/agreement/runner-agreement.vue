<template>
	<doc-view title="跑腿服务协议" :version="version" :date="date" :content="content" foot="骑手相关问题，可在「我的 - 意见反馈」里咨询。" />
</template>

<script>
	import DocView from './doc-view.vue'
	import { RUNNER_AGREEMENT, AGREEMENT_VERSION, EFFECTIVE_DATE } from '@/common/agreement.js'

	export default {
		components: { DocView },
		data() {
			return {
				version: AGREEMENT_VERSION,
				date: EFFECTIVE_DATE,
				content: RUNNER_AGREEMENT
			}
		}
	}
</script>
