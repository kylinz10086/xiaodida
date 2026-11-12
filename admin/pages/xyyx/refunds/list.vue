<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<view class="uni-group">
				<view class="status-tabs">
					<view v-for="tab in tabs" :key="tab.value" class="status-tab"
						:class="{ active: status === tab.value }" @click="switchStatus(tab.value)">
						{{ tab.text }}
					</view>
				</view>
				<input class="uni-search" type="text" v-model="keyword" @confirm="search"
					placeholder="搜索订单号 / 用户ID / 退款单号" />
				<button class="uni-button" type="default" size="mini" @click="search">搜索</button>
				<button class="uni-button" type="primary" size="mini" @click="load">刷新</button>
				<button class="uni-button" type="warn" size="mini" @click="scanLost">补退历史订单</button>
			</view>
		</view>

		<view class="uni-container">
			<view class="stat-row">
				<view class="stat-card">
					<text class="stat-num">{{ summary.total || 0 }}</text>
					<text class="stat-label">退款单数</text>
				</view>
				<view class="stat-card">
					<text class="stat-num">¥{{ summary.amount || 0 }}</text>
					<text class="stat-label">已退金额</text>
				</view>
				<view class="stat-card">
					<text class="stat-num warn">{{ summary.processing || 0 }}</text>
					<text class="stat-label">退款中</text>
				</view>
				<view class="stat-card">
					<text class="stat-num danger">{{ summary.failed || 0 }}</text>
					<text class="stat-label">退款失败</text>
				</view>
			</view>

			<uni-table :loading="loading" border stripe emptyText="还没有退款记录">
				<uni-tr>
					<uni-th align="center" width="150">订单号</uni-th>
					<uni-th align="center" width="90">金额</uni-th>
					<uni-th align="center" width="140">来源</uni-th>
					<uni-th align="center" width="120">退款方式</uni-th>
					<uni-th align="center" width="100">状态</uni-th>
					<uni-th align="center" width="180">原因</uni-th>
					<uni-th align="center" width="150">申请时间</uni-th>
					<uni-th align="center" width="150">完成时间</uni-th>
					<uni-th align="center" width="110">操作</uni-th>
				</uni-tr>
				<uni-tr v-for="item in list" :key="item._id">
					<uni-td align="center">
						<text class="mono">{{ shortId(item.task_id) }}</text>
					</uni-td>
					<uni-td align="center">
						<text class="amount">¥{{ item.amount }}</text>
					</uni-td>
					<uni-td align="center">{{ item.source_text || '-' }}</uni-td>
					<uni-td align="center">{{ item.mode_text }}</uni-td>
					<uni-td align="center">
						<text :class="['refund-tag', 'refund-' + item.status]">{{ item.status_text }}</text>
					</uni-td>
					<uni-td align="center">
						<text class="reason">{{ item.fail_reason || item.reason || '-' }}</text>
					</uni-td>
					<uni-td align="center">{{ formatTime(item.create_time) }}</uni-td>
					<uni-td align="center">{{ formatTime(item.finish_time) }}</uni-td>
					<uni-td align="center">
						<button v-if="item.status === 'failed'" class="uni-button" size="mini" type="warn"
							@click="retry(item)">重试退款</button>
						<text v-else class="muted">—</text>
					</uni-td>
				</uni-tr>
			</uni-table>

			<view class="uni-pagination-box">
				<uni-pagination show-icon :page-size="pageSize" v-model="page" :total="total"
					@change="onPageChanged" />
			</view>
		</view>
	</view>
</template>

