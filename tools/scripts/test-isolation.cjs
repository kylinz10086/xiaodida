#!/usr/bin/env node
/**
 * 隔离规则回归测试（不需要云端）
 *
 * 干什么：把 xyyx-common 里的两个「视图函数」单独跑起来，断言字段裁剪是不是真的生效。
 * 为什么重要：两端口信息隔离是产品红线（rule.md 第 9 节），靠人肉 review 迟早漏，
 *             这里把它变成可执行断言。
 *
 * 做法：用 Module._load 钩子把 uni-id-common 和 uniCloud 打桩，然后 require 真实的
 *       xyyx-common（不是复制的逻辑），保证测的就是线上跑的那份代码。
 *
 * 用法：node tools/scripts/test-isolation.mjs
 * 退出码：0 全过；1 有断言失败
 */
const path = require('path')
const Module = require('module')

const COMMON = path.resolve(
  __dirname,
  '..',
  '..',
  'apps',
  'user',
  'uniCloud-aliyun',
  'cloudfunctions',
  'common',
  'xyyx-common',
  'index.js'
)

/* ---------- 打桩 ---------- */
const noopDb = {
  collection: () => ({
    doc: () => ({ get: async () => ({ data: [] }), update: async () => ({ updated: 1 }), set: async () => ({}) }),
    where: () => ({
      get: async () => ({ data: [] }),
      count: async () => ({ total: 0 }),
      update: async () => ({ updated: 1 }),
      orderBy: () => ({ skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) })
    }),
    add: async () => ({ id: 'x' })
  }),
  command: { inc: (n) => ({ __inc: n }), neq: (v) => ({ __neq: v }), gte: (v) => ({ __gte: v }), or: () => ({}), and: () => ({}) },
  startTransaction: async () => ({})
}

global.uniCloud = { database: () => noopDb, importObject: () => ({}) }
global.console.error = () => {}

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'uni-id-common') {
    return { createInstance: () => ({ checkToken: async () => ({ uid: 'u1' }) }) }
  }
  return origLoad.call(this, request, parent, isMain)
}

const C = require(COMMON)

/* ---------- 断言框架 ---------- */
let pass = 0
const fails = []
function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fails.push(name)
    console.log(`  ✗ ${name}  ${extra}`)
  }
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

/* ---------- 造一个订单 ---------- */
const task = {
  _id: 'task_1',
  title: '东门驿站取快递',
  type: 1,
  type_text: '快递代取',
  description: '两个箱子',
  amount_cent: 1000,
  commission_cent: 100,
  rider_income_cent: 900,
  status: 1,
  item_type: '快递',
  item_size: '中件',
  item_weight: '约2kg',
  time_option: '30分钟内',
  origin: { name: '东门菜鸟驿站', detail: '3号柜', latitude: 30.1, longitude: 120.1 },
  destination: { name: '3号宿舍楼', detail: '302 室', latitude: 30.2, longitude: 120.2 },
  mobile: '13800001234',
  wechat_id: 'wx_test',
  remark: '到了打电话',
  images: [],
  publisher_id: 'u_pub',
  publisher_nickname: '林同学',
  runner_id: '',
  runner_nickname: '',
  create_time: 1700000000000
}

console.log('1. 骑手看「待接单」的订单（尚未接单）')
const before = C.taskForRider(task, 'u_rider')
ok('没有 contact 字段内容（contact 为 null）', before.contact === null, JSON.stringify(before.contact))
ok('返回体里任何位置都不含完整手机号', !JSON.stringify(before).includes('13800001234'))
ok('没有明文字段 mobile', !has(before, 'mobile'))
ok('门牌详情被抹掉', before.destination.detail === '')
ok('备注被抹掉', before.remark === '')
ok('地点名仍然可见（骑手要知道去哪）', before.destination.name === '3号宿舍楼')
ok('金额与可赚金额可见', before.amount === 10 && before.income === 9)

console.log('\n2. 骑手看「自己已接单」的订单')
const accepted = C.taskForRider({ ...task, status: 2, runner_id: 'u_rider' }, 'u_rider')
ok('给脱敏手机号', accepted.contact && accepted.contact.mobile_masked === '138****1234', JSON.stringify(accepted.contact))
ok('脱敏号里不含中间四位', !(accepted.contact.mobile_masked || '').includes('0000'))
ok('给出完整门牌', accepted.destination.detail === '302 室')
ok('给出备注', accepted.remark === '到了打电话')
ok('标记 mine=true', accepted.mine === true)

console.log('\n3. 骑手看「别人接的单」')
const others = C.taskForRider({ ...task, status: 2, runner_id: 'u_other' }, 'u_rider')
ok('别人接的单不给联系方式', others.contact === null)
ok('mine=false', others.mine === false)

console.log('\n4. 用户端视图')
const asPublisher = C.taskForUser({ ...task, status: 2, runner_id: 'u_rider' }, 'u_pub')
ok('发布者能看到自己填的联系方式', asPublisher.contact && asPublisher.contact.mobile === '13800001234')
ok('role=publisher', asPublisher.role === 'publisher')
ok('骑手信息只有昵称/头像/评分，没有手机号', asPublisher.rider && !has(asPublisher.rider, 'mobile'))
ok('骑手对象不含真实姓名字段', !has(asPublisher.rider || {}, 'real_name'))

const asVisitor = C.taskForUser(task, 'u_stranger')
ok('陌生人不给联系方式', asVisitor.contact === null)
ok('role=visitor', asVisitor.role === 'visitor')

console.log('\n5. 金额换算')
ok('10 元 = 1000 分', C.toCents(10) === 1000)
ok('9.99 元 = 999 分', C.toCents(9.99) === 999)
ok('1.1+0.2 不产生浮点误差', C.toCents(1.1 + 0.2) === 130, String(C.toCents(1.1 + 0.2)))
ok('分转元', C.yuan(1000) === 10 && C.yuan(999) === 9.99)
let threw = false
try {
  C.toCents(0.5)
} catch (e) {
  threw = true
}
ok('低于 1 元被拒', threw)

console.log('\n6. 手机号脱敏工具')
ok('13800001234 -> 138****1234', C.maskMobile('13800001234') === '138****1234')
ok('太短的返回空', C.maskMobile('123') === '')

console.log('')
if (fails.length) {
  console.log(`✗ ${fails.length} 项失败，${pass} 项通过`)
  process.exit(1)
}
console.log(`✓ 全部 ${pass} 项断言通过`)
