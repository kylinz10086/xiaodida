'use strict'
/**
 * 提现回归测试（自动处理 + 风控）
 *
 * 以前的提现是「扣余额 → 进 frozen → 等人工审核」，但后台没有审核入口，
 * 钱提出来就永远卡住。现在改成自动处理，用代码做风控：
 *   认证骑手 / 单笔上限 / 单日次数 / 单日累计 / 冷却 / CAS 防并发 / 流水留痕。
 *
 * 运行：node tests/withdraw-flow.spec.js
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

const MIN = 600000 // 10 分钟冷却

async function main() {
  const env = createEnv({ uid: 'rider-1' })
  const { riderObj, meta, addDoc, get, coll, setUid, call } = env

  addDoc('xyyx-users', { _id: 'rider-1', nickname: '骑手', role: 'rider', rider_status: 2 })
  addDoc('xyyx-users', { _id: 'rider-new', nickname: '新人', role: 'user', rider_status: 0 })
  addDoc('xyyx-wallets', {
    _id: 'rider-1',
    balance_cent: 100000,
    income_cent: 120000,
    withdrawn_cent: 20000,
    frozen_cent: 0
  })
  addDoc('xyyx-wallets', {
    _id: 'rider-new',
    balance_cent: 10000,
    income_cent: 10000,
    withdrawn_cent: 0,
    frozen_cent: 0
  })

  console.log('\n[1] 只有认证骑手能提现')
  setUid('rider-new')
  const deny = await call(riderObj.requestWithdraw, { amount: 5, ...meta() })
  eq(deny.code, 403, '未认证被拒')

  console.log('\n[2] 金额校验')
  setUid('rider-1')
  const tooSmall = await call(riderObj.requestWithdraw, { amount: 2, ...meta() })
  eq(tooSmall.code, 400, '低于 3 元被拒')
  const tooBig = await call(riderObj.requestWithdraw, { amount: 300, ...meta() })
  eq(tooBig.code, 400, '单笔超过 200 元被拒')

  console.log('\n[3] 正常提现：余额扣减、累计已提现、流水，不再冻结')
  const res = await call(riderObj.requestWithdraw, { amount: 3, ...meta() })
  eq(res.code, 0, '提现成功: ' + res.msg)
  eq(res.data.auto, true, '标记为自动处理')
  eq(res.data.balance, 997, '返回剩余余额 997 元')
  const wallet = get('xyyx-wallets', 'rider-1')
  eq(wallet.balance_cent, 99700, '余额扣了 3 元')
  eq(wallet.withdrawn_cent, 20300, '累计已提现 +3 元')
  eq(wallet.frozen_cent, 0, '不再进冻结')
  const txs = Array.from(coll('xyyx-transactions').values())
  const wd = txs.find((t) => t.type === 'withdraw' && t.amount_cent === -300)
  ok(!!wd, '写了一条 -3 元的 withdraw 流水')
  eq(wd.remark, '提现到微信零钱（自动）', '流水备注说明自动处理')

  console.log('\n[4] 冷却：刚提过不能马上再提')
  const again = await call(riderObj.requestWithdraw, { amount: 3, ...meta() })
  eq(again.code, 400, '10 分钟内第二次被拒')

  console.log('\n[5] 单日累计上限 500 元')
  // 造两条 11 分钟前的提现流水：次数没超、冷却已过，但累计 300 元
  const past = Date.now() - MIN - 1000
  addDoc('xyyx-transactions', {
    _id: 'tx-old-1',
    type: 'withdraw',
    user_id: 'rider-1',
    amount_cent: -20000,
    remark: '历史提现',
    idempotency_key: 'old-1',
    create_time: past
  })
  addDoc('xyyx-transactions', {
    _id: 'tx-old-2',
    type: 'withdraw',
    user_id: 'rider-1',
    amount_cent: -10000,
    remark: '历史提现',
    idempotency_key: 'old-2',
    create_time: past
  })
  const overDaily = await call(riderObj.requestWithdraw, { amount: 250, ...meta() })
  eq(overDaily.code, 400, '300 + 250 超过单日 500 上限被拒')
  // 单笔上限先命中 250 > 200，所以换个不超单笔但超日累计的金额
  const overDaily2 = await call(riderObj.requestWithdraw, { amount: 200, ...meta() })
  eq(overDaily2.code, 400, '300 + 200 超单日上限被拒')

  console.log('\n[6] 旧版冻结金额自动退回')
  // 把已有提现流水挪到 11 分钟前，绕开冷却窗口（单日累计 303 元，仍在上限内）
  for (const tx of coll('xyyx-transactions').values()) {
    if (tx.type === 'withdraw') tx.create_time = Date.now() - MIN - 5000
  }
  const w = get('xyyx-wallets', 'rider-1')
  w.frozen_cent = 1234
  w.balance_cent = 5000
  const release = await call(riderObj.requestWithdraw, { amount: 3, ...meta() })
  const w2 = get('xyyx-wallets', 'rider-1')
  eq(w2.frozen_cent, 0, '冻结清零')
  eq(w2.balance_cent, 5000 + 1234 - 300, '冻结金额回到余额后再扣提现')
  eq(release.code, 0, '退回后可正常提现: ' + release.msg)

  console.log('\n[7] 余额不足')
  const w3 = get('xyyx-wallets', 'rider-1')
  w3.balance_cent = 100
  const noMoney = await call(riderObj.requestWithdraw, { amount: 3, ...meta() })
  eq(noMoney.code, 400, '余额不足被拒')

  console.log('\n-----------------------------')
  console.log('passed ' + passed + ', failed ' + failures.length)
  if (failures.length) {
    failures.forEach((f) => console.log('  FAILED: ' + f))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
