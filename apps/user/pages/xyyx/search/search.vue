<template>
<view class="search-page">
<view class="search-header">
<view class="search-input-wrap">
<u-search 
placeholder="搜索任务、服务..." 
height="72" 
v-model="keyword" 
:clearabled="true" 
shape="round" 
bg-color="#f5f5f5" 
:focus="true"
@search="doSearch"
@clear="clearSearch"
></u-search>
</view>
<view class="cancel-btn" @click="goBack">
<text>取消</text>
</view>
</view>

<view class="search-content" v-if="!showResults">
<view class="section" v-if="searchHistory.length > 0">
<view class="section-header">
<text class="section-title">搜索历史</text>
<view class="clear-history" @click="clearHistory">
<text>清空</text>
</view>
</view>
<view class="tag-list">
<view 
class="tag-item" 
v-for="(item, index) in searchHistory" 
:key="index"
@click="searchByHistory(item)">
<text>{{item}}</text>
</view>
</view>
</view>

<view class="section">
<view class="section-header">
<text class="section-title">热门搜索</text>
</view>
<view class="tag-list">
<view 
class="tag-item hot" 
v-for="(item, index) in hotKeywords" 
:key="index"
@click="searchByHistory(item)">
<text>{{item}}</text>
</view>
</view>
</view>

<view class="section" v-if="suggestions.length > 0 && keyword">
<view class="section-header">
<text class="section-title">搜索建议</text>
</view>
<view class="suggestion-list">
<view 
class="suggestion-item" 
v-for="(item, index) in suggestions" 
:key="index"
@click="searchByHistory(item)">
<text class="suggestion-text">{{item}}</text>
<text class="arrow">›</text>
</view>
</view>
</view>
</view>

<view class="search-results" v-else>
<view class="result-header">
<text class="result-count">找到 {{results.length}} 个相关结果</text>
<view class="sort-btn" @click="toggleSort">
<text>{{sortText}}</text>
</view>
</view>
<view class="result-list">
<view class="empty-tip" v-if="results.length === 0">
<image class="empty-icon" src="/static/icon/order.png" mode="aspectFit"></image>
<text class="empty-text">未找到相关内容</text>
<text class="empty-sub">换个关键词试试吧</text>
</view>
<view 
class="result-item" 
v-for="(item, index) in results" 
:key="item.id"
@click="goToDetail(item)">
<image class="item-img" :src="item.imgSrc || '/static/icon/order.png'" mode="aspectFill"></image>
<view class="item-content">
<view class="item-title">
<text class="type-tag" :class="'type-' + item.type">{{item.typeText || '任务'}}</text>
<text class="title-text">{{item.thing || item.title}}</text>
</view>
<view class="item-desc" v-if="item.description">
<text>{{item.description}}</text>
</view>
<view class="item-footer">
<view class="item-info">
<text class="price">¥{{item.money}}</text>
<text class="time">{{formatTime(item.createTime || item.time)}}</text>
</view>
<view class="item-status" v-if="item.status">
<text :class="'status-' + item.status">{{getStatusText(item.status)}}</text>
</view>
</view>
</view>
</view>
</view>
</view>
</view>
</template>

<script>
import { mapGetters } from 'vuex';

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 10;

