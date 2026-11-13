<template>
	<doc-view title="用户服务协议" :version="version" :date="date" :content="content" />
</template>

<script>
	import DocView from './doc-view.vue'
	import { USER_AGREEMENT, AGREEMENT_VERSION, EFFECTIVE_DATE } from '@/common/agreement.js'

	export default {
		components: { DocView },
		data() {
			return {
				version: AGREEMENT_VERSION,
				date: EFFECTIVE_DATE,
				content: USER_AGREEMENT
			}
		}
	}
</script>
