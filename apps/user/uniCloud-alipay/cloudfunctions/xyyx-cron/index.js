'use strict'
/**
 * xyyx-cron —— 定时任务云函数
 *
 * 四件事：
 *   1. 自动完成订单：骑手标记送达但结算那一步失败的，补一次（送达即结算的兜底）。
 *   2. 重试卡住的退款：退款单停在 processing 超过 2 分钟的，重新提交给微信。
 *      —— 退款是钱，不能因为一次网络抖动就永远卡住。
 *   3. 同步退款结果：微信退款是异步的，主动查一次状态，避免只依赖回调。
 *   4. 清理过期 nonce：防重放表会一直涨，过期就删。
 *
 * 触发配置见同目录 cloudfunction-config.json（uniCloud 定时触发器，每 10 分钟一次）。
 * 也可以手工调用：uniCloud.callFunction({ name: 'xyyx-cron' })
 */

const C = require('xyyx-common')

/** 单次最多处理多少单，避免一次跑太久超时 */
const BATCH = 50

/**
 * 云函数里调云对象：只有不带客户端身份的调用才行得通，
 * 这正是 pay-notify 已经在用的方式（退款/支付内部方法不依赖用户 token）。
 */
function payApi() {
  return uniCloud.importObject('xyyx-pay', { customUI: true })
}

async function autoConfirm() {
  const now = Date.now()
  // AUTO_SETTLE_ON_DELIVER 打开时，只要骑手点过送达就该立刻结算；
  // 这里再扫一遍是为了兜住「改开关之前就已经卡在送达未完成」的历史订单，
  // 以及送达写库成功、结算那一步恰好失败的订单。
  const where = C.S().autoSettleOnDeliver
    ? { status: C.STATUS.ONGOING, delivered_time: C.dbCmd.gt(0) }
    : {
        status: C.STATUS.ONGOING,
        delivered_time: C.dbCmd.gt(0),
        auto_confirm_at: C.dbCmd.lte(now)
      }

  const res = await C.db.collection(C.COLL.tasks).where(where).limit(BATCH).get()

  const list = res.data || []
  const done = []
  const failed = []

  for (const task of list) {
    try {
      // 用户涨价改单后还没补差价的，先不结算：托管里的钱不够，结算会让平台垫钱。
      // 等用户付完差价（due_cent 归 0）下一轮再结。
      if (C.dueCentOf(task) > 0) {
        failed.push({ id: task._id, msg: `待用户补差价 ¥${C.yuan(C.dueCentOf(task))}` })
        continue
      }
      // settleTask 内部有 status CAS，重复调用不会重复记账
      const r = await C.settleTask(task, 'auto')
      done.push({ id: task._id, riderIncome: C.yuan(r.riderIncome), commission: C.yuan(r.commission) })
    } catch (e) {
      failed.push({ id: task._id, msg: e && e.message })
    }
  }

  return { scanned: list.length, settled: done.length, failed, done }
}

/**
 * 重试卡住的退款。
 * 只处理「登记超过 2 分钟还在 processing」的退款单 —— 正常情况客户端一步就退完了，
 * 卡住说明微信超时/退款暂时失败，这里补上（配合每 2 分钟一次的定时器，
 * 最坏情况 3 分钟内一定会重试一次）。
 */
async function retryRefunds() {
  const now = Date.now()

  // 1) 卡在退款中的（同一次请求里没退完）
  const res = await C.db
    .collection(C.COLL.refunds)
    .where({ status: 'processing', create_time: C.dbCmd.lt(now - 60 * 1000) })
    .limit(10)
    .get()

  // 2) 退过一次失败的，再给 3 次机会（商户余额补上了、网络恢复了就能成）
  const failRes = await C.db
    .collection(C.COLL.refunds)
    .where({ status: 'failed', retry_count: C.dbCmd.lt(3) })
    .orderBy('update_time', 'asc')
    .limit(5)
    .get()

  const list = [...(res.data || []), ...(failRes.data || [])]
  const ok = []
  const failed = []

  for (const refund of list) {
    try {
      const r = await payApi().refundTask(refund._id)
      if (r && r.code === 0) ok.push({ id: refund._id, amount: C.yuan(refund.amount_cent) })
      else failed.push({ id: refund._id, msg: (r && r.msg) || '未知错误' })
    } catch (e) {
      failed.push({ id: refund._id, msg: e && e.message })
    }
  }

  return { scanned: list.length, refunded: ok.length, ok, failed }
}

