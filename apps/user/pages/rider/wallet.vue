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
			</view>
		</view>

		<!-- 提现 -->
		<view class="card">
			<view class="card-title">
				<text>申请提现</text>
				<text class="card-extra">最低 3 元</text>
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
		</view>

		<!-- 提现记录（微信商家转账状态） -->
		<view class="card" v-if="withdrawals.length">
			<view class="card-title">
				<text>最近提现</text>
				<text class="card-extra">到账状态实时同步</text>
			</view>

			<view class="wd" v-for="w in withdrawals" :key="w.out_bill_no">
				<view class="wd-left">
					<text class="wd-amount">¥{{ money(w.amount) }}</text>
					<text class="wd-time">{{ formatTime(w.create_time) }}</text>
					<text class="wd-reason" v-if="w.fail_reason">{{ w.fail_reason }}{{ w.rolled_back ? '（已退回余额）' : '' }}</text>
				</view>
				<view class="wd-right">
					<text class="wd-state" :class="stateClassMap[w.state] || 'doing'">{{ w.state_text }}</text>
					<text class="wd-confirm" v-if="w.state === 'WAIT_USER_CONFIRM'" @click="resumeConfirm(w)">去确认</text>
				</view>
			</view>
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
			return {
				amount: '',
				submitting: false,
				withdrawals: [],
				// 与云函数 xyyx-rider 里的风控常量保持一致
				maxWithdraw: 200,
				maxDaily: 500
			}
		},
		computed: {
			...mapGetters('rider', ['wallet', 'commissionRate']),
			/** 抽佣比例来自配置表，别写死百分比 */
			commissionPercent() {
				return Math.round((Number(this.commissionRate) || 0) * 100)
			},
			quickAmounts() {
				const balance = Number(this.wallet.balance) || 0
				const list = [3, 5, 10].filter((n) => n <= balance)
				return list
			},
			/** 提现状态 → 颜色类名（模板里不能直接调方法，走映射表） */
			stateClassMap() {
				return {
					SUCCESS: 'done',
					WAIT_USER_CONFIRM: 'wait',
					FAIL: 'fail',
					CANCELLED: 'fail',
					EXPIRED: 'fail',
					pending: 'doing',
					PROCESSING: 'doing',
					TRANSFERING: 'doing',
					ACCEPTED: 'doing'
				}
			}
		},
		onShow() { this.load() },
		onPullDownRefresh() { this.load().finally(() => uni.stopPullDownRefresh()) },
		methods: {
			...mapActions('rider', ['fetchWallet', 'requestWithdraw', 'queryWithdraw', 'fetchWithdrawals']),


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
				try { this.withdrawals = await this.fetchWithdrawals(8) }
				catch (e) { this.withdrawals = [] }
			},

			/** 待确认收款的单子：重新拿 package_info 再拉一次微信确认页 */
			async resumeConfirm(w) {
				if (!w || !w.out_bill_no) return
				uni.showLoading({ title: '查询中…', mask: true })
				try {
					const d = await this.queryWithdraw(w.out_bill_no)
					uni.hideLoading()
					if (d.state === 'SUCCESS') {
						uni.showToast({ title: '已到账微信零钱', icon: 'none' })
						return this.load()
					}
					if (!d.package_info) {
						uni.showModal({
							title: '确认已过期',
							content: '这笔提现的确认收款已超时，微信会自动取消，金额会退回余额。稍等一会儿刷新，或者重新发起一次提现。',
							showCancel: false
						})
						return this.load()
					}
					const ok = await this.confirmTransfer({
						mchid: w.mchid || '',
						appid: w.appid || '',
						package_info: d.package_info
					})
					if (ok) {
						await this.pollWithdraw(w.out_bill_no)
					}
					await this.load()
				} catch (e) {
					uni.hideLoading()
					uni.showToast({ title: errText(e, '查询失败'), icon: 'none' })
				}
			},

			fillAll() {
				const balance = Number(this.wallet.balance) || 0
				if (balance < 3) {
					uni.showToast({ title: '余额不足 3 元', icon: 'none' })
					return
				}
				// 单笔有上限，超过就只填到上限，剩下的下次再提
				this.amount = Math.min(balance, this.maxWithdraw).toFixed(2)
			},

			async withdraw() {
				if (this.submitting) return
				const n = Number(this.amount)
				if (!(n >= 3)) return uni.showToast({ title: '最低提现 3 元', icon: 'none' })
				if (n > this.maxWithdraw) return uni.showToast({ title: `单笔最多 ${this.maxWithdraw} 元`, icon: 'none' })
				if (n > (Number(this.wallet.balance) || 0)) return uni.showToast({ title: '超出可提现余额', icon: 'none' })

				this.submitting = true
				try {
					const res = await this.requestWithdraw(n)
					const d = (res && res.data) || {}
					this.amount = ''

					if (d.need_confirm && d.package_info) {
						const ok = await this.confirmTransfer(d)
						if (!ok) {
							uni.showModal({
								title: '还没确认收款',
								content: '微信里需要点一下「确认收款」才会到账。可以重新发起提现再确认一次。',
								showCancel: false
							})
							await this.load()
							return
						}
						const state = await this.pollWithdraw(d.out_bill_no)
						if (state === 'SUCCESS') {
							uni.showModal({
								title: '提现成功',
								content: `¥${n.toFixed(2)} 已到账微信零钱。`,
								showCancel: false
							})
						} else if (state === 'FAIL') {
							uni.showModal({
								title: '提现失败',
								content: '微信转账失败，金额已退回余额，请稍后再试。',
								showCancel: false
							})
						} else {
							uni.showModal({
								title: '处理中',
								content: '微信正在处理这笔转账，稍后可在微信零钱账单里查看。',
								showCancel: false
							})
						}
					} else {
						uni.showModal({
							title: '提现成功',
							content: `¥${n.toFixed(2)} 已到账微信零钱，剩余可提现 ¥${Number(d.balance || 0).toFixed(2)}。`,
							showCancel: false,
							confirmText: '知道了',
							confirmColor: '#007AFF'
						})
					}
					await this.load()
				} catch (e) {
					uni.showToast({ title: errText(e, '提现失败'), icon: 'none' })
				} finally {
					this.submitting = false
				}
			},

			/** 拉起微信「确认收款」页（商家转账用户确认模式） */
			confirmTransfer(d) {
				return new Promise((resolve) => {
					if (typeof wx === 'undefined' || typeof wx.requestMerchantTransfer !== 'function') {
						uni.showModal({
							title: '微信版本过低',
							content: '当前微信不支持确认收款，请升级微信后再试。',
							showCancel: false
						})
						return resolve(false)
					}
					wx.requestMerchantTransfer({
						mchId: d.mchid || '',
						appId: d.appid || '',
						package: d.package_info,
						success: () => resolve(true),
						fail: () => resolve(false)
					})
				})
			},

			/** 确认收款后轮询转账状态 */
			async pollWithdraw(no) {
				if (!no) return ''
				for (let i = 0; i < 8; i++) {
					await new Promise((r) => setTimeout(r, 1500))
					try {
						const d = await this.queryWithdraw(no)
						if (d.state === 'SUCCESS' || d.state === 'FAIL') return d.state
					} catch (e) {
						// 继续轮询
					}
				}
				return ''
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

	.wd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #f6f6f8;

		&:last-child { border-bottom: none; }
	}

	.wd-left { display: flex; flex-direction: column; flex: 1; min-width: 0; }
	.wd-amount { font-size: 30rpx; font-weight: 600; color: #1c1c1e; }
	.wd-time { margin-top: 6rpx; font-size: 21rpx; color: #8e8e93; }
	.wd-reason { margin-top: 6rpx; font-size: 21rpx; color: #ff3b30; }

	.wd-right { display: flex; align-items: center; margin-left: 20rpx; }

	.wd-state {
		font-size: 23rpx;
		padding: 6rpx 16rpx;
		border-radius: 14rpx;

		&.done { color: #34c759; background: rgba(52, 199, 89, 0.1); }
		&.wait { color: #ff9500; background: rgba(255, 149, 0, 0.12); }
		&.fail { color: #ff3b30; background: rgba(255, 59, 48, 0.1); }
		&.doing { color: #007aff; background: rgba(0, 122, 255, 0.1); }
	}

	.wd-confirm {
		margin-left: 12rpx;
		font-size: 23rpx;
		color: #fff;
		background: #ff9500;
		padding: 8rpx 18rpx;
		border-radius: 16rpx;
	}

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
