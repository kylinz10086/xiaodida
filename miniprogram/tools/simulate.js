#!/usr/bin/env node
/**
 * 业务逻辑端到端仿真（不需要微信开发者工具）
 *
 * 把 wx 的本地存储 API 打成内存桩，然后真的跑一遍状态机：
 *   发布 → 接单 → 完成 → 确认 / 取消 / 放弃，并断言每一步的数据变化。
 *
 * 用法：node tools/simulate.js
 * 退出码：0 全过；1 有断言失败
 */
const path = require('path')

/* ---------- wx 存储桩 ---------- */
const mem = new Map()
global.wx = {
  getStorageSync: (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : ''),
  setStorageSync: (k, v) => mem.set(k, JSON.stringify(v)),
  removeStorageSync: (k) => mem.delete(k),
  clearStorageSync: () => mem.clear()
}

const store = require(path.resolve(__dirname, '..', 'utils', 'store.js'))

let pass = 0
const failures = []

function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(name)
    console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

/* ---------- 1. 初始化 ---------- */
section('1. 首次启动')
store.bootstrap()
const user = store.getUser()
ok('自动创建了本地用户', !!user._id)
ok('用户带学校字段', user.school === '浙江中医药大学')

let list = store.getTaskList({ status: 1 }).data.list
ok('种子里有 3 条待接任务', list.length === 3, `实际 ${list.length}`)
ok('任务都有 typeText', list.every((t) => !!t.typeText))
ok('任务按创建时间倒序', list[0].create_time >= list[1].create_time)

/* ---------- 2. 发布 ---------- */
section('2. 发布需求')
const beforePublish = store.getUserInfo().data.published_count
const pub = store.publishTask({
  title: '帮我把北门的行李箱搬到宿舍',
  type: 1,
  description: '20 寸行李箱，不重',
  money: '8.5',
  itemType: '快递',
  itemSize: '大件',
  itemWeight: '约 5kg',
  timeOption: '1小时内',
  origin: { name: '北门快递点' },
  destination: { name: '学生公寓 7 号楼' }
})
ok('发布返回 code 0', pub.code === 0, JSON.stringify(pub))
ok('返回新任务 id', !!pub.data.id)
const myTaskId = pub.data.id

const afterPublish = store.getUserInfo().data
ok('发布数 +1', afterPublish.published_count === beforePublish + 1)
ok('金额被转成数字 8.5', store.getTaskDetail(myTaskId).data.money === 8.5)

/* ---------- 3. 参数校验 ---------- */
section('3. 参数校验')
ok('空标题被拒', store.publishTask({ title: '  ', money: 5 }).code === 400)
ok('金额为 0 被拒', store.publishTask({ title: 'x', money: 0 }).code === 400)
ok('金额非法被拒', store.publishTask({ title: 'x', money: 'abc' }).code === 400)

/* ---------- 4. 接单 ---------- */
section('4. 接单')
ok('不能接自己发的单', store.acceptTask(myTaskId).code === 400)
ok('不存在的任务 404', store.acceptTask('not_exist').code === 404)

const demoTask = store.getTaskList({ status: 1 }).data.list.find((t) => t._id !== myTaskId)
const acceptRes = store.acceptTask(demoTask._id)
ok('接别人的单成功', acceptRes.code === 0, JSON.stringify(acceptRes))

const accepted = store.getTaskDetail(demoTask._id).data
ok('状态变成 2 进行中', accepted.status === 2)
ok('记录了接单者', accepted.runner_id === user._id)
ok('记录了接单时间', !!accepted.accept_time)
ok('角色识别为 runner', accepted.role === 'runner')
ok('重复接单被拒', store.acceptTask(demoTask._id).code === 400)

/* ---------- 5. 完成 ---------- */
section('5. 完成与收入')
const incomeBefore = store.getUserInfo().data.total_income
ok('未接单者不能点完成', store.completeTask(myTaskId).code === 403)
const doneRes = store.completeTask(demoTask._id)
ok('接单者可以标记完成', doneRes.code === 0, JSON.stringify(doneRes))
const finished = store.getTaskDetail(demoTask._id).data
ok('状态变成 3 已完成', finished.status === 3)
ok('记录完成时间', !!finished.complete_time)
const incomeAfter = store.getUserInfo().data.total_income
ok('收入累加了本单金额', Math.abs(incomeAfter - incomeBefore - demoTask.money) < 1e-6, `${incomeBefore} -> ${incomeAfter}`)