export default {
data() {
return {
keyword: '',
showResults: false,
results: [],
sortOrder: 'desc',
searchHistory: [],
hotKeywords: [
'代取快递',
'带饭',
'取件',
'外卖',
'快递代拿',
'食堂带餐',
'帮买',
'跑腿'
],
suggestions: []
};
},
computed: {
...mapGetters(['getTaskList', 'getMyOrders']),
sortText() {
return this.sortOrder === 'desc' ? '最新优先' : '最早优先';
}
},
watch: {
keyword(val) {
if (val.trim()) {
this.getSuggestions(val);
} else {
this.suggestions = [];
this.showResults = false;
}
}
},
onLoad() {
this.loadHistory();
},
methods: {
loadHistory() {
try {
const history = uni.getStorageSync(HISTORY_KEY);
if (history && Array.isArray(history)) {
this.searchHistory = history;
}
} catch (e) {
console.error('加载搜索历史失败', e);
}
},
saveHistory(keyword) {
if (!keyword.trim()) return;
let history = this.searchHistory.filter(item => item !== keyword);
history.unshift(keyword);
if (history.length > MAX_HISTORY) {
history = history.slice(0, MAX_HISTORY);
}
this.searchHistory = history;
try {
uni.setStorageSync(HISTORY_KEY, history);
} catch (e) {
console.error('保存搜索历史失败', e);
}
},
clearHistory() {
uni.showModal({
title: '提示',
content: '确定清空搜索历史吗？',
success: (res) => {
if (res.confirm) {
this.searchHistory = [];
uni.removeStorageSync(HISTORY_KEY);
}
}
});
},
getSuggestions(keyword) {
const kw = keyword.toLowerCase();
const allItems = [...(this.getTaskList || []), ...(this.getMyOrders || [])];
const suggestionSet = new Set();

allItems.forEach(item => {
const fields = [item.thing, item.title, item.description, item.typeText];
fields.forEach(field => {
if (field && field.toLowerCase().includes(kw)) {
suggestionSet.add(field);
}
});
});

this.suggestions = Array.from(suggestionSet).slice(0, 5);
},
doSearch() {
if (!this.keyword.trim()) {
uni.showToast({ title: '请输入搜索内容', icon: 'none' });
return;
}

this.saveHistory(this.keyword.trim());
this.performSearch();
},
performSearch() {
const kw = this.keyword.toLowerCase().trim();
const taskList = this.getTaskList || [];
const orderList = this.getMyOrders || [];

const allItems = [...taskList, ...orderList].map(item => ({
id: item.id,
imgSrc: item.imgSrc || '/static/icon/order.png',
thing: item.thing || item.title,
title: item.title,
description: item.description,
money: item.money,
time: item.time || item.createTime,
type: item.type,
typeText: item.typeText,
status: item.status,
createTime: item.createTime,
source: taskList.includes(item) ? 'task' : 'order'
}));

this.results = allItems.filter(item => 
(item.thing && item.thing.toLowerCase().includes(kw)) ||
(item.description && item.description.toLowerCase().includes(kw)) ||
(item.title && item.title.toLowerCase().includes(kw)) ||
(item.typeText && item.typeText.toLowerCase().includes(kw))
);

this.results.sort((a, b) => {
const timeA = new Date(a.createTime || a.time).getTime();
const timeB = new Date(b.createTime || b.time).getTime();
return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
});

this.showResults = true;
},
searchByHistory(keyword) {
this.keyword = keyword;
this.doSearch();
},
clearSearch() {
this.keyword = '';
this.showResults = false;
this.results = [];
this.suggestions = [];
},
toggleSort() {
this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
this.performSearch();
},
formatTime(time) {
if (!time) return '';
const date = new Date(time);
const now = new Date();
const diff = now - date;

if (diff < 60000) return '刚刚';
if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

return `${date.getMonth() + 1}/${date.getDate()}`;
},
getStatusText(status) {
const statusMap = {
1: '待接单',
2: '进行中',
3: '已完成',
4: '已取消'
};
return statusMap[status] || '';
},
goToDetail(item) {
if (item.source === 'task') {
uni.navigateTo({
url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?id=' + item.id
});
} else {
uni.navigateTo({
url: '/pages/xyyx/requirement-detail-info/requirement-detail-info?id=' + item.id + '&type=order'
});
}
},
goBack() {
uni.navigateBack();
}
}
}
</script>

<style lang="scss">
.search-page {
background-color: #F5F5F5;
min-height: 100vh;
}

.search-header {
display: flex;
align-items: center;
padding: 16rpx 24rpx;
background-color: #fff;
position: sticky;
top: 0;
z-index: 100;
}

.search-input-wrap {
flex: 1;
}

