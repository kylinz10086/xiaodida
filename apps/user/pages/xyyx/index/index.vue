<template>
	<view class="page-container">
		<u-dropdown class="area" :border-bottom="true">
			<u-dropdown-item v-model="value1" :title="options1[value1].label" :options="options1"></u-dropdown-item>
		</u-dropdown>
		<view class="search-wrap" @click="goToSearch">
			<view class="search-box">
				<text class="search-placeholder">搜索任务、服务...</text>
			</view>
		</view>
		<view class="banner-wrap">
			<u-swiper class="banner-swiper" mode="rect" img-mode="aspectFit" :list="list" height="320" border-radius="24"></u-swiper>
		</view>
		<view class="section-title">
			<view class="title-text">发布需求</view>
			<view class="title-line"></view>
		</view>
		<u-row gutter="16" class="action-row">
			<u-col span="6">
				<view class="action-card" @tap="clickReleaseRequirments(1)">
					<image class="action-icon" :src="imgCheckAllSrc" mode="aspectFit"></image>
					<view class="action-main">代取快递</view>
					<view class="action-sub">package requirement</view>
				</view>
			</u-col>
			<u-col span="6">
				<view class="action-card" @tap="clickReleaseRequirments(2)">
					<image class="action-icon" :src="imgShareSrc" mode="aspectFit"></image>
					<view class="action-main">我要带餐</view>
					<view class="action-sub">takeaway requirement</view>
				</view>
			</u-col>
		</u-row>
		<view class="section-header">
			<view class="section-title">
				<view class="title-text">任务市场</view>
				<image class="refresh-icon" :src="imgRefreshSrc" mode="aspectFit" @click="refreshList"></image>
			</view>
			<view class="sort-tabs">
				<view 
					class="sort-tab" 
					:class="{'active': sortType === 'time'}" 
					@click="changeSortType('time')">
					<text>按时间</text>
					<view class="sort-arrow" v-if="sortType === 'time'">
						<text :class="['arrow', {'up': sortOrder === 'asc', 'down': sortOrder === 'desc'}]">↓</text>
					</view>
				</view>
				<view 
					class="sort-tab" 
					:class="{'active': sortType === 'price'}" 
					@click="changeSortType('price')">
					<text>按价格</text>
					<view class="sort-arrow" v-if="sortType === 'price'">
						<text :class="['arrow', {'up': sortOrder === 'asc', 'down': sortOrder === 'desc'}]">↓</text>
					</view>
				</view>
			</view>
		</view>
		<view class="mission-list">
			<view class="empty-tip" v-if="orderList.length === 0 && !loading">
				<text>暂无任务，快去发布需求吧~</text>
			</view>
			<view class="loading-tip" v-else-if="loading">
				<text>加载中...</text>
			</view>
		    <mission-list-item v-else :listData="orderList"></mission-list-item>
		</view>
		<wechat-login-modal 
			:visible="showLoginModal" 
			@close="showLoginModal = false"
			@skip="showLoginModal = false"
			@success="onLoginSuccess">
		</wechat-login-modal>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex';
	import imgLogo1 from '../../../static/icon/logo1.png'
	import imgRefresh from '../../../static/icon/refresh.png'
	import imgCheckAll from '../../../static/icon/checkall.png'
	import imgShare from '../../../static/icon/share.png'

	import MissionListItem from '../components/mission-list-item.vue'
	import WechatLoginModal from '@/components/wechat-login-modal/wechat-login-modal.vue'

	export default {
		components: {
			MissionListItem,
			WechatLoginModal
		},
		computed: {
			...mapGetters(['getTaskList']),
			orderList() {
				let list = this.getTaskList.map(task => ({
					id: task._id || task.id,
					imgSrc: task.imgSrc || '/static/icon/order.png',
					thing: task.thing || task.title || task.description,
					title: task.title,
					description: task.description,
					money: task.money,
					time: this.formatTime(task.create_time || task.time || task.createTime),
					type: task.type,
					typeText: task.typeText,
					deadline: task.deadline,
					timeOption: task.timeOption,
					origin: task.origin,
					destination: task.destination,
					itemSize: task.itemSize,
					status: task.status,
					createTime: task.create_time || task.createTime
				}));
				
				if (this.sortType === 'time') {
					list.sort((a, b) => {
						const timeA = a.createTime || 0;
						const timeB = b.createTime || 0;
						return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
					});
				} else if (this.sortType === 'price') {
					list.sort((a, b) => {
						return this.sortOrder === 'desc' ? b.money - a.money : a.money - b.money;
					});
				}
				
				return list;
			}
		},
		onShow() {
			this.checkAgreement();
			this.checkLoginStatus();
			this.loadTaskList();
		},
		methods:{
			...mapActions(['acceptTask', 'fetchTaskList', 'acceptAgreement']),
			/**
			 * 合规：首次进入必须先同意《用户服务协议》和《隐私政策》。
			 * 同意后写本地标记，同时由云对象 xyyx-user.acceptAgreement 留痕（带版本号）。
			 */
			checkAgreement() {
				const agreed = uni.getStorageSync('agreed_version');
				if (agreed === '1.0.0') return;
				uni.showModal({
					title: '用户协议与隐私政策',
					content: '为了向你提供校园跑腿服务，我们需要你同意《用户服务协议》和《隐私政策》。\n\n我们只收集手机号、位置、订单信息等必要信息，且不会向无关第三方提供。',
					confirmText: '同意并继续',
					cancelText: '查看协议',
					confirmColor: '#007AFF',
					success: (res) => {
						if (res.confirm) {
							uni.setStorageSync('agreed_version', '1.0.0');
							this.acceptAgreement().catch(() => {});
						} else {
							uni.navigateTo({ url: '/pages/xyyx/agreement/user-agreement' });
						}
					}
				});
			},
			formatTime(timestamp) {
				if (!timestamp) return '';
				const date = new Date(timestamp);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const hour = String(date.getHours()).padStart(2, '0');
				const minute = String(date.getMinutes()).padStart(2, '0');
				return `${year}-${month}-${day} ${hour}:${minute}`;
			},
			async loadTaskList() {
				this.loading = true;
				try {
					await this.fetchTaskList({ status: 1, page: 1, pageSize: 50 });
				} catch (e) {
					console.error('加载任务列表失败', e);
				} finally {
					this.loading = false;
				}
			},
			checkLoginStatus() {
				const token = uni.getStorageSync('uniIdToken') || uni.getStorageSync('token');
				if (!token) {
					this.showLoginModal = true;
				}
			},
			onLoginSuccess(result) {
				this.showLoginModal = false;
				this.loadTaskList();
				if (this.pendingAction && this.pendingAction.type === 'release') {
					const num = this.pendingAction.num;
					this.pendingAction = null;
					setTimeout(() => {
						uni.navigateTo({
							url: '/pages/xyyx/release-requirements/release-requirements?item=' + num + '&type=release'
						});
					}, 300);
				}
			},
			clickReleaseRequirments: function(num) {
				const token = uni.getStorageSync('uniIdToken') || uni.getStorageSync('token');
				if (!token) {
					this.showLoginModal = true;
					this.pendingAction = { type: 'release', num: num };
					return;
				}
				uni.navigateTo({
					url: '/pages/xyyx/release-requirements/release-requirements?item='+ num+ '&type=release'
				});
			},
			goToSearch() {
				uni.navigateTo({
					url: '/pages/xyyx/search/search'
				});
			},
			changeSortType(type) {
				if (this.sortType === type) {
					this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
				} else {
					this.sortType = type;
					this.sortOrder = 'desc';
				}
			},
			async refreshList() {
				await this.loadTaskList();
				uni.showToast({
					title: '刷新成功',
					icon: 'success',
					duration: 1000
				});
			}
		},
		data() {
			return {
				showLoginModal: false,
				pendingAction: null,
				sortType: 'time',
				sortOrder: 'desc',
				loading: false,
				list: [{
					image: imgLogo1,
					title: '校递达'
				}],
				imgRefreshSrc: imgRefresh,
				imgCheckAllSrc: imgCheckAll,
				imgShareSrc: imgShare,
				value1: 0,
				options1: [
					{
						label: '浙江中医药大学',
						value: 0,
					}
				],
			};
		}
	}
