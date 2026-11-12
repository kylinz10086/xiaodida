<script>
	export default {
		onLaunch() {
			this.initLogin();
		},
		methods: {
			async initLogin() {
				const token = uni.getStorageSync('uniIdToken') || uni.getStorageSync('token');
				const userInfo = uni.getStorageSync('userInfo');

				if (token && userInfo) {
					this.$store.dispatch('setUserData', userInfo);
					this.$store.dispatch('setUserToken', token);
				}
			}
		}
	}
</script>

<style lang="scss">
	@import "uview-ui/index.scss";

	/* 全局盒模型：小程序里 view/text 默认 content-box，加 padding 容易把宽度撑破 */
	view,
	text {
		box-sizing: border-box;
	}

	/* 骑手端公共样式：card/btn/tag/status 等基础类 */
	@import "common/rider.scss";
	@import "pages/xyyx/index.scss";
</style>
