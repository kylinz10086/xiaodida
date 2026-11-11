<script>
	export default {
		globalData: {
			username: '李四',
			rewardPrice: 0,
			userObj: {
				nickname: {
					label: '昵称',
					value: '李四'
				},
				usertype: 2,
				mobile: {
					label: '手机号',
					value: '12345678910'
				},
				school: {
					label: '学校',
					value: '西安交通大学'
				},
				address: {
					label: '地址',
					value: '创新港B区'
				},
				qq: {
					label: 'QQ',
					value: '123456678'
				}
			},
			token: ""
		},
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
	@import "common/demo.scss";
	@import "pages/xyyx/index.scss";
</style>
