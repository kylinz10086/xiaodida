<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<view class="uni-group">
				<input class="uni-search" type="text" v-model="keyword" @confirm="search"
					placeholder="搜索用户昵称 / 用户ID / 提现单号" />
				<button class="uni-button" type="default" size="mini" @click="search">搜索</button>
				<button class="uni-button" type="primary" size="mini" @click="load">刷新</button>
				<button class="uni-button" type="default" size="mini" @click="sync">同步在途状态</button>
				<button class="uni-button" type="default" size="mini" @click="showIps">查出口IP</button>
			</view>
		</view>

		<view class="uni-container">
			<view class="notice">
				<text class="notice-title">提现已接微信「商家转账到零钱」，状态实时可查</text>
				<text class="notice-desc">
					骑手点提现 → 系统扣余额并发起转账 → 微信返回「待确认收款」时，骑手要在微信里点确认，钱才进零钱。
					系统每 10 分钟自动对账：微信侧失败的会把金额退回余额；如果微信侧其实已到账
					（出现过接口报错但钱已到账的情况），会自动改回「已到账」并扣回误退的余额，
					不会出现「钱到账了但可提现余额没扣」。想立刻刷新状态就点「同步在途状态」。
					失败原因里如果写「此IP地址不允许调用接口」，点右上角「查出口IP」，把查到的 IP 全部加到
					微信商户平台 → 产品中心 → 商家转账 → 接口安全IP。
				</text>
			</view>

			<view class="stat-row">
				<view class="stat-card">
					<text class="stat-num">{{ summary.count || 0 }}</text>
					<text class="stat-label">提现笔数</text>
				</view>
				<view class="stat-card">
					<text class="stat-num">¥{{ summary.amount || 0 }}</text>
					<text class="stat-label">已到账金额</text>
				</view>
				<view class="stat-card">
					<text class="stat-num wait">¥{{ summary.pending_amount || 0 }}</text>
					<text class="stat-label">待确认金额</text>
				</view>
				<view class="stat-card">
					<text class="stat-num ok">{{ summary.success || 0 }}</text>
					<text class="stat-label">已到账</text>
				</view>
				<view class="stat-card">
					<text class="stat-num wait">{{ summary.inflight || 0 }}</text>
					<text class="stat-label">在途</text>
				</view>
				<view class="stat-card">
					<text class="stat-num bad">{{ summary.failed || 0 }}</text>
					<text class="stat-label">失败（已退回 {{ summary.returned || 0 }}）</text>
				</view>
			</view>

			<uni-table :loading="loading" border stripe emptyText="还没有提现记录">
				<uni-tr>
					<uni-th align="center" width="150">用户</uni-th>
					<uni-th align="center" width="120">手机号</uni-th>
					<uni-th align="center" width="90">金额</uni-th>
					<uni-th align="center" width="130">状态</uni-th>
					<uni-th align="center" width="160">时间</uni-th>
					<uni-th align="center" width="230">提现单号</uni-th>
					<uni-th align="center" width="200">失败原因</uni-th>
				</uni-tr>
				<uni-tr v-for="item in list" :key="item._id">
					<uni-td align="center">{{ item.nickname }}</uni-td>
					<uni-td align="center">{{ item.mobile || '-' }}</uni-td>
					<uni-td align="center">
						<text class="amount">¥{{ item.amount }}</text>
					</uni-td>
					<uni-td align="center">
						<text class="badge" :class="stateClass(item.state)">{{ item.state_text }}</text>
					</uni-td>
					<uni-td align="center">{{ formatTime(item.create_time) }}</uni-td>
					<uni-td align="center">
						<text class="mono">{{ item.out_bill_no || item._id }}</text>
					</uni-td>
					<uni-td align="center">
						<text class="reason">{{ item.fail_reason || '-' }}</text>
						<text class="ip" v-if="item.egress_ip">IP {{ item.egress_ip }}</text>
					</uni-td>
				</uni-tr>
			</uni-table>

			<view class="uni-pagination-box">
				<uni-pagination show-icon :page-size="pageSize" v-model="page" :total="total" @change="onPageChanged" />
			</view>
		</view>
	</view>
</template>

