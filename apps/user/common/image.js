/**
 * 图片处理与上传
 *
 * 为什么不直接用 uniCloud.uploadFile：
 * 真机上 uploadFile 是直传 OSS，需要在小程序后台把 OSS 域名加进 uploadFile 合法域名，
 * 否则报 `uploadFile:fail url not in domain list`。这里统一改成：
 *   压缩 → 读 base64 → 云对象 uploadImage（服务端写 /tmp 再传云存储）
 * 只走 callFunction 的 request 域名，不需要额外配置。
 *
 * 头像更特殊：云存储返回的是 cloud://，要 getTempFileURL 才能显示，而且临时链接会过期。
 * 头像很小，直接压成 data URI 存资料里，所有端都能显示，也不用管域名。
 */

let nonceSeq = 0

function requestMeta() {
	const seq = (++nonceSeq).toString(36)
	return {
		nonce: `img_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 10)}`,
		timestamp: Date.now()
	}
}

function apiOf(role) {
	return uniCloud.importObject(role === 'rider' ? 'xyyx-rider' : 'xyyx-user', { customUI: true })
}

/** 压缩图片；不支持的平台/失败时退回原图，不阻塞流程 */
export function compressImage(src, opts = {}) {
	return new Promise((resolve) => {
		if (typeof uni.compressImage !== 'function') return resolve(src)
		uni.compressImage({
			src,
			quality: opts.quality || 60,
			compressedWidth: opts.width || 1080,
			success: (res) => resolve((res && res.tempFilePath) || src),
			fail: () => resolve(src)
		})
	})
}

/** 读成本地 base64（微信小程序专用） */
export function readBase64(filePath) {
	return new Promise((resolve, reject) => {
		const fs = typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
		if (!fs) return reject(new Error('当前环境不支持读取图片'))
		fs.readFile({
			filePath,
			encoding: 'base64',
			success: (res) => resolve(res.data || ''),
			fail: (e) => reject(new Error((e && e.errMsg) || '读取图片失败'))
		})
	})
}

/**
 * 上传一张图片，返回 fileID。
 *
 * 关键约束：服务端会把图片字节**直存进数据库**（≤620KB base64），
 * 客户端看图只走数据库这条路 —— 这个云空间服务端读不了云存储（downloadFile / 临时链接都拿不到内容）。
 * 所以「存得进去」就等于「打得开」：压到 560KB 以内再传，宁可小一点，也不要传上去打不开。
 */
const UPLOAD_TARGET_B64 = 560000

/** 按目标 base64 长度逐档压缩（从清晰到省流） */
async function compressToTarget(filePath, target, baseW, baseQ) {
	const ladder = [
		{ width: baseW, quality: baseQ },
		{ width: Math.min(baseW, 1200), quality: 55 },
		{ width: 1000, quality: 50 },
		{ width: 900, quality: 45 },
		{ width: 800, quality: 40 },
		{ width: 720, quality: 35 }
	]
	let b64 = ''
	for (const step of ladder) {
		const path = await compressImage(filePath, step)
		b64 = await readBase64(path)
		if (!b64) throw new Error('读取图片失败')
		if (b64.length <= target) break
	}
	return b64
}

export async function uploadImage(filePath, opts = {}) {
	const role = opts.role || 'user'
	const dir = opts.dir || 'misc'
	const baseW = Number(opts.width) || 1080
	const baseQ = Number(opts.quality) || 60

	// 服务端返回 stored=false 表示「字节没能存进数据库」——云存储读不回来，
	// 这张图之后就是「上传成功但看不了」。这时自动压小一档重传，宁可糊一点也要打得开。
	const targets = [Number(opts.targetB64) || UPLOAD_TARGET_B64, 300000, 190000]
	let lastId = ''
	for (const target of targets) {
		const b64 = await compressToTarget(filePath, target, baseW, baseQ)
		if (b64.length > 620000) throw new Error('图片太大，换一张小一点的图片试试')
		const res = await apiOf(role).uploadImage({
			base64: b64,
			ext: 'jpg',
			dir,
			...requestMeta()
		})
		if (res.code !== 0) throw new Error(res.msg || '上传失败')
		const data = res.data || {}
		if (!data.fileID) throw new Error('上传返回异常')
		lastId = data.fileID
		if (data.stored !== false) return data.fileID
	}
	return lastId
}

/** 头像压成 data URI：不依赖云存储/域名，也不会过期
 *
 * 返回 { small, hd }：
 *   small —— 240px 以内，存 users.avatar，列表/聊天都用它（每条列表都带一份，不能大）；
 *   hd    —— 720px 以内，存 users.avatar_hd，只在「我的」页 / getProfile 下发。
 */
