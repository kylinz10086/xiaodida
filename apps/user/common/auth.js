/**
 * 登录门禁
 *
 * 为什么单独抽出来：uni-id-pages 有 uniIdRouter 的 needLogin 机制，但它对 tabBar 页
 * 的拦截行为不稳定（有时不跳转、有时跳完回来又绕回去），所以这里用显式检查：
 * 页面 onShow 时调 requireLogin()，没登录就 push 登录页；登录成功 uni-id-pages 会
 * navigateBack 回到原页面，onShow 会再跑一次检查，此时已有 token，正常放行。
 */

const LOGIN_PAGE = '/uni_modules/uni-id-pages/pages/login/login-withoutpwd'

export function isLoggedIn() {
	return !!(uni.getStorageSync('uniIdToken') || uni.getStorageSync('token'))
}

export function requireLogin() {
	if (isLoggedIn()) return true
	uni.navigateTo({ url: LOGIN_PAGE })
	return false
}

export function goLogin() {
	uni.navigateTo({ url: LOGIN_PAGE })
}

export function logout() {
	uni.removeStorageSync('uniIdToken')
	uni.removeStorageSync('token')
	uni.removeStorageSync('userInfo')
}
