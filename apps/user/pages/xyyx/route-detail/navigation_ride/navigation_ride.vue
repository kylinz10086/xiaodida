<template>
	<view>
		<view class="flex-style">
			<view class="flex-item" @tap="goToWalk">步行</view>
			<view class="flex-item" @tap="goToCar">驾车</view>
			<view class="flex-item" @tap="goToBus">公交</view>
			<view class="flex-item active" @tap="goToRide">骑行</view>
		</view>
		<view class="map_box">
			<map id="navi_map" longitude="116.451028" latitude="39.949643" scale="12" :markers="markers"
				:polyline="polyline"></map>
		</view>

		<view class="text_box">
			<view class="text">{{distance}}</view>
			<view class="text">{{cost}}</view>
			<view class="detail_button" @tap="goDetail">详情</view>
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
				polyline: []
			};
		},
		methods: {
			goDetail: function() {
				uni.navigateTo({
					url: '/pages/xyyx/route-detail/navigation_ride_detail/navigation_ride_detail'
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
			myAmapFun.getRidingRoute({
				origin: '116.481028,39.989643',
				destination: '116.434446,39.90816',
				success: function(data) {
					var points = [];
					console.log(data)
					if (data.paths && data.paths[0] && data.paths[0].rides) {
						var steps = data.paths[0].rides;
						for (var i = 0; i < steps.length; i++) {
							var poLen = steps[i].polyline.split(';');
							for (var j = 0; j < poLen.length; j++) {
								points.push({
									longitude: parseFloat(poLen[j].split(',')[0]),
									latitude: parseFloat(poLen[j].split(',')[1])
								})
							}
						}
					}
					that.polyline = [{
						points: points,
						color: "#0091ff",
						width: 6
					}];
					if (data.paths[0] && data.paths[0].distance) {
						that.distance = data.paths[0].distance + '米';
					}
					if (data.paths[0] && data.paths[0].duration) {
						that.cost = parseInt(data.paths[0].duration / 60) + '分钟';
					}
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

	.map_box {
		position: absolute;
		top: 35px;
		bottom: 90px;
		left: 0px;
		right: 0px;
	}

	#navi_map {
		width: 100%;
		height: 100%;
	}

	.text_box {
		position: absolute;
		height: 90px;
		bottom: 0px;
		left: 0px;
		right: 0px;
	}

	.text_box .text {
		margin: 15px;
	}

	.detail_button {
		position: absolute;
		bottom: 30px;
		right: 10px;
		padding: 3px 5px;
		color: #fff;
		background: #0091ff;
		width: 50px;
		text-align: center;
		border-radius: 5px;
	}
</style>
