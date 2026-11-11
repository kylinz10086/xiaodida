<template>
	<view>
		<view class="flex-style">
			<view class="flex-item" @tap="goToWalk">步行</view>
			<view class="flex-item active" @tap="goToCar">驾车</view>
			<view class="flex-item" @tap="goToBus">公交</view>
			<view class="flex-item" @tap="goToRide">骑行</view>
		</view>
		<view class="map_box">
			<map id="navi_map" :longitude="longitude" :latitude="latitude" scale="15" :markers="markers"
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
				markers: [],
				distance: '',
				cost: '',
				polyline: [],
				longitude: "116.451028",
				latitude: "39.949643"
			};
		},
		methods: {
			goDetail: function() {
				uni.navigateTo({
					url: '/pages/xyyx/route-detail/navigation_car_detail/navigation_car_detail'
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
		onLoad: function(params) {
			console.log(params);
			let sposition = params.sposition.split(',');
			let eposition = params.eposition.split(',');
			let center_latitude = ((sposition[1]-0)+(eposition[1]-0))/2;
			let center_longitude = ((sposition[0]-0)+(eposition[0]-0))/2;
			this.latitude = center_latitude;
			this.longitude = center_longitude;
			this.markers = [{
					iconPath: "/static/amap/img/mapicon_navi_s.png",
					id: 0,
					latitude: sposition[1],//39.989643,
					longitude: sposition[0],//116.481028,
					width: 23,
					height: 33
				}, {
					iconPath: "/static/amap/img/mapicon_navi_e.png",
					id: 0,
					latitude: eposition[1],
					longitude: eposition[0],
					width: 24,
					height: 34
				}];
			var that = this;
			var myAmapFun = new amapFile.AMapWX({
				key: MAP_KEY
			});
			myAmapFun.getDrivingRoute({
				origin: params.sposition, //'116.481028,39.989643',
				destination: params.eposition,//'116.434446,39.90816',
				success: function(data) {
					var points = [];
					if (data.paths && data.paths[0] && data.paths[0].steps) {
						var steps = data.paths[0].steps;
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
					if (data.taxi_cost) {
						that.cost = '打车约' + parseInt(data.taxi_cost) + '元';
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