</script>

<style lang="scss">
	.page-container {
		background-color: #F2F2F7;
		min-height: 100vh;
	}
	
	.area>view>view>.u-dropdown__menu__item {
		background-color: #fff;
	}
	
	.search-wrap {
		background-color: #fff;
		padding: 16rpx 32rpx;
	}
	
	.search-box {
		display: flex;
		align-items: center;
		height: 70rpx;
		background-color: #f5f7fa;
		border-radius: 35rpx;
		padding: 0 24rpx;
	}
	
	.search-placeholder {
		font-size: 28rpx;
		color: #999;
	}
	
	.banner-wrap {
		padding: 24rpx 32rpx;
		background-color: #fff;
	}
	
	.banner-swiper {
		border-radius: 24rpx;
		overflow: hidden;
		background-color: #F2F2F7;
	}
	
	.section-title {
		display: flex;
		align-items: center;
		padding: 24rpx 32rpx 16rpx;
		
		.title-text {
			font-size: 34rpx;
			font-weight: 700;
			color: #000;
		}
		
		.title-line {
			flex: 1;
			height: 0;
		}
	}
	
	.action-row {
		padding: 0 24rpx;
	}
	
	.action-card {
		background: #fff;
		border-radius: 20rpx;
		padding: 32rpx;
		margin: 8rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: transform 0.2s ease;
		
		&:active {
			transform: scale(0.96);
		}
		
		.action-icon {
			width: 72rpx;
			height: 72rpx;
			margin-bottom: 12rpx;
		}
		
		.action-main {
			font-size: 30rpx;
			font-weight: 600;
			color: #000;
			margin-bottom: 4rpx;
		}
		
		.action-sub {
			font-size: 22rpx;
			color: #8E8E93;
		}
	}
	
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16rpx 32rpx;
		background-color: #F2F2F7;
		
		.section-title {
			padding: 0;
			display: flex;
			align-items: center;
			
			.refresh-icon {
				width: 36rpx;
				height: 36rpx;
				margin-left: 16rpx;
			}
		}
	}
	
	.sort-tabs {
		display: flex;
		gap: 12rpx;
	}
	
	.sort-tab {
		display: flex;
		align-items: center;
		padding: 12rpx 20rpx;
		background-color: rgba(0, 122, 255, 0.1);
		border-radius: 16rpx;
		font-size: 26rpx;
		color: #007AFF;
		font-weight: 500;
		transition: all 0.2s;
		
		&.active {
			background-color: #007AFF;
			color: #fff;
		}
	}
	
	.sort-arrow {
		margin-left: 6rpx;
		display: flex;
		align-items: center;
		
		.arrow {
			font-size: 22rpx;
			transition: transform 0.2s;
			
			&.up {
				transform: rotate(180deg);
			}
		}
	}
	
	.mission-list {
		padding: 0 32rpx 32rpx;
	}
	
	.empty-tip, .loading-tip {
		text-align: center;
		padding: 100rpx 0;
		color: #8E8E93;
		font-size: 28rpx;
	}
</style>