export async function avatarDataUri(filePath) {
	const small = await pickAvatar(filePath, [
		{ width: 240, quality: 60 },
		{ width: 200, quality: 50 },
		{ width: 160, quality: 45 }
	], 12000)
	let hd = ''
	try {
		hd = await pickAvatar(filePath, [
			{ width: 720, quality: 80 },
			{ width: 640, quality: 75 },
			{ width: 512, quality: 70 },
			{ width: 400, quality: 65 }
		], 120000)
	} catch (e) {
		hd = ''
	}
	return { small, hd: hd || small }
}

async function pickAvatar(filePath, sizes, maxLen) {
	for (const s of sizes) {
		const path = await compressImage(filePath, s)
		const b64 = await readBase64(path)
		if (!b64) throw new Error('读取图片失败')
		const uri = 'data:image/jpeg;base64,' + b64
		if (uri.length <= maxLen) return uri
	}
	throw new Error('头像太大，换一张小一点的图片')
}

/**
 * 通过云对象把图读成 data URI。
 *
 * 小程序 <image> 走 downloadFile 域名白名单，云存储 CDN 域名没配就整片裂图；
 * 临时链接还会过期。callFunction 用的是 request 域名（登录都靠它，一定配过），
 * 所以走云函数取图，客户端拿到 base64 再显示 / 预览。
 *
 * 云函数返回值有大小上限，服务端按分片返回。1.11.3 起：
 *   - 单片 400KB（大多数图一次往返就拿完）；
 *   - 需要多片时，**剩余分片并发取**（并发 4），大图从 5 次串行压到 1~2 次往返。
 */
const B64_CONCURRENCY = 4

/** base64 长度 = 4 * ceil(字节数 / 3)，用来算总共要取几片 */
function b64LenOfBytes(n) {
	const bytes = Number(n) || 0
	if (bytes <= 0) return 0
	return Math.ceil(bytes / 3) * 4
}

