<template>
	<view class="htz-image-upload-list">
		<view class="htz-image-upload-Item" v-for="(item,index) in uploadLists" :key="index">
			<view class="htz-image-upload-Item-video" v-if="isVideoItem(item)">
				<video :disabled="false" :controls="false" :src="item">
					<cover-view class="htz-image-upload-Item-video-fixed" @click="previewVideo(item)"></cover-view>

					<cover-view class="htz-image-upload-Item-del-cover" v-if="remove && previewVideoSrc==''"
						@click="imgDel(index)">×</cover-view>

				</video>

			</view>

			<image v-else :src="item" @click="imgPreview(item)"></image>

			<view class="htz-image-upload-Item-del" v-if="remove" @click="imgDel(index)">×</view>
		</view>
		<view class="htz-image-upload-Item htz-image-upload-Item-add" v-if="uploadLists.length<max && add"
			@click="chooseFile">
			+
		</view>
		<view class="preview-full" v-if="previewVideoSrc!=''">
			<video :autoplay="true" :src="previewVideoSrc" :show-fullscreen-btn="false">
				<cover-view class="preview-full-close" @click="previewVideoClose"> ×
				</cover-view>
			</video>
		</view>


		<!--  -->
	</view>
</template>

<style>
	.ceshi {
		width: 100%;
		height: 100%;
		position: relative;
		top: 0;
		left: 0;
		bottom: 0;
		right: 0;
		background-color: #FFFFFF;
		color: #2C405A;
		opacity: 0.5;
		z-index: 100;
	}
</style>

