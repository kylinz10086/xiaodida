/**
 * 客户端版本号
 *
 * 只改这一个地方，配合 manifest.json 的 versionName 一起升。
 * 页面上只显示「v1.11.6 · 开发版」，不带日期时间（看着清爽，也别当版本号一部分）。
 * 构建时间仍记录在 BUILD_STAMP 里，只出现在「点版本号」的详情弹窗，用来排查
 * 「手机上跑的是不是最新那个包」。
 */
export const APP_VERSION = '1.11.8'

/** 每次构建改一下（月-日 时:分）。只给详情弹窗用，不出现在版本号文案里 */
export const BUILD_STAMP = '11-14 22:25'

const ENV_TEXT = { develop: '开发版', trial: '体验版', release: '正式版' }

function envCode() {
	try {
		const info = typeof wx !== 'undefined' && wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
		return (info && info.miniProgram && info.miniProgram.envVersion) || ''
	} catch (e) {
		return ''
	}
}

export function versionText() {
	const env = envCode()
	return 'v' + APP_VERSION + (ENV_TEXT[env] ? ' · ' + ENV_TEXT[env] : '')
}

/** 「我的」页点版本号弹出的详情：排查「跑的是不是新包」用 */
export function versionDetail() {
	const env = envCode()
	let appid = ''
	try {
		const info = typeof wx !== 'undefined' && wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
		appid = (info && info.miniProgram && info.miniProgram.appId) || ''
	} catch (e) {
		appid = ''
	}
	return {
		version: APP_VERSION,
		stamp: BUILD_STAMP,
		env: ENV_TEXT[env] || '未知环境',
		appid
	}
}
