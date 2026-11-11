import Vue from 'vue';
import App from './App';
import * as util from '@/common/oyyl-js/util.js'

Vue.prototype.$util = util
Vue.config.productionTip = false;

App.mpType = 'app';

Vue.prototype.vuePrototype = '枣红';

import uView from 'uview-ui';
Vue.use(uView);

import store from '@/store';

let vuexStore = require('@/store/$u.mixin.js');
Vue.mixin(vuexStore);

let mpShare = require('uview-ui/libs/mixin/mpShare.js');
Vue.mixin(mpShare);

import Chinese from '@/common/locales/zh.js';
import English from '@/common/locales/en.js';

import VueI18n from '@/common/vue-i18n.min.js';

Vue.use(VueI18n);

const i18n = new VueI18n({
	locale: 'zh',
	messages: {
		'zh': Chinese,
		'en': English,
	}
});

Vue.prototype._i18n = i18n;

const app = new Vue({
	i18n,
	store,
	...App
});

import httpInterceptor from '@/common/http.interceptor.js';
Vue.use(httpInterceptor, app);

import httpApi from '@/common/http.api.js';
Vue.use(httpApi, app);

Vue.prototype.$EventBus = new Vue();

import uniIdPagesInit from '@/uni_modules/uni-id-pages/init.js'
uniIdPagesInit()

app.$mount();
