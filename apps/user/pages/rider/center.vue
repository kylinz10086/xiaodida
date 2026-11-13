<template>
	<view class="page">
		<!-- 顶部：身份 + 今日/累计 -->
		<view class="hero">
			<view class="hero-top">
				<view class="hero-id">
					<text class="hero-name">{{ profile.nickname || '未设置昵称' }}</text>
					<text class="hero-real" v-if="profile.real_name">认证姓名：{{ profile.real_name }}</text>
				</view>
				<text class="hero-status">{{ riderStatusText }}</text>
			</view>

			<view class="hero-stats">
				<view class="stat">
					<text class="num">{{ riderInfo.today_count || 0 }}</text>
					<text class="label">今日完成</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="num">¥{{ money(riderInfo.today_income) }}</text>
					<text class="label">今日收入</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="num">¥{{ money(profile.wallet && profile.wallet.balance) }}</text>
					<text class="label">可提现</text>
				</view>
			</view>
		</view>

		<!-- 我的资料：学号在这里必须完整显示 -->
		<view class="card profile-card">
			<view class="card-title">
				<text>我的资料</text>
				<text class="card-extra">{{ profile.student_no ? '仅用于平台审核' : '认证后展示' }}</text>
			</view>

			<view class="kv">
				<text class="k">真实姓名</text>
				<text class="v">{{ profile.real_name || '未填写' }}</text>
			</view>

			<view class="kv">
				<text class="k">学号</text>
				<view class="v student-v">
					<text v-if="profile.student_no" class="r-mono">{{ profile.studentNoGrouped || profile.student_no }}</text>
					<text class="muted" v-else>未填写</text>
					<text class="copy-mini" v-if="profile.student_no" @click.stop="copyStudentNo">复制</text>
				</view>
			</view>

			<view class="kv">
				<text class="k">手机号</text>
				<text class="v">{{ profile.mobile || '未填写' }}</text>
			</view>
			<view class="kv">
				<text class="k">所属学校</text>
				<text class="v">{{ profile.school || '浙江中医药大学' }}</text>
			</view>

			<!-- 学号不是 15 位：说明库里的值本身不全，给个入口让本人补全 -->
			<view class="warn-row" v-if="profile.student_no && !profile.studentNoValid" @click="editRiderInfo">
				<text class="warn-title">学号不是 15 位（当前 {{ (profile.studentNoDigits || '').length }} 位）</text>
				<text class="warn-desc">点这里补全成完整学号，否则审核时可能对不上学籍信息。</text>
			</view>

			<view class="reject" v-if="riderStatus === 3">
				<text class="reject-title">审核未通过</text>
				<text class="reject-reason">{{ profile.rider_reject_reason || '请联系管理员了解原因' }}</text>
			</view>
		</view>

		<!-- 数据 -->
		<view class="card">
			<view class="mini-stats">
				<view class="mini-stat">
					<text class="mini-num">{{ riderInfo.done_count || 0 }}</text>
					<text class="mini-label">累计完成</text>
				</view>
				<view class="mini-stat">
					<text class="mini-num">{{ riderInfo.ongoing_count || 0 }}</text>
					<text class="mini-label">进行中</text>
				</view>
				<view class="mini-stat">
					<text class="mini-num">{{ riderInfo.rating || 5 }}</text>
					<text class="mini-label">评分</text>
				</view>
			</view>
		</view>

		<!-- 入口 -->
		<view class="card rows">
			<view class="row-cell" @click="go('/pages/rider/workbench')">
				<text class="row-label">抢单大厅 / 我的任务</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" @click="goChats">
				<text class="row-label">消息</text>
				<text class="row-balance" v-if="chatUnread > 0">{{ chatUnread > 99 ? '99+' : chatUnread }} 条未读</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" @click="go('/pages/rider/wallet')">
				<text class="row-label">我的收入与提现</text>
				<text class="row-balance">¥{{ money(profile.wallet && profile.wallet.balance) }}</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" v-if="riderStatus !== 2" @click="go('/pages/rider/apply')">
				<text class="row-label">{{ riderStatus === 3 ? '重新提交骑手申请' : '申请成为骑手' }}</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" v-if="riderStatus === 2" @click="editRiderInfo">
				<text class="row-label">修改认证信息（姓名 / 学号 / 手机号）</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" @click="go('/pages/xyyx/agreement/runner-agreement')">
				<text class="row-label">跑腿服务协议（骑手）</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" @click="go('/pages/xyyx/agreement/guidelines')">
				<text class="row-label">骑手准则</text>
				<text class="arrow">›</text>
			</view>
			<view class="row-cell" @click="go('/pages/xyyx/agreement/privacy-policy')">
				<text class="row-label">隐私政策</text>
				<text class="arrow">›</text>
			</view>
		</view>

		<!-- 新手引导：只在还没成为骑手时出现 -->
		<view class="tips" v-if="riderStatus !== 2">
			<text class="tips-title">怎么开始接单</text>
			<text class="tips-item">1. 填写真实姓名、15 位学号、手机号提交申请</text>
			<text class="tips-item">2. 审核通过后进「抢单大厅」，可按距离挑顺路的单</text>
			<text class="tips-item">3. 取件 → 送达 → 订单完成，收入立刻进钱包</text>
		</view>

		<view class="tips" v-else>
			<text class="tips-title">接单小提示</text>
			<text class="tips-item">· 抢单后在「我的任务」里点「已取件」，到楼下再点「已送达」</text>
			<text class="tips-item">· 送达即完成，收入马上到账，可在「我的收入」提现</text>
			<text class="tips-item">· 详情页可以直接给用户打电话、一键地图导航</text>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { copyText, fmtMoney } from '@/common/rider-util.js'

	export default {
		data() {
			return { chatUnread: 0 }
		},
		computed: {
			...mapGetters('rider', ['profile', 'riderStatus', 'riderStatusText', 'riderInfo'])
		},
		onShow() {
			this.load()
			this.loadChatUnread()
		},
		onPullDownRefresh() {
			this.load().finally(() => uni.stopPullDownRefresh())
		},
		methods: {
			...mapActions('rider', ['fetchProfile']),
			money(v) { return fmtMoney(v) },
			async load() {
				try { await this.fetchProfile() } catch (e) { /* 未登录时静默 */ }
			},
			go(url) { uni.navigateTo({ url }) },
			editRiderInfo() { uni.navigateTo({ url: '/pages/rider/apply?edit=1' }) },
			goChats() {
				uni.navigateTo({ url: '/pages/chat/list?role=rider' })
			},
			async loadChatUnread() {
				try {
					const list = await this.$store.dispatch('rider/listChats')
					this.chatUnread = (list || []).reduce((sum, c) => sum + (Number(c.unread) || 0), 0)
				} catch (e) {
					this.chatUnread = 0
				}
			},
			copyStudentNo() {
				copyText(this.profile.studentNoDigits, '完整学号已复制')
			}
		}
	}
