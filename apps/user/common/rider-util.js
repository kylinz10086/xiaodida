/**
 * 骑手端前端工具集
 *
 * 只做纯计算 + uni 原生能力封装，不碰 vuex，方便两套骑手页面共用同一份逻辑。
 */

/* ---------------- 距离 ---------------- */

const EARTH_RADIUS = 6371000

function toRad(deg) {
	return (Number(deg) * Math.PI) / 180
}

/** 两点球面距离（米）。坐标缺省时返回 -1，调用方据此决定要不要显示 */
export function distanceMeters(lat1, lng1, lat2, lng2) {
	const a1 = Number(lat1)
	const o1 = Number(lng1)
	const a2 = Number(lat2)
	const o2 = Number(lng2)
	if (!a1 || !o1 || !a2 || !o2) return -1
	const dLat = toRad(a2 - a1)
	const dLng = toRad(o2 - o1)
	const s =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
	return Math.round(2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(s))))
}

/** 320m / 1.2km */
export function formatDistance(m) {
	const n = Number(m)
	if (!(n >= 0)) return ''
	if (n < 1000) return `${n}m`
	return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}km`
}

/** 需要走多久：按 1.2m/s 步行估算 */
export function formatWalk(m) {
	const n = Number(m)
	if (!(n >= 0)) return ''
	const min = Math.max(1, Math.round(n / 72))
	return min >= 60 ? `${Math.floor(min / 60)}小时${min % 60}分` : `${min}分钟`
}

/* ---------------- 金额 ---------------- */

/**
 * 金额展示：整数不带小数，有零头保留两位。
 * 服务端返回的是「元」的数字（已经换算过），前端只负责显示。
 * 0.9 → "0.90"（不显示成 0.9），5 → "5"。
 */
export function fmtMoney(v) {
	const n = Number(v)
	if (!isFinite(n)) return '0'
	return Math.abs(n % 1) < 1e-9 ? String(Math.round(n)) : n.toFixed(2)
}

/* ---------------- 时间 ---------------- */

function pad(n) {
	return n < 10 ? '0' + n : '' + n
}

export function formatTime(ts, withYear) {
	const n = Number(ts)
	if (!n) return ''
	const d = new Date(n)
	const base = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
	return withYear ? `${d.getFullYear()}-${base}` : base
}

/** 刚刚 / 5 分钟前 / 3 小时前 / 2 天前 */
export function timeAgo(ts) {
	const n = Number(ts)
	if (!n) return ''
	const diff = Date.now() - n
	if (diff < 60 * 1000) return '刚刚'
	if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)}分钟前`
	if (diff < 86400 * 1000) return `${Math.floor(diff / 3600000)}小时前`
	if (diff < 7 * 86400 * 1000) return `${Math.floor(diff / 86400000)}天前`
	return formatTime(n)
}

/* ---------------- 学号 ---------------- */

/**
 * 学号 = 4 位入学学年 + 6 位学院专业号 + 5 位班级学号，共 15 位
 * 例：202512211404009 → 2025 | 122114 | 04009
 */
export function parseStudentNo(value) {
	const raw = String(value === undefined || value === null ? '' : value).trim()
	const digits = raw.replace(/\s+/g, '')
	if (!/^\d{15}$/.test(digits)) {
		return { raw, digits, valid: false, year: '', major: '', classNo: '', grouped: digits }
	}
	return {
		raw,
		digits,
		valid: true,
		year: digits.slice(0, 4),
		major: digits.slice(4, 10),
		classNo: digits.slice(10),
		// 分组显示，避免 15 位数字糊成一坨看不出结构
		grouped: `${digits.slice(0, 4)} ${digits.slice(4, 10)} ${digits.slice(10)}`
	}
}

/* ---------------- 定位 ---------------- */

let cache = null
let pending = null

/**
 * 取当前定位（gcj02，和微信地图一致）。
 * 失败不抛错，返回 null —— 定位拿不到时页面只是不显示距离，不能因此白屏。
 */
export function getLocation(force) {
	if (!force && cache && Date.now() - cache.time < 60 * 1000) return Promise.resolve(cache)
	if (pending) return pending

	pending = new Promise((resolve) => {
		uni.getLocation({
			type: 'gcj02',
			success: (res) => {
				cache = { latitude: res.latitude, longitude: res.longitude, time: Date.now() }
				resolve(cache)
			},
			fail: () => resolve(null),
			complete: () => {
				pending = null
			}
		})
	})
	return pending
}