<script>
	const api = () => uniCloud.importObject('xyyx-admin', { customUI: true })

	export default {
		data() {
			return {
				keyword: '',
				list: [],
				total: 0,
				summary: { count: 0, amount: 0, success: 0, inflight: 0, failed: 0, returned: 0 },
				page: 1,
				pageSize: 20,
				loading: false
			}
		},
		onLoad() {
			this.load()
		},
		onShow() {
			this.load()
		},
		methods: {
			stateClass(s) {
				if (s === 'SUCCESS') return 'ok'
				if (s === 'WAIT_USER_CONFIRM') return 'wait'
				if (s === 'FAIL' || s === 'CANCELLED' || s === 'EXPIRED') return 'bad'
				return 'doing'
			},
			async load() {
				this.loading = true
				try {
					const res = await api().listWithdrawals({
						keyword: this.keyword,
						page: this.page,
						pageSize: this.pageSize
					})
					if (res.code !== 0) throw new Error(res.msg)
					const d = res.data || {}
					this.list = d.list || []
					this.total = d.total || 0
					this.summary = d.summary || { count: 0, amount: 0 }
				} catch (e) {
					uni.showModal({ title: '加载失败', content: e.message || '请确认已登录管理员账号', showCancel: false })
				} finally {
					this.loading = false
				}
			},
			/** 查云函数出口 IP：提现报「此IP地址不允许调用接口」时，把这些 IP 加到商户平台白名单 */
			async showIps() {
				uni.showLoading({ title: '查询中…', mask: true })
				try {
					const res = await api().egressIp()
					uni.hideLoading()
					if (res.code !== 0) throw new Error(res.msg)
					const d = res.data || {}
					const ips = (d.ips || []).join('\n') || '没查到（云函数访问公网受限）'
					uni.setClipboardData({
						data: (d.ips || []).join(','),
						success: () => {},
						fail: () => {}
					})
					uni.showModal({
						title: '云函数出口 IP（已复制）',
						content: `${ips}\n\n${d.tip || ''}`,
						showCancel: false,
						confirmText: '知道了'
					})
				} catch (e) {
					uni.hideLoading()
					uni.showModal({ title: '查询失败', content: e.message || '请稍后再试', showCancel: false })
				}
			},
			/** 让服务端去微信查一遍在途转账（确认收款/失败自动退回） */
			async sync() {
				uni.showLoading({ title: '同步中…', mask: true })
				try {
					const res = await api().syncWithdrawals({})
					uni.hideLoading()
					const d = (res && res.data) || {}
					if (res && res.code !== 0) throw new Error(res.msg)
					uni.showToast({ title: `已检查 ${d.scanned || 0} 笔，更新 ${d.updated || 0} 笔`, icon: 'none' })
					await this.load()
				} catch (e) {
					uni.hideLoading()
					uni.showModal({ title: '同步失败', content: e.message || '请稍后再试', showCancel: false })
				}
			},
			search() {
				this.page = 1
				this.load()
			},
			onPageChanged(e) {
				this.page = (e && e.current) || 1
				this.load()
			},
			formatTime(ts) {
				const n = Number(ts) || 0
				if (!n) return '-'
				const d = new Date(n)
				const p = (x) => (x < 10 ? '0' + x : '' + x)
				return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
			}
		}
	}
</script>

<style>
	.notice {
		margin: 12px 0 18px;
		padding: 14px 18px;
		background: #eef7ff;
		border: 1px solid #cfe6ff;
		border-radius: 8px;
	}

	.notice-title {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: #1677ff;
		margin-bottom: 6px;
	}

	.notice-desc {
		display: block;
		font-size: 12px;
		line-height: 1.7;
		color: #4a6272;
	}

	.stat-row {
		display: flex;
		gap: 12px;
		margin-bottom: 16px;
	}

	.stat-card {
		flex: 1;
		background: #f7f8fa;
		border-radius: 8px;
		padding: 14px;
		text-align: center;
	}

	.stat-num {
		display: block;
		font-size: 22px;
		font-weight: 700;
		color: #1677ff;
	}

	.stat-num.ok { color: #34c759; }
	.stat-num.wait { color: #ff9500; }
	.stat-num.bad { color: #eb5757; }

	.stat-label {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: #888;
	}

	.amount { color: #eb5757; font-weight: 600; }
	.recon { margin-left: 6px; }
	.mono { font-family: Consolas, monospace; font-size: 12px; color: #666; }
	.reason { font-size: 12px; color: #eb5757; }
	.ip {
		display: block;
		margin-top: 2px;
		font-family: Consolas, monospace;
		font-size: 11px;
		color: #999;
	}
	.muted { color: #bbb; }
	.hint {
		display: block;
		margin-top: 2px;
		font-size: 11px;
		color: #9a6200;
		background: #fff4e0;
		border-radius: 4px;
		padding: 1px 4px;
	}

	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
	}

	.badge.ok { color: #1a7f37; background: #e6f7ea; }
	.badge.wait { color: #9a6200; background: #fff4e0; }
	.badge.bad { color: #b42318; background: #ffe9e7; }
	.badge.doing { color: #1677ff; background: #e8f1ff; }
</style>