export async function fetchImageData(role, fileID, onProgress) {
	const id = String(fileID || '').trim()
	if (!/^cloud:\/\//.test(id) && !/^https?:\/\//.test(id)) return ''
	const api = apiOf(role)

	const first = await api.getImageData(id, 0)
	if (!first || first.code !== 0) throw new Error((first && first.msg) || '图片读取失败')
	const d0 = first.data || {}
	if (!d0.base64) throw new Error('图片读取失败')
	const mime = d0.mime || 'image/jpeg'

	// 兼容旧版云函数：一次返回整张
	if (d0.chunk === undefined || d0.done === undefined || d0.done) {
		return 'data:' + mime + ';base64,' + d0.base64
	}

	const unit = Number(d0.chunk) || 0
	const total = b64LenOfBytes(d0.size)
	if (!unit || !total || total <= unit) {
		// 算不出总长就退回串行，稳一点
		const parts = [d0.base64]
		let offset = Number(d0.offset) + unit
		for (let i = 0; i < 80; i++) {
			const res = await api.getImageData(id, offset)
			if (!res || res.code !== 0 || !res.data || !res.data.base64) {
				throw new Error((res && res.msg) || '图片读取失败')
			}
			parts.push(res.data.base64)
			offset = Number(res.data.offset) + Number(res.data.chunk)
			if (res.data.done) break
			if (!res.data.chunk) throw new Error('图片分片异常')
		}
		return 'data:' + mime + ';base64,' + parts.join('')
	}

	const offsets = []
	for (let off = unit; off < total; off += unit) offsets.push(off)
	const got = new Array(offsets.length)
	let cursor = 0
	let loaded = unit
	if (typeof onProgress === 'function') onProgress(loaded, total)

	const worker = async () => {
		while (cursor < offsets.length) {
			const my = cursor++
			const res = await api.getImageData(id, offsets[my])
			if (!res || res.code !== 0 || !res.data || !res.data.base64) {
				throw new Error((res && res.msg) || '图片读取失败')
			}
			got[my] = res.data.base64
			loaded += String(res.data.base64).length
			if (typeof onProgress === 'function') onProgress(Math.min(loaded, total), total)
		}
	}
	const workers = []
	for (let i = 0; i < Math.min(B64_CONCURRENCY, offsets.length); i++) workers.push(worker())
	await Promise.all(workers)

	return 'data:' + mime + ';base64,' + [d0.base64].concat(got).join('')
}

/* ------------------------------------------------------------------ *
 * 本地磁盘缓存
 *
 * 为什么要有：data URI 走 setData，一张 600KB 的图就是 600KB 的字符串传进渲染层，
 * 真机上肉眼可见地卡；而且每次进页面都重新分片取一遍，来回都是云函数冷启动。
 * 落盘之后 <image src="wxfile://..."> 是本地文件，秒开，setData 只有一个短路径。
 * ------------------------------------------------------------------ */

const DISK_KEY = '__imgDiskCache'
const DISK_MAX_COUNT = 12
const DISK_MAX_BYTES = 6 * 1024 * 1024

function fsOf() {
	return typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
}

function userDataPath() {
	return (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || ''
}

function diskIndex() {
	try {
		return uni.getStorageSync(DISK_KEY) || {}
	} catch (e) {
		return {}
	}
}

function diskSaveIndex(map) {
	try {
		uni.setStorageSync(DISK_KEY, map)
	} catch (e) {}
}

function diskGet(id) {
	const key = String(id || '')
	if (!key) return ''
	const map = diskIndex()
	const hit = map[key]
	if (!hit || !hit.path) return ''
	const fs = fsOf()
	if (!fs) return ''
	try {
		fs.accessSync(hit.path)
		hit.at = Date.now()
		diskSaveIndex(map)
		return hit.path
	} catch (e) {
		delete map[key]
		diskSaveIndex(map)
		return ''
	}
}

function diskPut(id, path, size) {
	const key = String(id || '')
	const fs = fsOf()
	if (!key || !path || !fs) return ''
	try {
		const map = diskIndex()
		map[key] = { path, size: Number(size) || 0, at: Date.now() }
		// 先按「总数 + 总字节」淘汰最久没看的
		let keys = Object.keys(map).sort((a, b) => (map[a].at || 0) - (map[b].at || 0))
		let total = keys.reduce((sum, k) => sum + (Number(map[k].size) || 0), 0)
		while (keys.length > DISK_MAX_COUNT || total > DISK_MAX_BYTES) {
			const oldest = keys.shift()
			if (oldest === key) break
			total -= Number(map[oldest].size) || 0
			try {
				fs.unlinkSync(map[oldest].path)
			} catch (e) {}
			delete map[oldest]
		}
		diskSaveIndex(map)
		return path
	} catch (e) {
		return ''
	}
}

function diskDrop(id) {
	const key = String(id || '')
	if (!key) return
	const map = diskIndex()
	const hit = map[key]
	if (!hit) return
	const fs = fsOf()
	try {
		if (fs && hit.path) fs.unlinkSync(hit.path)
	} catch (e) {}
	delete map[key]
	diskSaveIndex(map)
}

/** 把 base64 直接写成一个缓存文件（比先造 data URI 再落盘省一次大字符串） */
function writeB64ToDisk(id, b64, mime) {
	const fs = fsOf()
	const base = userDataPath()
	if (!fs || !base || !b64) return ''
	const ext = /png/i.test(mime || '') ? 'png' : 'jpg'
	const dir = base + '/imgcache'
	try {
		fs.accessSync(dir)
	} catch (e) {
		try {
			fs.mkdirSync(dir, true)
		} catch (e2) {}
	}
	const name = dir + '/' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-40) + '-' + Date.now() + '.' + ext
	try {
		fs.writeFileSync(name, b64, 'base64')
		const st = fs.statSync(name)
		if (!st || !st.size) throw new Error('empty')
		return diskPut(id, name, st.size)
	} catch (e) {
		return ''
	}
}

/**
 * 预取一批图（并行 2 个）。
 * 列表页/聊天页一进来就有多张图要画时用它，别一张一张串行等。
 *
 * 返回 { [fileID]: src }，失败的键不出现在结果里。
 */
export async function prefetchImages(role, ids, opts = {}) {
	const list = Array.from(new Set((ids || []).filter((id) => typeof id === 'string' && /^cloud:\/\/|^https?:\/\//.test(id))))
	const out = {}
	if (!list.length) return out
	const limit = Math.max(1, Math.min(3, Number(opts.concurrency) || 2))
	// 磁盘里已有的直接命中，剩下的才发请求
	const todo = []
	for (const id of list) {
		const hit = diskGet(id)
		if (hit) {
			out[id] = hit
			continue
		}
		todo.push(id)
	}
	let cursor = 0
	const worker = async () => {
		while (cursor < todo.length) {
			const id = todo[cursor++]
			try {
				const r = await resolveImageSrc(role, id, opts)
				if (r && r.src) out[id] = r.src
			} catch (e) {
				// 单张失败不影响其它图
			}
		}
	}
	const workers = []
	for (let i = 0; i < Math.min(limit, todo.length); i++) workers.push(worker())
	await Promise.all(workers)
	return out
}

/** 最近解出来的图片地址缓存：同一个 fileID 不重复取（预览和气泡共用） */
const srcCache = new Map()
const SRC_CACHE_MAX = 16

function cacheSet(key, val) {
	if (!key || !val) return
	if (srcCache.size >= SRC_CACHE_MAX) {
		const first = srcCache.keys().next().value
		srcCache.delete(first)
	}
	srcCache.set(key, val)
}

/**
 * 解出一张图「能画出来」的 src —— 依次尝试三条完全不同的路径：
 *   1. data   ：云函数分片取 base64，拼成 data URI 交给 <image>（不落盘、不看域名，最稳）
 *   2. file   ：同样的数据写成本地临时文件再画（data URI 太大被微信拒掉时用）
 *   3. url    ：云存储临时链接（前两条都失败、但小程序后台配过域名时能救）
 *
 * 返回 { src, method, errors }：method 用来在页面上显示走了哪条路，
 * errors 是每条路各自失败的原因（现场排查用，不用再猜）。
 */
export async function resolveImageSrc(role, fileID, opts = {}) {
	const id = String(fileID || '').trim()
	const skip = opts.skip || {}
	const errors = []
	const cached = srcCache.get(id)
	if (cached && !(skip[cached.method] || (opts.maxAge && Date.now() - cached.at > opts.maxAge))) {
		return { src: cached.src, method: cached.method, errors }
	}
	const hit = (src, method) => {
		cacheSet(id, { src, method, at: Date.now() })
		return { src, method, errors }
	}

	// 0. 磁盘里已经有这张图：本地文件路径，秒开，setData 只有一个短字符串
	if (!skip.disk) {
		const cached = diskGet(id)
		if (cached) return hit(cached, 'disk')
	}

	if (!skip.data) {
		try {
			const uri = await fetchImageData(role, id)
			const maxLen = Number(opts.maxDataLen) || 900000
			// 超过这个长度就别塞进 setData 了，直接落盘用本地路径（真机渲染快很多）
			const fileThreshold = Number(opts.fileThreshold) || 220000
			const b64 = uri && uri.indexOf('base64,') >= 0 ? uri.slice(uri.indexOf('base64,') + 7) : ''
			if (b64 && (opts.preferFile || uri.length > fileThreshold)) {
				const path = writeB64ToDisk(id, b64, 'image/jpeg')
				if (path) return hit(path, 'file')
			}
			if (uri && uri.length <= maxLen) return hit(uri, 'data')
			if (uri) errors.push('直读:图片太大（' + Math.round(uri.length / 1024) + 'KB）')
		} catch (e) {
			errors.push('直读:' + ((e && e.message) || '失败'))
		}
	}

	if (!skip.file) {
		try {
			const path = await fetchImageToTempFile(role, id)
			if (path) {
				// 已经在硬盘上了，顺手登记进缓存索引，下次直接命中
				const cachedPath = diskPut(id, path, 0)
				return hit(cachedPath || path, 'file')
			}
		} catch (e) {
			errors.push('落盘:' + ((e && e.message) || '失败'))
		}
	}

	if (!skip.url) {
		try {
			const map = await getTempUrls([id])
			if (map[id]) return hit(map[id], 'url')
		} catch (e) {
			errors.push('链接:' + ((e && e.message) || '失败'))
		}
	}

	return { src: '', method: '', errors }
}

/** 清掉某张图的缓存（点「重试」时用） */
export function forgetImageSrc(fileID) {
	const id = String(fileID || '').trim()
	srcCache.delete(id)
	diskDrop(id)
}

/**
 * 把原图落成本地文件，返回本地路径。
 *
 * 直接复用 fetchImageData（它已经做了分片并发 + 磁盘缓存），
 * 老版本这里是自己串行 for 循环分片，一张 600KB 的图要两个来回，慢一倍。
 */
export async function fetchImageToTempFile(role, fileID) {
	const id = String(fileID || '').trim()
	const isRef = /^cloud:\/\//.test(id) || /^https?:\/\//.test(id)
	if (!isRef) throw new Error('图片地址无效')
	const fs = typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
	const base = (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || ''
	if (!fs || !base) throw new Error('当前环境不支持保存图片')

	const uri = await fetchImageData(role, id)
	const i = uri.indexOf('base64,')
	if (i < 0) throw new Error('图片数据为空')
	const b64 = uri.slice(i + 7)
	if (!b64) throw new Error('图片数据为空')
	const mime = uri.slice(5, i).replace(';', '') || 'image/jpeg'
	const path = writeB64ToDisk(id, b64, mime)
	if (!path) throw new Error('图片写入本地失败')
	return path
}

/**
 * 生成缩略图 data URI（聊天图片、取件/送达留痕用）。
 *
 * 为什么不用云存储的临时链接显示：
 * 小程序 <image> 走的是 downloadFile 域名白名单，云存储的 CDN 域名没加进去就加载不出来；
 * 临时链接还会过期，旧消息过一阵子照样变裂图。缩略图直接内嵌成 data URI，
 * 不发额外请求、不看过期时间，任何端都能立刻画出来。
 * 原图仍然传云存储，只在点开预览时用（失败了就退回缩略图）。
 */
export async function thumbDataUri(filePath, opts = {}) {
	const maxLen = opts.maxLen || 12000
	const width = Number(opts.width) || 400
	// 从清晰到省流逐档试：先尽量保住清晰度，压不进 maxLen 再往下降
	const ladder = [
		{ width, quality: 50 },
		{ width: Math.round(width * 0.86), quality: 46 },
		{ width: Math.round(width * 0.72), quality: 42 },
		{ width: Math.round(width * 0.58), quality: 38 },
		{ width: Math.round(width * 0.44), quality: 34 },
		{ width: 200, quality: 32 }
	]
	for (const s of ladder) {
		try {
			const path = await compressImage(filePath, s)
			const b64 = await readBase64(path)
			if (!b64) continue
			const uri = 'data:image/jpeg;base64,' + b64
			if (uri.length <= maxLen) return uri
		} catch (e) {
			// 这一档失败就换更小的再试
		}
	}
	return ''
}

/**
 * 取件/送达留痕：弹「拍照 / 跳过」，返回 { fileID, thumb }、空串（跳过）或 null（取消整件事）。
 * 不拍照也能继续，不能因为留痕卡住履约。
 * thumb 是缩略图 data URI：详情页直接画它，不依赖云存储域名/临时链接。
 */
export function askProofImage(opts = {}) {
	return new Promise((resolve) => {
		uni.showActionSheet({
			itemList: ['拍照留痕（建议）', '跳过，直接继续'],
			success: (r) => {
				if (r.tapIndex === 1) return resolve('')
				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					sourceType: ['camera', 'album'],
					success: async (img) => {
						const path = img.tempFilePaths[0]
						try {
							// 留痕图只出现在订单详情，缩略图可以给大一点（560px / 36KB），
							// 太小会糊成一片，太大又会把详情返回体撑爆。
							// 服务端上限 44KB，且超限只丢缩略图、不影响送达（1.2.4 起）。
							const thumb = await thumbDataUri(path, { width: 560, maxLen: 36000 })
							const fileID = await uploadImage(path, {
								role: opts.role || 'rider',
								dir: 'proof',
								width: 1200,
								quality: 65
							})
							resolve({ fileID, thumb })
						} catch (e) {
							uni.showToast({ title: (e && e.message) || '留痕上传失败', icon: 'none' })
							resolve('')
						}
					},
					fail: () => resolve('')
				})
			},
			fail: () => resolve(null)
		})
	})
}

/**
 * 把 data URI 写成临时文件。
 * uni.previewImage / <image> 对大图更依赖本地路径，缩略图要放大看时先落盘最稳。
 */
export function dataUriToTempFile(uri, ext = 'jpg') {
	return new Promise((resolve) => {
		const s = String(uri || '')
		const i = s.indexOf('base64,')
		if (i < 0) return resolve('')
		const b64 = s.slice(i + 7)
		const fs = typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
		const base = (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || ''
		if (!fs || !base) return resolve('')
		const filePath = `${base}/preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
		fs.writeFile({
			filePath,
			data: b64,
			encoding: 'base64',
			success: () => resolve(filePath),
			fail: () => resolve('')
		})
	})
}

/**
 * 把 cloud:// fileID 换成可显示的临时链接。
 * 返回 { fileID: tempFileURL } 映射；失败时返回空对象，调用方退回原值。
 */
export async function getTempUrls(fileIDs) {
	const ids = (fileIDs || []).filter((id) => typeof id === 'string' && id.indexOf('cloud://') === 0)
	if (!ids.length) return {}
	try {
		const res = await uniCloud.getTempFileURL({ fileList: ids })
		const list = (res && res.fileList) || []
		const map = {}
		list.forEach((f) => {
			if (f && f.fileID && f.tempFileURL) map[f.fileID] = f.tempFileURL
		})
		return map
	} catch (e) {
		return {}
	}
}