export function clearLocationCache() {
	cache = null
}

/* ---------------- 地图 / 导航 ---------------- */

function marker(id, place, color, label) {
	return {
		id,
		latitude: Number(place.latitude),
		longitude: Number(place.longitude),
		width: 28,
		height: 34,
		callout: {
			content: label,
			color: '#ffffff',
			fontSize: 11,
			borderRadius: 6,
			bgColor: color,
			padding: 5,
			display: 'ALWAYS',
			textAlign: 'center'
		}
	}
}

/**
 * 组装详情页地图：起点、终点、我，三个点。
 * 返回的 latitude/longitude 是地图中心点。
 */
export function buildMap(task, me) {
	const o = (task && task.origin) || {}
	const d = (task && task.destination) || {}
	const points = []
	if (o.latitude && o.longitude) points.push({ latitude: Number(o.latitude), longitude: Number(o.longitude) })
	if (d.latitude && d.longitude) points.push({ latitude: Number(d.latitude), longitude: Number(d.longitude) })

	if (!points.length) return null

	const markers = []
	if (o.latitude && o.longitude) markers.push(marker(1, o, '#34c759', '取件点'))
	if (d.latitude && d.longitude) markers.push(marker(2, d, '#ff3b30', '送达点'))
	if (me && me.latitude && me.longitude) markers.push(marker(3, me, '#007aff', '我'))

	const polyline =
		o.latitude && o.longitude && d.latitude && d.longitude
			? [
					{
						points: [
							{ latitude: Number(o.latitude), longitude: Number(o.longitude) },
							{ latitude: Number(d.latitude), longitude: Number(d.longitude) }
						],
						color: '#007AFFAA',
						width: 4,
						dottedLine: false,
						arrowLine: true
					}
				]
			: []

	// 中心点取两个地点的中点，只算经度纬度平均就够用了
	const center =
		points.length === 1
			? points[0]
			: {
					latitude: (points[0].latitude + points[1].latitude) / 2,
					longitude: (points[0].longitude + points[1].longitude) / 2
				}

	return {
		latitude: center.latitude,
		longitude: center.longitude,
		markers,
		polyline,
		scale: points.length === 1 ? 17 : 15
	}
}

/**
 * 打开微信内置地图导航。
 * uni.openLocation 是唯一不需要申请 key、不需要引第三方 SDK 的导航方式，
 * 用户点进去可以直接选「步行/驾车」并开始规划。
 */
export function navigateTo(place, fallbackName) {
	if (!place || !place.latitude || !place.longitude) {
		uni.showToast({ title: '该地点没有坐标，无法导航', icon: 'none' })
		return
	}
	uni.openLocation({
		latitude: Number(place.latitude),
		longitude: Number(place.longitude),
		name: place.name || fallbackName || '目的地',
		address: place.detail || '',
		scale: 18,
		fail: () => uni.showToast({ title: '打开地图失败，请检查是否允许定位', icon: 'none' })
	})
}

/* ---------------- 联系 ---------------- */

export function callPhone(phone, tip) {
	const p = String(phone || '').replace(/[^\d]/g, '')
	if (p.length < 7) {
		uni.showToast({ title: '没有可用的手机号', icon: 'none' })
		return
	}
	uni.showModal({
		title: '拨打电话',
		content: (tip || '') + p,
		confirmText: '拨打',
		confirmColor: '#007AFF',
		success: (r) => {
			if (r.confirm) uni.makePhoneCall({ phoneNumber: p, fail: () => {} })
		}
	})
}

export function copyText(text, tip) {
	const t = String(text || '')
	if (!t) return
	uni.setClipboardData({
		data: t,
		success: () => uni.showToast({ title: tip || '已复制', icon: 'none' })
	})
}

/* ---------------- 其它 ---------------- */

/** 统一取错误提示文案（云端返回的 msg 在 store 里已经抛成 Error.message） */
export function errText(e, fallback) {
	if (!e) return fallback || '操作失败'
	return e.message || e.errMsg || fallback || '操作失败'
}
