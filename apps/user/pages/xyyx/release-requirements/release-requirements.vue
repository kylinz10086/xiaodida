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
			<view class="reuse-tip" v-if="reusedAddress">已沿用上次的取件/送达地址，点「选择」可以换</view>
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
			<view class="price-hint" v-if="priceHint">{{ priceHint }}</view>
			<view class="price-section">
				<view class="quick-prices">
					<view 
						v-for="(item, index) in quickPriceList" 
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
			<view class="contact-tip">
				<text v-if="sameAsAccountMobile">已使用账号绑定的手机号，骑手接单后可见（脱敏）</text>
				<text v-else>骑手需要通过该号码联系你，请填写真实手机号</text>
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
			<!-- 付款前必须说清楚：退款规则（默认全额退，后台配了费率才会扣） -->
			<view class="pay-notice" v-if="optionPageType == 'release'">
				<text class="pay-notice-title">支付说明</text>
				<text class="pay-notice-text" v-if="refundFeeRate > 0">
					下单需先支付 ¥{{ requirePrice || 0 }} 到平台托管。若你取消订单或降价改单，
					退款将扣除 {{ refundFeePercent }} 微信支付通道费，实际退回约 ¥{{ refundPreview }}。
				</text>
				<text class="pay-notice-text" v-else>
					下单需先支付 ¥{{ requirePrice || 0 }} 到平台托管。若你取消订单或降价改单，
					已付金额将全额原路退回。
				</text>
			</view>
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
	import { uploadImage, getTempUrls, thumbDataUri } from '@/common/image.js';
	import { distanceMeters } from '@/common/rider-util.js';
	import { requestNotify } from '@/common/notify.js';

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
				typeList: ['快递代取', '代带餐食', '其他'],
				taskTitle: '',
				requirementDetail: '',
				itemType: '',
				itemSize: '',
				itemWeight: '',
				sizeOptions: ['小件', '中件', '大件', '超大件'],
				phoneNumber: '',
				/** 账号绑定的手机号，用来判断当前填的是不是「我的号码」 */
				accountMobile: '',
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
				/** 图片 fileID 与预览地址的对应关系；提交时只传 fileID */
				imageIds: [],
				imageIdByPreview: {},
				/** fileID -> 缩略图 data URI：提交时一起存，详情页直接展示 */
				thumbByFileID: {},
				reusedAddress: false,
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
			},
			sameAsAccountMobile() {
				return !!this.accountMobile && this.phoneNumber === this.accountMobile;
			},
			/** 退款扣除费率（服务端下发，默认 0 = 全额退），用来在下单前把话说清楚 */
			refundFeeRate() {
				const r = this.$store && this.$store.state.profile && this.$store.state.profile.refund_fee_rate;
				return typeof r === 'number' ? r : 0;
			},
			refundFeePercent() {
				return (this.refundFeeRate * 100).toFixed(1).replace(/\.0$/, '') + '%';
			},
			/** 取消/降价时大约能退回多少（给用户一个直观数字） */
			refundPreview() {
				const amount = Number(this.requirePrice) || 0;
				if (amount <= 0) return '0.00';
				const cents = Math.round(amount * 100);
				const fee = Math.min(Math.round(cents * this.refundFeeRate), Math.max(0, cents - 1));
				return ((cents - fee) / 100).toFixed(2);
			},
			/** 按距离 + 物品大小给三档参考价；没有坐标就退回默认档，不报错 */
			quickPriceList() {
				const o = this.origin || {};
				const d = this.destination || {};
				let base = [3, 5, 8];
				if (o.latitude && o.longitude && d.latitude && d.longitude) {
					const m = distanceMeters(o.latitude, o.longitude, d.latitude, d.longitude);
					if (m >= 0 && m < 600) base = [3, 4, 5];
					else if (m < 1200) base = [4, 6, 8];
					else if (m < 2500) base = [6, 8, 10];
					else base = [8, 12, 15];
				}
				if (/大|超大/.test(this.itemSize || '')) base = base.map((n) => n + 2);
				return base;
			},
			priceHint() {
				const o = this.origin || {};
				const d = this.destination || {};
				if (!o.latitude || !d.latitude) return '';
				const list = this.quickPriceList;
				return '按距离和物品大小，建议 ' + list[0] + '-' + list[list.length - 1] + ' 元，也可以自己填';
			}
		},
		onLoad: function(option) {
			this.currentType = parseInt(option.item) || 1;
			this.optionPageType = option.type || 'release';
			if (this.optionPageType == 'release') {
				uni.setNavigationBarTitle({
					title: '校递达-发布需求'
				});
				this.prefillAddress();
			} else {
				uni.setNavigationBarTitle({
					title: '校递达-修改需求'
				});
				this.loadTaskData();
			}
			// 改单时优先用任务里原来的号码，只有空着才补账号号码
			this.prefillMobile();
		},
		methods: {
			...mapActions(['publishTask', 'publishAndPay', 'cancelTask', 'updateTask', 'payOrder', 'fetchUserInfo']),
			/** 地址复用：只存最近一次，不做地址簿 */
			prefillAddress() {
				try {
					const o = uni.getStorageSync('last_origin');
					const d = uni.getStorageSync('last_destination');
					if (o && o.name) this.origin = o;
					if (d && d.name) this.destination = d;
					this.reusedAddress = !!((o && o.name) || (d && d.name));
				} catch (e) {}
			},
			/**
			 * 联系方式直接从账号资料带过来：号码在「我的-手机号」维护过一次，
			 * 发布任务时就不该再手打一遍。
			 */
			async prefillMobile() {
				const cached = uni.getStorageSync('userInfo');
				if (cached && cached.mobile) this.accountMobile = cached.mobile;
				if (!this.accountMobile) {
					try {
						const profile = await this.fetchUserInfo();
						if (profile && profile.mobile) this.accountMobile = profile.mobile;
					} catch (e) {
						// 未登录 / 断网时保持手填，不打断发布流程
					}
				}
				if (!this.phoneNumber && this.accountMobile) this.phoneNumber = this.accountMobile;
			},
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
						// 数据库里存的是经纬度，页面用的是 'lng,lat' 字符串，这里补回来，
						// 否则编辑时「查看路线」会是 undefined,undefined
						if (this.origin && !this.origin.position && this.origin.longitude && this.origin.latitude) {
							this.origin.position = this.origin.longitude + ',' + this.origin.latitude;
						}
						if (this.destination && !this.destination.position && this.destination.longitude && this.destination.latitude) {
							this.destination.position = this.destination.longitude + ',' + this.destination.latitude;
						}
						// 图片：库里存 fileID，编辑时换成缩略图/临时链接预览，提交时再换回 fileID
						const ids = (task.images || []).slice(0, 6);
						this.imageIds = ids.slice();
						this.ceshiData = ids.slice();
						const thumbs = task.image_thumbs || [];
						ids.forEach((id, i) => {
							if (thumbs[i]) this.thumbByFileID[id] = thumbs[i];
						});
						// 有缩略图直接用它预览（不依赖域名），没有的再找临时链接
						this.ceshiData = ids.map((id) => this.thumbByFileID[id] || id);
						ids.forEach((id) => { this.imageIdByPreview[this.thumbByFileID[id] || id] = id; });
						getTempUrls(ids).then((map) => {
							if (!Object.keys(map).length) return;
							ids.forEach((id) => {
								if (map[id]) {
									this.imageIdByPreview[map[id]] = id;
									if (!this.thumbByFileID[id]) {
										// 老订单没有缩略图：临时链接能开就先显示，打不开就是灰块
										const i = this.ceshiData.indexOf(id);
										if (i >= 0) this.ceshiData.splice(i, 1, map[id]);
									}
								}
							});
						});
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
						// 同时存 position（旧字段）和经纬度（骑手端地图/导航要用）
						this.origin = {
							name: res.name || res.address,
							detail: res.address || '',
							position: res.longitude + ',' + res.latitude,
							latitude: res.latitude,
							longitude: res.longitude
						};
					}
				});
			},
			pickDestinationAddress: function() {
				uni.chooseLocation({
					success: (res) => {
						this.destination = {
							name: res.name || res.address,
							detail: res.address || '',
							position: res.longitude + ',' + res.latitude,
							latitude: res.latitude,
							longitude: res.longitude
						};
					}
				});
			},
			ceshiChooseSuccess: async function(params) {
				// 图片走云函数中转（真机 uploadFile 需要 OSS 域名白名单，没配会失败）
				for (const filePath of params) {
					try {
						uni.showLoading({ title: '上传中…', mask: true });
						// 顺手做一张缩略图：列表/详情直接画它，不依赖云存储域名
						const thumb = await thumbDataUri(filePath, { width: 480, maxLen: 12000 });
						const fileID = await uploadImage(filePath, { role: 'user', dir: 'tasks', width: 1440, quality: 70 });
						const map = thumb ? {} : await getTempUrls([fileID]);
						const preview = thumb || map[fileID] || fileID;
						if (thumb) this.thumbByFileID[fileID] = thumb;
						this.imageIds.push(fileID);
						this.imageIdByPreview[preview] = fileID;
						this.imageIdByPreview[fileID] = fileID;
						this.ceshiData.push(preview);
					} catch (e) {
						uni.showToast({ title: (e && e.message) || '图片上传失败', icon: 'none' });
					} finally {
						uni.hideLoading();
					}
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
				// 服务端也要求 11 位手机号（骑手要打电话联系），这里先拦一道，别等付完款才报错
				if (!/^1\d{10}$/.test(String(this.phoneNumber || '').trim())) {
					uni.showToast({
						title: '请填写正确的手机号',
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
				// 预览地址可能是缩略图 data URI / 临时链接，提交时换回 fileID
				const submitImages = (this.ceshiData || [])
					.map((url) => this.imageIdByPreview[url] || url)
					.filter((id) => typeof id === 'string' && id.length > 0)
					.slice(0, 6);
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
					// 预览地址可能是临时链接/缩略图，提交时换回 fileID；老数据没有映射就原样传
					images: submitImages,
					// 与 images 同下标的缩略图，详情页直接展示
					image_thumbs: submitImages.map((id) => this.thumbByFileID[id] || '')
				};
				
				// 有弹窗时要等用户看完再跳转，否则弹窗刚出来页面就被切走了
				const goOrders = () => {
					setTimeout(() => {
						uni.switchTab({
						    url: '/pages/xyyx/order/order'
						});
					}, 1200);
				};

				try {
					if (this.optionPageType === 'edit' && this.editTaskId) {
						// 修改订单：原地更新同一个订单号，不再「取消旧单 + 重新全额付款」
						const info = await this.updateTask({ ...taskData, taskId: this.editTaskId });
						if (info.needPay) {
							// 涨价：只补差价，不会重复收全款
							await this.payOrder({ taskId: this.editTaskId });
							uni.showModal({
								title: '修改成功',
								content: `订单金额 ¥${info.oldAmount} → ¥${info.amount}，已补付差价 ¥${info.payAmount}。`,
								showCancel: false,
								success: goOrders,
								fail: goOrders
							});
						} else if (info.refund && Number(info.refund) > 0) {
							// 降价：差额已在服务端当场提交退款，文案直接用服务端返回的
							const modeTip = info.refundMode === 'balance'
								? '（已退回账户余额）'
								: '（原路退回微信，可在「微信支付」账单里查看到账记录）';
							uni.showModal({
								title: '修改成功',
								content: (info.msg || `已退回差价 ¥${info.refund}`) + modeTip,
								showCancel: false,
								success: goOrders,
								fail: goOrders
							});
						} else {
							uni.showToast({
								duration: 1500,
								icon: 'success',
								title: info.msg || '修改成功！'
							});
							goOrders();
						}
					} else {
						// 发布后立刻走支付（配了商户证书是微信支付，没配是模拟支付）
						await this.publishAndPay(taskData);
						// 发布成功后问一次订阅授权：接单/送达通知
						await requestNotify(['taskAccepted', 'taskDelivered']).catch(() => {});
						// 下次发单直接带出这次的地点
						try {
							uni.setStorageSync('last_origin', this.origin);
							uni.setStorageSync('last_destination', this.destination);
						} catch (e) {}
						uni.showToast({
							duration: 1500,
							icon: 'success',
							title: '下单成功！'
						});
						goOrders();
					}
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
						const r = await this.cancelTask({ taskId: this.editTaskId, reason: '用户取消' });
						this.showDeleteModal = false;
						// 用弹窗而不是 toast：退款金额和手续费要让人看清
						uni.showModal({
							title: '订单已取消',
							content: (r && r.msg) || '订单已取消',
							showCancel: false,
							success: () => uni.switchTab({ url: '/pages/xyyx/order/order' }),
							fail: () => uni.switchTab({ url: '/pages/xyyx/order/order' })
						});
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
				// 用微信内置地图看取件点，不再跳老模板里那套 amap 导航页（那套要 position 字段，新数据没有）
				const o = this.origin || {};
				if (!o.latitude || !o.longitude) {
					uni.showToast({ title: '这个地点还没有坐标，重新选一次', icon: 'none' });
					return;
				}
				uni.openLocation({
					latitude: Number(o.latitude),
					longitude: Number(o.longitude),
					name: o.name || '取件点',
					address: o.detail || '',
					scale: 18
				});
			}
		}
	}
</script>

<style lang="scss">
	.release-requirement-page {
		background-color: #F2F2F7;
		min-height: 100vh;
		/* 底部固定条里多了「支付说明」，留够空间别挡住表单 */
		padding-bottom: 360rpx;
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
	
	/* 手机号说明：跟着输入框对齐，不单独占一行标题 */
	.contact-tip {
		margin: -10rpx 0 20rpx 160rpx;
		font-size: 22rpx;
		line-height: 1.5;
		color: #8E8E93;
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
	
	.price-hint {
		font-size: 23rpx;
		color: #AD6800;
		background: #FFF8E8;
		border-radius: 10rpx;
		padding: 12rpx 18rpx;
		margin-bottom: 16rpx;
		line-height: 1.5;
	}

	.reuse-tip {
		font-size: 23rpx;
		color: #007AFF;
		background: rgba(0, 122, 255, 0.08);
		border-radius: 10rpx;
		padding: 12rpx 18rpx;
		margin-bottom: 16rpx;
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

	/* 付款前的费用说明：固定底栏上方，必须看得见 */
	.pay-notice {
		background-color: #FFF7E6;
		border: 1rpx solid #FFE0A3;
		border-radius: 12rpx;
		padding: 16rpx 20rpx;
		margin-bottom: 14rpx;
		display: flex;
		flex-direction: column;
		gap: 6rpx;
	}

	.pay-notice-title {
		font-size: 24rpx;
		font-weight: 600;
		color: #AD6800;
	}

	.pay-notice-text {
		font-size: 22rpx;
		line-height: 1.55;
		color: #AD6800;
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
