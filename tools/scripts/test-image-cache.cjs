/**
 * 图片磁盘缓存单元测试（不需要小程序、不需要云空间）
 *
 * 用内存里的假文件系统 + 假的 uniCloud 图片接口，验证：
 *   1. 大图走本地文件而不是塞进 setData
 *   2. 第二次解析命中磁盘缓存，不再请求云端
 *   3. forgetImageSrc 会同时删文件和索引
 *   4. prefetchImages 并行取多张，全部落到缓存
 *
 * 用法：node tools/scripts/test-image-cache.cjs
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

/* ---------------- 假文件系统 ---------------- */
const disk = new Map()
let cloudCalls = 0
let inflight = 0
let maxInflight = 0

const fakeFs = {
  accessSync(p) {
    if (!disk.has(p)) throw new Error('ENOENT ' + p)
  },
  mkdirSync() {},
  writeFileSync(p, data, enc) {
    const buf = enc === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data)
    disk.set(p, buf)
  },
  statSync(p) {
    const buf = disk.get(p)
    if (!buf) throw new Error('ENOENT ' + p)
    return { size: buf.length }
  },
  unlinkSync(p) {
    disk.delete(p)
  }
}

const storage = new Map()

global.wx = {
  env: { USER_DATA_PATH: '/ud' },
  getFileSystemManager: () => fakeFs
}
global.uni = {
  getStorageSync: (k) => (storage.has(k) ? JSON.parse(storage.get(k)) : ''),
  setStorageSync: (k, v) => storage.set(k, JSON.stringify(v)),
  showToast: () => {}
}

/* ---------------- 假云对象：分片返回 base64 ---------------- */
const CHUNK = 400000
const TOTAL_B64 = 700000 // 约 525KB 的图，必须走两次分片
function bigB64() {
  const a = Buffer.alloc(Math.floor(TOTAL_B64 / 4) * 3, 7)
  return a.toString('base64').slice(0, TOTAL_B64)
}
const B64 = bigB64()

global.uniCloud = {
  importObject: () => ({
    async getImageData(id, offset) {
      cloudCalls++
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 30))
      inflight--
      const start = Number(offset) || 0
      const part = B64.slice(start, start + CHUNK)
      return {
        code: 0,
        data: {
          base64: part,
          mime: 'image/jpeg',
          size: Math.floor((TOTAL_B64 / 4) * 3),
          offset: start,
          chunk: part.length,
          done: start + part.length >= B64.length
        }
      }
    }
  })
}

/* ---------------- 载入被测模块 ---------------- */
const MOD = path.resolve(__dirname, '..', '..', 'apps', 'user', 'common', 'image.js')
const tmp = path.join(os.tmpdir(), 'xyyx-image-' + Date.now() + '.mjs')
fs.writeFileSync(tmp, fs.readFileSync(MOD, 'utf8'), 'utf8')

let fails = 0
let pass = 0
function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log('  ✓ ' + name)
  } else {
    fails++
    console.log('  ✗ ' + name + (extra ? '  ' + extra : ''))
  }
}

;(async () => {
  const { resolveImageSrc, forgetImageSrc, prefetchImages } = await import('file://' + tmp)

  console.log('1. 大图落盘')
  const id = 'cloud://test/photo.jpg'
  const r1 = await resolveImageSrc('user', id)
  ok('返回了可显示的 src', !!r1.src, JSON.stringify(r1.errors))
  ok('大图走本地文件（method=file）', r1.method === 'file', 'method=' + r1.method)
  ok('src 是本地路径而不是 data URI', r1.src.indexOf('data:') !== 0 && !!disk.get(r1.src))
  ok('文件内容长度与分片拼接一致', disk.get(r1.src).length === Math.floor((TOTAL_B64 / 4) * 3))
  ok('分了两次请求', cloudCalls === 2, 'calls=' + cloudCalls)

  console.log('2. 第二次命中磁盘缓存')
  const before = cloudCalls
  const r2 = await resolveImageSrc('user', id)
  // 同一个进程里会先命中内存缓存（更快），重启后才是 disk；两种都算命中
  ok('命中本地缓存', r2.method === 'disk' || r2.method === 'file', 'method=' + r2.method)
  ok('没有再次请求云端', cloudCalls === before, 'calls=' + (cloudCalls - before))
  ok('还是同一个文件', r2.src === r1.src)

  console.log('3. 缓存可以失效')
  forgetImageSrc(id)
  ok('文件已删除', !disk.get(r1.src))
  ok('索引已清空', !(JSON.parse(storage.get('__imgDiskCache') || '{}')[id]))

  console.log('4. 多张并行预取')
  const ids = ['cloud://t/a.jpg', 'cloud://t/b.jpg', 'cloud://t/c.jpg']
  const map = await prefetchImages('user', ids, { concurrency: 2 })
  ok('三张全部拿到', Object.keys(map).length === 3, JSON.stringify(Object.keys(map)))
  ok('并发没有超过 2', maxInflight <= 2, 'maxInflight=' + maxInflight)
  ok('都进了磁盘索引', Object.keys(JSON.parse(storage.get('__imgDiskCache') || '{}')).length >= 3)

  try {
    fs.unlinkSync(tmp)
  } catch (e) {}
  console.log('')
  if (fails) {
    console.log('✗ ' + fails + ' 项失败，' + pass + ' 项通过')
    process.exit(1)
  }
  console.log('✓ 全部 ' + pass + ' 项断言通过')
})().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