</script>

<style lang="scss">
	.page {
		padding: 24rpx 24rpx 80rpx;
		min-height: 100vh;
		background: #f2f3f5;
	}

	.hero {
		background: linear-gradient(150deg, #1677ff 0%, #3f9bff 100%);
		border-radius: 20rpx;
		padding: 32rpx;
		color: #fff;
		margin-bottom: 20rpx;
	}

	.hero-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.hero-id { display: flex; flex-direction: column; min-width: 0; }
	.hero-name { font-size: 36rpx; font-weight: 700; }
	.hero-real { margin-top: 8rpx; font-size: 23rpx; opacity: 0.82; }

	.hero-status {
		font-size: 21rpx;
		padding: 6rpx 18rpx;
		border-radius: 20rpx;
		background: rgba(255, 255, 255, 0.22);
		flex-shrink: 0;
	}

	.hero-stats { display: flex; align-items: center; margin-top: 30rpx; }
	.stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
	.stat-line { width: 1rpx; height: 44rpx; background: rgba(255, 255, 255, 0.25); }
	.num { font-size: 38rpx; font-weight: 700; }
	.label { margin-top: 6rpx; font-size: 21rpx; opacity: 0.82; }

	.profile-card { padding-bottom: 20rpx; }

	.student-v { display: flex; justify-content: flex-end; align-items: center; }

	/* 学号后面那个小小的复制，不做大按钮，避免比手机号更显眼 */
	.copy-mini {
		margin-left: 14rpx;
		font-size: 21rpx;
		color: #1677ff;
		padding: 2rpx 12rpx;
		border-radius: 8rpx;
		background: rgba(22, 119, 255, 0.08);
	}

	.reject {
		margin-top: 18rpx;
		background: #fff0ef;
		border-radius: 12rpx;
		padding: 16rpx 20rpx;
		display: flex;
		flex-direction: column;
	}

	.warn-row {
		margin-top: 14rpx;
		background: #fff8e8;
		border: 1rpx solid #ffe3b0;
		border-radius: 12rpx;
		padding: 16rpx 20rpx;
		display: flex;
		flex-direction: column;
	}

	.warn-title { font-size: 24rpx; color: #9a6200; font-weight: 600; }
	.warn-desc { margin-top: 6rpx; font-size: 22rpx; color: #9a6200; line-height: 1.5; }

	.reject-title { font-size: 25rpx; color: #c62828; font-weight: 600; }
	.reject-reason { margin-top: 6rpx; font-size: 23rpx; color: #c62828; }

	.mini-stats { display: flex; }
	.mini-stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;

		& + & { border-left: 1rpx solid #f2f3f5; }
	}

	.mini-num { font-size: 34rpx; font-weight: 700; color: #1c1f24; }
	.mini-label { margin-top: 6rpx; font-size: 21rpx; color: #9aa1ad; }

	.rows { padding: 0 28rpx; }

	.row-cell {
		display: flex;
		align-items: center;
		padding: 28rpx 0;
		border-bottom: 1rpx solid #f5f6f8;

		&:last-child { border-bottom: none; }
		&:active { opacity: 0.7; }
	}

	.row-label { flex: 1; font-size: 28rpx; color: #1c1f24; }
	.row-balance { font-size: 25rpx; color: #12a150; margin-right: 8rpx; }
	.arrow { color: #c7cbd3; font-size: 30rpx; }

	.tips { padding: 28rpx 12rpx 0; display: flex; flex-direction: column; gap: 10rpx; }
	.tips-title { font-size: 25rpx; font-weight: 700; color: #1c1f24; }
	.tips-item { font-size: 23rpx; color: #9aa1ad; line-height: 1.6; }
</style>
