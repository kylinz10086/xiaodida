<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<view class="uni-group">
				<input class="uni-search" type="text" v-model="keyword" @confirm="search"
					placeholder="搜索昵称 / 手机号 / 用户名 / 学号" />
				<button class="uni-button" type="default" size="mini" @click="search">搜索</button>
				<button class="uni-button" type="primary" size="mini" @click="load">刷新</button>
			</view>
		</view>

		<view class="uni-container">
			<view class="stat-row">
				<view class="stat-card">
					<text class="stat-num">{{ total }}</text>
					<text class="stat-label">用户总数</text>
				</view>
				<view class="stat-card">
					<text class="stat-num">{{ riderCount }}</text>
					<text class="stat-label">已通过骑手</text>
				</view>
				<view class="stat-card">
					<text class="stat-num">{{ pendingCount }}</text>
					<text class="stat-label">待审核骑手</text>
				</view>
			</view>

			<uni-table :loading="loading" border stripe emptyText="暂无用户数据">
				<uni-tr>
					<uni-th align="center" width="120">昵称</uni-th>
					<uni-th align="center" width="140">用户名</uni-th>
					<uni-th align="center" width="130">手机号</uni-th>
					<uni-th align="center" width="90">角色</uni-th>
					<uni-th align="center" width="100">骑手状态</uni-th>
					<uni-th align="center" width="130">真实姓名</uni-th>
					<uni-th align="center" width="180">学号</uni-th>
					<uni-th align="center" width="170">注册时间</uni-th>
					<uni-th align="center" width="100">操作</uni-th>
				</uni-tr>
				<uni-tr v-for="item in list" :key="item._id">
					<uni-td align="center">{{ item.nickname || '-' }}</uni-td>
					<uni-td align="center">{{ item.username || '-' }}</uni-td>
					<uni-td align="center">{{ item.mobile || '-' }}</uni-td>
					<uni-td align="center">{{ item.roleText }}</uni-td>
					<uni-td align="center">
						<text :class="['rider-tag', 'rider-' + item.rider_status]">{{ item.rider_status_text }}</text>
					</uni-td>
					<uni-td align="center">{{ item.real_name || '-' }}</uni-td>
					<uni-td align="center">
						<view v-if="item.student_no" class="stu-cell">
							<text class="stu-no">{{ item.student_no }}</text>
							<text class="stu-parts">{{ item.student_no_display }}</text>
						</view>
						<text v-else class="stu-bad">-</text>
					</uni-td>
					<uni-td align="center">{{ formatTime(item.register_date) }}</uni-td>
					<uni-td align="center">
						<button class="uni-button" size="mini" type="primary" @click="openDetail(item)">详情</button>
					</uni-td>
				</uni-tr>
			</uni-table>

			<view class="uni-pagination-box">
				<uni-pagination show-icon :page-size="pageSize" v-model="page" :total="total"
					@change="onPageChanged" />
			</view>
		</view>

		<uni-popup ref="detailPopup" type="center">
			<view class="detail-box" v-if="detail">
				<view class="detail-title">用户详情</view>
				<view class="detail-row"><text class="detail-label">用户 ID</text><text>{{ detail._id }}</text></view>
				<view class="detail-row"><text class="detail-label">昵称</text><text>{{ detail.nickname || '-' }}</text></view>
				<view class="detail-row"><text class="detail-label">用户名</text><text>{{ detail.username || '-' }}</text></view>
				<view class="detail-row"><text class="detail-label">手机号</text><text>{{ detail.mobile || '-' }}</text></view>
				<view class="detail-row"><text class="detail-label">角色</text><text>{{ detail.roleText }}</text></view>
				<view class="detail-row"><text class="detail-label">骑手状态</text><text>{{ detail.rider_status_text }}</text></view>
				<view class="detail-row"><text class="detail-label">真实姓名</text><text>{{ detail.real_name || '-' }}</text></view>
				<view class="detail-row">
					<text class="detail-label">学号</text>
					<view class="detail-stu">
						<text v-if="detail.student_no" class="stu-no">{{ detail.student_no }}</text>
						<text v-else>-</text>
						<text v-if="detail.student_no_display" class="stu-parts">{{ detail.student_no_display }}</text>
					</view>
				</view>
				<view class="detail-row"><text class="detail-label">注册时间</text><text>{{ formatTime(detail.register_date) }}</text></view>
				<view class="detail-row"><text class="detail-label">最后登录</text><text>{{ formatTime(detail.last_login_date) }}</text></view>
				<view class="detail-actions">
					<button class="uni-button" size="mini" @click="closeDetail">关闭</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
	const api = () => uniCloud.importObject('xyyx-admin', { customUI: true })

	export default {
		data() {
			return {
				list: [],
				total: 0,
				riderCount: 0,
				pendingCount: 0,
				page: 1,
				pageSize: 20,
				keyword: '',
				loading: false,
				detail: null
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
					const res = await api().listUsers({
						page: this.page,
						pageSize: this.pageSize,
						keyword: this.keyword
					})
					if (res.code !== 0) throw new Error(res.msg)
					this.list = res.data.list || []
					this.total = res.data.total || 0
					const stat = await api().overview()
					if (stat.code === 0) {
						this.riderCount = stat.data.riders || 0
						this.pendingCount = stat.data.pendingRiders || 0
					}
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			search() {
				this.page = 1
				this.load()
			},
			onPageChanged(e) {
				this.page = e.current
				this.load()
			},
			openDetail(item) {
				this.detail = item
				this.$refs.detailPopup.open()
			},
			closeDetail() {
				this.$refs.detailPopup.close()
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
		font-size: 26px;
		font-weight: 700;
		color: #007aff;
	}
	.stat-label {
		margin-top: 4px;
		color: #8a8a8a;
		font-size: 13px;
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
	.detail-box {
		width: 560px;
		max-width: 90vw;
		background: #fff;
		border-radius: 10px;
		padding: 24px;
	}
	.detail-title {
		font-size: 18px;
		font-weight: 600;
		margin-bottom: 16px;
	}
	.detail-row {
		display: flex;
		padding: 8px 0;
		border-bottom: 1px solid #f2f2f7;
		font-size: 14px;
		word-break: break-all;
	}
	.detail-label {
		width: 90px;
		color: #8a8a8a;
		flex-shrink: 0;
	}
	.detail-actions {
		margin-top: 20px;
		text-align: right;
	}
	/* 学号：等宽 + 不换行，15 位完整显示，下面补分段 */
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
	.detail-stu {
		display: flex;
		flex-direction: column;
	}
</style>
