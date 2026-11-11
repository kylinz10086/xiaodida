<template>
	<view class="user-info-list-item">
		<u-field class="user-info-u-field" v-model="itemData" :label="label" placeholder="无" :disabled="true">
			<evan-radio v-if="showRadio" primary-color="#ee0a24" :clearable="true" slot="right" v-model="radioValue" label="check"></evan-radio>
		</u-field>
	</view>
</template>

<script>
	export default {
		name: 'UserInfoListItem',
		props: {
			itemData: {
				type: String,
				default: ''
			},
			label: {
				type: String,
				default: ''
			},
			showRadio: {
				type: Boolean,
				default: true
			}
		},
		data() {
			return {
				radioValue: null,
				isCheck: false
			}
		},
		computed: {
			ghost: function() {
				console.log(this.radioValue);
			}
		}
	}
</script>

<style lang="scss">
	.user-info-list-item {
		margin-left: 56rpx;
		margin-right: 56rpx;
		margin-top: 24rpx;
		height: 66rpx;
		background-image: linear-gradient(90deg, #F6F6F6, #FFFFFF);
	}
	
	.user-info-u-field{
		& > view {
			padding: 8rpx 28rpx!important;
		}
	}
</style>
