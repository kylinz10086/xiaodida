<template>
	<view class="release-requirement-page">
		<u-modal 
		  @cancel="cancelDeleteModal" 
		  @confirm="confirmWithdraw" 
		  content="确认删除订单？" 
		  v-model="showDeleteModal"
		  :show-cancel-button="true"
		  :title-style="{color: 'red'}">
		</u-modal>
		
		<view class="form-section">
			<view class="section-title">需求类型</view>
			<view class="type-buttons">
				<view 
					v-for="(item, index) in typeList" 
					:key="index"
					@click="switchType(index + 1)" 
					:class="['type-btn', {'type-chosen': currentType === index + 1}]">
					{{item}}
				</view>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">任务标题</view>
			<view class="form-input-wrap">
				<u-input 
					v-model="taskTitle" 
					placeholder="请简短描述您的需求（必填）" 
					:maxlength="30"
					:border="false" 
				/>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">详细描述</view>
			<view class="form-textarea-wrap">
				<u-input 
					v-model="requirementDetail" 
					type="textarea" 
					placeholder="请详细描述您的需求，如物品大小、特殊要求等"
					:maxlength="360" 
					:border="false" 
					:height="200"
					:auto-height="true" 
				/>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">物品信息</view>
			<view class="form-row">
				<view class="form-label">物品类型</view>
				<view class="form-input-wrap small">
					<u-input v-model="itemType" placeholder="如：快递、外卖、文件" :border="false" />
				</view>
			</view>
			<view class="form-row">
				<view class="form-label">物品大小</view>
				<view class="size-options">
					<view 
						v-for="(item, index) in sizeOptions" 
						:key="index"
						@click="itemSize = item"
						:class="['size-btn', {'size-chosen': itemSize === item}]">
						{{item}}
					</view>
				</view>
			</view>
			<view class="form-row">
				<view class="form-label">预估重量</view>
				<view class="form-input-wrap small">
					<u-input v-model="itemWeight" placeholder="如：约2kg" :border="false" />
				</view>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">取件地点</view>
			<view class="address-input-group">
				<view class="address-input-item">
					<view class="address-input-header">
						<text class="address-icon start">起</text>
						<text class="address-label-text">取件地点</text>
					</view>
					<view class="address-input-body">
						<input 
							class="address-input" 
							v-model="origin.name" 
							placeholder="请输入或选择取件地点"
							placeholder-class="input-placeholder"
						/>
						<view class="address-pick-btn" @click="pickOriginAddress">
							<text>选择</text>
						</view>
					</view>
				</view>
				<view class="address-input-item">
					<view class="address-input-header">
						<text class="address-icon end">终</text>
						<text class="address-label-text">送达地点</text>
					</view>
					<view class="address-input-body">
						<input 
							class="address-input" 
							v-model="destination.name" 
							placeholder="请输入或选择送达地点"
							placeholder-class="input-placeholder"
						/>
						<view class="address-pick-btn" @click="pickDestinationAddress">
							<text>选择</text>
						</view>
					</view>
				</view>
			</view>
			<view class="route-map-btn" v-if="origin.name && destination.name" @click="openRouteMap">
				<text>查看路线规划</text>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">时间要求</view>
			<view class="time-options">
				<view 
					v-for="(item, index) in timeOptions" 
					:key="index"
					@click="selectTimeOption(item)"
					:class="['time-btn', {'time-chosen': selectedTimeOption === item}]">
					{{item}}
				</view>
			</view>
			<view class="custom-time" v-if="selectedTimeOption === '指定时间'" @click="showTimePicker">
				<text class="time-label">指定时间：</text>
				<text :class="['time-value', {'placeholder': requireTime === '点击选择时间'}]">
					{{requireTime}}
				</text>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">悬赏金额</view>
			<view class="price-section">
				<view class="quick-prices">
					<view 
						v-for="(item, index) in quickPrices" 
						:key="index"
						@click="setQuickPrice(item)"
						:class="['quick-price-btn', {'price-chosen': requirePrice === item}]">
						¥{{item}}
					</view>
				</view>
				<view class="custom-price">
					<text class="price-symbol">¥</text>
					<input 
						class="price-input" 
						type="digit" 
						v-model="requirePrice" 
						placeholder="自定义金额"
						@input="selectedQuickPrice = null"
					/>
				</view>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">联系方式</view>
			<view class="form-row">
				<view class="form-label">手机号码</view>
				<view class="form-input-wrap small">
					<u-input v-model="phoneNumber" placeholder="接收任务通知" type="number" :border="false" :maxlength="11" />
				</view>
			</view>
			<view class="form-row">
				<view class="form-label">微信号</view>
				<view class="form-input-wrap small">
					<u-input v-model="wechatId" placeholder="方便沟通详情" :border="false" />
				</view>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">补充图片</view>
			<view class="picture-upload">
				<htz-image-upload 
					:max="6" 
					v-model="ceshiData" 
					@uploadSuccess="() => {}" 
					@chooseSuccess="ceshiChooseSuccess">
				</htz-image-upload>
			</view>
		</view>

		<view class="form-section">
			<view class="section-title">备注信息</view>
			<view class="form-textarea-wrap">
				<u-input 
					v-model="remark" 
					type="textarea" 
					placeholder="其他需要说明的事项（选填）"
					:maxlength="200" 
					:border="false" 
					:height="120"
					:auto-height="true" 
				/>
			</view>
		</view>

		<u-picker :params="params" :default-time="defaultTime" @confirm="confirmTime" mode="time"
			v-model="isShowTimePicker"></u-picker>

		<view class="submit-section">
			<view v-if="optionPageType == 'release'" class="submit-buttons">
				<u-button class="btn-cancel" @click="backtoprepage">取消</u-button>
				<u-button class="btn-submit" type="primary" @click="releaseReq" :loading="submitting">发布任务</u-button>
			</view>
			<view v-if="optionPageType == 'edit'" class="submit-buttons">
				<u-button class="btn-cancel" @click="backtoprepage">取消</u-button>
				<u-button class="btn-delete" type="warning" @click="withDrawReq">删除</u-button>
				<u-button class="btn-submit" type="primary" @click="releaseReq" :loading="submitting">保存修改</u-button>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapActions, mapGetters } from 'vuex';
	import UserInfoListItem from '../components/user-info-list-item.vue';
	import Moment from '../utils/moment/moment.js';
	import qiniuUploader from '../utils/qiniuUploader-min.js';

	export default {
		components: {
			UserInfoListItem
		},
		data() {
			return {
				showDeleteModal: false,
				optionPageType: 'release',
				editTaskId: null,
				currentType: 1,
				typeList: ['快递', '带餐', '代购', '其他'],
				taskTitle: '',
				requirementDetail: '',
				itemType: '',
				itemSize: '',
				itemWeight: '',
				sizeOptions: ['小件', '中件', '大件', '超大件'],
				phoneNumber: '',
				wechatId: '',
				remark: '',
				isShowTimePicker: false,
				defaultTime: '2021-10-22 16:22:11',
				params: {
					year: true,
					month: true,
					day: true,
					hour: true,
					minute: true,
					second: true
				},
				requireTime: '点击选择时间',
				selectedTimeOption: '',
				timeOptions: ['尽快送达', '1小时内', '今天内', '指定时间'],
				requirePrice: 0,
				selectedQuickPrice: null,
				quickPrices: [3, 5, 8, 10, 15, 20],
				ceshiData: [],
				token: '',
				submitting: false,
				origin: {
					name: '',
					position: ''
				},
				destination: {
					name: '',
					position: ''
				}
			};
		},
		computed: {
			...mapGetters(['getMyTasks']),
			typeText() {
				return this.typeList[this.currentType - 1] || '其他';
			}
		},
		onLoad: function(option) {
			this.currentType = parseInt(option.item) || 1;
			this.optionPageType = option.type || 'release';
			if (this.optionPageType == 'release') {
				uni.setNavigationBarTitle({
					title: '校递达-发布需求'
				});
			} else {
				uni.setNavigationBarTitle({
					title: '校递达-修改需求'
				});
				this.loadTaskData();
			}
		},
		methods: {
			...mapActions(['publishTask', 'publishAndPay', 'cancelTask']),
			loadTaskData() {
				const taskId = uni.getStorageSync('currentEditTaskId');
				if (taskId) {
					const task = this.getMyTasks.find(t => t._id === taskId || t.id === taskId);
					if (task) {
						this.editTaskId = taskId;
						this.currentType = task.type || 1;
						this.taskTitle = task.title || '';
						this.requirementDetail = task.description || '';
						this.itemType = task.itemType || '';
						this.itemSize = task.itemSize || '';
						this.itemWeight = task.itemWeight || '';
						this.requireTime = task.deadline || '点击选择时间';
						this.selectedTimeOption = task.timeOption || '';
						this.requirePrice = task.money || 0;
						this.phoneNumber = task.phoneNumber || '';
						this.wechatId = task.wechatId || '';
						this.remark = task.remark || '';
						this.origin = task.origin || { name: '', position: '' };
						this.destination = task.destination || { name: '', position: '' };
						this.ceshiData = task.images || [];
					}
					uni.removeStorageSync('currentEditTaskId');
				}
			},
			switchType: function(num) {
				this.currentType = num;
			},
			selectTimeOption: function(option) {
				this.selectedTimeOption = option;
				if (option !== '指定时间') {
					this.requireTime = option;
				} else {
					this.requireTime = '点击选择时间';
					this.showTimePicker();
				}
			},
			showTimePicker: function() {
				this.isShowTimePicker = true;
				let tmpTime = Moment().add(1, 'h').format('YYYY-M-D HH:mm:ss');
				this.defaultTime = tmpTime;
			},
			confirmTime: function(obj) {
				this.requireTime = obj.year + '-' + obj.month + '-' + obj.day + ' ' + obj.hour + ':' + obj.minute + ':' + obj.second;
			},
			setQuickPrice: function(price) {
				this.requirePrice = price;
				this.selectedQuickPrice = price;
			},
			pickOriginAddress: function() {
				uni.chooseLocation({
					success: (res) => {
						this.origin = {
							name: res.name || res.address,
							position: res.longitude + ',' + res.latitude
						};
					}
				});
			},
			pickDestinationAddress: function() {
				uni.chooseLocation({
					success: (res) => {
						this.destination = {
							name: res.name || res.address,
							position: res.longitude + ',' + res.latitude
						};
					}
				});
			},
			ceshiChooseSuccess: async function(params) {
				let data = await uni.request({
					url: 'https://p32608e355.eicp.vip/upToken'
				});
				if (data[1] && data[1].data && data[1].data.code == 200) {
					let token = data[1].data.token;
					params.map((filePath) => {
						let tt = filePath.split('/');
						let filename = tt[tt.length-1];
						uni.uploadFile({
							url: 'https://upload-z1.qiniup.com', 
							filePath: filePath,
							name: 'file',
							formData: {
								'key': filename,
								'token': token
							},
							success: (uploadFileRes) => {
								let data = JSON.parse(uploadFileRes.data);
								this.ceshiData.push("http://r1dyssfm5.hb-bkt.clouddn.com/"+data.key);
							}
						});
					});
				}
			},
			validateForm() {
				if (!this.taskTitle.trim()) {
					uni.showToast({
						title: '请填写任务标题',
						icon: 'none'
					});
					return false;
				}
				if (!this.requirementDetail.trim()) {
					uni.showToast({
						title: '请填写详细描述',
						icon: 'none'
					});
					return false;
				}
				if (!this.origin.name) {
					uni.showToast({
						title: '请选择取件地点',
						icon: 'none'
					});
					return false;
				}
				if (!this.destination.name) {
					uni.showToast({
						title: '请选择送达地点',
						icon: 'none'
					});
					return false;
				}
				if (!this.selectedTimeOption) {
					uni.showToast({
						title: '请选择时间要求',
						icon: 'none'
					});
					return false;
				}
				if (this.selectedTimeOption === '指定时间' && this.requireTime === '点击选择时间') {
					uni.showToast({
						title: '请选择指定时间',
						icon: 'none'
					});
					return false;
				}
				if (this.requirePrice <= 0) {
					uni.showToast({
						title: '请设置悬赏金额',
						icon: 'none'
					});
					return false;
				}
				return true;
			},
			backtoprepage: function() {
				uni.navigateBack({
					delta: 1
				});
			},
			releaseReq: async function() {
				if (!this.validateForm()) return;
				if (this.submitting) return;
				
				this.submitting = true;
				
				// 字段名对齐云对象 xyyx-user.publishTask（服务端只用 snake_case + amount 元）
				const taskData = {
					type: this.currentType,
					title: this.taskTitle,
					description: this.requirementDetail,
					item_type: this.itemType,
					item_size: this.itemSize,
					item_weight: this.itemWeight,
					amount: Number(this.requirePrice),
					time_option: this.selectedTimeOption,
					mobile: this.phoneNumber,
					wechat_id: this.wechatId,
					remark: this.remark,
					origin: this.origin,
					destination: this.destination,
					images: this.ceshiData
				};
				
				try {
					if (this.optionPageType === 'edit' && this.editTaskId) {
						await this.cancelTask({ taskId: this.editTaskId, reason: '重新发布' });
						await this.publishAndPay(taskData);
						uni.showToast({
							duration: 1500,
							icon: 'success',
							title: '修改成功！'
						});
					} else {
						// 发布后立刻走支付（配了商户证书是微信支付，没配是模拟支付）
						await this.publishAndPay(taskData);
						uni.showToast({
							duration: 1500,
							icon: 'success',
							title: '下单成功！'
						});
					}
					
					setTimeout(() => {
						uni.switchTab({
						    url: '/pages/xyyx/order/order'
						});
					}, 1500);
				} catch (e) {
					uni.showToast({
						title: e.message || '操作失败',
						icon: 'none'
					});
				} finally {
					this.submitting = false;
				}
			},
			withDrawReq: function() {
				this.showDeleteModal = true;
			},
			confirmWithdraw: async function() {
				if (this.editTaskId) {
					try {
						await this.cancelTask({ taskId: this.editTaskId, reason: '用户取消' });
						this.showDeleteModal = false;
						uni.showToast({
							duration: 1500,
							icon: 'success',
							title: '删除成功！'
						});
						setTimeout(() => {
							uni.switchTab({
							    url: '/pages/xyyx/order/order'
							});
						}, 1500);
					} catch (e) {
						uni.showToast({
							title: e.message || '删除失败',
							icon: 'none'
						});
					}
				}
			},
			cancelDeleteModal: function() {
				this.showDeleteModal = false;
			},
			openRouteMap: function() {
				uni.navigateTo({
					url: '/pages/xyyx/route-detail/route-detail?sposition='+this.origin.position+'&eposition='+this.destination.position
				});
			}
		}
	}
