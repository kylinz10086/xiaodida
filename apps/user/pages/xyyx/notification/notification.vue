<template>
<view class="page-container">
<view class="setting-section">
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">订单通知</text>
<text class="setting-desc">接收订单状态变更、接单提醒等通知</text>
</view>
<switch :checked="settings.orderNotice" @change="toggleSetting('orderNotice')" color="#007AFF" />
</view>
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">消息通知</text>
<text class="setting-desc">接收聊天消息、系统公告等通知</text>
</view>
<switch :checked="settings.messageNotice" @change="toggleSetting('messageNotice')" color="#007AFF" />
</view>
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">活动通知</text>
<text class="setting-desc">接收优惠活动、新功能上线等通知</text>
</view>
<switch :checked="settings.activityNotice" @change="toggleSetting('activityNotice')" color="#007AFF" />
</view>
</view>

<view class="setting-section">
<view class="section-header">
<text class="section-title">提醒方式</text>
</view>
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">声音提醒</text>
</view>
<switch :checked="settings.sound" @change="toggleSetting('sound')" color="#007AFF" />
</view>
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">震动提醒</text>
</view>
<switch :checked="settings.vibrate" @change="toggleSetting('vibrate')" color="#007AFF" />
</view>
</view>

<view class="setting-section">
<view class="section-header">
<text class="section-title">免打扰时段</text>
</view>
<view class="setting-item">
<view class="setting-left">
<text class="setting-title">开启免打扰</text>
<text class="setting-desc">在指定时间段内不接收通知</text>
</view>
<switch :checked="settings.doNotDisturb" @change="toggleSetting('doNotDisturb')" color="#007AFF" />
</view>
<view class="time-picker" v-if="settings.doNotDisturb">
<view class="time-item" @click="showStartTimePicker">
<text class="time-label">开始时间</text>
<view class="time-value">
<text>{{settings.startTime}}</text>
<text class="arrow">›</text>
</view>
</view>
<view class="time-item" @click="showEndTimePicker">
<text class="time-label">结束时间</text>
<view class="time-value">
<text>{{settings.endTime}}</text>
<text class="arrow">›</text>
</view>
</view>
</view>
</view>

<u-picker mode="time" v-model="showPicker" :params="pickerParams" @confirm="onTimeConfirm"></u-picker>
</view>
</template>

<script>
const SETTINGS_KEY = 'notificationSettings';

export default {
data() {
return {
showPicker: false,
pickerParams: {
hour: true,
minute: true
},
currentTimeType: 'start',
settings: {
orderNotice: true,
messageNotice: true,
activityNotice: true,
sound: true,
vibrate: true,
doNotDisturb: false,
startTime: '22:00',
endTime: '08:00'
}
};
},
onLoad() {
this.loadSettings();
},
methods: {
loadSettings() {
try {
const stored = uni.getStorageSync(SETTINGS_KEY);
if (stored) {
this.settings = { ...this.settings, ...stored };
}
} catch (e) {
console.error('加载通知设置失败', e);
}
},
saveSettings() {
try {
uni.setStorageSync(SETTINGS_KEY, this.settings);
} catch (e) {
console.error('保存通知设置失败', e);
}
},
toggleSetting(key) {
this.settings[key] = !this.settings[key];
this.saveSettings();

if (key === 'sound' && this.settings[key]) {
uni.vibrateShort();
}

uni.showToast({
title: this.settings[key] ? '已开启' : '已关闭',
icon: 'none'
});
},
showStartTimePicker() {
this.currentTimeType = 'start';
this.showPicker = true;
},
showEndTimePicker() {
this.currentTimeType = 'end';
this.showPicker = true;
},
onTimeConfirm(e) {
const time = e.hour + ':' + e.minute;
if (this.currentTimeType === 'start') {
this.settings.startTime = time;
} else {
this.settings.endTime = time;
}
this.saveSettings();
}
}
}
</script>

<style lang="scss">
.page-container {
background-color: #F5F5F5;
min-height: 100vh;
}

.setting-section {
background-color: #fff;
margin-bottom: 20rpx;
}

.section-header {
padding: 24rpx 32rpx 16rpx;
}

.section-title {
font-size: 26rpx;
color: #999;
font-weight: 500;
}

.setting-item {
display: flex;
justify-content: space-between;
align-items: center;
padding: 28rpx 32rpx;
border-bottom: 1rpx solid #F0F0F0;

&:last-child {
border-bottom: none;
}
}

.setting-left {
flex: 1;
display: flex;
flex-direction: column;
}

.setting-title {
font-size: 30rpx;
color: #333;
font-weight: 500;
}

.setting-desc {
font-size: 24rpx;
color: #999;
margin-top: 8rpx;
}

.time-picker {
background-color: #F9F9F9;
padding: 0 32rpx;
}

.time-item {
display: flex;
justify-content: space-between;
align-items: center;
padding: 24rpx 0;
border-bottom: 1rpx solid #F0F0F0;

&:last-child {
border-bottom: none;
}
}

.time-label {
font-size: 28rpx;
color: #666;
}

.time-value {
display: flex;
align-items: center;

text {
font-size: 28rpx;
color: #007AFF;
}

.arrow {
font-size: 32rpx;
color: #C7C7CC;
margin-left: 8rpx;
}
}
</style>
