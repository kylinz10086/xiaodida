/**
 * 校递达小程序 —— 本地数据层
 *
 * 设计约束：函数签名与返回结构刻意对齐 uniCloud 云对象 `xyyx`
 * （{ code, msg, data }、同样的方法名和任务状态机），这样明天云端开通后，
 * 只要把这里的实现换成 wx.cloud.callFunction / uniCloud.importObject，页面代码不用动。
 *
 * 任务状态：1 待接单 / 2 进行中 / 3 已完成 / 4 已取消
 * 任务类型：1 快递代取 / 2 代带餐食 / 3 其他
 */

const KEY_USER = 'xyyx_user'
const KEY_TASKS = 'xyyx_tasks'
const KEY_SEEDED = 'xyyx_seeded_v1'

const TYPE_TEXT = { 1: '快递代取', 2: '代带餐食', 3: '其他' }
const STATUS_TEXT = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消' }

const SCHOOL = '浙江中医药大学'

function now() {
  return Date.now()
}

function makeId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 8)}`
}

function readTasks() {
  return wx.getStorageSync(KEY_TASKS) || []
}

function writeTasks(list) {
  wx.setStorageSync(KEY_TASKS, list)
  return list
}

function findTask(id) {
  return readTasks().find((t) => t._id === id) || null
}

/* ------------------------------------------------------------------ */
/* 种子数据（首次启动写入，方便离线演示）                                */
/* ------------------------------------------------------------------ */

function seed() {
  if (wx.getStorageSync(KEY_SEEDED)) return
  const t = now()
  const minutes = (m) => m * 60 * 1000

  const demo = [
    {
      title: '帮忙取一下东门菜鸟驿站的快递',
      type: 1,
      description: '两个中等箱子，不重，麻烦送到3号宿舍楼下，到了打电话。',
      money: 5,
      itemType: '快递',
      itemSize: '中件',
      itemWeight: '约2kg',
      timeOption: '30分钟内',
      origin: { name: '东门菜鸟驿站', latitude: 30.2451, longitude: 120.2181 },
      destination: { name: '学生公寓3号楼', latitude: 30.2462, longitude: 120.2172 },
      publisher_name: '林同学',
      status: 1,
      create_time: t - minutes(8)
    },
    {
      title: '一食堂带一份黄焖鸡米饭到图书馆',
      type: 2,
      description: '在一食堂二楼，微辣不要香菜，到图书馆三楼自习区。',
      money: 4,
      itemType: '外卖',
      itemSize: '小件',
      itemWeight: '约1kg',
      timeOption: '30分钟内',
      origin: { name: '第一食堂', latitude: 30.247, longitude: 120.2195 },
      destination: { name: '图书馆三楼', latitude: 30.2466, longitude: 120.2199 },
      publisher_name: '阿珂',
      status: 1,
      create_time: t - minutes(23)
    },
    {
      title: '南门顺丰柜取件送到实验楼B座',
      type: 1,
      description: '一个小文件袋，很轻，急用，今天下午五点前送到就行。',
      money: 6,
      itemType: '快递',
      itemSize: '小件',
      itemWeight: '约0.5kg',
      timeOption: '今天下午',
      origin: { name: '南门顺丰快递柜', latitude: 30.2437, longitude: 120.2176 },
      destination: { name: '实验楼B座401', latitude: 30.2448, longitude: 120.2203 },
      publisher_name: '老周',
      status: 1,
      create_time: t - minutes(41)
    }
  ]

  const list = demo.map((d) => ({
    _id: makeId('task'),
    typeText: TYPE_TEXT[d.type],
    publisher_id: 'demo_publisher',
    publisher_avatar: '',
    phoneNumber: '',
    wechatId: '',
    remark: '',
    images: [],
    ...d
  }))

  writeTasks(list)
  wx.setStorageSync(KEY_SEEDED, 1)
}

/* ------------------------------------------------------------------ */
/* 用户                                                                */
/* ------------------------------------------------------------------ */

function getUser() {
  let user = wx.getStorageSync(KEY_USER)
  if (user && user._id) return user
  user = {
    _id: makeId('user'),
    nickname: '校园用户',
    avatar: '',
    mobile: '',
    school: SCHOOL,
    published_count: 0,
    accepted_count: 0,
    total_income: 0,
    create_time: now(),
    update_time: now()
  }
  wx.setStorageSync(KEY_USER, user)
  return user
}

function saveUser(patch) {
  const user = { ...getUser(), ...patch, update_time: now() }
  wx.setStorageSync(KEY_USER, user)
  return user
}

/* ------------------------------------------------------------------ */
/* 业务接口（对齐云对象 xyyx）                                          */
/* ------------------------------------------------------------------ */

function getTaskList(params = {}) {
  const { status = 1, type, keyword } = params
  let list = readTasks()
  if (status !== null && status !== undefined && status !== 'all') {
    list = list.filter((t) => t.status === Number(status))
  }
  if (type) list = list.filter((t) => t.type === Number(type))
  if (keyword) {
    const kw = String(keyword).trim()
    if (kw) {
      list = list.filter(
        (t) =>
          (t.title || '').indexOf(kw) > -1 ||
          (t.description || '').indexOf(kw) > -1 ||
          ((t.origin && t.origin.name) || '').indexOf(kw) > -1 ||
          ((t.destination && t.destination.name) || '').indexOf(kw) > -1
      )
    }
  }
  list = list.slice().sort((a, b) => (b.create_time || 0) - (a.create_time || 0))
  return { code: 0, data: { list, total: list.length } }
}

function getTaskDetail(taskId) {
  const task = findTask(taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  const user = getUser()
  const role = task.publisher_id === user._id ? 'publisher' : task.runner_id === user._id ? 'runner' : 'visitor'
  return { code: 0, data: { ...task, role } }
}

function publishTask(data) {
  const user = getUser()
  const money = parseFloat(data.money)
  if (!data.title || !String(data.title).trim()) return { code: 400, msg: '请填写任务标题' }
  if (!(money > 0)) return { code: 400, msg: '请填写悬赏金额' }

  const task = {
    _id: makeId('task'),
    title: String(data.title).trim(),
    type: Number(data.type) || 1,
    typeText: TYPE_TEXT[data.type] || '快递代取',
    description: data.description || '',
    money,
    itemType: data.itemType || '',
    itemSize: data.itemSize || '',
    itemWeight: data.itemWeight || '',
    timeOption: data.timeOption || '',
    deadline: data.deadline || '',
    origin: data.origin || { name: '' },
    destination: data.destination || { name: '' },
    phoneNumber: data.phoneNumber || '',
    wechatId: data.wechatId || '',
    remark: data.remark || '',
    images: data.images || [],
    status: 1,
    publisher_id: user._id,
    publisher_name: user.nickname,
    publisher_avatar: user.avatar,
    create_time: now()
  }

  writeTasks([task, ...readTasks()])
  saveUser({ published_count: (user.published_count || 0) + 1 })
  return { code: 0, msg: '发布成功', data: { id: task._id } }
}

function acceptTask(taskId) {
  const user = getUser()
  const tasks = readTasks()
  const task = tasks.find((t) => t._id === taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  if (task.status !== 1) return { code: 400, msg: '任务已被接取' }
  if (task.publisher_id === user._id) return { code: 400, msg: '不能接取自己发布的任务' }

  task.status = 2
  task.runner_id = user._id
  task.runner_name = user.nickname
  task.runner_avatar = user.avatar
  task.accept_time = now()
  writeTasks(tasks)
  saveUser({ accepted_count: (user.accepted_count || 0) + 1 })
  return { code: 0, msg: '接单成功' }
}

function completeTask(taskId) {
  const user = getUser()
  const tasks = readTasks()
  const task = tasks.find((t) => t._id === taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  if (task.runner_id !== user._id) return { code: 403, msg: '只有接单者可以点完成' }
  if (task.status !== 2) return { code: 400, msg: '当前状态不能完成' }

  task.status = 3
  task.complete_time = now()
  writeTasks(tasks)
  saveUser({ total_income: Number(((user.total_income || 0) + (task.money || 0)).toFixed(2)) })
  return { code: 0, msg: '已标记完成' }
}

function confirmTask(taskId) {
  const user = getUser()
  const tasks = readTasks()
  const task = tasks.find((t) => t._id === taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  if (task.publisher_id !== user._id) return { code: 403, msg: '只有发布者可以确认' }
  if (task.status !== 2) return { code: 400, msg: '当前状态不能确认' }

  task.status = 3
  task.complete_time = now()
  writeTasks(tasks)
  return { code: 0, msg: '已确认完成' }
}

function cancelTask(taskId, reason) {
  const user = getUser()
  const tasks = readTasks()
  const task = tasks.find((t) => t._id === taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  if (task.publisher_id !== user._id) return { code: 403, msg: '无权操作' }
  if (task.status !== 1) return { code: 400, msg: '只能取消待接单的任务' }

  task.status = 4
  task.cancel_time = now()
  task.cancel_reason = reason || '用户取消'
  writeTasks(tasks)
  saveUser({ published_count: Math.max(0, (user.published_count || 0) - 1) })
  return { code: 0, msg: '已取消' }
}

function abandonTask(taskId) {
  const user = getUser()
  const tasks = readTasks()
  const task = tasks.find((t) => t._id === taskId)
  if (!task) return { code: 404, msg: '任务不存在' }
  if (task.runner_id !== user._id) return { code: 403, msg: '无权操作' }

  task.status = 1
  delete task.runner_id
  delete task.runner_name
  delete task.runner_avatar
  delete task.accept_time
  writeTasks(tasks)
  saveUser({ accepted_count: Math.max(0, (user.accepted_count || 0) - 1) })
  return { code: 0, msg: '已放弃任务' }
}

function getMyTasks(params = {}) {
  const user = getUser()
  const { role, status } = params
  let list = readTasks().filter((t) => t.publisher_id === user._id || t.runner_id === user._id)

  list = list.map((t) => ({
    ...t,
    role: t.publisher_id === user._id ? 'publisher' : 'runner'
  }))

  if (role === 'publisher' || role === 'runner') list = list.filter((t) => t.role === role)
  if (status !== undefined && status !== null && status !== 'all') list = list.filter((t) => t.status === Number(status))

  list.sort((a, b) => (b.create_time || 0) - (a.create_time || 0))
  return { code: 0, data: { list, total: list.length } }
}

function getUserInfo() {
  return { code: 0, data: getUser() }
}

function updateUserInfo(data) {
  const user = saveUser({
    nickname: data.nickname !== undefined ? data.nickname : getUser().nickname,
    avatar: data.avatar !== undefined ? data.avatar : getUser().avatar,
    mobile: data.mobile !== undefined ? data.mobile : getUser().mobile
  })
  return { code: 0, msg: '已保存', data: user }
}

function bootstrap() {
  getUser()
  seed()
}

module.exports = {
  TYPE_TEXT,
  STATUS_TEXT,
  SCHOOL,
  bootstrap,
  getUser,
  saveUser,
  getUserInfo,
  updateUserInfo,
  getTaskList,
  getTaskDetail,
  publishTask,
  acceptTask,
  completeTask,
  confirmTask,
  cancelTask,
  abandonTask,
  getMyTasks
}
