<template>
	<view class="page">
		<!-- 余额卡 -->
		<view class="balance-card">
			<text class="label">可提现余额（元）</text>
			<text class="amount">{{ money(wallet.balance) }}</text>
			<view class="sub-row">
				<view class="sub-item">
					<text class="sub-num">{{ money(wallet.income) }}</text>
					<text class="sub-label">累计收入</text>
				</view>
				<view class="sub-item">
					<text class="sub-num">{{ money(wallet.withdrawn) }}</text>
					<text class="sub-label">已提现</text>
				</view>
				<view class="sub-item" v-if="wallet.frozen">
					<text class="sub-num">{{ money(wallet.frozen) }}</text>
					<text class="sub-label">审核中</text>
				</view>
			</view>
		</view>

		<!-- 提现 -->
		<view class="card">
			<view class="card-title">
				<text>申请提现</text>
				<text class="card-extra">最低 10 元</text>
			</view>

			<view class="withdraw-row">
				<text class="yuan">¥</text>
				<input class="input" type="digit" v-model="amount" placeholder="输入提现金额" />
				<text class="all-btn" @click="fillAll">全部</text>
			</view>

			<view class="quick-row">
				<view class="quick" v-for="q in quickAmounts" :key="q" @click="amount = String(q)">{{ q }}元</view>
			</view>

			<view class="btn btn-primary" :class="{ disabled: submitting }" @click="withdraw">
				{{ submitting ? '提交中…' : '申请提现' }}
			</view>

			<text class="tip">人工审核，一般 1-3 个工作日打款；审核期间余额先进入「审核中」。客服会通过你认证的手机号联系确认收款方式。</text>
		</view>

		<!-- 明细 -->
		<view class="card">
			<view class="card-title">
				<text>收支明细</text>
				<text class="card-extra">{{ wallet.transactions ? wallet.transactions.length : 0 }} 条</text>
			</view>

			<view class="tx" v-for="t in wallet.transactions" :key="t._id">
				<view class="tx-left">
					<text class="tx-remark">{{ t.remark || txTypeText(t.type) }}</text>
					<text class="tx-time">{{ formatTime(t.create_time) }} · {{ txTypeText(t.type) }}</text>
				</view>
				<text class="tx-amount" :class="{ plus: t.amount > 0 }">{{ t.amount > 0 ? '+' : '' }}{{ money(t.amount) }}</text>
			</view>

			<view class="empty" v-if="!wallet.transactions || !wallet.transactions.length">
				<view class="empty-line"></view>
				<text class="empty-title">还没有收支记录</text>
				<text class="empty-tip">完成第一单后，收入会显示在这里</text>
			</view>
		</view>

		<view class="foot-note">平台抽佣 {{ commissionPercent }}%，骑手到手 = 订单金额 × {{ 100 - commissionPercent }}%</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { formatTime, errText } from '@/common/rider-util.js'

	export default {
		data() {
			return { amount: '', submitting: false }
		},
		computed: {
			...mapGetters('rider', ['wallet', 'commissionRate']),
			/** 抽佣比例来自配置表，别写死百分比 */
			commissionPercent() {
				return Math.round((Number(this.commissionRate) || 0) * 100)
			},
			quickAmounts() {
				const balance = Number(this.wallet.balance) || 0
				const list = [10, 20, 50].filter((n) => n <= balance)
				return list
			}
		},
		onShow() { this.load() },
		onPullDownRefresh() { this.load().finally(() => uni.stopPullDownRefresh()) },
		methods: {
			...mapActions('rider', ['fetchWallet', 'requestWithdraw']),

			money(n) {
				const num = Number(n) || 0
				// 统一两位小数，避免出现 12.5 / 12.500000001 这种
				return num.toFixed(2)
			},

			txTypeText(type) {
				return {
					income: '订单收入',
					commission: '平台佣金',
					refund: '退款',
					withdraw: '提现',
					escrow_in: '托管入账',
					escrow_out: '托管出账'
				}[type] || type || '其他'
			},

			formatTime(ts) {
				return formatTime(ts, true)
			},

			async load() {
				try { await this.fetchWallet() }
				catch (e) { uni.showToast({ title: errText(e, '加载失败'), icon: 'none' }) }
			},

			fillAll() {
				const balance = Number(this.wallet.balance) || 0
				if (balance < 10) {
					uni.showToast({ title: '余额不足 10 元', icon: 'none' })
					return
				}
				this.amount = balance.toFixed(2)
			},

			async withdraw() {
				if (this.submitting) return
				const n = Number(this.amount)
				if (!(n >= 10)) return uni.showToast({ title: '最低提现 10 元', icon: 'none' })
				if (n > (Number(this.wallet.balance) || 0)) return uni.showToast({ title: '超出可提现余额', icon: 'none' })

				this.submitting = true
				try {
					await this.requestWithdraw(n)
					uni.showModal({
						title: '申请已提交',
						content: `¥${n.toFixed(2)} 提现申请已提交，审核通过后到账。`,
						showCancel: false,
						confirmText: '知道了',
						confirmColor: '#007AFF'
					})
					this.amount = ''
					await this.load()
				} catch (e) {
					uni.showToast({ title: errText(e, '提交失败'), icon: 'none' })
				} finally {
					this.submitting = false
				}
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

	.balance-card {
		background: linear-gradient(160deg, #007aff 0%, #3aa0ff 100%);
		border-radius: 24rpx;
		padding: 40rpx 32rpx;
		color: #fff;
		margin-bottom: 20rpx;
		box-shadow: 0 8rpx 24rpx rgba(0, 122, 255, 0.22);
	}

	.label { font-size: 25rpx; opacity: 0.9; }
	.amount {
		display: block;
		margin-top: 12rpx;
		font-size: 68rpx;
		font-weight: 700;
		line-height: 1.15;
	}

	.sub-row { display: flex; margin-top: 26rpx; }
	.sub-item {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	.sub-num { font-size: 28rpx; font-weight: 600; }
	.sub-label { margin-top: 4rpx; font-size: 21rpx; opacity: 0.85; }

	.withdraw-row {
		display: flex;
		align-items: center;
		background: #f7f8fa;
		border-radius: 16rpx;
		padding: 0 22rpx;
		height: 92rpx;
	}

	.yuan { font-size: 32rpx; color: #ff3b30; font-weight: 700; margin-right: 10rpx; }
	.input { flex: 1; font-size: 32rpx; height: 92rpx; }

	.all-btn {
		font-size: 24rpx;
		color: #007aff;
		padding: 6rpx 16rpx;
		background: rgba(0, 122, 255, 0.08);
		border-radius: 16rpx;
	}

	.quick-row { display: flex; gap: 12rpx; margin: 16rpx 0 22rpx; }

	.quick {
		font-size: 23rpx;
		color: #6e6e73;
		background: #f7f8fa;
		padding: 10rpx 22rpx;
		border-radius: 18rpx;
	}

	.tip { display: block; margin-top: 16rpx; font-size: 22rpx; color: #8e8e93; line-height: 1.6; }

	.tx {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #f6f6f8;

		&:last-child { border-bottom: none; }
	}

	.tx-left { display: flex; flex-direction: column; flex: 1; min-width: 0; }

	.tx-remark {
		font-size: 27rpx;
		color: #1c1c1e;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tx-time { margin-top: 6rpx; font-size: 21rpx; color: #8e8e93; }

	.tx-amount {
		font-size: 30rpx;
		font-weight: 600;
		color: #8e8e93;
		margin-left: 20rpx;

		&.plus { color: #34c759; }
	}

	.foot-note {
		text-align: center;
		font-size: 21rpx;
		color: #b0b0b5;
		padding: 10rpx 0 30rpx;
	}

	.empty-line {
		width: 80rpx;
		height: 6rpx;
		background: #e4e8ee;
		border-radius: 3rpx;
		margin-bottom: 22rpx;
	}

	.empty-title {
		font-size: 27rpx;
		font-weight: 600;
		color: #3a4049;
	}
</style>
