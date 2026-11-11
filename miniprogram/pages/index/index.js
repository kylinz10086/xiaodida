const store = require('../../utils/store.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    school: store.SCHOOL,
    filterType: 0,
    keyword: '',
    tasks: [],
    publishing: false
  },

  onShow() {
    this.loadTasks()
  },

  onPullDownRefresh() {
    this.loadTasks()
    wx.stopPullDownRefresh()
  },

  loadTasks() {
    const { filterType, keyword } = this.data
    const res = store.getTaskList({
      status: 1,
      type: filterType || undefined,
      keyword
    })
    this.setData({ tasks: (res.data.list || []).map(fmt.decorateTask) })
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.loadTasks()
  },

  changeFilter(e) {
    const type = Number(e.currentTarget.dataset.type || 0)
    this.setData({ filterType: type }, () => this.loadTasks())
  },

  goPublish(e) {
    const type = Number(e.currentTarget.dataset.type || 1)
    wx.navigateTo({ url: `/pages/publish/publish?type=${type}` })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  quickAccept(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认接单',
      content: '接单后请尽快联系发布者并按时送达。',
      confirmText: '接单',
      confirmColor: '#007AFF',
      success: (r) => {
        if (!r.confirm) return
        const res = store.acceptTask(id)
        if (res.code !== 0) {
          wx.showToast({ title: res.msg || '接单失败', icon: 'none' })
          return
        }
        wx.showToast({ title: '接单成功', icon: 'success' })
        this.loadTasks()
        setTimeout(() => wx.switchTab({ url: '/pages/orders/orders' }), 600)
      }
    })
  }
})
