const store = require('./utils/store.js')

App({
  globalData: {
    user: null
  },

  onLaunch() {
    store.bootstrap()
    this.globalData.user = store.getUser()
  },

  onShow() {
    this.globalData.user = store.getUser()
  }
})
