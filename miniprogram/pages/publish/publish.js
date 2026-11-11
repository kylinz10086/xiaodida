const store = require('../../utils/store.js')

const SIZE_OPTIONS = ['小件', '中件', '大件']
const TIME_OPTIONS = ['30分钟内', '1小时内', '今天下午', '今晚', '明天前']
const QUICK_PRICES = [3, 5, 8, 10]

Page({
  data: {
    isEdit: false,
    taskId: '',
    typeList: ['快递代取', '代带餐食', '其他'],
    type: 1,
    title: '',
    description: '',
    itemType: '',
    itemSize: '小件',
    itemWeight: '',
    originName: '',
    destinationName: '',
    timeOption: '30分钟内',
    money: '',
    phoneNumber: '',
    wechatId: '',
    remark: '',
    sizeOptions: SIZE_OPTIONS,
    timeOptions: TIME_OPTIONS,
    quickPrices: QUICK_PRICES,
    submitting: false
  },

  onLoad(query) {
    if (query.type) {
      this.setData({ type: Number(query.type) || 1 })
    }
  },

  switchType(e) {
    this.setData({ type: Number(e.currentTarget.dataset.type) })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  selectSize(e) {
    this.setData({ itemSize: e.currentTarget.dataset.value })
  },

  selectTime(e) {
    this.setData({ timeOption: e.currentTarget.dataset.value })
  },

  setQuickPrice(e) {
    this.setData({ money: String(e.currentTarget.dataset.value) })
  },

  useCurrentLocation(e) {
    const which = e.currentTarget.dataset.which
    wx.getLocation({
      type: 'gcj02',
      success: (pos) => {
        wx.chooseLocation({
          latitude: pos.latitude,
          longitude: pos.longitude,
          success: (loc) => {
            const patch = which === 'origin' ? { originName: loc.name || loc.address } : { destinationName: loc.name || loc.address }
            this.setData(patch)
          },
          fail: () => {
            wx.showToast({ title: '未选择地点', icon: 'none' })
          }
        })
      },
      fail: () => {
        wx.showToast({ title: '需要位置权限，请手动填写地点', icon: 'none' })
      }
    })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/index/index' })
  },

  submit() {
    if (this.data.submitting) return
    const { title, money, type, description, itemType, itemSize, itemWeight, originName, destinationName, timeOption, phoneNumber, wechatId, remark } = this.data

    if (!title.trim()) {
      wx.showToast({ title: '请填写任务标题', icon: 'none' })
      return
    }
    if (!(parseFloat(money) > 0)) {
      wx.showToast({ title: '请填写悬赏金额', icon: 'none' })
      return
    }
    if (phoneNumber && !/^1\d{10}$/.test(phoneNumber)) {
      wx.showToast({ title: '手机号格式不对', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    const res = store.publishTask({
      title,
      type,
      description,
      money,
      itemType,
      itemSize,
      itemWeight,
      timeOption,
      phoneNumber,
      wechatId,
      remark,
      origin: { name: originName.trim(), latitude: 0, longitude: 0 },
      destination: { name: destinationName.trim(), latitude: 0, longitude: 0 }
    })
    this.setData({ submitting: false })

    if (res.code !== 0) {
      wx.showToast({ title: res.msg || '发布失败', icon: 'none' })
      return
    }
    wx.showToast({ title: '发布成功', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 700)
  }
})
