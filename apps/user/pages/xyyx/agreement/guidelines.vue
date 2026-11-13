<template>
	<doc-view title="骑手准则" :version="version" :date="date" :content="content" foot="准则和处罚都按订单记录执行，有异议可以在「我的 - 意见反馈」里申诉。" />
</template>

<script>
	import DocView from './doc-view.vue'
	import { RUNNER_GUIDELINES, AGREEMENT_VERSION, EFFECTIVE_DATE } from '@/common/agreement.js'

	export default {
		components: { DocView },
		data() {
			return {
				version: AGREEMENT_VERSION,
				date: EFFECTIVE_DATE,
				content: RUNNER_GUIDELINES
			}
		}
	}
</script>
