const store = require('../../utils/store.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    task: null,
    role: 'visitor',
    notFound: false
  },

  onLoad(query) {
    this.taskId = query.id
  },

  onShow() {
    this.loadTask()
  },

  loadTask() {
    const res = store.getTaskDetail(this.taskId)
    if (res.code !== 0) {
      this.setData({ notFound: true, task: null })
      return
    }
    const t = res.data
    this.setData({
      role: t.role,
      notFound: false,
      task: {
        ...t,
        tagClass: fmt.typeTagClass(t.type),
        statusText: fmt.STATUS_TEXT[t.status] || '',
        statusClass: 'status-' + t.status,
        moneyText: fmt.money(t.money),
        createText: fmt.formatTime(t.create_time),
        acceptText: fmt.formatTime(t.accept_time),
        completeText: fmt.formatTime(t.complete_time),
        cancelText: fmt.formatTime(t.cancel_time),
        originName: (t.origin && t.origin.name) || '未填写',
        destinationName: (t.destination && t.destination.name) || '未填写'
      }
    })
  },

  callPublisher() {
    const phone = this.data.task && this.data.task.phoneNumber
    if (!phone) {
      wx.showToast({ title: '发布者未留手机号', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  copyWechat() {
    const wxId = this.data.task && this.data.task.wechatId
    if (!wxId) {
      wx.showToast({ title: '发布者未留微信号', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: wxId })
  },

  accept() {
    wx.showModal({
      title: '确认接单',
      content: '接单后请尽快联系发布者并按时送达。',
      confirmText: '接单',
      confirmColor: '#007AFF',
      success: (r) => {
        if (!r.confirm) return
        const res = store.acceptTask(this.taskId)
        if (res.code !== 0) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '接单成功', icon: 'success' })
        this.loadTask()
      }
    })
  },

  complete() {
    wx.showModal({
      title: '标记完成',
      content: '确认已经送达？发布者确认后这一单就结单了。',
      confirmText: '已完成',
      confirmColor: '#34C759',
      success: (r) => {
        if (!r.confirm) return
        const res = store.completeTask(this.taskId)
        if (res.code !== 0) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已标记完成', icon: 'success' })
        this.loadTask()
      }
    })
  },

  confirmDone() {
    wx.showModal({
      title: '确认收货',
      content: '确认跑腿同学已经把东西送到了？',
      confirmText: '确认完成',
      confirmColor: '#34C759',
      success: (r) => {
        if (!r.confirm) return
        const res = store.confirmTask(this.taskId)
        if (res.code !== 0) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已确认完成', icon: 'success' })
        this.loadTask()
      }
    })
  },

  abandon() {
    wx.showModal({
      title: '放弃任务',
      content: '放弃后任务会回到任务市场，让给别人接。',
      confirmText: '放弃',
      confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return
        const res = store.abandonTask(this.taskId)
        if (res.code !== 0) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已放弃', icon: 'none' })
        this.loadTask()
      }
    })
  },

  cancel() {
    wx.showModal({
      title: '取消任务',
      content: '取消后任务将从任务市场下架。',
      confirmText: '取消任务',
      confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return
        const res = store.cancelTask(this.taskId, '发布者取消')
        if (res.code !== 0) {
          wx.showToast({ title: res.msg, icon: 'none' })
          return
        }
        wx.showToast({ title: '已取消', icon: 'none' })
        this.loadTask()
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
