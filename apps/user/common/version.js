/**
 * 客户端版本号
 *
 * 只改这一个地方，配合 manifest.json 的 versionName 一起升。
 * 页面上显示「v1.11.4 · 开发版 · 21:40」：
 *   - 版本号：代码包是哪一版
 *   - 开发版/体验版/正式版：微信里跑的是哪条通道
 *   - 构建时间：同一版本号重新构建也能区分，避免「改了没生效」来回猜
 *
 * 这几个字段是排查「手机上还是老包」的唯一依据，别删。
 */
export const APP_VERSION = '1.11.5'

/** 每次构建改一下（月-日 时:分），用来区分同版本的重新构建 */
export const BUILD_STAMP = '11-13 21:38'

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
	return 'v' + APP_VERSION + (ENV_TEXT[env] ? ' · ' + ENV_TEXT[env] : '') + ' · ' + BUILD_STAMP
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
