<template>
	<view class="page-container">
		<view class="user-header" :class="{'logged-in': loggedIn}">
			<view class="header-bg"></view>
			<view class="header-content">
				<view class="user-info" @click="handleUserClick">
					<view class="avatar-wrap">
						<image class="avatar" :src="avatarSrc" mode="aspectFill"></image>
						<view class="avatar-border"></view>
					</view>
					<view class="user-text">
						<text class="nickname">{{ loggedIn ? (userInfo.nickname || '微信用户') : '点击登录' }}</text>
						<text class="user-id" v-if="loggedIn && userInfo.mobile">{{ maskMobile(userInfo.mobile) }}</text>
						<text class="user-id" v-else-if="!loggedIn">登录后享受更多服务</text>
					</view>
				</view>
				<view class="header-actions" v-if="loggedIn">
					<view class="action-item" @click="goToNotification">
						<text class="action-text">通知</text>
					</view>
				</view>
			</view>
		</view>

		<view class="profile-helper" v-if="showProfileHelper" @click="editField('nickname')">
			<view class="helper-main">
				<text class="helper-title">把资料补一下</text>
				<text class="helper-desc">设置头像和昵称，骑手和同学更容易认出你。</text>
			</view>
			<view class="helper-actions">
				<text class="helper-btn" @click.stop="editField('nickname')">昵称</text>
				<text class="helper-btn" @click.stop="chooseAvatar">头像</text>
			</view>
		</view>
		
		<view class="stats-section" :class="{'with-helper': showProfileHelper}" v-if="loggedIn">
			<view class="stats-card">
				<view class="stat-item">
					<text class="stat-num">{{ userStats.published_count || 0 }}</text>
					<text class="stat-label">发布任务</text>
				</view>
				<view class="stat-divider"></view>
				<view class="stat-item">
					<text class="stat-num">{{ userStats.accepted_count || 0 }}</text>
					<text class="stat-label">接单任务</text>
				</view>
				<view class="stat-divider"></view>
				<view class="stat-item">
					<text class="stat-num">{{ money(userStats.total_income || 0) }}</text>
					<text class="stat-label">收入(元)</text>
				</view>
			</view>
		</view>
		
		<view class="order-entry-section" v-if="loggedIn">
			<view class="order-entry-card" @click="goToMyOrders('published')">
				<view class="entry-icon-wrap published">
					<text class="entry-icon-text">发</text>
				</view>
				<view class="entry-info">
					<text class="entry-title">我发布的</text>
					<text class="entry-desc">{{ userStats.published_count || 0 }}个任务</text>
				</view>
				<text class="entry-arrow">›</text>
			</view>
			<view class="order-entry-card" @click="goToMyOrders('accepted')">
				<view class="entry-icon-wrap accepted">
					<text class="entry-icon-text">接</text>
				</view>
				<view class="entry-info">
					<text class="entry-title">我接的单</text>
					<text class="entry-desc">{{ userStats.accepted_count || 0 }}个任务</text>
				</view>
				<text class="entry-arrow">›</text>
			</view>
		</view>

		<view class="menu-section" v-if="loggedIn">
			<view class="menu-item" @click="editField('nickname')">
				<text class="menu-label">用户名</text>
				<view class="menu-right">
					<text class="menu-value">{{ userInfo.nickname || '去设置' }}</text>
					<text class="arrow">›</text>
				</view>
			</view>
			<view class="menu-item" @click="editField('mobile')">
				<text class="menu-label">手机号</text>
				<view class="menu-right">
					<text class="menu-value">{{ maskMobile(userInfo.mobile) }}</text>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>
		
		<!-- 骑手中心：一个 App 两种身份，切过去就能接单 -->
		<view class="menu-section">
			<view class="menu-item" @click="goRiderCenter">
				<text class="menu-label">骑手中心</text>
				<view class="menu-right">
					<text class="menu-value">{{ riderStatusText }}</text>
					<text class="arrow">›</text>
				</view>
			</view>
			<view class="menu-item" @click="goChats">
				<text class="menu-label">消息</text>
				<view class="menu-right">
					<text class="menu-value" v-if="chatUnread > 0">{{ chatUnread > 99 ? '99+' : chatUnread }} 条未读</text>
					<text class="arrow">›</text>
				</view>
			</view>
			<view class="menu-item" @click="goFeedback">
				<text class="menu-label">意见反馈</text>
				<view class="menu-right">
					<text class="menu-value">问题、投诉与建议</text>
					<text class="arrow">›</text>
				</view>
			</view>
			<view class="menu-item" @click="goSupport">
				<text class="menu-label">联系客服</text>
				<view class="menu-right">
					<text class="menu-value">订单问题、投诉</text>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>
		
		<view class="menu-section" v-if="loggedIn">
			<view class="menu-item logout-btn" @click="handleLogout">
				<text class="menu-label">退出登录</text>
			</view>
		</view>

		<!-- 底部：协议、反馈、注销；微信审核要求注销入口必须找得到 -->
		<view class="legal-footer">
			<view class="legal-link" @click="goToPage('legal')">
				<text class="legal-link-text">法律条款与平台规则</text>
				<text class="legal-link-arrow">›</text>
			</view>
			<view class="legal-link" @click="goDeleteAccount">
				<text class="legal-link-text">注销账号</text>
				<text class="legal-link-arrow">›</text>
			</view>
		</view>

		<view class="version-footer">
			<text class="version-text">{{ versionText }}</text>
		</view>
		
		<view class="edit-modal" v-if="showEditModal" @touchmove.stop.prevent>
			<view class="modal-mask" @click="closeEditModal"></view>
			<view class="modal-content">
				<view class="modal-header">
					<text class="modal-title">编辑{{ editingField ? editingField.label : '' }}</text>
					<view class="modal-close" @click="closeEditModal">
						<text class="close-icon">×</text>
					</view>
				</view>
				<view class="modal-body">
					<view class="edit-item" v-if="editingField">
						<view class="input-wrapper" :class="{ 'focused': inputFocused }">
							<input class="edit-input" v-model="editingValue" :placeholder="'请输入' + editingField.label"
								:type="getInputType(editingField.key)" :maxlength="getMaxLength(editingField.key)"
								:focus="showEditModal" @focus="inputFocused = true" @blur="inputFocused = false"
								@input="onInputChange" />
							<view class="clear-btn" v-if="editingValue" @click="clearInput">
								<text class="clear-icon">×</text>
							</view>
						</view>
						<view class="input-footer">
							<text class="input-tip" v-if="editingField.key === 'mobile'">请输入11位手机号码</text>
							<text class="input-tip" v-else-if="editingField.key === 'nickname'">2-20个字符</text>
							<view v-else></view>
							<text class="char-count">{{ editingValue.length }}/{{ getMaxLength(editingField.key) }}</text>
						</view>
						<view class="error-tip" v-if="validationError">
							<text class="error-icon">!</text>
							<text>{{ validationError }}</text>
						</view>
					</view>
				</view>
				<view class="modal-footer">
					<view class="modal-btn cancel" @click="closeEditModal">
						<text>取消</text>
					</view>
					<view class="modal-btn confirm" :class="{ 'disabled': !canConfirm || saving }" @click="confirmModify">
						<text>{{ saving ? '保存中...' : '保存' }}</text>
					</view>
				</view>
			</view>
		</view>
		
		<wechat-login-modal :visible="showLoginModal" @close="showLoginModal = false" @skip="showLoginModal = false"
			@success="onLoginSuccess"></wechat-login-modal>
	</view>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import WechatLoginModal from '@/components/wechat-login-modal/wechat-login-modal.vue'