/* ---------- 6. 放弃 ---------- */
section('6. 放弃任务')
const t2 = store.getTaskList({ status: 1 }).data.list.find((t) => t._id !== myTaskId)
ok('先接单', store.acceptTask(t2._id).code === 0)
ok('放弃成功', store.abandonTask(t2._id).code === 0)
const abandoned = store.getTaskDetail(t2._id).data
ok('回到待接单', abandoned.status === 1)
ok('清掉了接单者信息', !abandoned.runner_id && !abandoned.accept_time)

/* ---------- 7. 取消 ---------- */
section('7. 取消任务')
const pubBefore = store.getUserInfo().data.published_count
ok('取消自己的待接单任务', store.cancelTask(myTaskId, '不想发了').code === 0)
const cancelled = store.getTaskDetail(myTaskId).data
ok('状态变成 4 已取消', cancelled.status === 4)
ok('记录了取消原因', cancelled.cancel_reason === '不想发了')
ok('已取消的不能重复取消', store.cancelTask(myTaskId, 'x').code === 400)
ok('取消后发布数 -1', store.getUserInfo().data.published_count === pubBefore - 1)

/* ---------- 8. 确认完成 ---------- */
section('8. 发布者确认完成')
const pub2 = store.publishTask({ title: '带一份盖浇饭', type: 2, money: 6, origin: { name: '二食堂' }, destination: { name: '图书馆' } })
const id2 = pub2.data.id
// 用一个「别的用户」来接单：切换本地用户
const originalUser = store.getUser()
const other = { ...originalUser, _id: 'other_user', nickname: '别人', published_count: 0, accepted_count: 0, total_income: 0 }
store.saveUser({}) // 占位，保持接口形状
global.wx.setStorageSync('xyyx_user', other)
ok('另一个用户接单', store.acceptTask(id2).code === 0)

global.wx.setStorageSync('xyyx_user', originalUser)
ok('发布者确认完成', store.confirmTask(id2).code === 0)
ok('状态变成 3', store.getTaskDetail(id2).data.status === 3)

/* ---------- 9. 我的任务 ---------- */
section('9. 我的任务聚合')
const mine = store.getMyTasks().data.list
ok('只包含自己发布或接取的任务', mine.every((t) => t.publisher_id === originalUser._id || t.runner_id === originalUser._id))
ok('每条都带 role', mine.every((t) => t.role === 'publisher' || t.role === 'runner'))
const onlyPub = store.getMyTasks({ role: 'publisher' }).data.list
ok('按 role 过滤生效', onlyPub.every((t) => t.role === 'publisher'))
const onlyRunner = store.getMyTasks({ role: 'runner' }).data.list
ok('按 runner 过滤生效', onlyRunner.every((t) => t.role === 'runner'))
ok('按状态过滤生效', store.getMyTasks({ status: 3 }).data.list.every((t) => t.status === 3))

/* ---------- 10. 搜索 ---------- */
section('10. 搜索')
const kw = store.getTaskList({ status: null, keyword: '食堂' }).data.list
ok('关键词命中地点/标题', kw.length >= 1, `命中 ${kw.length}`)
ok('搜不到返回空数组', store.getTaskList({ status: null, keyword: 'zzz不存在zzz' }).data.list.length === 0)

/* ---------- 11. 数据重置 ---------- */
section('11. 重置')
mem.clear()
store.bootstrap()
ok('重置后回到 3 条种子任务', store.getTaskList({ status: 1 }).data.list.length === 3)
ok('重置后是新用户', store.getUserInfo().data.published_count === 0)

/* ---------- 结果 ---------- */
console.log('')
if (failures.length) {
  console.log(`✗ ${failures.length} 项失败，${pass} 项通过`)
  console.log(failures.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log(`✓ 全部 ${pass} 项断言通过`)