/**
 * 修复「订单上写着退款中，但根本没有退款单」的孤儿订单。
 *
 * 出现原因：退款单登记时 yyx-refunds 集合还不存在（新环境没建集合），
 * 结果订单被记成 refunding/processing，钱没退、单也没落库。
 * 这类订单不在 retryRefunds 的扫描范围里（那里是按退款单扫的），必须单独兜。
 */
async function repairOrphanRefunds() {
  const res = await C.db
    .collection(C.COLL.tasks)
    .where({ refund_status: 'processing', refund_cent: C.dbCmd.gt(0) })
    .limit(10)
    .get()

  const list = res.data || []
  const fixed = []
  const failed = []

  for (const task of list) {
    try {
      const rr = await C.db.collection(C.COLL.refunds).where({ task_id: task._id }).limit(1).get()
      // 有退款单的交回 retryRefunds 处理，这里只补真正丢了单的
      if (rr.data && rr.data.length) continue
      await C.repairOrphanRefund(task, '退款单丢失，定时任务自动补建')
      fixed.push(task._id)
    } catch (e) {
      failed.push({ id: task._id, msg: e && e.message })
    }
  }

  return { scanned: list.length, repaired: fixed.length, fixed, failed }
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

/**
 * 同步在途提现的真实状态。
 * 用户点了「确认收款」但客户端崩了、或者支付宝/微信回调没到，
 * 都靠这里查到最终状态：失败/过期就把钱退回余额，不会出现「扣了钱没到账」。
 */
async function syncWithdrawals() {
  const pay = uniCloud.importObject('xyyx-pay', { customUI: true })
  const res = await pay.syncWithdrawals()
  return (res && res.data) || {}
}

/** 清理很久没人看的直存图片 */
async function cleanImages() {
  try {
    return await C.cleanImageData(120)
  } catch (e) {
    return 0
  }
}

exports.main = async () => {
  const started = Date.now()
  // 定时任务不走云对象的 guard，这里自己刷一次配置
  await C.loadSettings()

  let confirmResult = null
  let confirmError = null
  try {
    confirmResult = await autoConfirm()
  } catch (e) {
    confirmError = e && e.message
    console.error('[xyyx-cron] 自动完成订单失败:', confirmError)
  }

  let refundResult = null
  let refundError = null
  try {
    refundResult = await retryRefunds()
  } catch (e) {
    refundError = e && e.message
    console.error('[xyyx-cron] 退款重试失败:', refundError)
  }

  let orphanResult = null
  try {
    orphanResult = await repairOrphanRefunds()
  } catch (e) {
    console.error('[xyyx-cron] 孤儿退款修复失败:', e && e.message)
  }

  const removed = await cleanNonces()

  let wdResult = {}
  try {
    wdResult = await syncWithdrawals()
  } catch (e) {
    console.error('[xyyx-cron] 同步提现状态失败:', e && e.message)
  }

  let imagesRemoved = 0
  try {
    imagesRemoved = await cleanImages()
  } catch (e) {
    console.error('[xyyx-cron] 清理图片缓存失败:', e && e.message)
  }

  const summary = {
    ok: !confirmError && !refundError,
    scan: confirmResult ? confirmResult.scanned : 0,
    settled: confirmResult ? confirmResult.settled : 0,
    failed: confirmResult ? confirmResult.failed : [],
    refund_scan: refundResult ? refundResult.scanned : 0,
    refunded: refundResult ? refundResult.refunded : 0,
    refund_failed: refundResult ? refundResult.failed : [],
    orphan_repaired: orphanResult ? orphanResult.repaired : 0,
    nonces_removed: removed,
    withdraw_checked: wdResult.scanned || 0,
    withdraw_updated: wdResult.updated || 0,
    images_removed: imagesRemoved,
    cost_ms: Date.now() - started
  }
  console.log('[xyyx-cron]', JSON.stringify(summary))
  return summary
}
