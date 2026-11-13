'use strict'
/**
 * xyyx-ops —— 运维云对象
 *
 * 只做三件事：看数（stats）、备份（backup）、清测试数据（purgeBusiness）。
 * 全部要求管理员身份 + 明确的确认口令，默认 dry-run。
 *
 * 为什么不做成「URL 化的 HTTP 接口」：
 *   1.2.0 刚把 pay-notify 里的诊断后门拆掉（那个后门能用静态 key 触发真实转账）。
 *   这里刻意走云对象 + requireAdmin：调用者必须是已登录的管理员，
 *   URL 化后又没有签名校验的入口，一律不再开。
 *
 * 怎么调用（在管理后台 http://127.0.0.1:5180/admin/ 登录后，浏览器控制台里执行）：
 *
 *   const ops = uniCloud.importObject('xyyx-ops', { customUI: true })
 *   await ops.stats()                                        // 先看有多少
 *   await ops.backup()                                       // 备份到云存储
 *   await ops.purgeBusiness({ confirm: 'PURGE-BUSINESS' })    // dry-run，只报数
 *   await ops.purgeBusiness({ confirm: 'PURGE-BUSINESS', dryRun: false })  // 真删
 */
const C = require('xyyx-common')

/** 业务内容：删了不影响账，也不会让钱包/流水对不上 */
const BUSINESS_COLLECTIONS = [
  C.COLL.messages,
  C.COLL.reviews,
  C.COLL.images,
  C.COLL.moderation,
  'xyyx-feedback',
  C.COLL.tasks,
  C.COLL.nonces,
  C.COLL.limits
]

/**
 * 故意不清理 yyx-agreements：那是「用户同意过协议」的留痕，
 * 属于合规证据，测试数据里也不该被抹掉。真要大扫除请单独处理。
 */

/** 账本类：绝不在 purge 里动，列出来只为了让 stats 能看 */
const LEDGER_COLLECTIONS = [
  C.COLL.transactions,
  C.COLL.wallets,
  C.COLL.payorders,
  C.COLL.refunds,
  C.COLL.withdrawals,
  'uni-id-users',
  C.COLL.users
]

const PURGE_CONFIRM = 'PURGE-BUSINESS'
/** 单次删除的批量大小：小一点，避免一次删太多把函数跑超时 */
const BATCH = 100

async function countOf(name) {
  try {
    const res = await C.db.collection(name).count()
    return { name: name, count: Number(res.total) || 0, ok: true }
  } catch (e) {
    // 集合不存在是正常情况（新空间还没建全）
    return { name: name, count: 0, ok: false, error: (e && e.message) || 'unavailable' }
  }
}

/** 删一个集合里的文档；返回删掉的条数。用 _id exists 兜底，避免「无 where 删全表」被平台拒绝 */
async function purgeCollection(name) {
  let removed = 0
  for (let i = 0; i < 1000; i++) {
    const res = await C.db
      .collection(name)
      .where({ _id: C.dbCmd.exists(true) })
      .limit(BATCH)
      .get()
    const rows = (res.data || []).slice()
    if (!rows.length) break
    const ids = rows.map((r) => r._id)
    const del = await C.db
      .collection(name)
      .where({ _id: C.dbCmd.in(ids) })
      .remove()
    const n = Number(del.deleted) || 0
    removed += n
    // 有文档但一条都没删掉 = 权限/平台限制，别死循环
    if (!n) break
  }
  return removed
}

module.exports = {
  /** 各集合条数（业务 + 账本，一眼看出测试数据有多少） */
  async stats() {
    await C.requireAdmin(this)
    const business = []
    for (const name of BUSINESS_COLLECTIONS) business.push(await countOf(name))
    const ledger = []
    for (const name of LEDGER_COLLECTIONS) ledger.push(await countOf(name))
    return C.ok({
      business: business,
      ledger: ledger,
      total_business: business.reduce((a, x) => a + x.count, 0)
    })
  },

  /**
   * 把业务集合导出成 JSON 传到云存储，返回文件 ID。
   * 清理前先跑这一步：删错了还能从云存储拉回来。
   */
  async backup(params = {}) {
    const auth = await C.requireAdmin(this)
    const stamp = new Date(Date.now() + 8 * 3600 * 1000)
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14)
    const dir = `ops-backup/${stamp}`
    const files = []
    const counts = {}

    for (const name of BUSINESS_COLLECTIONS) {
      let all = []
      try {
        for (let i = 0; i < 200; i++) {
          const res = await C.db
            .collection(name)
            .where({ _id: C.dbCmd.exists(true) })
            .orderBy('_id', 'asc')
            .skip(all.length)
            .limit(200)
            .get()
          const rows = res.data || []
          if (!rows.length) break
          all = all.concat(rows)
          if (rows.length < 200) break
        }
      } catch (e) {
        counts[name] = { ok: false, error: (e && e.message) || '' }
        continue
      }
      if (!all.length) {
        counts[name] = { ok: true, count: 0 }
        continue
      }
      try {
        const up = await uniCloud.uploadFile({
          cloudPath: `${dir}/${name}.json`,
          fileContent: Buffer.from(JSON.stringify(all), 'utf8'),
          fileType: 'json'
        })
        files.push({ collection: name, fileID: up.fileID, count: all.length })
        counts[name] = { ok: true, count: all.length, fileID: up.fileID }
      } catch (e) {
        counts[name] = { ok: false, count: all.length, error: (e && e.message) || '' }
      }
    }

    await C.audit(C.AUDIT_ACTION.TASK_PURGE, auth, {
      targetType: 'backup',
      targetId: dir,
      detail: { files: files.length, counts: counts }
    })
    return C.ok({ dir: dir, files: files, counts: counts }, '备份完成')
  },

  /**
   * 清理业务内容。
   *
   * 默认 dryRun=true，只回报「要删多少」，不真删。
   * 不动 transactions / wallets / payorders / refunds / withdrawals / users：
   * 这些是和微信商户平台一一对应的凭证，删了以后永远对不上账。
   */
  async purgeBusiness(params = {}) {
    const auth = await C.requireAdmin(this)
    if (params.confirm !== PURGE_CONFIRM) {
      throw new C.BizError(400, `需要确认口令 ${PURGE_CONFIRM}`)
    }
    const dryRun = params.dryRun !== false

    const before = []
    for (const name of BUSINESS_COLLECTIONS) before.push(await countOf(name))

    if (dryRun) {
      return C.ok(
        { dryRun: true, collections: before, total: before.reduce((a, x) => a + x.count, 0) },
        'dry-run：没有删除任何数据'
      )
    }

    const result = []
    for (const item of before) {
      if (!item.ok || !item.count) {
        result.push({ name: item.name, removed: 0, existed: item.count })
        continue
      }
      try {
        const removed = await purgeCollection(item.name)
        result.push({ name: item.name, removed: removed, existed: item.count })
      } catch (e) {
        result.push({ name: item.name, removed: 0, existed: item.count, error: (e && e.message) || '' })
      }
    }

    const total = result.reduce((a, x) => a + x.removed, 0)
    await C.audit(C.AUDIT_ACTION.TASK_PURGE, auth, {
      targetType: 'business',
      result: 'ok',
      detail: { total_removed: total, result: result }
    })
    return C.ok({ dryRun: false, total_removed: total, result: result }, `已清理 ${total} 条业务数据`)
  }
}

module.exports = Object.fromEntries(Object.entries(module.exports).map(([k, fn]) => [k, C.guard(fn)]))
