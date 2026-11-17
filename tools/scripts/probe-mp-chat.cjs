#!/usr/bin/env node
/**
 * 真机式诊断：用微信开发者工具自动化，检查「消息」列表与聊天页
 *
 * 为什么有这个脚本：1.2.9 ~ 1.2.11 期间「消息里点开对话没反应」，
 * 页面不报错、console 也没有异常，靠读代码猜了两轮都没猜对。
 * 用自动化真的点一下，才看到 `data-event-opts` 把 v-for 的 :key 表达式
 * 当成属性名解析，openChat 收到 undefined。
 *
 * 用法（只在开发机用，依赖不进仓库）：
 *   1) 先让开发者工具开自动化端口：wx_auto(projectPath=apps/user/unpackage/dist/build/mp-weixin)
 *   2) npm i miniprogram-automator --no-save   （任选一个临时目录）
 *   3) node tools/scripts/probe-mp-chat.cjs
 *
 * 输出：会话条数 / 每行 peer / peer 是否唯一 / 打开后消息数与来源分布 / 第三方消息条数
 */
'use strict'
/* 临时诊断：确认「不同聊天对象」是否真的分开
 *   1. 列表里每个聊天对象各占一行（peer_id 不重复、不合并）
 *   2. 进入某人的会话，消息必须只来自「我 + 他（+ 系统）」，不能有第三个人
 */

const automator = require('miniprogram-automator')
const WS = process.env.WS || 'ws://127.0.0.1:9420'
const log = (...a) => console.log('[probe]', ...a)

async function main() {
  const mp = await automator.connect({ wsEndpoint: WS })
  const events = []
  mp.on('console', (m) => events.push(m.type.toUpperCase() + ' ' + m.args.join(' ')))
  mp.on('exception', (e) => events.push('EXCEPTION ' + (e.message || JSON.stringify(e))))

  const list = await mp.reLaunch('/pages/chat/list?role=user')
  await new Promise((r) => setTimeout(r, 3500))
  const ld = await list.data()
  const convs = ld.conversations || []
  log('会话条数=', convs.length)
  for (const c of convs) {
    log(
      '  行: peer=' + (c.peer_id || '-') +
      ' 昵称=' + ((c.peer && c.peer.nickname) || '-') +
      ' 订单数=' + c.task_count +
      ' 未读=' + c.unread +
      ' 标题=' + c.title +
      ' 最近=' + JSON.stringify((c.last && c.last.content) || '').slice(0, 30)
    )
  }
  const peerIds = convs.map((c) => c.peer_id)
  log('peer_id 是否唯一=', new Set(peerIds).size === peerIds.length)

  const rows = await list.$$('.conv')
  for (let i = 0; i < rows.length; i++) {
    await rows[i].tap()
    await new Promise((r) => setTimeout(r, 3000))
    const cur = await mp.currentPage()
    if (cur.path.indexOf('chat/chat') < 0) {
      log('  第' + i + '行没跳走：', cur.path)
      continue
    }
    const d = await cur.data()
    const me = d.me
    const peer = (d.peer && d.peer._id) || ''
    const bad = (d.messages || []).filter(
      (m) => m.from_id !== me && m.from_id !== peer && m.from_id !== 'system'
    )
    const byFrom = {}
    for (const m of d.messages || []) byFrom[m.from_id] = (byFrom[m.from_id] || 0) + 1
    log(
      '  打开 peer=' + peer + ' 昵称=' + ((d.peer && d.peer.nickname) || '-') +
      ' 消息=' + (d.messages || []).length +
      ' loadErr=' + JSON.stringify(d.loadErr) +
      ' 第三方消息=' + bad.length
    )
    log('    来源分布=', JSON.stringify(byFrom), ' 我是', me)
    if (bad.length) log('    ⚠️ 串台样例:', JSON.stringify(bad[0]).slice(0, 200))

    await mp.navigateBack()
    await new Promise((r) => setTimeout(r, 1500))
  }

  log('--- console/exceptions ---')
  for (const e of events.slice(-10)) log(e.slice(0, 200))
  await mp.disconnect()
}

main().catch((e) => {
  console.error('[probe] FATAL', e && (e.stack || e.message || e))
  process.exit(1)
})
