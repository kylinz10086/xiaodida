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
 * 图片超过 900KB（服务端上限）会先压缩；压完还超就报错让用户换一张。
 */
export async function uploadImage(filePath, opts = {}) {
	const role = opts.role || 'user'
	const dir = opts.dir || 'misc'
	let path = filePath
	let b64 = ''

	for (const quality of [opts.quality || 60, 45, 30]) {
		path = await compressImage(filePath, { quality, width: opts.width || 1080 })
		b64 = await readBase64(path)
		if (!b64) throw new Error('读取图片失败')
		// base64 长度 ≈ 二进制 × 1.37，留一点 JSON 余量
		if (b64.length <= 1_150_000) break
	}

	if (b64.length > 1_150_000) throw new Error('图片太大，请换一张或先裁剪')

	const res = await apiOf(role).uploadImage({
		base64: b64,
		ext: 'jpg',
		dir,
		...requestMeta()
	})
	if (res.code !== 0) throw new Error(res.msg || '上传失败')
	const data = res.data || {}
	if (!data.fileID) throw new Error('上传返回异常')
	return data.fileID
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

	if (!skip.data) {
		try {
			const uri = await fetchImageData(role, id)
			// data URI 太大时微信会直接不画（setData 单次上限 1MB），宁可走落盘
			const maxLen = Number(opts.maxDataLen) || 900000
			if (uri && uri.length <= maxLen) return hit(uri, 'data')
			if (uri) errors.push('直读:图片太大（' + Math.round(uri.length / 1024) + 'KB）')
		} catch (e) {
			errors.push('直读:' + ((e && e.message) || '失败'))
		}
	}

	if (!skip.file) {
		try {
			const path = await fetchImageToTempFile(role, id)
			if (path) return hit(path, 'file')
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
	srcCache.delete(String(fileID || '').trim())
}

/**
 * 分片取原图，最后一次性写成本地文件。
 *
 * 之前是每片 appendFileSync(base64) —— 微信的 appendFile 对 base64 解码并不可靠，
 * 多片拼出来的文件会坏掉，表现就是「小图能看、大图全黑 + 原图显示失败」。
 * 现在改成：分片取回先拼 base64，最后 writeFileSync 一次写入，并校验文件大小；
 * 写失败再退一步用 base64ToArrayBuffer 写。
 */
export function fetchImageToTempFile(role, fileID) {
	return new Promise((resolve, reject) => {
		const id = String(fileID || '').trim()
		const isRef = /^cloud:\/\//.test(id) || /^https?:\/\//.test(id)
		if (!isRef) return reject(new Error('图片地址无效'))
		const fs = typeof wx !== 'undefined' && wx.getFileSystemManager ? wx.getFileSystemManager() : null
		const base = (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || ''
		if (!fs || !base) return reject(new Error('当前环境不支持保存图片'))

		const api = apiOf(role)
		const filePath = `${base}/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
		const parts = []
		let offset = 0
		let total = 0

		const run = async () => {
			try {
				for (let i = 0; i < 80; i++) {
					const res = await api.getImageData(id, offset)
					if (!res || res.code !== 0) throw new Error((res && res.msg) || '图片读取失败')
					const d = res.data || {}
					if (!d.base64) throw new Error('图片数据为空')
					parts.push(d.base64)
					total = Number(d.size) || total
					// 兼容旧版云函数（整张图一次返回）
					if (d.chunk === undefined || d.done === undefined) break
					offset = Number(d.offset) + Number(d.chunk)
					if (d.done) break
					if (!d.chunk) throw new Error('图片分片异常')
				}

				const b64 = parts.join('')
				let wrote = false
				try {
					fs.writeFileSync(filePath, b64, 'base64')
					wrote = true
				} catch (e) {
					wrote = false
				}
				if (!wrote && typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
					fs.writeFileSync(filePath, wx.base64ToArrayBuffer(b64))
					wrote = true
				}
				if (!wrote) throw new Error('图片写入本地失败')

				// 校验大小：多片拼接如果出错，这里能立刻发现，而不是丢给 <image> 黑屏
				const st = fs.statSync(filePath)
				if (total && st && st.size !== total) {
					throw new Error('图片不完整（' + st.size + '/' + total + '）')
				}
				resolve(filePath)
			} catch (e) {
				reject(e instanceof Error ? e : new Error('图片读取失败'))
			}
		}
		run()
	})
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
	const sizes = [
		{ width: opts.width || 400, quality: 45 },
		{ width: 280, quality: 40 },
		{ width: 200, quality: 35 }
	]
	for (const s of sizes) {
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
							const thumb = await thumbDataUri(path, { width: 480 })
							const fileID = await uploadImage(path, {
								role: opts.role || 'rider',
								dir: 'proof',
								width: 1600,
								quality: 75
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