<script>
	import { dataUriToTempFile } from '@/common/image.js';
	export default {
		name: 'htz-image-upload',
		props: {
			max: { //展示图片最大值
				type: Number,
				default: 1,
			},
			chooseNum: { //选择图片数
				type: Number,
				default: 9,
			},
			name: { //发到后台的文件参数名
				type: String,
				default: 'file',
			},
			remove: { //是否展示删除按钮
				type: Boolean,
				default: true,
			},
			add: { //是否展示添加按钮
				type: Boolean,
				default: true,
			},
			disabled: { //是否禁用
				type: Boolean,
				default: false,
			},
			sourceType: { //选择照片来源 【ps：H5就别费劲了，设置了也没用。不是我说的，官方文档就这样！！！】
				type: Array,
				default: () => ['album', 'camera'],
			},
			action: { //上传地址
				type: String,
				default: '',
			},
			headers: { //上传的请求头部
				type: Object,
				default: () => {},
			},
			formData: { //HTTP 请求中其他额外的 form data
				type: Object,
				default: () => {},
			},
			compress: { //是否需要压缩
				type: Boolean,
				default: true,
			},
			quality: { //压缩质量，范围0～100
				type: Number,
				default: 80,
			},
			value: { //受控图片列表
				type: Array,
				default: () => [],
			},
			uploadSuccess: {
				default: (res) => {
					return {
						success: false,
						url: ''
					}
				},
			},
			mediaType: { //文件类型 image/video/all
				type: String,
				default: 'image',
			},
			maxDuration: { //拍摄视频最长拍摄时间，单位秒。最长支持 60 秒。 (只针对拍摄视频有用)
				type: Number,
				default: 60,
			},
			camera: { //'front'、'back'，默认'back'(只针对拍摄视频有用)
				type: String,
				default: 'back',
			},

		},
		data() {
			return {
				uploadLists: [],
				mediaTypeData: ['image', 'video', 'all'],
				previewVideoSrc: '',
			}
		},
		mounted: function() {
			this.$nextTick(function() {
				this.uploadLists = this.value;
				if (this.mediaTypeData.indexOf(this.mediaType) == -1) {
					uni.showModal({
						title: '提示',
						content: 'mediaType参数不正确',
						showCancel: false,
						success: function(res) {
							if (res.confirm) {
								//console.log('用户点击确定');
							} else if (res.cancel) {
								//console.log('用户点击取消');
							}
						}
					});
				}
			});
		},
		watch: {
			value(val, oldVal) {
				//console.log('value',val, oldVal)
				this.uploadLists = val;
			},
		},
		methods: {
			previewVideo(src) {
				this.previewVideoSrc = src;
				// this.previewVideoSrc =
				// 	'https://vkceyugu.cdn.bspapp.com/VKCEYUGU-fbd63a76-dc76-485c-b711-f79f2986daeb/ba804d82-860b-4d1a-a706-5a4c8ce137c3.mp4'
			},
			previewVideoClose() {
				this.previewVideoSrc = ''
				console.log('previewVideoClose', this.previewVideoSrc)
			},
			imgDel(index) {
				uni.showModal({
					title: '提示',
					content: '您确定要删除么?',
					success: (res) => {
						if (res.confirm) {
							// this.uploadLists.splice(index, 1)
							// this.$emit("input", this.uploadLists);
							// this.$emit("imgDelete", this.uploadLists);
							let delUrl = this.uploadLists[index]
							this.uploadLists.splice(index, 1)
							this.$emit("input", this.uploadLists);
							this.$emit("imgDelete", {
								del: delUrl,
								tempFilePaths: this.uploadLists
							});
						} else if (res.cancel) {}
					}
				});
			},
			imgPreview(item) {
				// 缩略图是 data URI，扩展名正则认不出来；这里改成按「是不是视频」过滤
				const list = (this.uploadLists || []).filter((it) => !this.isVideoItem(it))
				if (!list.length) return
				const idx = list.indexOf(item)
				const toLocal = (u) => {
					if (String(u).indexOf('data:image/') !== 0) return Promise.resolve(u)
					return dataUriToTempFile(u).then((local) => local || u)
				}
				Promise.all(list.map(toLocal)).then((urls) => {
					const current = urls[idx >= 0 ? idx : 0] || urls[0]
					if (current) uni.previewImage({ urls, current, loop: true })
				})
			},
			/** data URI 缩略图不是视频，别被扩展名正则误判成 video */
			isVideoItem(item) {
				const s = String(item || '')
				if (s.indexOf('data:image/') === 0) return false
				return !/\.(gif|jpg|jpeg|png)$/i.test(s)
			},
			chooseFile() {
				if (this.disabled) {
					return false;
				}
				switch (this.mediaTypeData.indexOf(this.mediaType)) {
					case 1: //视频
						this.videoAdd();
						break;
					case 2: //全部
						uni.showActionSheet({
							itemList: ['相册', '视频'],
							success: (res) => {
								if (res.tapIndex == 1) {
									this.videoAdd();
								} else if (res.tapIndex == 0) {
									this.imgAdd();
								}
							},
							fail: (res) => {
								console.log(res.errMsg);
							}
						});
						break;
					default: //图片
						this.imgAdd();
						break;
				}


				//if(this.mediaType=='image'){


			},
			videoAdd() {
				console.log('videoAdd')
				let nowNum = Math.abs(this.uploadLists.length - this.max);
				let thisNum = (this.chooseNum > nowNum ? nowNum : this.chooseNum) //可选数量
				uni.chooseVideo({
					compressed: this.compress,
					sourceType: this.sourceType,
					camera: this.camera,
					maxDuration: this.maxDuration,
					success: (res) => {
						console.log('videoAdd', res)
						console.log(res.tempFilePath)
						this.chooseSuccessMethod([res.tempFilePath], 1)
						//this.imgUpload([res.tempFilePath]);
						//console.log('tempFiles', res)
						// if (this.action == '') { //未配置上传路径
						// 	this.$emit("chooseSuccess", res.tempFilePaths);
						// } else {
						// 	if (this.compress && (res.tempFiles[0].size / 1024 > 1025)) { //设置了需要压缩 并且 文件大于1M，进行压缩上传
						// 		this.imgCompress(res.tempFilePaths);
						// 	} else {
						// 		this.imgUpload(res.tempFilePaths);
						// 	}
						// }
					}
				});
			},
			imgAdd() {
				console.log('imgAdd')
				let nowNum = Math.abs(this.uploadLists.length - this.max);
				let thisNum = (this.chooseNum > nowNum ? nowNum : this.chooseNum) //可选数量
				console.log('nowNum', nowNum)
				console.log('thisNum', thisNum)
				// #ifdef APP-PLUS
				if (this.sourceType.length > 1) {
					uni.showActionSheet({
						itemList: ['拍摄', '从手机相册选择'],
						success: (res) => {
							if (res.tapIndex == 1) {
								this.appGallery(thisNum);
							} else if (res.tapIndex == 0) {
								this.appCamera();
							}
						},
						fail: (res) => {
							console.log(res.errMsg);
						}
					});
				}
				if (this.sourceType.length == 1 && this.sourceType.indexOf('album') > -1) {
					this.appGallery(thisNum);
				}

				if (this.sourceType.length == 1 && this.sourceType.indexOf('camera') > -1) {
					this.appCamera();
				}
				// #endif
				//#ifndef APP-PLUS
				uni.chooseImage({
					count: thisNum,
					sizeType: ['original', 'compressed'], //可以指定是原图还是压缩图，默认二者都有
					sourceType: this.sourceType,
					success: (res) => {
						this.chooseSuccessMethod(res.tempFilePaths, 0)
						//console.log('tempFiles', res)
						// if (this.action == '') { //未配置上传路径
						// 	this.$emit("chooseSuccess", res.tempFilePaths);
						// } else {
						// 	if (this.compress && (res.tempFiles[0].size / 1024 > 1025)) { //设置了需要压缩 并且 文件大于1M，进行压缩上传
						// 		this.imgCompress(res.tempFilePaths);
						// 	} else {
						// 		this.imgUpload(res.tempFilePaths);
						// 	}
						// }
					}
				});
				// #endif
			},
			appCamera() {
				var cmr = plus.camera.getCamera();
				var res = cmr.supportedImageResolutions[0];
				var fmt = cmr.supportedImageFormats[0];
				//console.log("Resolution: " + res + ", Format: " + fmt);
				cmr.captureImage((path) => {
						//alert("Capture image success: " + path);
						this.chooseSuccessMethod([path], 0)
					},
					(error) => {
						//alert("Capture image failed: " + error.message);
						console.log("Capture image failed: " + error.message)
					}, {
						resolution: res,
						format: fmt
					}
				);
			},
			appGallery(maxNum) {
				plus.gallery.pick((res) => {
					this.chooseSuccessMethod(res.files, 0)
				}, function(e) {
					//console.log("取消选择图片");
				}, {
					filter: "image",
					multiple: true,
					maximum: maxNum
				});
			},
			chooseSuccessMethod(filePaths, type) {
				if (this.action == '') { //未配置上传路径
					this.$emit("chooseSuccess", filePaths, type); //filePaths 路径 type 0 为图片 1为视频
				} else {
					if (type == 1) {
						this.imgUpload(filePaths);
					} else {
						if (this.compress) { //设置了需要压缩
							this.imgCompress(filePaths);
						} else {
							this.imgUpload(filePaths);
						}
					}

				}
			},
			imgCompress(tempFilePaths) {
				uni.showLoading({
					title: '压缩中...'
				});

				let compressImgs = [];
				let results = [];
				tempFilePaths.forEach((item, index) => {
					compressImgs.push(new Promise((resolve, reject) => {
						// #ifndef H5
						uni.compressImage({
							src: item,
							quality: this.quality,
							success: res => {
								//console.log('compressImage', res.tempFilePath)
								results.push(res.tempFilePath);
								resolve(res.tempFilePath);
							},
							fail: (err) => {
								//console.log(err.errMsg);
								reject(err);
							},
							complete: () => {
								//uni.hideLoading();
							}
						})
						// #endif
						// #ifdef H5
						this.canvasDataURL(item, {
							quality: this.quality / 100
						}, (base64Codes) => {
							//this.imgUpload(base64Codes);
							results.push(base64Codes);
							resolve(base64Codes);
						})
						// #endif
					}))
				})
				Promise.all(compressImgs) //执行所有需请求的接口
					.then((results) => {
						uni.hideLoading();
						console.log('imgUpload', results)
						this.imgUpload(results);
					})
					.catch((res, object) => {
						uni.hideLoading();
					});
			},
			imgUpload(tempFilePaths) {
				// if (this.action == '') {
				// 	uni.showToast({
				// 		title: '未配置上传地址',
				// 		icon: 'none',
				// 		duration: 2000
				// 	});
				// 	return false;
				// }
				uni.showLoading({
					title: '上传中'
				});
				console.log('imgUpload', tempFilePaths)
				let uploadImgs = [];
				tempFilePaths.forEach((item, index) => {
					uploadImgs.push(new Promise((resolve, reject) => {
						console.log(index, item)
						const uploadTask = uni.uploadFile({
							url: this.action, //仅为示例，非真实的接口地址
							filePath: item,
							name: this.name,
							fileType: 'image',
							formData: this.formData,
							header: this.headers,
							success: (uploadFileRes) => {
								//uni.hideLoading();
								//console.log(typeof this.uploadSuccess)
								//console.log('')
								if (typeof this.uploadSuccess == 'function') {
									let thisUploadSuccessMethod = this.uploadSuccess(
										uploadFileRes)
									if (thisUploadSuccessMethod.success) {
										this.value.push(thisUploadSuccessMethod.url)
										this.$emit("input", this.uploadLists);
									}
								}
								resolve(uploadFileRes);
								this.$emit("uploadSuccess", uploadFileRes);
							},
							fail: (err) => {
								console.log(err);
								//uni.hideLoading();
								reject(err);
								this.$emit("uploadFail", err);
							},
							complete: () => {
								//uni.hideLoading();
							}
						});
					}))
				})
				Promise.all(uploadImgs) //执行所有需请求的接口
					.then((results) => {
						uni.hideLoading();
					})
					.catch((res, object) => {
						uni.hideLoading();
						this.$emit("uploadFail", res);
					});
				// uploadTask.onProgressUpdate((res) => {
				// 	//console.log('',)
				// 	uni.showLoading({
				// 		title: '上传中' + res.progress + '%'
				// 	});
				// 	if (res.progress == 100) {
				// 		uni.hideLoading();
				// 	}
				// });
			},
			canvasDataURL(path, obj, callback) {
				var img = new Image();
				img.src = path;
				img.onload = function() {
					var that = this;
					// 默认按比例压缩
					var w = that.width,
						h = that.height,
						scale = w / h;
					w = obj.width || w;
					h = obj.height || (w / scale);
					var quality = 0.8; // 默认图片质量为0.8
					//生成canvas
					var canvas = document.createElement('canvas');
					var ctx = canvas.getContext('2d');
					// 创建属性节点
					var anw = document.createAttribute("width");
					anw.nodeValue = w;
					var anh = document.createAttribute("height");
					anh.nodeValue = h;
					canvas.setAttributeNode(anw);
					canvas.setAttributeNode(anh);
					ctx.drawImage(that, 0, 0, w, h);
					// 图像质量
					if (obj.quality && obj.quality <= 1 && obj.quality > 0) {
						quality = obj.quality;
					}
					// quality值越小，所绘制出的图像越模糊
					var base64 = canvas.toDataURL('image/jpeg', quality);
					// 回调函数返回base64的值
					callback(base64);
				}
			},
		}
	}
