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

			<!-- 学籍截图：审核要核对「学号+姓名」是不是本人，光填数字不够 -->
			<view class="field">
				<text class="label">
					学籍信息截图
					<text class="req" v-if="!edit">必填</text>
				</text>
				<view class="shot-tip">
					<text class="shot-step">① 打开「教学一体化平台」<text class="shot-url" @click.stop="copyUrl">{{ platformUrl }}</text></text>
					<text class="shot-step">② 信息查询 → 查询个人信息</text>
					<text class="shot-step">③ 截图要求：能同时看到<text class="shot-em">学号</text>和<text class="shot-em">姓名</text></text>
				</view>
				<view class="shot-box" @click="pickProof">
					<image v-if="proofPreview" :src="proofPreview" class="shot-img" mode="aspectFit" />
					<view v-else class="shot-empty">
						<text class="shot-plus">{{ uploading ? '…' : '＋' }}</text>
						<text class="shot-text">{{ uploading ? '上传中' : '上传截图' }}</text>
					</view>
				</view>
				<text class="shot-hint" v-if="proofPreview && !uploading" @click.stop="pickProof">点图可以换一张</text>
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
	</view>
</template>

<script>
	import { mapGetters, mapActions } from 'vuex'
	import { parseStudentNo, errText } from '@/common/rider-util.js'
	import { uploadImage, thumbDataUri } from '@/common/image.js'

	const PLATFORM_URL = 'https://jwmk.zcmu.edu.cn/jwglxt/'

	export default {
		data() {
			return {
				agreed: false,
				submitting: false,
				edit: false,
				form: { real_name: '', student_no: '', mobile: '' },
				platformUrl: PLATFORM_URL,
				/** 学籍截图：fileID 给后端存，thumb 给后台审核时直接看 */
				proofFileID: '',
				proofThumb: '',
				proofPreview: '',
				uploading: false
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
			// 已经传过截图的（改资料时）直接把旧的显示出来，不用重传
			if (!this.proofPreview && this.profile.student_proof_thumb) {
				this.proofPreview = this.profile.student_proof_thumb
				this.proofThumb = this.profile.student_proof_thumb
				this.proofFileID = this.profile.student_proof || ''
			}
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

			copyUrl() {
				uni.setClipboardData({
					data: PLATFORM_URL,
					success: () => uni.showToast({ title: '网址已复制，去浏览器打开', icon: 'none' })
				})
			},

			/**
			 * 选图 → 压缩 → 上传。
			 * 缩略图（1080px / 约 120KB 以内）一起传：后台审核页面直接画它，
			 * 不用再走云存储临时链接（那个会过期、还要配域名）。
			 */
			pickProof() {
				if (this.uploading) return
				uni.chooseImage({
					count: 1,
					sizeType: ['compressed'],
					sourceType: ['album', 'camera'],
					success: async (img) => {
						const path = img.tempFilePaths && img.tempFilePaths[0]
						if (!path) return
						this.proofPreview = path
						this.uploading = true
						try {
							const fileID = await uploadImage(path, {
								role: 'rider',
								dir: 'student-proof',
								width: 1200,
								quality: 70
							})
							const thumb = await thumbDataUri(path, { width: 1080, maxLen: 150000 })
							this.proofFileID = fileID
							this.proofThumb = thumb
							uni.showToast({ title: '截图已上传', icon: 'success' })
						} catch (e) {
							this.proofFileID = ''
							this.proofThumb = ''
							this.proofPreview = ''
							uni.showToast({ title: (e && e.message) || '上传失败，重试一次', icon: 'none' })
						} finally {
							this.uploading = false
						}
					},
					fail: () => {}
				})
			},

			async submit() {
				if (this.submitting) return
				const realName = String(this.form.real_name || '').trim()
				const studentNo = this.student.digits
				const mobile = String(this.form.mobile || '').trim()

				if (!this.agreed) return uni.showToast({ title: '请先同意协议', icon: 'none' })
				if (realName.length < 2) return uni.showToast({ title: '请填写真实姓名', icon: 'none' })
				if (!this.student.valid) return uni.showToast({ title: '学号应为 15 位数字', icon: 'none' })
				if (!/^1\d{10}$/.test(mobile)) return uni.showToast({ title: '请填写 11 位手机号', icon: 'none' })
				if (this.uploading) return uni.showToast({ title: '截图还在上传，稍等一下', icon: 'none' })
				// 首次申请必须带截图：审核要看「学号 + 姓名」是不是本人
				if (!this.edit && !this.proofFileID) return uni.showToast({ title: '请上传学籍信息截图', icon: 'none' })

				this.submitting = true
				try {
					const proofPatch = this.proofFileID
						? { student_proof: this.proofFileID, student_proof_thumb: this.proofThumb }
						: {}
					// 修改模式：只更新认证信息，不重新走审核
					if (this.edit) {
						await this.updateRiderInfo({ real_name: realName, student_no: studentNo, mobile, ...proofPatch })
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
					const res = await this.applyRider({ real_name: realName, student_no: studentNo, mobile, ...proofPatch })
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

	/* 学籍截图 */
	.req { font-size: 22rpx; color: #ff3b30; margin-left: 6rpx; }

	.shot-tip {
		background: #f7f8fa;
		border-radius: 14rpx;
		padding: 16rpx 20rpx;
		margin-bottom: 16rpx;
	}

	.shot-step {
		display: block;
		font-size: 23rpx;
		color: #6e6e73;
		line-height: 1.9;
	}

	.shot-url { color: #007aff; }
	.shot-em { color: #1c1c1e; font-weight: 600; }

	.shot-box {
		width: 100%;
		height: 320rpx;
		border-radius: 16rpx;
		background: #f7f8fa;
		border: 2rpx dashed #d1d1d6;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.shot-img { width: 100%; height: 100%; }

	.shot-empty { display: flex; flex-direction: column; align-items: center; }
	.shot-plus { font-size: 56rpx; color: #b0b0b5; line-height: 1; }
	.shot-text { margin-top: 10rpx; font-size: 24rpx; color: #8e8e93; }

	.shot-hint {
		display: block;
		margin-top: 10rpx;
		font-size: 22rpx;
		color: #007aff;
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
</style>
