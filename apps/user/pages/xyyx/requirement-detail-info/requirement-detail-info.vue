<template>
	<view class="requirement-detail-info">
		<view class="detail-header">
			<view class="header-top">
				<view class="type-tag" :class="'type-' + taskData.type">
					{{taskData.typeText || '快递'}}
				</view>
				<view class="status-tag" :class="'status-' + taskData.status">
					{{statusText}}
				</view>
			</view>
			<view class="task-title">{{taskData.title}}</view>
			<view class="price-display">
				<text class="price-symbol">¥</text>
				<text class="price-value">{{ money(taskData.money) }}</text>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.status">
			<view class="section-title">订单进度</view>
			<view class="timeline" v-if="taskData.status !== 4">
				<view class="tl" :class="{ on: !!taskData.pay_time }">
					<text class="tl-dot"></text>
					<view class="tl-main">
						<text class="tl-title">已支付</text>
						<text class="tl-time">{{ taskData.pay_time ? formatTime(taskData.pay_time) : '待支付' }}</text>
					</view>
				</view>
				<view class="tl" :class="{ on: !!taskData.accept_time }">
					<text class="tl-dot"></text>
					<view class="tl-main">
						<text class="tl-title">已接单</text>
						<text class="tl-time">{{ taskData.accept_time ? formatTime(taskData.accept_time) : '等待骑手接单' }}</text>
					</view>
				</view>
				<view class="tl" :class="{ on: !!taskData.picked_time }">
					<text class="tl-dot"></text>
					<view class="tl-main">
						<text class="tl-title">已取件</text>
						<text class="tl-time">{{ taskData.picked_time ? formatTime(taskData.picked_time) : '骑手取件后会更新' }}</text>
						<image v-if="taskData.pick_proof" class="proof-img" :src="imageUrl(taskData.pick_proof)"
							mode="aspectFill" @click="previewProof(taskData.pick_proof)"></image>
					</view>
				</view>
				<view class="tl" :class="{ on: !!taskData.delivered_time }">
					<text class="tl-dot"></text>
					<view class="tl-main">
						<text class="tl-title">已送达</text>
						<text class="tl-time">{{ taskData.delivered_time ? formatTime(taskData.delivered_time) : '等待送达' }}</text>
						<image v-if="taskData.deliver_proof" class="proof-img" :src="imageUrl(taskData.deliver_proof)"
							mode="aspectFill" @click="previewProof(taskData.deliver_proof)"></image>
					</view>
				</view>
				<view class="tl" :class="{ on: taskData.status === 3 }">
					<text class="tl-dot"></text>
					<view class="tl-main">
						<text class="tl-title">已完成</text>
						<text class="tl-time">{{ taskData.complete_time ? formatTime(taskData.complete_time) : '送达后自动结算' }}</text>
					</view>
				</view>
			</view>
			<view class="cancelled" v-else>
				<text>订单已取消{{ taskData.cancel_time ? ' · ' + formatTime(taskData.cancel_time) : '' }}</text>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">详细描述</view>
			<view class="section-content">{{taskData.description || '暂无详细描述'}}</view>
		</view>

		<view class="detail-section" v-if="taskData.itemType || taskData.itemSize || taskData.itemWeight">
			<view class="section-title">物品信息</view>
			<view class="info-tags">
				<view class="info-tag" v-if="taskData.itemType">
					<text class="tag-label">类型</text>
					<text class="tag-value">{{taskData.itemType}}</text>
				</view>
				<view class="info-tag" v-if="taskData.itemSize">
					<text class="tag-label">大小</text>
					<text class="tag-value">{{taskData.itemSize}}</text>
				</view>
				<view class="info-tag" v-if="taskData.itemWeight">
					<text class="tag-label">重量</text>
					<text class="tag-value">{{taskData.itemWeight}}</text>
				</view>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">取件地点</view>
			<view class="route-display">
				<view class="route-point">
					<text class="point-icon start">起</text>
					<view class="point-info">
						<text class="point-label">取件地点</text>
						<text class="point-name">{{taskData.origin ? taskData.origin.name : '未设置'}}</text>
					</view>
				</view>
				<view class="route-line"></view>
				<view class="route-point">
					<text class="point-icon end">终</text>
					<view class="point-info">
						<text class="point-label">送达地点</text>
						<text class="point-name">{{taskData.destination ? taskData.destination.name : '未设置'}}</text>
					</view>
				</view>
			</view>
			<view class="route-map-btn" v-if="taskData.origin && taskData.origin.name && taskData.destination && taskData.destination.name" @click="openRouteMap">
				<text>查看路线规划</text>
			</view>
		</view>

		<view class="detail-section">
			<view class="section-title">时间要求</view>
			<view class="time-display">
				<view class="time-tag" v-if="taskData.timeOption">{{taskData.timeOption}}</view>
				<view class="time-detail" v-if="taskData.deadline && taskData.timeOption === '指定时间'">{{taskData.deadline}}</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.phoneNumber || taskData.wechatId">
			<view class="section-title">联系方式</view>
			<view class="contact-info">
				<view class="contact-item" v-if="taskData.phoneNumber">
					<text class="contact-label">手机号码</text>
					<text class="contact-value">{{taskData.phoneNumber}}</text>
				</view>
				<view class="contact-item" v-if="taskData.wechatId">
					<text class="contact-label">微信号</text>
					<text class="contact-value">{{taskData.wechatId}}</text>
				</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.images && taskData.images.length > 0">
			<view class="section-title">补充图片</view>
			<view class="picture-display">
				<image v-for="(img, index) in taskData.images" :key="index" :src="imageUrl(img)" class="preview-image" mode="aspectFill" @click="previewImage(index)"></image>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.remark">
			<view class="section-title">备注信息</view>
			<view class="section-content">{{taskData.remark}}</view>
		</view>

		<view class="detail-section" v-if="taskData.rider && taskData.status >= 2">
			<view class="section-title">跑腿员</view>
			<view class="rider-card">
				<image class="rider-avatar" :src="avatarUrl(taskData.rider.avatar)" mode="aspectFill"></image>
				<view class="rider-main">
					<text class="rider-name">{{ taskData.rider.nickname || '骑手' }}</text>
					<text class="rider-meta">{{ riderMeta }}</text>
				</view>
				<view class="chat-btn-sm" v-if="taskData.role === 'publisher' || taskData.role === 'runner'" @click="goChat">
					<text>发消息</text>
					<text class="chat-dot" v-if="chatUnread > 0">{{ chatUnread > 99 ? '99+' : chatUnread }}</text>
				</view>
			</view>

			<view class="review-list" v-if="reviews.length">
				<view class="review-item" v-for="r in reviews" :key="r._id">
					<view class="review-top">
						<text class="review-name">{{ r.from_nickname }}</text>
						<text class="review-stars">{{ '★★★★★'.slice(0, r.score) }}</text>
					</view>
					<text class="review-text">{{ r.content || '默认好评' }}</text>
				</view>
			</view>
		</view>

		<view class="detail-section" v-if="taskData.publisher_name">
			<view class="section-title">发布者信息</view>
			<view class="runner-info">
				<view class="runner-item">
					<text class="runner-label">发布人</text>
					<text class="runner-value">{{taskData.publisher_name}}</text>
				</view>
			</view>
		</view>

		<!-- 支付与退款：改价后到底是「补差价」还是「退了差价」，这里说清楚 -->
		<view class="detail-section" v-if="taskData.role === 'publisher' && (taskData.paid || taskData.needPay || taskData.hasRefund)">
			<view class="section-title">支付与退款</view>
			<view class="runner-info">
				<view class="runner-item">
					<text class="runner-label">订单金额</text>
					<text class="runner-value">¥{{taskData.money}}</text>
				</view>
				<view class="runner-item" v-if="taskData.paid">
					<text class="runner-label">实付金额</text>
					<text class="runner-value">¥{{taskData.paid}}</text>
				</view>
				<view class="runner-item" v-if="taskData.needPay">
					<text class="runner-label">待补差价</text>
					<text class="runner-value warn">¥{{taskData.due}}</text>
				</view>
				<view class="runner-item" v-if="taskData.hasRefund">
					<text class="runner-label">{{taskData.refundStatusText || '已退款'}}</text>
					<text class="runner-value ok">¥{{taskData.refund}}</text>
				</view>
				<view class="runner-item" v-if="taskData.refundFee > 0">
					<text class="runner-label">其中通道手续费</text>
					<text class="runner-value">¥{{taskData.refundFee}}</text>
				</view>
			</view>
			<!-- 退款失败要说清原因，否则用户只看到「退款失败」四个字 -->
			<view class="refund-fail" v-if="taskData.refundStatus === 'failed' && taskData.refundFailReason">
				<text>退款失败：{{taskData.refundFailReason}}</text>
				<text class="refund-fail-tip">系统会自动重试，也可以联系客服人工处理</text>
			</view>
		</view>

		<view class="detail-footer">
			<view class="publish-time">发布时间：{{formatTime(taskData.create_time)}}</view>
		</view>

		<!-- 底部动作：按「身份 + 状态」给真正能用的按钮，不出现点了必然失败的入口 -->
		<view class="action-section" v-if="taskData.role === 'publisher'">
			<block v-if="taskData.status === 1">
				<view class="action-btn cancel" @click="cancelOrder">取消订单</view>
				<view class="action-btn confirm" @click="editOrder">修改订单</view>
			</block>
			<block v-else-if="taskData.status === 2 && taskData.delivered_time > 0">
				<view class="action-btn cancel" @click="goBack">返回</view>
				<view class="action-btn complete" @click="confirmReceipt">确认收货</view>
			</block>
			<block v-else-if="taskData.status === 2">
				<view class="action-btn cancel" @click="goBack">返回</view>
				<view class="action-btn confirm" v-if="taskData.rider" @click="goChat">联系骑手</view>
			</block>
			<block v-else-if="taskData.status === 3">
				<view class="action-btn cancel" @click="goBack">返回</view>
				<view class="action-btn complete" v-if="!taskData.reviewed && !reviewedLocal" @click="openReview">评价骑手</view>
			</block>
			<block v-else>
				<view class="action-btn cancel" @click="goBack">返回</view>
			</block>
		</view>

		<view class="action-section" v-else-if="taskData.role === 'runner'">
			<view class="action-btn cancel" @click="goBack">返回</view>
			<view class="action-btn confirm" @click="goRiderDetail">去骑手工作台</view>
		</view>

		<view class="action-section" v-else>
			<view class="action-btn cancel" @click="goBack">返回</view>
		</view>

		<!-- 评价弹层：1-5 星 + 快捷标签 + 200 字 -->
		<view class="review-mask" v-if="showReview" @touchmove.stop.prevent>
			<view class="review-modal">
				<text class="review-title">评价这单骑手</text>
				<view class="star-row">
					<text v-for="n in 5" :key="n" class="star" :class="{ on: n <= reviewStars }" @click="reviewStars = n">★</text>
				</view>
				<view class="tag-row">
					<text v-for="t in reviewTagOptions" :key="t" class="rtag" :class="{ on: pickedTags.indexOf(t) >= 0 }"
						@click="toggleTag(t)">{{ t }}</text>
				</view>
				<textarea class="review-input" v-model="reviewContent" maxlength="200"
					placeholder="说点什么（选填，200 字以内）"></textarea>
				<view class="review-actions">
					<view class="review-btn cancel" @click="showReview = false">取消</view>
					<view class="review-btn ok" :class="{ disabled: submittingReview }" @click="submitReview">
						{{ submittingReview ? '提交中…' : '提交' }}
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex';
	import { navigateTo, fmtMoney } from '@/common/rider-util.js';
	import { resolveImageSrc } from '@/common/image.js';

	export default {
		data() {
			return {
				optionPageType: 'completed',
				taskId: null,
				chatUnread: 0,
				imageMap: {},
				reviews: [],
				showReview: false,
				reviewStars: 5,
				pickedTags: [],
				reviewContent: '',
				submittingReview: false,
				reviewedLocal: false,
				reviewTagOptions: ['准时', '态度好', '包装完好', '沟通及时']
			};
		},
		computed: {
			...mapGetters(['getTaskById', 'getMyTasks', 'getTaskList']),
			taskData() {
				if (!this.taskId) return {};
				return this.getTaskById(this.taskId) || {};
			},
			statusText() {
				const map = { 1: '待接单', 2: '进行中', 3: '已完成', 4: '已取消' };
				return map[this.taskData.status] || '待接单';
			},
			riderMeta() {
				const r = this.taskData.rider || {};
				const count = Number(r.accepted_count) || 0;
				const rating = Number(r.rating) || 5;
				// 单量太少时不展示 5.0，避免「新骑手」看起来像满分老手
				const ratingText = count < 3 ? '新骑手' : rating.toFixed(1) + ' 分';
				return ratingText + ' · 已完成 ' + count + ' 单';
			}
		},
		onLoad(option) {
			this.optionPageType = option.type || 'completed';
			this.taskId = uni.getStorageSync('currentViewTaskId');
			if (this.taskId) uni.removeStorageSync('currentViewTaskId');
		},
		onShow() {
			if (this.taskId) {
				this.$store
					.dispatch('fetchDetail', this.taskId)
					.then(() => {
						this.resolveImages();
						this.loadReviews();
					})
					.catch(() => {});
				this.loadChatUnread();
			}
		},
		methods: {
			...mapActions(['acceptTask', 'completeTask', 'confirmTask', 'abandonTask']),
			money(v) {
				return fmtMoney(v);
			},
			/** 头像：只有 data URI / http(s) / 本地静态能直接画，cloud:// 老数据退回默认头像 */
			avatarUrl(src) {
				const s = String(src || '')
				if (!s) return '/static/icon/head1.png'
				if (s.indexOf('data:image/') === 0 || s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s
				if (s.charAt(0) === '/') return s
				return '/static/icon/head1.png'
			},
			/**
			 * 缩略图映射：服务端在详情接口下发 data URI 缩略图（与 images 同下标），
			 * 直接画它，不受云存储域名 / 临时链接过期影响。
			 */
			thumbOf(id) {
				const d = this.taskData || {}
				const ids = d.images || []
				const i = ids.indexOf(id)
				if (i >= 0 && d.image_thumbs && d.image_thumbs[i]) return d.image_thumbs[i]
				if (id && id === d.pick_proof && d.pick_proof_thumb) return d.pick_proof_thumb
				if (id && id === d.deliver_proof && d.deliver_proof_thumb) return d.deliver_proof_thumb
				return ''
			},
			imageUrl(id) {
				const thumb = this.thumbOf(id)
				if (thumb) return thumb
				const url = this.imageMap[id]
				if (url) return url
				// 没换成链接之前不要塞给 <image>，否则就是一张裂图
				return typeof id === 'string' && id.indexOf('cloud://') === 0 ? '' : id
			},
			async resolveImages() {
				const ids = [
					...(this.taskData.images || []),
					this.taskData.pick_proof,
					this.taskData.deliver_proof
				].filter((id) => typeof id === 'string' && (id.indexOf('cloud://') === 0 || /^https?:\/\//.test(id)));
				if (!ids.length) return;
				// 直读 data URI 优先（不依赖域名、不落盘），失败自动换下一条路径
				const missing = ids.filter((id) => !this.imageMap[id] && !this.thumbOf(id));
				for (const id of missing.slice(0, 3)) {
					try {
						const r = await resolveImageSrc('user', id);
						if (r && r.src) this.imageMap = Object.assign({}, this.imageMap, { [id]: r.src });
					} catch (e) {
						// 单张失败不影响其它图
					}
				}
			},
			/** 打开自建预览页（缩略图秒开，原图后台替换），不再用会转圈的 uni.previewImage */
			openPreviewById(id) {
				const d = this.taskData || {};
				const ids = [...(d.images || []), d.pick_proof, d.deliver_proof].filter(Boolean);
				const list = [];
				let current = 0;
				for (const it of ids) {
					const isRef = typeof it === 'string' && (it.indexOf('cloud://') === 0 || /^https?:\/\//.test(it));
					const src = this.thumbOf(it) || this.imageMap[it] || (isRef ? '' : it);
					// 有 fileID 的就算暂时没有缩略图也放进去：预览页自己会去取原图
					if (!src && !isRef) continue;
					if (it === id) current = list.length;
					list.push({ src, fileID: isRef ? it : '' });
				}
				if (!list.length) {
					uni.showToast({ title: '图片暂时打不开', icon: 'none' });
					return;
				}
				uni.setStorageSync('__imagePreview', { list, current, role: 'user' });
				uni.navigateTo({ url: '/pages/common/image-preview' });
			},
			previewProof(id) {
				this.openPreviewById(id);
			},
			async loadChatUnread() {
				try {
					this.chatUnread = await this.$store.dispatch('chatUnread', this.taskId);
				} catch (e) {
					this.chatUnread = 0;
				}
			},
			goChat() {
				if (!this.taskId) return;
				uni.navigateTo({ url: '/pages/chat/chat?taskId=' + this.taskId + '&role=user' });
			},
			editOrder() {
				if (!this.taskId) return;
				uni.setStorageSync('currentEditTaskId', this.taskId);
				uni.navigateTo({
					url: '/pages/xyyx/release-requirements/release-requirements?item=' + (this.taskData.type || 1) + '&type=edit'
				});
			},
			async cancelOrder() {
				const ok = await new Promise((resolve) => {
					uni.showModal({
						title: '取消订单',
						content: '取消后，已付金额会原路退回。确定取消吗？',
						confirmText: '取消订单',
						confirmColor: '#FF3B30',
						success: (r) => resolve(!!r.confirm)
					});
				});
				if (!ok) return;
				try {
					const res = await this.$store.dispatch('cancelTask', { taskId: this.taskId, reason: '用户取消' });
					uni.showToast({ title: (res && res.msg) || '已取消', icon: 'none' });
					setTimeout(() => uni.navigateBack(), 900);
				} catch (e) {
					uni.showToast({ title: (e && e.message) || '取消失败', icon: 'none' });
				}
			},
			async confirmReceipt() {
				const ok = await new Promise((resolve) => {
					uni.showModal({
						title: '确认收货',
						content: '确认已经收到东西？确认后款项会结算给骑手。',
						confirmText: '确认收货',
						success: (r) => resolve(!!r.confirm)
					});
				});
				if (!ok) return;
				try {
					await this.$store.dispatch('confirmReceipt', this.taskId);
					uni.showToast({ title: '已确认收货', icon: 'success' });
					setTimeout(() => uni.navigateBack(), 900);
				} catch (e) {
					uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
				}
			},
			goRiderDetail() {
				uni.navigateTo({ url: '/pages/rider/detail?id=' + this.taskId });
			},
			formatTime(timestamp) {
				if (!timestamp) return '';
				const date = new Date(timestamp);
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
			},
			goBack() {
				uni.navigateBack({ delta: 1 });
			},
			openRouteMap() {
				if (this.taskData.origin && this.taskData.origin.name) {
					navigateTo(this.taskData.origin, '取件点');
				}
			},
			pickOrder() {
				if (!this.taskId) return;
				this.acceptTask({ taskId: this.taskId }).then(() => {
					uni.showToast({ duration: 1500, icon: 'success', title: '接单成功！', mask: true });
					setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
				}).catch(err => {
					uni.showToast({ title: err.message || '接单失败', icon: 'none', duration: 2000 });
				});
			},
			handleCompleteOrder() {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？',
					success: (res) => {
						if (res.confirm) {
							this.completeTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'success', title: '订单已完成！', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			confirmComplete() {
				uni.showModal({
					title: '确认完成',
					content: '确认该订单已完成吗？确认后订单将标记为已完成。',
					success: (res) => {
						if (res.confirm) {
							this.confirmTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'success', title: '订单已确认完成！', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/order/order' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			giveupOrder() {
				uni.showModal({
					title: '确认放弃',
					content: '放弃订单将影响您的信用评分，确定要放弃吗？',
					confirmColor: '#ff6b35',
					success: (res) => {
						if (res.confirm) {
							this.abandonTask({ taskId: this.taskId }).then(() => {
								uni.showToast({ duration: 1500, icon: 'none', title: '已放弃订单', mask: true });
								setTimeout(() => { uni.switchTab({ url: '/pages/xyyx/index/index' }); }, 1500);
							}).catch(err => {
								uni.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
							});
						}
					}
				});
			},
			async loadReviews() {
				const rider = this.taskData.rider;
				if (!rider || !rider._id) return;
				try {
					const data = await this.$store.dispatch('listReviews', { riderId: rider._id, pageSize: 3 });
					this.reviews = (data && data.list) || [];
				} catch (e) {
					this.reviews = [];
				}
			},
			openReview() {
				this.reviewStars = 5;
				this.pickedTags = [];
				this.reviewContent = '';
				this.showReview = true;
			},
			toggleTag(t) {
				const i = this.pickedTags.indexOf(t);
				if (i >= 0) this.pickedTags.splice(i, 1);
				else this.pickedTags.push(t);
			},
			async submitReview() {
				if (this.submittingReview) return;
				this.submittingReview = true;
				const tagText = this.pickedTags.length ? this.pickedTags.join('、') + '。' : '';
				const content = (tagText + this.reviewContent.trim()).slice(0, 200);
				try {
					await this.$store.dispatch('submitReview', {
						taskId: this.taskId,
						score: this.reviewStars,
						content
					});
					this.showReview = false;
					this.reviewedLocal = true;
					uni.showToast({ title: '评价成功', icon: 'success' });
					this.loadReviews();
				} catch (e) {
					uni.showToast({ title: (e && e.message) || '评价失败', icon: 'none' });
				} finally {
					this.submittingReview = false;
				}
			},
			previewImage(index) {
				const ids = this.taskData.images || [];
				const targetId = ids[index];
				if (!targetId) return;
				this.openPreviewById(targetId);
			}
		}
	}
</script>

<style lang="scss">
	.requirement-detail-info { background-color: #F2F2F7; min-height: 100vh; padding-bottom: 140rpx; }
	.detail-header { background-color: #fff; padding: 32rpx; }
	.header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
	.type-tag { padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500; background-color: rgba(0, 122, 255, 0.1); color: #007AFF; }
	.status-tag { padding: 8rpx 20rpx; border-radius: 16rpx; font-size: 24rpx; font-weight: 500; background-color: rgba(52, 199, 89, 0.1); color: #34C759; }
	.task-title { font-size: 36rpx; font-weight: 700; margin-bottom: 16rpx; color: #000; }
	.price-display { display: flex; align-items: baseline; }
	.price-symbol { font-size: 28rpx; font-weight: 600; color: #FF9500; }
	.price-value { font-size: 44rpx; font-weight: 700; color: #FF9500; }
	.detail-section { background-color: #fff; margin: 24rpx 32rpx; border-radius: 24rpx; padding: 24rpx 32rpx; }
	.section-title { font-size: 26rpx; font-weight: 600; color: #8E8E93; margin-bottom: 16rpx; text-transform: uppercase; letter-spacing: 1rpx; }
	.section-content { font-size: 28rpx; color: #000; line-height: 1.6; }
	.info-tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
	.info-tag { display: flex; flex-direction: column; padding: 16rpx 24rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.tag-label { font-size: 22rpx; color: #8E8E93; margin-bottom: 8rpx; }
	.tag-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.route-display { background-color: #F2F2F7; border-radius: 16rpx; padding: 20rpx; }
	.route-point { display: flex; align-items: flex-start; }
	.point-icon { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 20rpx; color: #fff; font-size: 20rpx; margin-right: 16rpx; flex-shrink: 0;
		&.start { background-color: #34C759; } &.end { background-color: #FF9500; }
	}
	.point-info { flex: 1; }
	.point-label { font-size: 24rpx; color: #8E8E93; display: block; margin-bottom: 8rpx; }
	.point-name { font-size: 28rpx; color: #000; font-weight: 500; }
	.route-line { width: 4rpx; height: 40rpx; background-color: #E5E5EA; margin-left: 18rpx; margin-top: 8rpx; margin-bottom: 8rpx; }
	.route-map-btn { margin-top: 16rpx; padding: 20rpx; text-align: center; background-color: rgba(0, 122, 255, 0.1); border-radius: 16rpx; color: #007AFF; font-size: 28rpx; font-weight: 500; }
	.chat-btn { display: flex; align-items: center; justify-content: center; }
	.chat-dot {
		margin-left: 10rpx;
		min-width: 32rpx;
		height: 32rpx;
		line-height: 32rpx;
		padding: 0 10rpx;
		border-radius: 16rpx;
		background: #FF3B30;
		color: #fff;
		font-size: 19rpx;
		font-weight: 600;
	}

	.timeline { padding-left: 4rpx; }

	.tl {
		display: flex;
		position: relative;
		padding-bottom: 26rpx;

		&:last-child { padding-bottom: 0; }
	}

	.tl::before {
		content: '';
		position: absolute;
		left: 7rpx;
		top: 24rpx;
		bottom: 0;
		width: 2rpx;
		background: #eef0f3;
	}

	.tl:last-child::before { display: none; }

	.tl-dot {
		width: 16rpx;
		height: 16rpx;
		border-radius: 50%;
		background: #dfe3ea;
		margin: 8rpx 20rpx 0 0;
		flex-shrink: 0;
		z-index: 1;
	}

	.tl.on .tl-dot { background: #1677ff; }
	.tl.on .tl-title { color: #1c1f24; font-weight: 600; }

	.tl-main { display: flex; flex-direction: column; }
	.tl-title { font-size: 27rpx; color: #5c6370; }
	.tl-time { margin-top: 4rpx; font-size: 21rpx; color: #9aa1ad; }
	.proof-img {
		width: 132rpx;
		height: 132rpx;
		border-radius: 10rpx;
		margin-top: 10rpx;
		background: #f2f3f5;
	}

	.cancelled {
		padding: 12rpx 0;
		font-size: 26rpx;
		color: #ff3b30;
	}

	.rider-card {
		display: flex;
		align-items: center;
		padding: 12rpx 0 4rpx;
	}

	.rider-avatar {
		width: 84rpx;
		height: 84rpx;
		border-radius: 50%;
		background: #eef0f3;
		flex-shrink: 0;
	}

	.rider-main {
		flex: 1;
		min-width: 0;
		margin-left: 18rpx;
		display: flex;
		flex-direction: column;
	}

	.rider-name { font-size: 29rpx; font-weight: 600; color: #1c1f24; }
	.rider-meta { margin-top: 4rpx; font-size: 22rpx; color: #9aa1ad; }

	.chat-btn-sm {
		display: flex;
		align-items: center;
		padding: 12rpx 24rpx;
		border-radius: 24rpx;
		background: rgba(22, 119, 255, 0.1);
		color: #1677ff;
		font-size: 24rpx;
		font-weight: 600;
		flex-shrink: 0;
	}

	.review-list { margin-top: 14rpx; border-top: 1rpx solid #f2f3f5; padding-top: 14rpx; }
	.review-item { padding: 10rpx 0; }
	.review-top { display: flex; justify-content: space-between; align-items: center; }
	.review-name { font-size: 23rpx; color: #5c6370; }
	.review-stars { font-size: 22rpx; color: #ffb400; letter-spacing: 2rpx; }
	.review-text { display: block; margin-top: 4rpx; font-size: 24rpx; color: #3a4049; line-height: 1.6; }

	.review-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 99;
		display: flex;
		align-items: flex-end;
	}

	.review-modal {
		width: 100%;
		background: #fff;
		border-radius: 24rpx 24rpx 0 0;
		padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
	}

	.review-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; color: #1c1f24; }
	.star-row { display: flex; justify-content: center; gap: 18rpx; margin: 24rpx 0 8rpx; }
	.star { font-size: 56rpx; color: #e4e8ee; }
	.star.on { color: #ffb400; }
	.tag-row { display: flex; flex-wrap: wrap; gap: 12rpx; justify-content: center; margin: 18rpx 0; }
	.rtag { padding: 8rpx 20rpx; border-radius: 20rpx; background: #f2f3f5; color: #5c6370; font-size: 23rpx; }
	.rtag.on { background: rgba(255, 149, 0, 0.12); color: #b26a00; }
	.review-input {
		width: 100%;
		height: 160rpx;
		background: #f7f8fa;
		border-radius: 12rpx;
		padding: 18rpx;
		font-size: 26rpx;
		line-height: 1.6;
		box-sizing: border-box;
	}
	.review-actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
	.review-btn { flex: 1; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: 40rpx; font-size: 28rpx; }
	.review-btn.cancel { background: #f2f3f5; color: #5c6370; }
	.review-btn.ok { background: #1677ff; color: #fff; font-weight: 600; }
	.review-btn.ok.disabled { opacity: 0.5; }
	.time-display { display: flex; align-items: center; gap: 12rpx; }
	.time-tag { padding: 12rpx 24rpx; background-color: rgba(0, 122, 255, 0.1); color: #007AFF; border-radius: 16rpx; font-size: 28rpx; font-weight: 500; }
	.time-detail { font-size: 28rpx; color: #000; }
	.contact-info { display: flex; flex-direction: column; gap: 12rpx; }
	.contact-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.contact-label { font-size: 26rpx; color: #8E8E93; }
	.contact-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.picture-display { display: flex; flex-wrap: wrap; gap: 12rpx; }
	.preview-image { width: 200rpx; height: 200rpx; border-radius: 16rpx; }
	.runner-info { display: flex; flex-direction: column; gap: 12rpx; }
	.runner-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background-color: #F2F2F7; border-radius: 16rpx; }
	.runner-label { font-size: 26rpx; color: #8E8E93; }
	.runner-value { font-size: 28rpx; color: #000; font-weight: 500; }
	.runner-value.warn { color: #FF9500; }
	.runner-value.ok { color: #34C759; }
	.refund-fail {
		display: flex; flex-direction: column; gap: 6rpx;
		margin-top: 14rpx; padding: 16rpx 20rpx; border-radius: 14rpx;
		background: rgba(255, 59, 48, 0.08); color: #C62828; font-size: 24rpx;
	}
	.refund-fail-tip { color: #8E8E93; font-size: 22rpx; }
	.detail-footer { padding: 20rpx 32rpx; text-align: center; }
	.publish-time { font-size: 24rpx; color: #8E8E93; }
	.action-section { position: fixed; bottom: 0; left: 0; right: 0; background-color: #F2F2F7; padding: 16rpx 32rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); display: flex; gap: 16rpx; }
	.action-btn { flex: 1; height: 88rpx; line-height: 88rpx; text-align: center; border-radius: 16rpx; font-size: 32rpx; font-weight: 600; }
	.action-btn.cancel { background-color: #fff; color: #007AFF; }
	.action-btn.confirm { background-color: #007AFF; color: #fff; }
	.action-btn.complete { background-color: #34C759; color: #fff; }
	.action-btn.abandon { background-color: #fff; color: #FF3B30; }
</style>
