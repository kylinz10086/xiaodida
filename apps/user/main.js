import Vue from 'vue'
import App from './App'
import store from '@/store'
import uView from 'uview-ui'

Vue.config.productionTip = false
App.mpType = 'app'

Vue.use(uView)

let vuexStore = require('@/store/$u.mixin.js')
Vue.mixin(vuexStore)

let mpShare = require('uview-ui/libs/mixin/mpShare.js')
Vue.mixin(mpShare)

Vue.prototype.$EventBus = new Vue()

const app = new Vue({
	store,
	...App
})

import uniIdPagesInit from '@/uni_modules/uni-id-pages/init.js'
uniIdPagesInit()

app.$mount()
