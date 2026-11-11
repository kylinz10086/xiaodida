const store = require('../../utils/store.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    role: 'all',
    status: 'all',
    counts: { all: 0, p1: 0, p2: 0, p3: 0 },
    tasks: []
  },

  onShow() {
    const preset = wx.getStorageSync('orders_role')
    if (preset) {
      wx.removeStorageSync('orders_role')
      this.setData({ role: preset })
    }
    this.loadTasks()
  },

  onPullDownRefresh() {
    this.loadTasks()
    wx.stopPullDownRefresh()
  },

  loadTasks() {
    const { role, status } = this.data

    // 计数按 role 统计（不受当前 status 筛选影响）
    const allOfRole = store.getMyTasks({ role: role === 'all' ? undefined : role }).data.list
    const counts = {
      all: allOfRole.length,
      p1: allOfRole.filter((t) => t.status === 1).length,
      p2: allOfRole.filter((t) => t.status === 2).length,
      p3: allOfRole.filter((t) => t.status === 3).length
    }

    const res = store.getMyTasks({
      role: role === 'all' ? undefined : role,
      status: status === 'all' ? undefined : status
    })

    const tasks = res.data.list.map((t) => {
      const d = fmt.decorateTask(t)
      return {
        ...d,
        roleText: t.role === 'publisher' ? '我发布的' : '我接的单',
        originName2: d.destinationName || d.originName
      }
    })

    this.setData({ tasks, counts })
  },

  changeRole(e) {
    this.setData({ role: e.currentTarget.dataset.role }, () => this.loadTasks())
  },

  changeStatus(e) {
    this.setData({ status: e.currentTarget.dataset.status }, () => this.loadTasks())
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  completeTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '标记完成',
      content: '确认已经送达？',
      confirmText: '已完成',
      confirmColor: '#34C759',
      success: (r) => {
        if (!r.confirm) return
        const res = store.completeTask(id)
        wx.showToast({ title: res.code === 0 ? '已标记完成' : res.msg, icon: res.code === 0 ? 'success' : 'none' })
        this.loadTasks()
      }
    })
  },

  confirmTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认收货',
      content: '确认跑腿同学已送达？',
      confirmText: '确认完成',
      confirmColor: '#34C759',
      success: (r) => {
        if (!r.confirm) return
        const res = store.confirmTask(id)
        wx.showToast({ title: res.code === 0 ? '已确认完成' : res.msg, icon: res.code === 0 ? 'success' : 'none' })
        this.loadTasks()
      }
    })
  },

  cancelTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '取消任务',
      content: '取消后任务将从任务市场下架。',
      confirmText: '取消任务',
      confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return
        const res = store.cancelTask(id, '发布者取消')
        wx.showToast({ title: res.code === 0 ? '已取消' : res.msg, icon: 'none' })
        this.loadTasks()
      }
    })
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/publish?type=1' })
  }
})
