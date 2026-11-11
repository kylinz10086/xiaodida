<template>
	<view>
		<view class="flex-style">
			<view class="flex-item" @tap="goToWalk">步行</view>
			<view class="flex-item" @tap="goToCar">驾车</view>
			<view class="flex-item active" @tap="goToBus">公交</view>
			<view class="flex-item" @tap="goToRide">骑行</view>
		</view>

		<view class="text_box" v-for="(item,index) in transits" :key="index">
			<text class="text_item" v-for="(item,jndex) in item.transport" :key="jndex">
				{{item}}
			</text>
		</view>
	</view>
</template>

<script>
	import MAP_KEY from '@/common/map-key.js'
	import amapFile from '@/common/map/amap-wx.130.js';
	export default {
		data() {
			return {
				markers: [{
					iconPath: "/static/amap/img/mapicon_navi_s.png",
					id: 0,
					latitude: 39.989643,
					longitude: 116.481028,
					width: 23,
					height: 33
				}, {
					iconPath: "/static/amap/img/mapicon_navi_e.png",
					id: 0,
					latitude: 39.90816,
					longitude: 116.434446,
					width: 24,
					height: 34
				}],
				distance: '',
				cost: '',
				polyline: [],
				transits: []
			};
		},
		methods: {
			goDetail: function() {
				uni.navigateTo({
					url: '/pages/xyyx/route-detail/navigation_bus_detail/navigation_bus_detail'
				})
			},
			goToCar: function(e) {
				uni.redirectTo({
					url: '/pages/xyyx/route-detail/navigation_car/navigation_car'
				})
			},
			goToBus: function(e) {
				uni.redirectTo({
					url: '/pages/xyyx/route-detail/navigation_bus/navigation_bus'
				})
			},
			goToRide: function(e) {
				uni.redirectTo({
					url: '/pages/xyyx/route-detail/navigation_ride/navigation_ride'
				})
			},
			goToWalk: function(e) {
				uni.redirectTo({
					url: '/pages/xyyx/route-detail/navigation_walk/navigation/navigation'
				})
			}
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
					if (data && data.transits) {
						var transits = data.transits;
						for (var i = 0; i < transits.length; i++) {
							var segments = transits[i].segments;
							transits[i].transport = [];
							for (var j = 0; j < segments.length; j++) {
								if (segments[j].bus && segments[j].bus.buslines && segments[j].bus
									.buslines[0] && segments[j].bus.buslines[0].name) {
									var name = segments[j].bus.buslines[0].name
									if (j !== 0) {
										name = '--' + name;
									}
									transits[i].transport.push(name);
								}
							}
						}
					}
					that.transits = transits
				},
				fail: function(info) {

				}
			});
		},
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
