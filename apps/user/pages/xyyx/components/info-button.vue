<template>
	<u-row class="inforow" gutter="0">
		<u-col span="4" class="infoiconcol">
			<image :src="icon" mode=""
				style="width: 72rpx; height: 72rpx;vertical-align:middle;align-items: center;margin-left: 12rpx;">
			</image>
		</u-col>
		<u-col span="8">
			<u-row gutter="0" class="maintxt" style="font-size: 32rpx;text-align: right;">
				<text>{{mainTextVal}}</text>
			</u-row>
			<u-row gutter="0" class="subtext" style="font-size: 18rpx;text-align: right;">
				<text>{{underTextVal}}</text>
			</u-row>
		</u-col>
	</u-row>
</template>

<script>
	export default {
		name: 'InfoButton',
		props: ['mainTextVal', 'underTextVal', 'icon'],
	}
</script>

<style lang="scss">
	.inforow > view{
		background-color: #FFFFFF;
		margin-top: 21rpx;
		border-radius: 16rpx;
	}
	
	.infoiconcol {
		view {
			text-align: center!important;
			display: flex;
			height: 93rpx;
			padding-left: 6rpx;
			margin-right: -11rpx;
		}
	}
	
	.maintxt {
		view {
			padding-top: 14rpx;
			padding-right: 14rpx;
		}
	}
	
	.subtext {
		color: #878787;
		
		view {
			padding-bottom: 14rpx;
			padding-right: 14rpx;
		}
	}
</style>
