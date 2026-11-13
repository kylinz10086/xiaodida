<template>
	<view class="alg-page">
		<view class="alg-head">
			<text class="alg-title">算法公示</text>
			<text class="alg-sub">任务大厅的排序与接单撮合说明</text>
		</view>

		<view class="alg-block" v-for="(section, index) in sections" :key="index">
			<text class="alg-h">{{ section.h }}</text>
			<text class="alg-p" v-for="(p, i) in section.ps" :key="i">{{ p }}</text>
		</view>

		<view class="alg-foot">
			<text class="alg-tip">生效日期：2026 年 11 月 11 日</text>
			<text class="alg-tip">如对排序或撮合结果有疑问，可通过「我的-意见反馈」反馈，我们会在 15 个工作日内答复。</text>
		</view>
	</view>
</template>

<script>
	// 只写平台真实在做的事：没有个性化推荐、没有竞价排名，
	// 大厅就是「本校 + 待接单」的全量列表，排序规则由用户自己选。
	const SECTIONS = [
		{
			h: '一、公示范围',
			ps: [
				'本公示说明校递达小程序「任务大厅」如何决定任务展示顺序，以及任务如何被接单。',
				'平台不提供个性化内容推荐，也没有广告或竞价排名位。'
			]
		},
		{
			h: '二、任务如何被筛选',
			ps: [
				'大厅只展示同时满足以下条件的任务：属于浙江中医药大学范围、状态为「待接单」、未被取消或删除。',
				'超出校园范围的任务不会展示，平台不做跨校、同城配送。'
			]
		},
		{
			h: '三、排序规则',
			ps: [
				'用户端首页默认按发布时间倒序，也可以切换「按价格」；再次点击同一项可切换升序 / 降序。',
				'骑手端大厅默认按发布时间倒序；开启定位后可以切到「距离最近」，按取件点到你的直线距离排序。',
				'排序只使用订单本身的信息（发布时间、悬赏金额、取件点坐标）和你的实时定位，不使用浏览记录、消费能力、性别、年龄等信息做个性化排序。'
			]
		},
		{
			h: '四、接单如何撮合',
			ps: [
				'平台不做算法派单，骑手在大厅自行选择任务并点击「接单」。',
				'接单遵循先到先得：服务端以原子操作把任务状态从「待接单」改为「进行中」，只有第一个成功的请求生效，其余会提示「已被接走」。',
				'接单后骑手可以看到你的完整手机号，仅用于这一单的取送联系；订单完成或取消后不再展示。骑手不应保存、转发或用于其他用途。'
			]
		},
		{
			h: '五、不使用哪些数据',
			ps: [
				'平台不读取你的通讯录、短信、相册、聊天记录与剪贴板。',
				'位置信息只在你选择取件 / 送达地点和计算路线时使用，不参与任务排序。',
				'不存在通过付费提高任务曝光的功能。'
			]
		},
		{
			h: '六、人工干预',
			ps: [
				'涉及违法违规、虚假交易、欺诈风险的任务，平台审核后可下架或隐藏，该处理不受排序规则影响。',
				'除上述合规处置外，平台不会人为调整单个用户看到的任务顺序。'
			]
		}
	]

	export default {
		data() {
			return {
				sections: SECTIONS
			}
		}
	}
</script>

<style lang="scss">
	.alg-page {
		min-height: 100vh;
		background: #F2F2F7;
		padding: 24rpx 24rpx 60rpx;
	}

	.alg-head {
		background: #fff;
		border-radius: 24rpx;
		padding: 36rpx;
		margin-bottom: 20rpx;
	}

	.alg-title {
		font-size: 40rpx;
		font-weight: 700;
		color: #1C1C1E;
	}

	.alg-sub {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #8E8E93;
	}

	.alg-block {
		background: #fff;
		border-radius: 24rpx;
		padding: 32rpx 36rpx;
		margin-bottom: 20rpx;
	}

	.alg-h {
		display: block;
		font-size: 30rpx;
		font-weight: 600;
		color: #1C1C1E;
		margin-bottom: 14rpx;
	}

	.alg-p {
		display: block;
		font-size: 28rpx;
		line-height: 1.75;
		color: #3A3A3C;
		margin-bottom: 10rpx;

		&:last-child {
			margin-bottom: 0;
		}
	}

	.alg-foot {
		padding: 24rpx 12rpx 0;
	}

	.alg-tip {
		display: block;
		font-size: 24rpx;
		line-height: 1.7;
		color: #8E8E93;
		margin-bottom: 8rpx;
	}
</style>
