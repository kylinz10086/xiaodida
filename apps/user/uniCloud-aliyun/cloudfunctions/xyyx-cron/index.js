'use strict'
/**
 * xyyx-cron —— 定时任务云函数
 *
 * 两件事：
 *   1. 自动确认收货：骑手标记送达后，用户 24 小时内没确认也没提异议的，自动结算。
 *      这是「外卖式托管」的必要兜底，否则骑手送完了钱一直卡在托管里。
 *   2. 清理过期 nonce：防重放表会一直涨，过期就删。
 *
 * 触发配置见同目录 cloudfunction-config.json（uniCloud 定时触发器，每 10 分钟一次）。
 * 也可以手工调用：uniCloud.callFunction({ name: 'xyyx-cron' })
 */

const C = require('xyyx-common')

/** 单次最多处理多少单，避免一次跑太久超时 */
const BATCH = 50

async function autoConfirm() {
  const now = Date.now()
  const res = await C.db
    .collection(C.COLL.tasks)
    .where({
      status: C.STATUS.ONGOING,
      delivered_time: C.dbCmd.gt(0),
      auto_confirm_at: C.dbCmd.lte(now)
    })
    .limit(BATCH)
    .get()

  const list = res.data || []
  const done = []
  const failed = []

  for (const task of list) {
    try {
      // settleTask 内部有 status CAS，重复调用不会重复记账
      const r = await C.settleTask(task, 'auto')
      done.push({ id: task._id, riderIncome: C.yuan(r.riderIncome), commission: C.yuan(r.commission) })
    } catch (e) {
      failed.push({ id: task._id, msg: e && e.message })
    }
  }

  return { scanned: list.length, settled: done.length, failed, done }
}

async function cleanNonces() {
  const now = Date.now()
  try {
    const r = await C.db.collection(C.COLL.nonces).where({ expire_time: C.dbCmd.lt(now) }).remove()
    return r.deleted || 0
  } catch (e) {
    // remove 在某些环境下不可用，退化成不清理（不影响主流程）
    return -1
  }
}

exports.main = async () => {
  const started = Date.now()
  let confirmResult = null
  let confirmError = null
  try {
    confirmResult = await autoConfirm()
  } catch (e) {
    confirmError = e && e.message
    console.error('[xyyx-cron] 自动确认失败:', confirmError)
  }

  const removed = await cleanNonces()

  const summary = {
    ok: !confirmError,
    scan: confirmResult ? confirmResult.scanned : 0,
    settled: confirmResult ? confirmResult.settled : 0,
    failed: confirmResult ? confirmResult.failed : [],
    nonces_removed: removed,
    cost_ms: Date.now() - started
  }
  console.log('[xyyx-cron]', JSON.stringify(summary))
  return summary
}
