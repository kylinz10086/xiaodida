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
			<uni-table :loading="loading" border stripe emptyText="暂无反馈">
				<uni-tr>
					<uni-th align="center" width="110">类型</uni-th>
					<uni-th align="left" width="380">内容</uni-th>
					<uni-th align="center" width="140">联系方式</uni-th>
					<uni-th align="center" width="140">提交时间</uni-th>
					<uni-th align="center" width="90">状态</uni-th>
					<uni-th align="center" width="130">操作</uni-th>
				</uni-tr>
				<uni-tr v-for="item in list" :key="item._id">
					<uni-td align="center">
						<text class="fb-type">{{ item.type_text || item.type }}</text>
					</uni-td>
					<uni-td align="left">
						<text class="fb-content" @click="toggle(item._id)">{{ expanded[item._id] ? item.content : preview(item.content) }}</text>
					</uni-td>
					<uni-td align="center">
						<text v-if="item.contact" class="fb-contact">{{ item.contact }}</text>
						<text v-else class="fb-none">未留</text>
					</uni-td>
					<uni-td align="center">{{ item.time_text || '-' }}</uni-td>
					<uni-td align="center">
						<text :class="['fb-tag', 'fb-' + item.status]">{{ item.status === 'done' ? '已处理' : '待处理' }}</text>
					</uni-td>
					<uni-td align="center">
						<button class="uni-button" size="mini" :type="item.status === 'done' ? 'default' : 'primary'"
							@click="toggleDone(item)">
							{{ item.status === 'done' ? '恢复待处理' : '标记已处理' }}
						</button>
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
				tabs: [
					{ text: '待处理', value: 'new' },
					{ text: '已处理', value: 'done' },
					{ text: '全部', value: '' }
				],
				status: 'new',
				list: [],
				expanded: {},
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
					const res = await api().listFeedback({
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
			/** 长内容先截断，点一下展开（反馈里常有整段订单描述） */
			preview(text) {
				const s = String(text || '')
				return s.length > 80 ? s.slice(0, 80) + '…（点开看全文）' : s
			},
			toggle(id) {
				this.expanded = { ...this.expanded, [id]: !this.expanded[id] }
			},
			toggleDone(item) {
				const next = item.status === 'done' ? 'new' : 'done'
				uni.showModal({
					title: next === 'done' ? '标记已处理' : '恢复待处理',
					content: next === 'done' ? '确认这条反馈已经处理完了？' : '把这条放回待处理列表？',
					success: async (r) => {
						if (!r.confirm) return
						try {
							const res = await api().markFeedback({ id: item._id, status: next })
							if (res.code !== 0) throw new Error(res.msg)
							uni.showToast({ title: res.msg || '已更新', icon: 'success' })
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message || '操作失败', icon: 'none' })
						}
					}
				})
			}
		}
	}
</script>

<style lang="scss">
	.status-tabs { display: flex; gap: 8px; }
	.status-tab {
		padding: 6px 14px;
		border-radius: 16px;
		background: #f2f2f7;
		color: #4a4a4a;
		font-size: 13px;
		cursor: pointer;
	}
	.status-tab.active { background: #007aff; color: #fff; }

	.fb-type { font-size: 12px; color: #4a4a4a; }
	.fb-content {
		display: block;
		font-size: 13px;
		color: #1c1c1e;
		line-height: 1.6;
		word-break: break-all;
		cursor: pointer;
	}
	.fb-contact { font-family: Menlo, Consolas, monospace; font-size: 12px; color: #1c1c1e; }
	.fb-none { font-size: 12px; color: #b0b6c0; }
	.fb-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
	.fb-new { background: #fff7e6; color: #ad6800; }
	.fb-done { background: #e8f8ee; color: #1a7f37; }
</style>
