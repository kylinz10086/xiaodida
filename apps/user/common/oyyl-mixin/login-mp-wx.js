import {
	myRequest
} from '@/common/oyyl-js/request'
export default {
	computed: {
		userToken() {
			return this.$store.getters.userToken
		}
	},
	methods: {
		async mpWxLogin(userInfoData) {
			await this.mpWxGetUserInfo(userInfoData)
			this.$util.msg('登陆成功');
			setTimeout(() => {
				uni.navigateBack();
			}, 1000)
		},
		// 获取用户信息
		mpWxGetUserInfo(userInfoData) {
			return new Promise((resolve, reject) => {
				if (!userInfoData.detail.userInfo) {
					reject(new Error('未拿到用户信息'))
				}
				this.$util.throttle(async () => {
					const [loginErr, loginData] = await uni.login({
						provider: 'weixin'
					})
					const [err, userData] = await uni.getUserInfo();
					console.log(loginData, userData)
					const res = await myRequest(this.userToken, 'https://p32608e355.eicp.vip/api/v1/user/welogin', 'POST', {
						code: loginData.code,
						encryptedData: userData.encryptedData,
						iv: userData.iv
					}, {
						showLoading: true
					})
					if (res.state !== 0) {
						this.$util.msg(res.msg);
						reject(new Error(res.msg))
					} else {
						this.$store.dispatch('setUserToken', res.token)
						resolve(res.userInfo)
					}
				})
			}).then(userInfo => {
				this.$store.dispatch('setUserData', userInfo);
				return userInfo
			})
		},
		async updateUserInfo() {
			// 获取用户信息
			let userInfo = await this.getUserInfo()
			// 此处一定要先从userInfo中获取对应的属性，直接...uerInfo传给云函数会少内容
			const {
				nickName,
				gender,
				avatarUrl
			} = userInfo
			const res = await myRequest(this.userToken, 'https://p32608e355.eicp.vip/api/v1/user/updateUserInfo', 'POST', {
				nickName,
				gender,
				avatarUrl
			}, {
				showLoading: true
			});
			if (res.state !== 0) {
				this.$util.msg(res.msg);
			} else {
				console.log(res)
				this.$store.dispatch('setUserData', {
					nickName,
					gender,
					avatarUrl
				});
			}
		},
		getUserInfo() {
			return new Promise((resolve, reject) => {
				uni.getUserProfile({
					desc: "更新用户信息",
					success: (res) => {
						console.log(res)
						resolve(res.userInfo)
					},
					fail: (err) => {
						reject(err)
					}
				})
			})
		}
	}
}
