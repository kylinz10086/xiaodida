<template>
	<view>
		<view class="text_box" v-for="(item,index) in steps" :key="index">
			{{item.instruction}}
		</view>
	</view>
</template>

<script>
	import MAP_KEY from '@/common/map-key.js'
	import amapFile from '@/common/map/amap-wx.130.js';
	export default {
		data() {
			return {
				steps: {}
			};
		},
		onLoad: function() {
			var that = this;
			var myAmapFun = new amapFile.AMapWX({
				key: MAP_KEY
			});
			myAmapFun.getTransitRoute({
				origin: '116.481028,39.989643',
				destination: '116.434446,39.90816',
				city: '北京',
				success: function(data) {
					console.log(data)
				},
				fail: function(info) {

				}
			})
		}
	}
</script>

<style lang="scss">
	.flex-style {
		display: -webkit-box;
		display: -webkit-flex;
		display: flex;
	}

	.flex-item {
		height: 35px;
		line-height: 35px;
		text-align: center;
		-webkit-box-flex: 1;
		-webkit-flex: 1;
		flex: 1
	}

	.flex-item.active {
		color: #0091ff;
	}

	.text_box {
		margin: 0 15px;
		padding: 15px 0;
		border-bottom: 1px solid #c3c3c3;
		font-size: 13px;
	}

	.text_box .text_item {
		display: inline-block;
		line-height: 8px;
	}
</style>
