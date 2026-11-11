<template>
	<view class="page">
		<view class="balance-card">
			<text class="label">可提现余额</text>
			<text class="amount">¥{{ wallet.balance || 0 }}</text>
			<view class="sub">
				<text>累计收入 ¥{{ wallet.income || 0 }}</text>
				<text>已提现 ¥{{ wallet.withdrawn || 0 }}</text>
			</view>
		</view>

		<view class="card">
			<view class="card-title">申请提现</view>
			<view class="withdraw-row">
				<text class="yuan">¥</text>
				<input class="input" type="digit" v-model="amount" placeholder="最低 10 元" />
				<view class="btn btn-primary btn-sm" @click="withdraw">申请</view>
			</view>
			<text class="muted small tip">人工审核，1-3 个工作日到账。</text>
		</view>

		<view class="card">
			<view class="card-title">收支明细</view>
			<view class="tx" v-for="t in wallet.transactions" :key="t._id">
				<view class="tx-left">
					<text class="tx-remark">{{ t.remark || txTypeText(t.type) }}</text>
					<text class="tx-time">{{ formatTime(t.create_time) }}</text>
				</view>
				<text class="tx-amount" :class="{ plus: t.amount > 0 }">{{ t.amount > 0 ? '+' : '' }}{{ t.amount }}</text>
			</view>
			<view class="empty" v-if="!wallet.transactions || wallet.transactions.length === 0"><text>还没有收支记录</text></view>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'

	export default {
		data() { return { amount: '' } },
		computed: { ...mapGetters('rider', ['wallet']) },
		onShow() { this.load() },
		methods: {
			...mapActions('rider', ['fetchWallet', 'requestWithdraw']),
			async load() {
				try { await this.fetchWallet() }
				catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			},
			txTypeText(type) {
				return { income: '订单收入', commission: '平台佣金', refund: '退款', withdraw: '提现', escrow_in: '托管入账', escrow_out: '托管出账' }[type] || type
			},
			formatTime(ts) {
				if (!ts) return ''
				const d = new Date(ts)
				const p = (n) => (n < 10 ? '0' + n : n)
				return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
			},
			async withdraw() {
				const n = Number(this.amount)
				if (!(n >= 10)) { uni.showToast({ title: '最低提现 10 元', icon: 'none' }); return }
				try {
					await this.requestWithdraw(n)
					uni.showToast({ title: '申请已提交', icon: 'success' })
					this.amount = ''
					this.load()
				} catch (e) { uni.showToast({ title: e.message, icon: 'none' }) }
			}
		}
	}
</script>

<style lang="scss">
	.page { padding: 24rpx; }

	.balance-card {
		background: linear-gradient(160deg, #007aff 0%, #3aa0ff 100%);
		border-radius: 24rpx; padding: 40rpx 32rpx; color: #fff; margin-bottom: 20rpx;
	}

	.label { font-size: 26rpx; opacity: 0.9; }
	.amount { display: block; margin-top: 14rpx; font-size: 64rpx; font-weight: 700; }
	.sub { display: flex; gap: 32rpx; margin-top: 20rpx; font-size: 24rpx; opacity: 0.9; }

	.card { background: #fff; border-radius: 24rpx; padding: 28rpx; margin-bottom: 20rpx; }
	.card-title { font-size: 28rpx; font-weight: 700; margin-bottom: 18rpx; }

	.withdraw-row { display: flex; align-items: center; gap: 12rpx; background: #f7f8fa; border-radius: 16rpx; padding: 12rpx 20rpx; }
	.yuan { font-size: 30rpx; color: #ff3b30; font-weight: 700; }
	.input { flex: 1; height: 64rpx; font-size: 30rpx; }
	.tip { display: block; margin-top: 14rpx; }

	.tx { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; border-bottom: 1rpx solid #f4f4f6;
		&:last-child { border-bottom: none; } }
	.tx-left { display: flex; flex-direction: column; }
	.tx-remark { font-size: 27rpx; color: #1c1c1e; }
	.tx-time { margin-top: 6rpx; font-size: 22rpx; color: #8e8e93; }
	.tx-amount { font-size: 30rpx; font-weight: 600; color: #8e8e93;
		&.plus { color: #34c759; } }
</style>