.cancel-btn {
padding: 16rpx 24rpx;

text {
font-size: 28rpx;
color: #007AFF;
}
}

.search-content {
padding: 24rpx;
}

.section {
background-color: #fff;
border-radius: 20rpx;
padding: 24rpx;
margin-bottom: 24rpx;
}

.section-header {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 20rpx;
}

.section-title {
font-size: 30rpx;
font-weight: 600;
color: #333;
}

.clear-history {
text {
font-size: 26rpx;
color: #999;
}
}

.tag-list {
display: flex;
flex-wrap: wrap;
gap: 16rpx;
}

.tag-item {
position: relative;
padding: 16rpx 28rpx;
background-color: #F5F5F5;
border-radius: 32rpx;

text {
font-size: 26rpx;
color: #666;
}

&.hot {
background-color: #fff;
border: 1rpx solid #E5E5EA;

text {
color: #333;
}
}
}

.suggestion-list {
margin-top: 8rpx;
}

.suggestion-item {
display: flex;
justify-content: space-between;
align-items: center;
padding: 24rpx 0;
border-bottom: 1rpx solid #F0F0F0;

&:last-child {
border-bottom: none;
}

.suggestion-text {
font-size: 28rpx;
color: #333;
}

.arrow {
font-size: 32rpx;
color: #C7C7CC;
}
}

.search-results {
padding: 24rpx;
}

.result-header {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 20rpx;
}

.result-count {
font-size: 26rpx;
color: #999;
}

.sort-btn {
padding: 12rpx 20rpx;
background-color: rgba(0, 122, 255, 0.1);
border-radius: 16rpx;

text {
font-size: 24rpx;
color: #007AFF;
}
}

.result-list {
background-color: #fff;
border-radius: 20rpx;
overflow: hidden;
}

.empty-tip {
display: flex;
flex-direction: column;
align-items: center;
padding: 100rpx 0;

.empty-icon {
width: 120rpx;
height: 120rpx;
opacity: 0.4;
margin-bottom: 24rpx;
}

.empty-text {
font-size: 30rpx;
color: #333;
margin-bottom: 8rpx;
}

.empty-sub {
font-size: 26rpx;
color: #999;
}
}

.result-item {
display: flex;
padding: 24rpx;
border-bottom: 1rpx solid #F0F0F0;

&:last-child {
border-bottom: none;
}

&:active {
background-color: #F8F8F8;
}
}

.item-img {
width: 140rpx;
height: 140rpx;
border-radius: 16rpx;
margin-right: 20rpx;
flex-shrink: 0;
}

.item-content {
flex: 1;
display: flex;
flex-direction: column;
justify-content: space-between;
}

.item-title {
display: flex;
align-items: center;

.type-tag {
padding: 4rpx 12rpx;
border-radius: 8rpx;
font-size: 22rpx;
margin-right: 12rpx;

&.type-1 {
background-color: rgba(0, 122, 255, 0.1);
color: #007AFF;
}

&.type-2 {
background-color: rgba(255, 149, 0, 0.1);
color: #FF9500;
}
}

.title-text {
font-size: 28rpx;
font-weight: 500;
color: #333;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
flex: 1;
}
}

.item-desc {
margin-top: 8rpx;

text {
font-size: 24rpx;
color: #999;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}
}

.item-footer {
display: flex;
justify-content: space-between;
align-items: center;
margin-top: 12rpx;
}

.item-info {
display: flex;
align-items: center;
gap: 16rpx;

.price {
font-size: 30rpx;
font-weight: 600;
color: #FF3B30;
}

.time {
font-size: 24rpx;
color: #999;
}
}

.item-status {
text {
font-size: 24rpx;
padding: 4rpx 12rpx;
border-radius: 8rpx;
}

.status-1 {
background-color: rgba(255, 149, 0, 0.1);
color: #FF9500;
}

.status-2 {
background-color: rgba(0, 122, 255, 0.1);
color: #007AFF;
}

.status-3 {
background-color: rgba(52, 199, 89, 0.1);
color: #34C759;
}
}
</style>