</script>

<style lang="scss">
	.release-requirement-page {
		background-color: #F2F2F7;
		min-height: 100vh;
		padding-bottom: 140rpx;
	}
	
	.form-section {
		background-color: #fff;
		margin-bottom: 24rpx;
		padding: 24rpx 32rpx;
	}
	
	.section-title {
		font-size: 26rpx;
		font-weight: 600;
		color: #8E8E93;
		margin-bottom: 16rpx;
		text-transform: uppercase;
		letter-spacing: 1rpx;
	}
	
	.type-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
	}
	
	.type-btn {
		padding: 16rpx 32rpx;
		border-radius: 16rpx;
		font-size: 28rpx;
		background-color: rgba(0, 122, 255, 0.1);
		color: #007AFF;
		font-weight: 500;
		transition: all 0.2s;
	}
	
	.type-chosen {
		background-color: #007AFF;
		color: #fff;
	}
	
	.form-input-wrap {
		background-color: #F2F2F7;
		border-radius: 16rpx;
		padding: 20rpx 24rpx;
	}
	
	.form-input-wrap.small {
		flex: 1;
		padding: 16rpx 20rpx;
	}
	
	.form-textarea-wrap {
		background-color: #F2F2F7;
		border-radius: 16rpx;
		padding: 20rpx 24rpx;
		min-height: 200rpx;
	}
	
	.form-row {
		display: flex;
		align-items: center;
		margin-bottom: 20rpx;
		
		&:last-child {
			margin-bottom: 0;
		}
	}
	
	.form-label {
		font-size: 28rpx;
		color: #000;
		width: 160rpx;
		flex-shrink: 0;
		font-weight: 500;
	}
	
	.size-options {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
		flex: 1;
	}
	
	.size-btn {
		padding: 12rpx 24rpx;
		border-radius: 16rpx;
		font-size: 26rpx;
		background-color: rgba(0, 122, 255, 0.1);
		color: #007AFF;
		font-weight: 500;
	}
	
	.size-chosen {
		background-color: #007AFF;
		color: #fff;
	}
	
	.address-input-group {
		display: flex;
		flex-direction: column;
		gap: 16rpx;
	}
	
	.address-input-item {
		background-color: #F2F2F7;
		border-radius: 16rpx;
		padding: 20rpx;
	}
	
	.address-input-header {
		display: flex;
		align-items: center;
		margin-bottom: 12rpx;
	}
	
	.address-icon {
		width: 40rpx;
		height: 40rpx;
		line-height: 40rpx;
		text-align: center;
		border-radius: 20rpx;
		color: #fff;
		font-size: 20rpx;
		margin-right: 12rpx;
		
		&.start {
			background-color: #34C759;
		}
		&.end {
			background-color: #FF9500;
		}
	}
	
	.address-label-text {
		font-size: 28rpx;
		color: #000;
		font-weight: 600;
	}
	
	.address-input-body {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}
	
	.address-input {
		flex: 1;
		height: 72rpx;
		background-color: #fff;
		border-radius: 12rpx;
		padding: 0 20rpx;
		font-size: 28rpx;
		color: #000;
	}
	
	.input-placeholder {
		color: #C7C7CC;
	}
	
	.address-pick-btn {
		padding: 14rpx 24rpx;
		background-color: #007AFF;
		color: #fff;
		border-radius: 12rpx;
		font-size: 26rpx;
		white-space: nowrap;
		font-weight: 500;
	}
	
	.route-map-btn {
		margin-top: 16rpx;
		padding: 20rpx;
		text-align: center;
		background-color: rgba(0, 122, 255, 0.1);
		border-radius: 12rpx;
		color: #007AFF;
		font-size: 28rpx;
		font-weight: 500;
	}
	
	.time-options {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
		margin-bottom: 16rpx;
	}
	
	.time-btn {
		padding: 14rpx 28rpx;
		border-radius: 16rpx;
		font-size: 26rpx;
		background-color: rgba(0, 122, 255, 0.1);
		color: #007AFF;
		font-weight: 500;
	}
	
	.time-chosen {
		background-color: #007AFF;
		color: #fff;
	}
	
	.custom-time {
		display: flex;
		align-items: center;
		padding: 20rpx 24rpx;
		background-color: #F2F2F7;
		border-radius: 12rpx;
	}
	
	.time-label {
		font-size: 28rpx;
		color: #8E8E93;
	}
	
	.time-value {
		font-size: 28rpx;
		color: #007AFF;
		font-weight: 500;
		
		&.placeholder {
			color: #C7C7CC;
		}
	}
	
	.price-section {
		display: flex;
		flex-direction: column;
		gap: 20rpx;
	}
	
	.quick-prices {
		display: flex;
		flex-wrap: wrap;
		gap: 12rpx;
	}
	
	.quick-price-btn {
		padding: 14rpx 28rpx;
		border-radius: 16rpx;
		font-size: 28rpx;
		background-color: rgba(255, 149, 0, 0.1);
		color: #FF9500;
		font-weight: 500;
	}
	
	.price-chosen {
		background-color: #FF9500;
		color: #fff;
	}
	
	.custom-price {
		display: flex;
		align-items: center;
		padding: 16rpx 20rpx;
		background-color: #F2F2F7;
		border-radius: 12rpx;
	}
	
	.price-symbol {
		font-size: 32rpx;
		font-weight: 600;
		color: #FF9500;
		margin-right: 8rpx;
	}
	
	.price-input {
		flex: 1;
		font-size: 32rpx;
		color: #000;
		font-weight: 500;
	}
	
	.picture-upload {
		background-color: #F2F2F7;
		border-radius: 16rpx;
		padding: 20rpx;
	}
	
	.submit-section {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background-color: #F2F2F7;
		padding: 16rpx 32rpx;
		padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
		z-index: 999;
	}
	
	.submit-buttons {
		display: flex;
		gap: 16rpx;
	}
	
	.btn-cancel {
		flex: 1;
		height: 88rpx;
		line-height: 88rpx;
		background-color: #fff;
		color: #007AFF;
		border: none;
		border-radius: 16rpx;
		font-size: 32rpx;
		font-weight: 500;
	}
	
	.btn-delete {
		flex: 1;
		height: 88rpx;
		line-height: 88rpx;
		background-color: #fff;
		color: #FF3B30;
		border: none;
		border-radius: 16rpx;
		font-size: 32rpx;
		font-weight: 500;
	}
	
	.btn-submit {
		flex: 2;
		height: 88rpx;
		line-height: 88rpx;
		background-color: #007AFF;
		color: #fff;
		border: none;
		border-radius: 16rpx;
		font-size: 32rpx;
		font-weight: 600;
	}
</style>
