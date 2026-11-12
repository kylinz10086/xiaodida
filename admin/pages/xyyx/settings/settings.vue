<template>
	<view class="fix-top-window">
		<view class="uni-header">
			<view class="uni-group">
				<text class="tip-text">改了立即生效，不用重新部署</text>
				<button class="uni-button" type="default" size="mini" @click="load">刷新</button>
				<button class="uni-button" type="warn" size="mini" @click="reset">恢复默认</button>
				<button class="uni-button" type="primary" size="mini" :loading="saving" @click="save">保存</button>
			</view>
		</view>

		<view class="uni-container">
			<view class="card">
				<view class="card-title">费率</view>

				<view class="field">
					<view class="field-label">
						<text class="label">平台抽佣比例</text>
						<text class="hint">骑手收入 = 订单金额 × (1 − 该比例)。当前 8%</text>
					</view>
					<view class="field-input">
						<input class="input" type="digit" v-model="form.commissionPercent" placeholder="8" />
						<text class="unit">%</text>
					</view>
				</view>

				<view class="field">
					<view class="field-label">
						<text class="label">退款扣除费率</text>
						<text class="hint">填 0 = 全额原路退回（当前产品选择）；填 0.6 表示退 99.4%</text>
					</view>
					<view class="field-input">
						<input class="input" type="digit" v-model="form.refundFeePercent" placeholder="0" />
						<text class="unit">%</text>
					</view>
				</view>

				<view class="preview">
					<text class="preview-label">换算预览</text>
					<text class="preview-text">10 元订单：用户实付 10.00，取消后退回 {{ preview(10) }}</text>
				</view>
			</view>

			<view class="card">
				<view class="card-title">订单与结算</view>

				<view class="field">
					<view class="field-label">
						<text class="label">订单金额区间（元）</text>
						<text class="hint">低于/超过会被服务端拒绝</text>
					</view>
					<view class="field-input wide">
						<input class="input short" type="digit" v-model="form.minOrderYuan" placeholder="1" />
						<text class="unit">—</text>
						<input class="input short" type="digit" v-model="form.maxOrderYuan" placeholder="1000" />
					</view>
				</view>

				<view class="field">
					<view class="field-label">
						<text class="label">提现下限（元）</text>
						<text class="hint">骑手单笔提现的最低金额</text>
					</view>
					<view class="field-input">
						<input class="input" type="digit" v-model="form.minWithdrawYuan" placeholder="10" />
						<text class="unit">元</text>
					</view>
				</view>

				<view class="field">
					<view class="field-label">
						<text class="label">送达即完成</text>
						<text class="hint">开：骑手点送达直接完成并结算；关：等用户确认/超时自动确认</text>
					</view>
					<view class="field-input">
						<switch :checked="form.autoSettleOnDeliver" @change="onSettleChange" color="#007AFF" />
					</view>
				</view>

				<view class="field">
					<view class="field-label">
						<text class="label">自动确认时间（小时）</text>
						<text class="hint">「送达即完成」关闭时才生效</text>
					</view>
					<view class="field-input">
						<input class="input" type="number" v-model="form.autoConfirmHours" placeholder="24" />
						<text class="unit">小时</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">风控</view>

				<view class="field">
					<view class="field-label">
						<text class="label">抢单频率</text>
						<text class="hint">同一骑手每分钟最多抢几单</text>
					</view>
					<view class="field-input">
						<input class="input" type="number" v-model="form.grabPerMinute" placeholder="30" />
						<text class="unit">单/分钟</text>
					</view>
				</view>

				<view class="field">
					<view class="field-label">
						<text class="label">放弃订单上限</text>
						<text class="hint">同一骑手每天最多放弃几单</text>
					</view>
					<view class="field-input">
						<input class="input" type="number" v-model="form.abandonPerDay" placeholder="8" />
						<text class="unit">单/天</text>
					</view>
				</view>
			</view>

			<view class="card">
				<view class="card-title">展示信息</view>

				<view class="field">
					<view class="field-label">
						<text class="label">客服电话</text>
						<text class="hint">留空则不展示</text>
					</view>
					<view class="field-input">
						<input class="input" type="text" v-model="form.supportMobile" placeholder="例如 0571-88888888" />
					</view>
				</view>

				<view class="field column">
					<view class="field-label">
						<text class="label">公告</text>
						<text class="hint">留空表示正常营业；填了会展示在首页</text>
					</view>
					<textarea class="textarea" v-model="form.notice" maxlength="200" placeholder="例如：今日 22:00 后暂停接单" />
				</view>
			</view>

			<view class="footer-actions">
				<button class="uni-button" type="primary" size="mini" :loading="saving" @click="save">保存并生效</button>
			</view>
		</view>
	</view>
</template>

