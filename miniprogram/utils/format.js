/** 展示层格式化：时间、金额、任务卡片字段 */

const TYPE_CLASS = { 1: 'tag-express', 2: 'tag-meal', 3: 'tag-other' }
const STATUS_TEXT = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消' }

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 2026-11-10 23:10 */
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 刚刚 / 12分钟前 / 3小时前 / 11-08 */
function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '小时前'
  const d = new Date(ts)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 5 -> "5"，5.5 -> "5.5"，5.00 -> "5" */
function money(n) {
  const v = Number(n || 0)
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function typeTagClass(type) {
  return TYPE_CLASS[type] || 'tag-other'
}

/** 给列表卡片补齐展示字段，避免在 wxml 里写复杂表达式 */
function decorateTask(t) {
  return {
    ...t,
    tagClass: typeTagClass(t.type),
    statusText: STATUS_TEXT[t.status] || '',
    timeText: relativeTime(t.create_time),
    moneyText: money(t.money),
    originName: (t.origin && t.origin.name) || '',
    destinationName: (t.destination && t.destination.name) || ''
  }
}

module.exports = {
  formatTime,
  relativeTime,
  money,
  typeTagClass,
  decorateTask,
  STATUS_TEXT
}
