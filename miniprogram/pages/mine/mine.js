const store = require('../../utils/store.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    user: null,
    stats: { published: 0, accepted: 0, income: '0' },
    school: store.SCHOOL
  },

  onShow() {
    this.loadUser()
  },

  loadUser() {
    const res = store.getUserInfo()
    const user = res.data
    this.setData({
      user: {
        ...user,
        avatarText: (user.nickname || '校').slice(0, 1)
      },
      stats: {
        published: user.published_count || 0,
        accepted: user.accepted_count || 0,
        income: fmt.money(user.total_income || 0)
      }
    })
  },

  editNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新的昵称',
      content: this.data.user.nickname || '',
      success: (r) => {
        if (!r.confirm) return
        const name = (r.content || '').trim()
        if (!name) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' })
          return
        }
        store.updateUserInfo({ nickname: name })
        this.loadUser()
        wx.showToast({ title: '已保存', icon: 'success' })
      }
    })
  },

  editMobile() {
    wx.showModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '输入 11 位手机号',
      content: this.data.user.mobile || '',
      success: (r) => {
        if (!r.confirm) return
        const mobile = (r.content || '').trim()
        if (mobile && !/^1\d{10}$/.test(mobile)) {
          wx.showToast({ title: '手机号格式不对', icon: 'none' })
          return
        }
        store.updateUserInfo({ mobile })
        this.loadUser()
        wx.showToast({ title: '已保存', icon: 'success' })
      }
    })
  },

  goOrders(e) {
    const role = e.currentTarget.dataset.role || 'all'
    wx.setStorageSync('orders_role', role)
    wx.switchTab({ url: '/pages/orders/orders' })
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/publish?type=1' })
  },

  resetDemo() {
    wx.showModal({
      title: '重置演示数据',
      content: '会清掉本机上的任务和自己发的单，恢复成初始的三条示例任务。',
      confirmText: '重置',
      confirmColor: '#FF3B30',
      success: (r) => {
        if (!r.confirm) return
        wx.clearStorageSync()
        store.bootstrap()
        this.loadUser()
        wx.showToast({ title: '已重置', icon: 'success' })
      }
    })
  },

  about() {
    wx.showModal({
      title: '关于校递达',
      content: '校园快递代取 / 代带餐食互助小程序。当前为本地演示版：数据存在手机本地，云端开通后接 uniCloud 即可多端同步。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
