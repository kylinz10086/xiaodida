<template>
	<view>
		<fx-amountInput currency="￥" :fontSize="30" confirmText="确定" btnColor="#2B76EF" placeholder="请输入金额(上限500)" :maxNumber="500" :isBold="true" :isFilter="true" @change="() => {}" @confirm="confirmMoney"></fx-amountInput>
	</view>
</template>

<script>
	import fxAmountInput from '@/components/fx-amountInput/fx-amountInput.vue';
	export default {
		components: {
			fxAmountInput
		},
		data() {
			return {
				
			};
		},
		methods:{
			confirmMoney: (money) => {
				getApp().globalData.rewardPrice = money;
				uni.navigateBack({
					delta: 1
				});
			}
		}
	}
</script>

<style lang="scss">
	view.keyboard-main > view:nth-child(5) {
		display: none;
	}
	
	view.keyboard-main > text {
		font-size: 60rpx!important;
	}
</style>