<script>
	const api = () => uniCloud.importObject('xyyx-admin', { customUI: true })

	export default {
		data() {
			return {
				loading: false,
				saving: false,
				/** 后台用「百分数」展示，提交时再换算 */
				form: {
					commissionPercent: '8',
					refundFeePercent: '0',
					minOrderYuan: '1',
					maxOrderYuan: '1000',
					minWithdrawYuan: '10',
					autoSettleOnDeliver: true,
					autoConfirmHours: '24',
					grabPerMinute: '30',
					abandonPerDay: '5',
					supportMobile: '',
					notice: ''
				}
			}
		},
		onLoad() {
			this.load()
		},
		methods: {
			async load() {
				this.loading = true
				try {
					const res = await api().getSettings()
					if (res.code !== 0) throw new Error(res.msg)
					const c = (res.data && res.data.current) || {}
					this.form = {
						commissionPercent: this.pct(c.commissionRate),
						refundFeePercent: this.pct(c.refundFeeRate),
						minOrderYuan: String(c.minOrderYuan),
						maxOrderYuan: String(c.maxOrderYuan),
						minWithdrawYuan: String(c.minWithdrawYuan),
						autoSettleOnDeliver: !!c.autoSettleOnDeliver,
						autoConfirmHours: String(c.autoConfirmHours),
						grabPerMinute: String(c.grabPerMinute),
						abandonPerDay: String(c.abandonPerDay),
						supportMobile: c.supportMobile || '',
						notice: c.notice || ''
					}
				} catch (e) {
					uni.showToast({ title: e.message || '加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			/** 0.05 -> "5"，0 -> "0" */
			pct(rate) {
				const n = Number(rate)
				if (!Number.isFinite(n)) return '0'
				return String(Number((n * 100).toFixed(3)))
			},
			onSettleChange(e) {
				this.form.autoSettleOnDeliver = !!e.detail.value
			},
			preview(yuan) {
				const rate = Number(this.form.refundFeePercent) || 0
				const cents = Math.round(yuan * 100)
				const fee = Math.min(Math.round(cents * rate / 100), Math.max(0, cents - 1))
				return ((cents - fee) / 100).toFixed(2)
			},
			num(v, def) {
				const n = Number(v)
				return Number.isFinite(n) ? n : def
			},
			async save() {
				if (this.saving) return
				const cRate = this.num(this.form.commissionPercent, 8) / 100
				const rRate = this.num(this.form.refundFeePercent, 0) / 100
				if (cRate < 0 || cRate > 0.5) {
					uni.showToast({ title: '抽佣比例应在 0~50%', icon: 'none' })
					return
				}
				if (rRate < 0 || rRate > 0.2) {
					uni.showToast({ title: '退款费率应在 0~20%', icon: 'none' })
					return
				}
				const minY = this.num(this.form.minOrderYuan, 1)
				const maxY = this.num(this.form.maxOrderYuan, 1000)
				if (minY >= maxY) {
					uni.showToast({ title: '最低金额要小于最高金额', icon: 'none' })
					return
				}
				uni.showModal({
					title: '确认修改',
					content: `抽佣 ${this.form.commissionPercent}%、退款扣费 ${this.form.refundFeePercent}%，
					保存后立即对所有新订单生效。`,
					success: async (r) => {
						if (!r.confirm) return
						this.saving = true
						try {
							const res = await api().updateSettings({
								commissionRate: cRate,
								refundFeeRate: rRate,
								minOrderYuan: minY,
								maxOrderYuan: maxY,
								minWithdrawYuan: this.num(this.form.minWithdrawYuan, 10),
								autoSettleOnDeliver: !!this.form.autoSettleOnDeliver,
								autoConfirmHours: Math.round(this.num(this.form.autoConfirmHours, 24)),
								grabPerMinute: Math.round(this.num(this.form.grabPerMinute, 30)),
								abandonPerDay: Math.round(this.num(this.form.abandonPerDay, 5)),
								supportMobile: this.form.supportMobile || '',
								notice: this.form.notice || ''
							})
							if (res.code !== 0) throw new Error(res.msg)
							uni.showToast({ title: '已保存，立即生效', icon: 'success' })
							this.load()
						} catch (e) {
							uni.showToast({ title: e.message || '保存失败', icon: 'none' })
						} finally {
							this.saving = false
						}
					}
				})
			},
			reset() {
				uni.showModal({
					title: '恢复默认',
					content: '抽佣 8%、退款全额退（费率 0）、金额 1-1000 元…确认恢复？',
					success: async (r) => {
						if (!r.confirm) return
						try {
							const res = await api().resetSettings()
							if (res.code !== 0) throw new Error(res.msg)
							uni.showToast({ title: '已恢复默认', icon: 'success' })
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
	.tip-text {
		font-size: 12px;
		color: #8a8a8a;
		margin-right: 8px;
	}

	.card {
		background: #fff;
		border-radius: 8px;
		padding: 18px 20px;
		margin-bottom: 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, .04);
	}

	.card-title {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 12px;
		color: #1c1c1e;
	}

	.field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid #f4f4f6;

		&:last-child {
			border-bottom: none;
		}

		&.column {
			flex-direction: column;
			align-items: stretch;
		}
	}

	.field-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.label {
		font-size: 14px;
		color: #1c1c1e;
	}

	.hint {
		font-size: 12px;
		color: #8a8a8a;
		line-height: 1.4;
	}

	.field-input {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;

		&.wide {
			gap: 8px;
		}
	}

	.input {
		width: 90px;
		height: 32px;
		border: 1px solid #dcdfe6;
		border-radius: 6px;
		padding: 0 10px;
		font-size: 14px;
		text-align: right;

		&.short {
			width: 80px;
		}
	}

	.unit {
		font-size: 13px;
		color: #8a8a8a;
		min-width: 34px;
	}

	.textarea {
		width: 100%;
		height: 76px;
		border: 1px solid #dcdfe6;
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 13px;
		line-height: 1.5;
		margin-top: 8px;
	}

	.preview {
		margin-top: 8px;
		background: #f7f8fa;
		border-radius: 6px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-label {
		font-size: 12px;
		color: #8a8a8a;
	}

	.preview-text {
		font-size: 13px;
		color: #007aff;
	}

	.footer-actions {
		display: flex;
		justify-content: flex-end;
		padding-bottom: 24px;
	}
</style>