<script>
	const api = () => uniCloud.importObject('xyyx-admin', { customUI: true })

	export default {
		data() {
			return {
				tabs: [
					{ text: '全部', value: '' },
					{ text: '退款中', value: 'processing' },
					{ text: '已退款', value: 'success' },
					{ text: '退款失败', value: 'failed' }
				],
				status: '',
				keyword: '',
				list: [],
				total: 0,
				page: 1,
				pageSize: 20,
				loading: false,
				summary: { total: 0, amount: 0, processing: 0, failed: 0 }
			}
		},
		onLoad() {
			this.load()
		},
		onShow() {
			this.load()
		},
		methods: {
			async load() {
				this.loading = true
				try {
					const res = await api().listRefunds({
						status: this.status,
						keyword: this.keyword,
						page: this.page,
						pageSize: this.pageSize
					})
					if (res.code !== 0) throw new Error(res.msg)
					this.list = res.data.list || []
					this.total = res.data.total || 0
					this.summary = res.data.summary || this.summary
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			switchStatus(v) {
				this.status = v
				this.page = 1
				this.load()
			},
			search() {
				this.page = 1
				this.load()
			},
			onPageChanged(e) {
				this.page = e.current
				this.load()
			},
			/**
			 * 补退历史订单。
			 *
			 * 老版本取消订单只在流水里写了一行「已退款」，从没真正退钱；
			 * 这里先扫出来给运营看（金额、笔数），确认后才真的退，避免误操作。
			 */
			async scanLost() {
				uni.showLoading({ title: '扫描中' })
				try {
					const res = await api().scanLostRefunds({ limit: 200 })
					uni.hideLoading()
					if (res.code !== 0) throw new Error(res.msg)
					const d = res.data || {}
					if (!d.total) {
						uni.showModal({
							title: '没有需要补退的订单',
							content: `已扫描 ${d.scanned || 0} 笔已取消订单，账目一致。`,
							showCancel: false
						})
						return
					}
					const preview = (d.missing || [])
						.slice(0, 5)
						.map((m) => `· ${m.title || m.task_id} ¥${m.refund}`)
						.join('\n')
					uni.showModal({
						title: `发现 ${d.total} 笔未真正退款`,
						content: `合计 ¥${d.lostAmount}，例如：\n${preview}\n\n确认后会立刻向微信发起退款。`,
						confirmText: '立即补退',
						confirmColor: '#FF3B30',
						success: async (r) => {
							if (!r.confirm) return
							uni.showLoading({ title: '补退中' })
							try {
								const rr = await api().repairLostRefunds({ limit: 200, confirm: true })
								uni.hideLoading()
								if (rr.code !== 0) throw new Error(rr.msg)
								uni.showModal({
									title: '补退完成',
									content: rr.msg || '已发起补退',
									showCancel: false
								})
								this.load()
							} catch (e) {
								uni.hideLoading()
								uni.showToast({ title: e.message || '补退失败', icon: 'none' })
							}
						}
					})
				} catch (e) {
					uni.hideLoading()
					uni.showToast({ title: e.message || '扫描失败', icon: 'none' })
				}
			},
			async retry(item) {
				uni.showModal({
					title: '重试退款',
					content: `重新发起 ¥${item.amount} 的退款？`,
					success: async (r) => {
						if (!r.confirm) return
						try {
							const res = await api().retryRefund({ refundId: item._id })
							if (res.code !== 0) throw new Error(res.msg)
							// 微信原路退款需要再推一次到支付对象
							if (res.data && res.data.needWxRefund) {
								const pay = await uniCloud.importObject('xyyx-pay', { customUI: true })
									.refundTask(res.data.refundId)
								if (pay.code !== 0) throw new Error(pay.msg)
							}
							uni.showToast({ title: '已重新发起', icon: 'success' })
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message || '重试失败', icon: 'none' })
						}
					}
				})
			},
			shortId(id) {
				const s = String(id || '')
				return s.length > 12 ? s.slice(0, 6) + '…' + s.slice(-4) : s || '-'
			},
			formatTime(ts) {
				const n = Number(ts)
				if (!n) return '-'
				const d = new Date(n)
				const p = (v) => String(v).padStart(2, '0')
				return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
			}
		}
	}
</script>

<style lang="scss">
	.status-tabs {
		display: flex;
		gap: 8px;
	}

	.status-tab {
		padding: 6px 14px;
		border-radius: 16px;
		background: #f2f2f7;
		color: #4a4a4a;
		font-size: 13px;
		cursor: pointer;
	}

	.status-tab.active {
		background: #007aff;
		color: #fff;
	}

	.stat-row {
		display: flex;
		gap: 16px;
		margin-bottom: 16px;
	}

	.stat-card {
		flex: 1;
		background: #fff;
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		box-shadow: 0 2px 8px rgba(0, 0, 0, .04);
	}

	.stat-num {
		font-size: 24px;
		font-weight: 700;
		color: #007aff;

		&.warn {
			color: #ff9500;
		}

		&.danger {
			color: #ff3b30;
		}
	}

	.stat-label {
		margin-top: 4px;
		color: #8a8a8a;
		font-size: 13px;
	}

	.mono {
		font-family: Menlo, Consolas, monospace;
		font-size: 12px;
	}

	.amount {
		font-weight: 600;
		color: #ff3b30;
	}

	.reason {
		font-size: 12px;
		color: #606266;
		word-break: break-all;
	}

	.muted {
		color: #b0b0b5;
	}

	.refund-tag {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
	}

	.refund-processing {
		background: #fff7e6;
		color: #ad6800;
	}

	.refund-success {
		background: #e8f8ee;
		color: #1a7f37;
	}

	.refund-failed {
		background: #ffecec;
		color: #c62828;
	}
</style>