</script>

<style>
	.preview-full {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 100%;
		z-index: 1002;
	}

	.preview-full video {
		width: 100%;
		height: 100%;
		z-index: 1002;
	}

	.preview-full-close {
		position: fixed;
		right: 32rpx;
		top: 25rpx;
		width: 80rpx;
		height: 80rpx;
		line-height: 60rpx;
		text-align: center;
		z-index: 1003;
		/* 	background-color: #808080; */
		color: #fff;
		font-size: 65rpx;
		font-weight: bold;
		text-shadow: 1px 2px 5px rgb(0 0 0);
	}



	/* .preview-full-close-before,
	.preview-full-close-after {
		position: absolute;
		top: 50%;
		left: 50%;
		content: '';
		height: 60rpx;
		margin-top: -30rpx;
		width: 6rpx;
		margin-left: -3rpx;
		background-color: #FFFFFF;
		z-index: 20000;
	}

	.preview-full-close-before {
		transform: rotate(45deg);

	}

	.preview-full-close-after {
		transform: rotate(-45deg);

	} */

	.htz-image-upload-list {
		display: flex;
		flex-wrap: wrap;
	}

	.htz-image-upload-Item {
		width: 160rpx;
		height: 160rpx;
		margin: 13rpx;
		border-radius: 10rpx;
		position: relative;
	}

	.htz-image-upload-Item image {
		width: 100%;
		height: 100%;
		border-radius: 10rpx;
	}

	.htz-image-upload-Item-video {
		width: 100%;
		height: 100%;
		border-radius: 10rpx;
		position: relative;

	}

	.htz-image-upload-Item-video-fixed {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 100%;
		border-radius: 10rpx;
		z-index: 996;

	}

	.htz-image-upload-Item video {
		width: 100%;
		height: 100%;
		border-radius: 10rpx;

	}

	.htz-image-upload-Item-add {
		font-size: 105rpx;
		/* line-height: 160rpx; */
		text-align: center;
		border: 1px dashed #d9d9d9;
		color: #d9d9d9;
	}

	.htz-image-upload-Item-del {
		background-color: #f5222d;
		font-size: 24rpx;
		position: absolute;
		width: 35rpx;
		height: 35rpx;
		line-height: 35rpx;
		text-align: center;
		top: 0;
		right: 0;
		z-index: 997;
		color: #fff;
	}

	.htz-image-upload-Item-del-cover {
		background-color: #f5222d;
		font-size: 24rpx;
		position: absolute;
		width: 35rpx;
		height: 35rpx;
		text-align: center;
		top: 0;
		right: 0;
		color: #fff;
		/* #ifdef APP-PLUS */
		line-height: 25rpx;
		/* #endif */
		/* #ifndef APP-PLUS */
		line-height: 35rpx;
		/* #endif */
		z-index: 997;

	}
</style>
