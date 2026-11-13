<template>
	<view class="page">
		<!-- 已通过 / 审核中 / 已拒绝：都先给一句明确提示（edit 模式下直接显示表单） -->
		<view class="card status-card" v-if="!edit && riderStatus === 2">
			<view class="status-badge">已通过</view>
			<text class="status-title">你已经是认证骑手</text>
			<text class="status-desc">可以直接去抢单大厅接单了。学号/姓名填错可以点下面修改。</text>
			<view class="btn btn-primary" @click="goWorkbench">去抢单</view>
			<view class="btn btn-ghost" style="margin-top:16rpx" @click="edit = true">修改认证信息</view>
		</view>

		<view class="card status-card" v-else-if="!edit && riderStatus === 1">
			<view class="status-badge pending">审核中</view>
			<text class="status-title">申请已提交</text>
			<text class="status-desc">审核一般需要 1-2 个工作日，通过后就能在「抢单大厅」接单。</text>
			<view class="btn btn-ghost" @click="goCenter">返回骑手中心</view>
		</view>

		<view class="card" v-else>
			<view class="card-title">
				<text>{{ edit ? '修改认证信息' : '申请成为骑手' }}</text>
				<text class="card-extra">仅限浙中医大在校生</text>
			</view>
			<text class="tip">信息只用于平台审核，不会展示给其他用户。</text>

			<view class="field">
				<text class="label">真实姓名</text>
				<input class="input" v-model="form.real_name" placeholder="与学号一致" maxlength="20" />
			</view>

			<view class="field">
				<text class="label">学号</text>
				<!-- 用 number 键盘，并且只让输入数字；15 位完整存在 form.student_no 里 -->
				<input class="input" v-model="form.student_no" type="number" placeholder="15 位数字学号"
					maxlength="15" />
				<view class="stu-tip" :class="{ ok: student.valid }">
					<text v-if="student.valid">15 位 · {{ student.year }} {{ student.major }} {{ student.classNo }}</text>
					<text v-else>还需输入 {{ 15 - student.digits.length > 0 ? 15 - student.digits.length : 0 }} 位（共 15 位）</text>
				</view>
			</view>

			<view class="field">
				<text class="label">手机号</text>
				<input class="input" v-model="form.mobile" type="number" maxlength="11" placeholder="方便同学联系你" />
			</view>

			<view class="agree" @click="agreed = !agreed" v-if="!edit">
				<view class="checkbox" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</view>
				<text class="agree-text">
					我已阅读并同意
					<text class="agree-link" @click.stop="openDoc('runner-agreement')">《跑腿服务协议》</text>、
					<text class="agree-link" @click.stop="openDoc('guidelines')">《骑手准则》</text>与
					<text class="agree-link" @click.stop="openDoc('privacy-policy')">《隐私政策》</text>
				</text>
			</view>

			<view class="btn btn-primary" :class="{ disabled: submitting }" @click="submit">
				{{ submitting ? '提交中…' : (edit ? '保存修改' : (riderStatus === 3 ? '重新提交申请' : '提交申请')) }}
			</view>

			<view class="reject" v-if="riderStatus === 3">
				<text class="reject-title">上次审核未通过</text>
				<text class="reject-reason">{{ profile.rider_reject_reason || '可修改资料后重新提交' }}</text>
			</view>
		</view>

		<view class="tips">
			<text class="tips-title">学号怎么看</text>
			<text class="tips-item">15 位学号 = 4 位入学学年 + 6 位学院专业号 + 5 位班级学号</text>
			<text class="tips-item">例如 202512211404009 → 2025 学年 / 122114 / 04009</text>
		</view>
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { parseStudentNo, errText } from '@/common/rider-util.js'

	export default {
		data() {
			return {
				agreed: false,
				submitting: false,
				edit: false,
				form: { real_name: '', student_no: '', mobile: '' }
			}
		},
		computed: {
			...mapGetters('rider', ['riderStatus', 'profile']),
			student() {
				return parseStudentNo(this.form.student_no)
			}
		},
		onLoad(q) {
			// ?edit=1：已经是骑手时用来补全/修正学号和姓名
			this.edit = !!(q && (q.edit === '1' || q.edit === 1 || q.edit === true))
		},
		onShow() {
			// 已填过的资料回填，避免被拒绝或修改时要全部手打
			if (this.profile.mobile && !this.form.mobile) this.form.mobile = this.profile.mobile
			if (this.profile.real_name && !this.form.real_name) this.form.real_name = this.profile.real_name
			if (this.profile.studentNoDigits && !this.form.student_no) this.form.student_no = this.profile.studentNoDigits
			// 修改模式下默认视为已同意过协议
			if (this.edit) this.agreed = true
		},
		methods: {
			...mapActions('rider', ['applyRider', 'acceptAgreement', 'fetchProfile', 'updateRiderInfo']),

			openDoc(name) {
				uni.navigateTo({ url: `/pages/xyyx/agreement/${name}` })
			},

			goWorkbench() { uni.navigateTo({ url: '/pages/rider/workbench' }) },
			goCenter() { uni.navigateBack() },

			async submit() {
				if (this.submitting) return
				const realName = String(this.form.real_name || '').trim()
				const studentNo = this.student.digits
				const mobile = String(this.form.mobile || '').trim()

				if (!this.agreed) return uni.showToast({ title: '请先同意协议', icon: 'none' })
				if (realName.length < 2) return uni.showToast({ title: '请填写真实姓名', icon: 'none' })
				if (!this.student.valid) return uni.showToast({ title: '学号应为 15 位数字', icon: 'none' })
				if (!/^1\d{10}$/.test(mobile)) return uni.showToast({ title: '请填写 11 位手机号', icon: 'none' })

				this.submitting = true
				try {
					// 修改模式：只更新认证信息，不重新走审核
					if (this.edit) {
						await this.updateRiderInfo({ real_name: realName, student_no: studentNo, mobile })
						uni.showModal({
							title: '已保存',
							content: `学号已完整保存：${this.student.grouped}`,
							showCancel: false,
							confirmText: '知道了',
							confirmColor: '#007AFF',
							success: () => uni.navigateBack()
						})
						return
					}

					await this.acceptAgreement()
					const res = await this.applyRider({ real_name: realName, student_no: studentNo, mobile })
					const auto = res && res.data && res.data.auto
					uni.showModal({
						title: auto ? '已通过审核' : '提交成功',
						content: auto
							? '你是平台第一位骑手，已自动通过审核，可以直接去抢单了。'
							: '申请已提交，审核一般 1-2 个工作日，结果会在小程序里通知你。',
						showCancel: false,
						confirmText: auto ? '去抢单' : '知道了',
						confirmColor: '#007AFF',
						success: () => {
							if (auto) uni.navigateTo({ url: '/pages/rider/workbench' })
							else uni.navigateBack()
						}
					})
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
		padding: 24rpx;
		min-height: 100vh;
		background: #f2f2f7;
	}

	.card { padding: 30rpx; }

	.status-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 48rpx 30rpx;
	}

	.status-badge {
		font-size: 22rpx;
		font-weight: 600;
		color: #12a150;
		background: rgba(18, 161, 80, 0.10);
		padding: 6rpx 20rpx;
		border-radius: 20rpx;
		margin-bottom: 6rpx;

		&.pending { color: #b26a00; background: rgba(255, 149, 0, 0.12); }
	}
	.status-title { margin-top: 18rpx; font-size: 32rpx; font-weight: 700; color: #1c1c1e; }
	.status-desc {
		margin: 12rpx 0 30rpx;
		font-size: 25rpx;
		color: #8e8e93;
		text-align: center;
		line-height: 1.6;
	}

	.tip { display: block; margin-bottom: 26rpx; font-size: 24rpx; color: #8e8e93; line-height: 1.6; }

	.field { margin-bottom: 26rpx; }
	.label { display: block; font-size: 26rpx; color: #6e6e73; margin-bottom: 12rpx; }

	.input {
		height: 88rpx;
		background: #f7f8fa;
		border-radius: 16rpx;
		padding: 0 22rpx;
		font-size: 29rpx;
	}

	.stu-tip {
		margin-top: 10rpx;
		font-size: 22rpx;
		color: #ff9500;

		&.ok { color: #34c759; }
	}




	.agree { display: flex; align-items: flex-start; margin: 6rpx 0 28rpx; }

	.checkbox {
		flex-shrink: 0;
		width: 34rpx;
		height: 34rpx;
		border-radius: 8rpx;
		border: 2rpx solid #c7c7cc;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22rpx;
		color: #fff;
		margin: 2rpx 12rpx 0 0;

		&.checked { background: #007aff; border-color: #007aff; }
	}

	.agree-text { flex: 1; font-size: 23rpx; color: #6e6e73; line-height: 1.6; }
	.agree-link { color: #007aff; }

	.reject { margin-top: 22rpx; background: #ffecec; border-radius: 14rpx; padding: 16rpx 20rpx; }
	.reject-title { font-size: 25rpx; color: #c62828; font-weight: 600; }
	.reject-reason { display: block; margin-top: 6rpx; font-size: 23rpx; color: #c62828; }

	.tips { padding: 28rpx 12rpx; display: flex; flex-direction: column; gap: 8rpx; }
	.tips-title { font-size: 25rpx; font-weight: 700; color: #1c1c1e; }
	.tips-item { font-size: 23rpx; color: #8e8e93; line-height: 1.6; }
</style>
