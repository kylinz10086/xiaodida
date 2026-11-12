'use strict'
/**
 * 骑手端接单 → 取件 → 送达 → 结算 的回归测试
 *
 * 重点验证「接单之后无法完成订单」这个 bug 修好了没有：
 *   骑手点「已送达」后订单必须变成「已完成」，钱必须进骑手钱包，
 *   而不是卡在「进行中」等用户确认。
 *
 * 运行：node tests/rider-flow.spec.js
 */

const { createEnv } = require('./fake-uni')

let passed = 0
const failures = []

function ok(cond, label, extra) {
  if (cond) {
    passed++
    console.log('  [OK] ' + label)
  } else {
    failures.push(label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
    console.log('  [FAIL] ' + label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
  }
}

function eq(actual, expect, label) {
  ok(actual === expect, label, { actual, expect })
}

async function main() {
  const env = createEnv({ uid: 'rider-1' })
  const { C, riderObj, meta, coll, addDoc, get, setUid, call } = env

  // 抽佣比例是可配置的（当前 5%），断言跟着常量走，别写死数字
  const RATE = C.COMMISSION_RATE
  const incomeCentOf = (amountCent) => Math.round(amountCent * (1 - RATE))
  const yuanOf = (cents) => Number((cents / 100).toFixed(2))

  addDoc('xyyx-users', {
    _id: 'rider-1',
    nickname: 'rider',
    role: 'rider',
    rider_status: 2,
    rating: 5,
    accepted_count: 0,
    mobile: '13800000001'
  })
  addDoc('xyyx-users', { _id: 'pub-user', nickname: 'pub', role: 'user', rider_status: 0 })

  addDoc('xyyx-tasks', {
    _id: 'task-0000-r1',
    title: 'qu kuaidi',
    type: 1,
    type_text: 'kuaidi',
    amount_cent: 1000,
    pay_status: 'paid',
    pay_mode: 'mock',
    paid_cent: 1000,
    payments: [{ no: 'P1', cent: 1000, type: 'full', time: Date.now(), refunded: 0 }],
    status: C.STATUS.PENDING,
    publisher_id: 'pub-user',
    mobile: '13800000002',
    origin: { name: 'A building', detail: 'room 101', latitude: 30.1, longitude: 120.1 },
    destination: { name: 'B building', detail: 'room 202', latitude: 30.2, longitude: 120.2 },
    remark: 'fragile',
    create_time: Date.now()
  })

  // 自己发的单不进大厅
  addDoc('xyyx-tasks', {
    _id: 'task-0000-own',
    title: 'my own task',
    type: 1,
    type_text: 'kuaidi',
    amount_cent: 500,
    pay_status: 'paid',
    status: C.STATUS.PENDING,
    publisher_id: 'rider-1',
    create_time: Date.now()
  })

  console.log('\n[1] 抢单大厅')
  const hall = await call(riderObj.listHall, {})
  eq(hall.code, 0, 'list hall ok')
  eq(hall.data.list.length, 1, 'own task excluded from hall')
  const item = hall.data.list[0]
  eq(item.amount, 10, 'amount 10 yuan')
  // 这是「可赚 ¥0」那个 bug：还没结算也要显示预期收入
  eq(item.income, yuanOf(incomeCentOf(1000)), 'expected income = amount - commission')
  eq(item.income_settled, false, 'not settled yet')
  eq(item.contact, null, 'no contact before accepting')
  eq(item.remark, '', 'no remark before accepting')
  eq(item.origin.latitude, 30.1, 'coordinates visible for distance')
  eq(item.origin.detail, '', 'door detail hidden before accepting')

  console.log('\n[2] 骑手未认证不能抢单')
  addDoc('xyyx-users', { _id: 'rider-0', nickname: 'newbie', role: 'user', rider_status: 0 })
  setUid('rider-0')
  const deny = await call(riderObj.grabTask, 'task-0000-r1', meta())
  eq(deny.code, 403, 'blocked for unverified rider')
  setUid('rider-1')

  console.log('\n[3] 抢单')
  const grab = await call(riderObj.grabTask, 'task-0000-r1', meta())
  eq(grab.code, 0, 'grab ok: ' + grab.msg)
  let t = get('xyyx-tasks', 'task-0000-r1')
  eq(t.status, C.STATUS.ONGOING, 'status ongoing')
  eq(t.runner_id, 'rider-1', 'runner assigned')
  eq(!!t.accept_time, true, 'accept_time set')

  console.log('\n[4] 接单后才能看到联系方式与门牌')
  const detail = await call(riderObj.getTaskDetail, 'task-0000-r1')
  eq(detail.code, 0, 'detail ok')
  eq(detail.data.contact.mobile, '13800000002', 'full mobile for calling')
  eq(detail.data.origin.detail, 'room 101', 'door detail unlocked')
  eq(detail.data.remark, 'fragile', 'remark unlocked')

  console.log('\n[5] 没取件不能点送达')
  const early = await call(riderObj.markDelivered, 'task-0000-r1', meta())
  eq(early.code, 400, 'blocked before picked')

  console.log('\n[6] 取件')
  const picked = await call(riderObj.markPicked, 'task-0000-r1', meta())
  eq(picked.code, 0, 'picked ok')
  t = get('xyyx-tasks', 'task-0000-r1')
  eq(!!t.picked_time, true, 'picked_time set')
  const pickedAgain = await call(riderObj.markPicked, 'task-0000-r1', meta())
  eq(pickedAgain.code, 0, 'picked is idempotent')

  console.log('\n[7] 送达 = 完成并结算（核心修复）')
  const delivered = await call(riderObj.markDelivered, 'task-0000-r1', meta())
  eq(delivered.code, 0, 'deliver ok: ' + delivered.msg)
  eq(delivered.data.settled, true, 'settled on delivery')
  eq(delivered.data.income, yuanOf(incomeCentOf(1000)), 'rider income = amount - commission')
  t = get('xyyx-tasks', 'task-0000-r1')
  eq(t.status, C.STATUS.DONE, 'order is DONE (not stuck at ongoing)')
  eq(t.rider_income_cent, incomeCentOf(1000), 'rider_income_cent = amount - commission')
  eq(t.commission_cent, 1000 - incomeCentOf(1000), 'commission = amount * rate')
  eq(!!t.complete_time, true, 'complete_time set')
  eq(!!t.delivered_time, true, 'delivered_time set')

  const wallet = get('xyyx-wallets', 'rider-1')
  eq(wallet.balance_cent, incomeCentOf(1000), 'rider wallet credited')
  eq(wallet.income_cent, incomeCentOf(1000), 'rider income ledger credited')

  const txs = Array.from(coll('xyyx-transactions').values())
  eq(txs.filter((x) => x.type === 'income').length, 1, 'one income transaction')
  eq(txs.filter((x) => x.type === 'commission').length, 1, 'one commission transaction')
  eq(txs.filter((x) => x.type === 'escrow_out').length, 1, 'one escrow_out transaction')

  console.log('\n[8] 重复点送达不会重复结算')
  const again = await call(riderObj.markDelivered, 'task-0000-r1', meta())
  eq(again.code, 400, 'second deliver rejected')
  eq(get('xyyx-wallets', 'rider-1').balance_cent, incomeCentOf(1000), 'wallet not credited twice')

  console.log('\n[9] 我的任务列表 & 今日统计')
  const jobs = await call(riderObj.listMyJobs, {})
  eq(jobs.code, 0, 'jobs ok')
  eq(jobs.data.list.length, 1, 'one job')
  eq(jobs.data.list[0].status, C.STATUS.DONE, 'job status done')
  eq(jobs.data.summary.done, 1, 'summary done count')
  eq(jobs.data.summary.ongoing, 0, 'summary ongoing count')

  const profile = await call(riderObj.getProfile)
  eq(profile.code, 0, 'profile ok')
  eq(profile.data.rider.done_count, 1, 'done_count 1')
  eq(profile.data.rider.today_count, 1, 'today_count 1')
  eq(profile.data.rider.today_income, yuanOf(incomeCentOf(1000)), 'today_income = amount - commission')
  eq(profile.data.wallet.balance, yuanOf(incomeCentOf(1000)), 'wallet balance in profile')

  console.log('\n[10] 放弃任务回到大厅')
  addDoc('xyyx-tasks', {
    _id: 'task-0000-r2',
    title: 'second',
    type: 2,
    type_text: 'meal',
    amount_cent: 600,
    pay_status: 'paid',
    paid_cent: 600,
    payments: [{ no: 'P2', cent: 600, type: 'full', time: Date.now(), refunded: 0 }],
    status: C.STATUS.PENDING,
    publisher_id: 'pub-user',
    create_time: Date.now()
  })
  await call(riderObj.grabTask, 'task-0000-r2', meta())
  const ab = await call(riderObj.abandonTask, 'task-0000-r2', 'too far', meta())
  eq(ab.code, 0, 'abandon ok')
  const r2 = get('xyyx-tasks', 'task-0000-r2')
  eq(r2.status, C.STATUS.PENDING, 'back to pending')
  eq(r2.runner_id, '', 'runner cleared')
  eq(r2.picked_time, 0, 'picked_time cleared')

  console.log('\n[11] 待补差价的订单不能被抢')
  addDoc('xyyx-tasks', {
    _id: 'task-0000-due',
    title: 'unpaid diff',
    type: 1,
    type_text: 'kuaidi',
    amount_cent: 300,
    // 涨价改单了但只付了 1 元：pay_status 仍是 partial，这里故意伪造 paid 试探
    pay_status: 'paid',
    paid_cent: 100,
    due_cent: 200,
    status: C.STATUS.PENDING,
    publisher_id: 'pub-user',
    create_time: Date.now()
  })
  const grabDue = await call(riderObj.grabTask, 'task-0000-due', meta())
  eq(grabDue.code, 400, 'blocked: order not fully paid')

  console.log('\n[12] 学号 15 位才能提交骑手申请')
  setUid('rider-0')
  const badNo = await call(riderObj.applyRider, { real_name: 'zhangsan', student_no: '2025122114040', mobile: '13800000009', ...meta() })
  eq(badNo.code, 400, 'reject 13-digit student no')
  const badNo2 = await call(riderObj.applyRider, { real_name: 'zhangsan', student_no: '20251221140400a', mobile: '13800000009', ...meta() })
  eq(badNo2.code, 400, 'reject non-digit student no')
  const goodNo = await call(riderObj.applyRider, { real_name: 'zhangsan', student_no: '202512211404009', mobile: '13800000009', ...meta() })
  eq(goodNo.code, 0, 'accept 15-digit student no')
  const riderProfile = await call(riderObj.getProfile)
  eq(riderProfile.data.student_no, '202512211404009', 'student no stored in full')
  eq(riderProfile.data.student_no_display, '2025 学年 · 122114 · 04009', 'student no echoed in segments')
  eq(riderProfile.data.student_info.major, '122114', 'major segment parsed')
  eq(riderProfile.data.student_info.class_no, '04009', 'class segment parsed')

  console.log('\n[13] 费率来自配置表，改完立即生效（代码里不写死）')
  addDoc('xyyx-settings', {
    _id: 'app',
    commissionRate: 0.2,
    refundFeeRate: 0.01,
    minOrderYuan: 2,
    maxOrderYuan: 500
  })
  await C.loadSettings(true)
  eq(C.S().commissionRate, 0.2, 'settings override loaded')
  eq(C.S().refundFeeRate, 0.01, 'refund fee rate comes from settings')

  const hallAfter = await call(riderObj.listHall, {})
  const hit = (hallAfter.data.list || []).find((x) => x._id === 'task-0000-r2') || {}
  eq(hit.amount, 6, 'task found in hall')
  eq(hit.income, 4.8, 'income uses 20% commission (6 * 0.8)')
  eq(C.refundFeeOf(300), 3, 'refund fee uses 1% from settings')
  eq(C.refundNetOf(300), 297, 'net refund 297 with 1% fee')

  console.log('\n-----------------------------')
  console.log(`passed ${passed}, failed ${failures.length}`)
  if (failures.length) {
    failures.forEach((f) => console.log('  FAIL: ' + f))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('test crashed:', e)
  process.exit(1)
})
