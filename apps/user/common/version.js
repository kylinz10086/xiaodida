/**
 * 客户端版本号
 *
 * 只改这一个地方，配合 manifest.json 的 versionName 一起升。
 * 页面上显示「v1.9.9 · 体验版」：出问题时先确认手机上跑的是不是新包，
 * 避免「改了没生效」来回猜。
 */
export const APP_VERSION = '1.11.3'

const ENV_TEXT = { develop: '开发版', trial: '体验版', release: '正式版' }

export function versionText() {
	let env = ''
	try {
		const info = typeof wx !== 'undefined' && wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
		env = (info && info.miniProgram && info.miniProgram.envVersion) || ''
	} catch (e) {
		env = ''
	}
	return 'v' + APP_VERSION + (ENV_TEXT[env] ? ' · ' + ENV_TEXT[env] : '')
}
