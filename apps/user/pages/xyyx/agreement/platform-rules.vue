<template>
	<doc-view title="平台规则摘要" :version="version" :date="date" :content="content" />
</template>

<script>
	import DocView from './doc-view.vue'
	import { PLATFORM_RULES, AGREEMENT_VERSION, EFFECTIVE_DATE } from '@/common/agreement.js'

	export default {
		components: { DocView },
		data() {
			return {
				version: AGREEMENT_VERSION,
				date: EFFECTIVE_DATE,
				content: PLATFORM_RULES
			}
		}
	}
</script>