import { fmtMoney } from '@/common/rider-util.js'
import { avatarDataUri } from '@/common/image.js'
import { versionText as appVersionText } from '@/common/version.js'

export default {
	components: {
		WechatLoginModal
	},
	data() {
		return {
				loggedIn: false,
			showLoginModal: false,
			showEditModal: false,
			editingField: null,
			editingValue: '',
			inputFocused: false,
			validationError: '',
			saving: false,
			chatUnread: 0,
			defaultAvatar: '/static/icon/head1.png',
			userInfo: {
				avatar: '',
				avatar_hd: '',
				nickname: '',
				mobile: ''
			}
		}
	},
	computed: {
		...mapGetters(['getUserStats']),
		/** 头像：优先高清版（720px），没有再退回压缩版 */
		avatarSrc() {
			const u = this.userInfo || {}
			return u.avatar_hd || u.avatar || this.defaultAvatar
		},
		versionText() {
			return appVersionText()
		},
		/** 骑手身份（0未申请 1审核中 2已通过 3已拒绝） */
		riderStatusText() {
			const map = { 0: '未开通', 1: '审核中', 2: '已认证', 3: '未通过' }
			const p = this.userInfo || {}
			return map[p.rider_status] || '未开通'
		},
		userStats() {
			return this.getUserStats || {
				published_count: 0,
				accepted_count: 0,
				total_income: 0,
				balance: 0
			}
		},

		/** 微信新版拿不到真实昵称/头像时，才显示手动完善提示 */
		showProfileHelper() {
			if (!this.loggedIn) return false
			const nickname = this.userInfo.nickname || ''
			const avatar = this.userInfo.avatar || ''
			return nickname === '微信用户' || !avatar || avatar.indexOf('head1') >= 0
		},

		canConfirm() {
			if (!this.editingValue.trim()) return false
			if (this.editingField && this.editingField.key === 'mobile') {
				return /^1[3-9]\d{9}$/.test(this.editingValue)
			}
			if (this.editingField && this.editingField.key === 'nickname') {
				return this.editingValue.trim().length >= 2
			}
			return true
		}
	},
	onShow() {
		// 用 data 而不是 computed：uni.getStorageSync 不是响应式的，
		// 放 computed 里会导致「登录成功后仍然显示未登录」。
		this.loggedIn = !!(uni.getStorageSync('uniIdToken') || uni.getStorageSync('token'))
		if (this.loggedIn) {
			this.loadUserInfo()
			this.loadChatUnread()
		}
	},
	methods: {
		...mapActions(['fetchUserInfo', 'updateUserInfo']),
		money(v) {
			return fmtMoney(v)
		},
		/** 进入骑手中心（同一 App 的另一重身份） */
		goRiderCenter() {
			uni.navigateTo({ url: '/pages/rider/center' })
		},
		goFeedback() {
			if (!this.loggedIn) {
				this.showLoginModal = true
				return
			}
			uni.navigateTo({ url: '/pages/xyyx/feedback/feedback' })
		},
		goChats() {
			if (!this.loggedIn) {
				this.showLoginModal = true
				return
			}
			uni.navigateTo({ url: '/pages/chat/list?role=user' })
		},
		goSupport() {
			const p = this.$store.state.profile || {}
			const mobile = (p.settings && p.settings.supportMobile) || ''
			if (mobile) {
				uni.showModal({
					title: '联系客服',
					content: '客服电话：' + mobile + '\n工作时间 9:00-21:00',
					confirmText: '拨打',
					success: (r) => {
						if (r.confirm) uni.makePhoneCall({ phoneNumber: String(mobile), fail: () => {} })
					}
				})
				return
			}
			uni.showModal({
				title: '联系客服',
				content: '客服在线时间 9:00-21:00。你可以先在「意见反馈」里留言，我们会尽快回复。',
				confirmText: '去反馈',
				success: (r) => {
					if (r.confirm) uni.navigateTo({ url: '/pages/xyyx/feedback/feedback' })
				}
			})
		},
		async loadChatUnread() {
			try {
				const list = await this.$store.dispatch('listChats')
				this.chatUnread = (list || []).reduce((sum, c) => sum + (Number(c.unread) || 0), 0)
			} catch (e) {
				this.chatUnread = 0
			}
		},
		goDeleteAccount() {
			if (!this.loggedIn) {
				this.showLoginModal = true
				return
			}
			uni.navigateTo({ url: '/pages/xyyx/feedback/feedback?type=delete_account' })
		},
		async loadUserInfo() {
			if (!this.loggedIn) return
			
			try {
				const data = await this.fetchUserInfo()
				if (data) {
					this.userInfo = {
						avatar: data.avatar || '',
						avatar_hd: data.avatar_hd || '',
						nickname: data.nickname || data.name || '',
						mobile: data.mobile || '',
						// 模板里的 riderStatusText 依赖这个字段，之前被丢掉了
						rider_status: data.rider_status || 0
					}
					uni.setStorageSync('userInfo', this.userInfo)
				}
			} catch (e) {
				console.error('加载用户信息失败', e)
				const stored = uni.getStorageSync('userInfo')
				if (stored && Object.keys(stored).length > 0) {
					this.userInfo = {
						avatar: stored.avatar || '',
						avatar_hd: stored.avatar_hd || '',
						nickname: stored.nickname || '',
						mobile: stored.mobile || '',
						rider_status: stored.rider_status || 0
					}
				}
			}
		},
		handleUserClick() {
			if (!this.loggedIn) {
				this.showLoginModal = true
			} else {
				this.chooseAvatar()
			}
		},
		onLoginSuccess() {
			this.showLoginModal = false
			this.loggedIn = true
			this.loadUserInfo()
		},
		maskMobile(mobile) {
			if (!mobile) return '未绑定'
			if (mobile.length === 11) {
				return mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
			}
			return mobile
		},
		getInputType(key) {
			return key === 'mobile' ? 'number' : 'text'
		},
		getMaxLength(key) {
			if (key === 'mobile') return 11
			if (key === 'nickname') return 20
			return 50
		},
		editField(key) {
			const fieldMap = {
				nickname: { key: 'nickname', label: '用户名' },
				mobile: { key: 'mobile', label: '手机号' }
			}
			this.editingField = fieldMap[key]
			this.editingValue = this.userInfo[key] || ''
			this.validationError = ''
			this.inputFocused = false
			this.showEditModal = true
		},
		chooseAvatar() {
			uni.chooseImage({
				count: 1,
				sizeType: ['compressed'],
				sourceType: ['album', 'camera'],
				success: async (res) => {
					const tempFilePath = res.tempFilePaths[0]
					const old = this.userInfo.avatar
					const oldHd = this.userInfo.avatar_hd
					this.userInfo.avatar = tempFilePath
					try {
						// 头像压成 data URI 存资料里：不依赖云存储，不会因 uploadFile 域名白名单失败。
						// small 给列表/聊天（每条都要带，必须小），hd 给「我的」页显示。
						const { small, hd } = await avatarDataUri(tempFilePath)
						await this.updateUserInfo({ avatar: small, avatar_hd: hd })
						this.userInfo.avatar = small
						this.userInfo.avatar_hd = hd
						uni.setStorageSync('userInfo', this.userInfo)
						uni.showToast({ title: '头像已更新', icon: 'success' })
					} catch (e) {
						this.userInfo.avatar = old
						this.userInfo.avatar_hd = oldHd
						uni.showToast({ title: (e && e.message) || '头像更新失败', icon: 'none' })
					}
				}
			})
		},
		clearInput() {
			this.editingValue = ''
			this.validationError = ''
		},
		onInputChange() {
			this.validationError = ''
			if (this.editingField && this.editingField.key === 'mobile') {
				this.editingValue = this.editingValue.replace(/\D/g, '')
			}
		},
		closeEditModal() {
			this.showEditModal = false
			this.editingField = null
			this.editingValue = ''
			this.inputFocused = false
			this.validationError = ''
		},
		async confirmModify() {
			if (!this.canConfirm || this.saving) return

			const value = this.editingValue.trim()

			if (!value) {
				this.validationError = '内容不能为空'
				return
			}

			if (this.editingField.key === 'mobile') {
				if (!/^1[3-9]\d{9}$/.test(value)) {
					this.validationError = '请输入正确的手机号码'
					return
				}
			}

			if (this.editingField.key === 'nickname') {
				if (value.length < 2) {
					this.validationError = '用户名至少2个字符'
					return
				}
			}

			this.saving = true
			try {
				const updateData = {}
				updateData[this.editingField.key] = value
				await this.updateUserInfo(updateData)
				
				this.userInfo[this.editingField.key] = value
				uni.setStorageSync('userInfo', this.userInfo)
				this.closeEditModal()
				uni.showToast({ title: '保存成功', icon: 'success' })
			} catch (e) {
				uni.showToast({ title: e.message || '保存失败', icon: 'none' })
			} finally {
				this.saving = false
			}
		},
		goToNotification() {
			uni.navigateTo({
				url: '/pages/xyyx/notification/notification'
			})
		},
		goToPage(type) {
			const map = {
				legal: '/pages/xyyx/agreement/legal-terms',
				algorithm: '/pages/xyyx/agreement/algorithm',
				privacy: '/pages/xyyx/agreement/privacy-policy',
				runner: '/pages/xyyx/agreement/runner-agreement',
				user: '/pages/xyyx/agreement/user-agreement'
			}
			const url = map[type] || '/pages/xyyx/agreement/legal-terms'
			uni.navigateTo({ url })
		},
		goToMyOrders(type) {
			uni.setStorageSync('myOrdersFilter', type === 'published' ? 'publisher' : 'runner');
			uni.switchTab({ url: '/pages/xyyx/order/order' });
		},
		handleLogout() {
			uni.showModal({
				title: '提示',
				content: '确定要退出登录吗？',
				success: (res) => {
					if (res.confirm) {
						this.$store.dispatch('logout')
						this.loggedIn = false
						this.showLoginModal = false
						this.userInfo = { avatar: '', nickname: '', mobile: '', rider_status: 0 }
						uni.showToast({ title: '已退出登录', icon: 'success' })
					}
				}
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.profile-helper {
	margin: 20rpx 24rpx 0;
	padding: 22rpx 24rpx;
	background: #fff;
	border-radius: 16rpx;
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.helper-main { flex: 1; min-width: 0; }
.helper-title {
	display: block;
	font-size: 26rpx;
	font-weight: 600;
	color: #1C1C1E;
}
.helper-desc {
	display: block;
	margin-top: 6rpx;
	font-size: 22rpx;
	color: #8E8E93;
	line-height: 1.5;
}
.helper-actions {
	display: flex;
	gap: 16rpx;
	margin-left: 16rpx;
	flex-shrink: 0;
}
.helper-btn {
	font-size: 23rpx;
	color: #007AFF;
	font-weight: 600;
	padding: 8rpx 18rpx;
	background: rgba(0, 122, 255, 0.08);
	border-radius: 20rpx;
}

.page-container {
	background-color: #F5F5F5;
	min-height: 100vh;
	padding-bottom: 180rpx;
}

.user-header {
	position: relative;
	padding: 60rpx 32rpx 40rpx;
	margin-bottom: 20rpx;

	.header-bg {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 100%;
		/* 和首页、登录弹窗统一成同一套品牌蓝 */
		background: linear-gradient(160deg, #007AFF 0%, #3AA0FF 100%);
		border-radius: 0 0 40rpx 40rpx;
	}

	.header-content {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.user-info {
		display: flex;
		align-items: center;
	}

	.avatar-wrap {
		position: relative;
		width: 120rpx;
		height: 120rpx;

		.avatar {
			width: 100%;
			height: 100%;
			border-radius: 50%;
			background-color: #fff;
		}

		.avatar-border {
			position: absolute;
			top: -4rpx;
			left: -4rpx;
			right: -4rpx;
			bottom: -4rpx;
			border: 4rpx solid rgba(255, 255, 255, 0.5);
			border-radius: 50%;
		}
	}

	.user-text {
		margin-left: 24rpx;

		.nickname {
			display: block;
			font-size: 36rpx;
			font-weight: 600;
			color: #fff;
			margin-bottom: 8rpx;
		}

		.user-id {
			display: block;
			font-size: 24rpx;
			color: rgba(255, 255, 255, 0.8);
		}
	}

	.header-actions {
		.action-item {
			height: 60rpx;
			padding: 0 22rpx;
			background-color: rgba(255, 255, 255, 0.2);
			border-radius: 30rpx;
			display: flex;
			align-items: center;
			justify-content: center;

			.action-text {
				font-size: 23rpx;
				color: #fff;
			}
		}
	}
}

.stats-section {
	padding: 0 32rpx;
	margin-top: -40rpx;
	margin-bottom: 20rpx;
	position: relative;
	z-index: 10;

	/* 有「完善资料」提示卡时不要再上移，否则会盖住提示按钮 */
	&.with-helper {
		margin-top: 20rpx;
	}

	.stats-card {
		background-color: #fff;
		border-radius: 20rpx;
		padding: 32rpx 0;
		display: flex;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
	}

	.stat-item {
		flex: 1;
		text-align: center;

		.stat-num {
			display: block;
			font-size: 40rpx;
			font-weight: 700;
			color: #333;
			margin-bottom: 8rpx;
		}

		.stat-label {
			display: block;
			font-size: 24rpx;
			color: #999;
		}
	}

	.stat-divider {
		width: 1rpx;
		background-color: #E5E5E5;
		margin: 10rpx 0;
	}
}

.order-entry-section {
	padding: 0 32rpx;
	margin-bottom: 20rpx;
	display: flex;
	gap: 16rpx;

	.order-entry-card {
		flex: 1;
		display: flex;
		align-items: center;
		background-color: #fff;
		border-radius: 20rpx;
		padding: 28rpx 24rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
		transition: transform 0.2s;

		&:active {
			transform: scale(0.97);
		}

		.entry-icon-wrap {
			width: 72rpx;
			height: 72rpx;
			border-radius: 18rpx;
			display: flex;
			align-items: center;
			justify-content: center;
			margin-right: 20rpx;
			flex-shrink: 0;

			&.published {
				background: linear-gradient(135deg, #4A90E2, #357ABD);
			}

			&.accepted {
				background: linear-gradient(135deg, #FF9500, #E8850A);
			}

			.entry-icon-text {
				font-size: 30rpx;
				font-weight: 700;
				color: #fff;
			}
		}

		.entry-info {
			flex: 1;
			min-width: 0;

			.entry-title {
				display: block;
				font-size: 30rpx;
				font-weight: 600;
				color: #333;
				margin-bottom: 4rpx;
			}

			.entry-desc {
				display: block;
				font-size: 24rpx;
				color: #999;
			}
		}

		.entry-arrow {
			font-size: 36rpx;
			color: #C7C7CC;
			flex-shrink: 0;
		}
	}
}

.menu-section {
	background-color: #fff;
	margin-bottom: 20rpx;
	border-radius: 20rpx;
	margin-left: 24rpx;
	margin-right: 24rpx;
	overflow: hidden;
}

.menu-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 28rpx 32rpx;
	border-bottom: 1rpx solid #F5F5F5;

	&:last-child {
		border-bottom: none;
	}

	&:active {
		background-color: #FAFAFA;
	}

	.menu-label {
		font-size: 28rpx;
		color: #333;
	}

	.menu-right {
		display: flex;
		align-items: center;

		.menu-value {
			font-size: 28rpx;
			color: #999;
			margin-right: 8rpx;
		}
	}

	.arrow {
		font-size: 32rpx;
		color: #C7C7CC;
	}
}

/* 法律条款入口：居中灰字，和微信原生的「更多资料」页一致 */
.legal-footer {
	padding: 16rpx 0 8rpx;
}

.version-footer {
	padding: 8rpx 0 32rpx;
	text-align: center;
}

.version-text {
	font-size: 20rpx;
	color: #c2c7d0;
}

.legal-link {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 14rpx 0;

	&:active {
		opacity: 0.6;
	}
}

.legal-link-text {
	font-size: 26rpx;
	color: #8E8E93;
}

.legal-link-arrow {
	margin-left: 6rpx;
	font-size: 26rpx;
	color: #B0B0B5;
}

.logout-btn {
	.menu-label {
		color: #FF3B30;
	}
}

.edit-modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 999;
	display: flex;
	align-items: center;
	justify-content: center;
}

.modal-mask {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
}

.modal-content {
	position: relative;
	width: 90%;
	max-width: 640rpx;
	background-color: #fff;
	border-radius: 24rpx;
	overflow: hidden;
	animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
	from {
		opacity: 0;
		transform: scale(0.95);
	}

	to {
		opacity: 1;
		transform: scale(1);
	}
}

.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 36rpx 32rpx 24rpx;
}

.modal-title {
	font-size: 34rpx;
	font-weight: 600;
	color: #1a1a1a;
}

.modal-close {
	width: 56rpx;
	height: 56rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #F5F5F5;
	border-radius: 50%;

	.close-icon {
		font-size: 40rpx;
		color: #999;
		line-height: 1;
	}
}

.modal-body {
	padding: 16rpx 32rpx 32rpx;
}

.edit-item {
	margin-bottom: 0;
}

.input-wrapper {
	display: flex;
	align-items: center;
	background-color: #F5F5F5;
	border-radius: 16rpx;
	border: 2rpx solid transparent;
	transition: all 0.2s;

	&.focused {
		background-color: #fff;
		border-color: #007AFF;
	}
}

.edit-input {
	flex: 1;
	height: 96rpx;
	padding: 0 24rpx;
	font-size: 32rpx;
	color: #1a1a1a;
}

.clear-btn {
	width: 64rpx;
	height: 64rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 8rpx;

	.clear-icon {
		font-size: 32rpx;
		color: #fff;
		background-color: #C7C7CC;
		width: 40rpx;
		height: 40rpx;
		line-height: 40rpx;
		text-align: center;
		border-radius: 50%;
	}
}

.input-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 16rpx;
	padding: 0 8rpx;
}

.input-tip {
	font-size: 24rpx;
	color: #999;
}

.char-count {
	font-size: 24rpx;
	color: #C7C7CC;
}

.error-tip {
	display: flex;
	align-items: center;
	margin-top: 20rpx;
	padding: 16rpx 20rpx;
	background-color: #FFF5F5;
	border-radius: 12rpx;

	text {
		font-size: 26rpx;
		color: #FF3B30;
	}

	.error-icon {
		width: 32rpx;
		height: 32rpx;
		line-height: 32rpx;
		text-align: center;
		background-color: #FF3B30;
		color: #fff;
		border-radius: 50%;
		font-size: 22rpx;
		font-weight: bold;
		margin-right: 12rpx;
	}
}

.modal-footer {
	display: flex;
	border-top: 1rpx solid #F0F0F0;
}

.modal-btn {
	flex: 1;
	padding: 32rpx;
	text-align: center;
	font-size: 32rpx;
	transition: background-color 0.2s;

	&.cancel {
		color: #666;
		background-color: #FAFAFA;
	}

	&.confirm {
		color: #007AFF;
		font-weight: 500;
		background-color: #fff;

		&.disabled {
			color: #C7C7CC;
		}
	}

	&:active:not(.disabled) {
		background-color: #F5F5F5;
	}
}
</style>
