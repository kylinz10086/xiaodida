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
					转账失败/取消/过期会自动把金额退回骑手余额（标记「已退回」），不会出现扣了钱没到账。
					失败的单子确认余额已退回后，可以在这里点「重发」再来一次。
					如果失败原因写「此IP地址不允许调用接口」，点右上角「查出口IP」，把查到的 IP 全部加到
					微信商户平台 → 产品中心 → 商家转账 → 接口安全IP。
					注意：云函数出口 IP 会变。想一劳永逸，用 tools/wechat-relay.cjs 在固定 IP 的服务器上做转发，
					之后微信只看到那台机器的 IP，白名单配一次就长期有效。
				</text>
			</view>

			<view class="stat-row">
				<view class="stat-card">
					<text class="stat-num">{{ summary.count || 0 }}</text>
					<text class="stat-label">提现笔数</text>
				</view>
				<view class="stat-card">
					<text class="stat-num">¥{{ summary.amount || 0 }}</text>
					<text class="stat-label">提现总额</text>
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
					<uni-th align="center" width="110">操作</uni-th>
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
						<text class="hint" v-if="needTopup(item.fail_reason)">运营账户没钱 → 充值后点重发（原单号）</text>
						<text class="ip" v-if="item.egress_ip">IP {{ item.egress_ip }}</text>
					</uni-td>
					<uni-td align="center">
						<button v-if="item.can_retry" class="uni-button" type="warn" size="mini"
							@click="retry(item)">重发</button>
						<button v-if="!item.legacy" class="uni-button recon" type="default" size="mini"
							@click="reconcile(item)">对账</button>
						<text v-if="item.legacy" class="muted">-</text>
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
			/** 资金不足：微信提示「商户运营账户资金不足」，充值后原单号重试即可 */
			needTopup(reason) {
				const s = String(reason || '')
				return s.indexOf('资金不足') >= 0 || s.indexOf('余额不足') >= 0 || s.indexOf('运营账户') >= 0
			},
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
			/** 对账：以微信侧状态为准，修「钱到了但显示失败」 */
			async reconcile(item) {
				uni.showLoading({ title: '向微信核对中…', mask: true })
				try {
					const res = await api().reconcileWithdraw({ outBillNo: item.out_bill_no || item._id })
					uni.hideLoading()
					if (res.code !== 0) throw new Error(res.msg)
					const d = res.data || {}
					uni.showModal({
						title: '对账结果',
						content:
							(res.msg || '已对账') +
							'\n微信状态：' +
							(d.state || '-') +
							(d.recharged ? '\n已把误退的余额扣回（用户实际已到账）' : ''),
						showCancel: false
					})
					await this.load()
				} catch (e) {
					uni.hideLoading()
					uni.showModal({ title: '对账失败', content: e.message || '请稍后再试', showCancel: false })
				}
			},
			/** 重发一笔失败提现 */
			async retry(item) {
				const ok = await new Promise((resolve) => {
					uni.showModal({
						title: '重发这笔提现',
						content: `给「${item.nickname}」重新打款 ¥${item.amount}？请确认金额已经退回他的余额。`,
						success: (r) => resolve(Boolean(r.confirm))
					})
				})
				if (!ok) return
				uni.showLoading({ title: '重发中…', mask: true })
				try {
					const res = await api().reissueWithdraw({ outBillNo: item.out_bill_no || item._id })
					uni.hideLoading()
					if (res.code !== 0) throw new Error(res.msg)
					uni.showModal({
						title: '已重发',
						content: (res.msg || '已重新发起转账') + '。如果微信要求用户确认收款，需要骑手在小程序钱包页点「去确认」。',
						showCancel: false
					})
					await this.load()
				} catch (e) {
					uni.hideLoading()
					uni.showModal({ title: '重发失败', content: e.message || '请稍后再试', showCancel: false })
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
