<template>
	<doc-view title="隐私政策" :version="version" :date="date" :content="content" />
</template>

<script>
	import DocView from './doc-view.vue'
	import { PRIVACY_POLICY, AGREEMENT_VERSION, EFFECTIVE_DATE } from '@/common/agreement.js'

	export default {
		components: { DocView },
		data() {
			return {
				version: AGREEMENT_VERSION,
				date: EFFECTIVE_DATE,
				content: PRIVACY_POLICY
			}
		}
	}
</script>
