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
				<button class="uni-button" type="primary" size="mini" @click="load">刷新</button>
			</view>
		</view>

		<view class="uni-container">
			<uni-table :loading="loading" border stripe emptyText="没有符合条件的骑手申请">
				<uni-tr>
					<uni-th align="center" width="130">昵称</uni-th>
					<uni-th align="center" width="130">真实姓名</uni-th>
					<uni-th align="center" width="190">学号</uni-th>
					<uni-th align="center" width="140">手机号</uni-th>
					<uni-th align="center" width="160">申请时间</uni-th>
					<uni-th align="center" width="100">状态</uni-th>
					<uni-th align="center" width="120">审核时间</uni-th>
					<uni-th align="center" width="220">操作</uni-th>
				</uni-tr>
				<uni-tr v-for="item in list" :key="item._id">
					<uni-td align="center">{{ item.nickname || '-' }}</uni-td>
					<uni-td align="center">{{ item.real_name || '-' }}</uni-td>
					<uni-td align="center">
						<!-- 学号必须完整显示：15 位连写不换行，下面再给一行分段（学年/学院专业/班级学号） -->
						<view v-if="item.student_no" class="stu-cell">
							<text class="stu-no">{{ item.student_no }}</text>
							<text class="stu-parts">{{ item.student_no_display }}</text>
						</view>
						<text v-else class="stu-bad">未填写</text>
					</uni-td>
					<uni-td align="center">{{ item.mobile || '-' }}</uni-td>
					<uni-td align="center">{{ formatTime(item.rider_apply_time) }}</uni-td>
					<uni-td align="center">
						<text :class="['rider-tag', 'rider-' + item.rider_status]">{{ item.rider_status_text }}</text>
					</uni-td>
					<uni-td align="center">{{ formatTime(item.rider_review_time) }}</uni-td>
					<uni-td align="center">
						<view class="uni-group">
							<button v-if="item.rider_status !== 2" class="uni-button" size="mini" type="primary"
								@click="approve(item)">通过</button>
							<button v-if="item.rider_status !== 3" class="uni-button" size="mini" type="warn"
								@click="reject(item)">拒绝</button>
							<text v-if="item.rider_status === 3" class="reject-reason">{{ item.rider_reject_reason || '已拒绝' }}</text>
						</view>
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
					{ text: '待审核', value: 1 },
					{ text: '已通过', value: 2 },
					{ text: '已拒绝', value: 3 },
					{ text: '全部', value: 0 }
				],
				status: 1,
				list: [],
				total: 0,
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
			async load() {
				this.loading = true
				try {
					const res = await api().listRiders({
						status: this.status,
						page: this.page,
						pageSize: this.pageSize
					})
					if (res.code !== 0) throw new Error(res.msg)
					this.list = res.data.list || []
					this.total = res.data.total || 0
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
			onPageChanged(e) {
				this.page = e.current
				this.load()
			},
			approve(item) {
				uni.showModal({
					title: '通过骑手审核',
					content: `确认通过 ${item.real_name || item.nickname} 的骑手申请？`,
					success: async (r) => {
						if (!r.confirm) return
						await this.review(item, 'approve', '')
					}
				})
			},
			reject(item) {
				uni.showModal({
					title: '拒绝骑手申请',
					editable: true,
					placeholderText: '填写拒绝原因（可选）',
					content: '',
					success: async (r) => {
						if (!r.confirm) return
						await this.review(item, 'reject', (r.content || '').trim())
					}
				})
			},
			async review(item, action, reason) {
				try {
					const res = await api().reviewRider({
						userId: item._id,
						action,
						reason
					})
					if (res.code !== 0) throw new Error(res.msg)
					uni.showToast({ title: res.msg || '操作成功', icon: 'success' })
					this.load()
				} catch (e) {
					uni.showToast({ title: e.message || '操作失败', icon: 'none' })
				}
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
	.rider-tag {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
	}
	.rider-0 { background: #f2f2f7; color: #8e8e93; }
	.rider-1 { background: #fff7e6; color: #ad6800; }
	.rider-2 { background: #e8f8ee; color: #1a7f37; }
	.rider-3 { background: #ffecec; color: #c62828; }
	.reject-reason {
		font-size: 12px;
		color: #c62828;
	}
	/* 学号：等宽字体 + 不换行，15 位必须完整露出来 */
	.stu-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.35;
	}
	.stu-no {
		font-family: Menlo, Consolas, 'Courier New', monospace;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.3px;
		white-space: nowrap;
		word-break: keep-all;
		color: #1c1c1e;
	}
	.stu-parts {
		font-size: 11px;
		color: #909399;
		white-space: nowrap;
	}
	.stu-bad {
		font-size: 12px;
		color: #c62828;
	}
</style>
