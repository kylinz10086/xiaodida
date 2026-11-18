/**
 * errText 文案映射测试
 *
 * 背景：2026-11-18 云空间异常（Env状态异常），用户看到的是「加载失败」，
 * 我们自己也看不出是平台挂了还是代码挂了。这组断言保证：
 *   - 平台级错误翻成人话
 *   - 业务错误保留原文
 *   - 「[云对象]: 」前缀去掉
 *
 * 用法：node tools/scripts/test-errtext.cjs
 */
'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

const MOD = path.resolve(__dirname, '..', '..', 'apps', 'user', 'common', 'rider-util.js')
const tmp = path.join(os.tmpdir(), 'xyyx-errtext-' + Date.now() + '.mjs')
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
  const { errText } = await import('file://' + tmp)

  console.log('1. 平台级错误')
  ok('Env状态异常 → 人话', errText(new Error('[xyyx-user]: Env状态异常'), '加载失败') === '服务暂时不可用，请稍后再试')
  ok('不带前缀也认', errText(new Error('Env状态异常'), '加载失败') === '服务暂时不可用，请稍后再试')
  ok('FUNCTION_NOT_FOUND 也认', errText(new Error('FUNCTION_NOT_FOUND'), 'x') === '服务暂时不可用，请稍后再试')

  console.log('2. 登录态')
  ok('token 过期 → 重新进入', /重新进入/.test(errText(new Error('[uni-id-co]: token expired'), 'x')))
  ok('token 无效 → 重新进入', /重新进入/.test(errText(new Error('uni-id-check-token-failed'), 'x')))

  console.log('3. 网络')
  ok('超时 → 检查网络', /网络/.test(errText({ errMsg: 'request:fail timeout' }, 'x')))

  console.log('4. 业务错误保留原文')
  ok('业务文案原样返回', errText(new Error('[xyyx-user]: 余额不足'), 'x') === '余额不足')
  ok('没有前缀就原样返回', errText(new Error('订单状态已变化，请刷新后重试'), 'x') === '订单状态已变化，请刷新后重试')

  console.log('5. 兜底')
  ok('空参数用 fallback', errText(null, '加载失败') === '加载失败')
  ok('全空用默认文案', errText(null) === '操作失败')
  ok('errMsg 兜底', errText({ errMsg: 'chooseImage:fail' }, 'x') === 'chooseImage:fail')

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
