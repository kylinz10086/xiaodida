<template>
	<view>
		<view>
			<u-field
				v-model="attrName"
				label="信息名称"
				required
				placeholder="请填写信息名称"
				:error-message="errorMessage1"
			>
			</u-field>
			<u-field
				v-model="attrContent"
				label="信息内容"
				required
				placeholder="请填写信息内容"
				type="textarea"
				:error-message="errorMessage2"
			>
			</u-field>
		</view>
		<view style="display: flex;flex-direction: row;">
			<view @click.capture="cancelModify" style="flex-grow: 1;margin-right: 14rpx;margin-left: 56rpx;">
				<u-button>取消</u-button>
			</view>
			<view @click.capture="confirmModify" style="flex-grow: 1;margin-left: 14rpx;margin-right: 56rpx;">
				<u-button type="error">保存</u-button>
			</view>
		</view>
	</view>
</template>

<script>
	// Todo
	import toPinYin from '../../../common/toPinyin/toPinyin.js';
	
	export default {
		data() {
			return {
				attrName: '',
				attrContent: '',
				errorMessage1: '',
				errorMessage2: ''
			}
		},
		methods: {
			cancelModify: function() {
				uni.navigateBack({
					delta: 1
				});
			},
			confirmModify: function() {
				// 先验证信息名称是否合法
				if(this.attrName==''){
					this.errorMessage1 = '此信息未填写!';
				}
				if(this.attrContent==''){
					this.errorMessage2 = '此信息未填写!';
				}
				if(this.attrName==''||this.attrContent==''){
					return;
				}
				this.attrName = this.attrName.replace(/[^\w\u4E00-\u9FA5]/g, '');
				let attrNameTmp = toPinYin.chineseToPinYin(this.attrName);
				console.log(attrNameTmp);
				// 提交修改内容到服务器，成功后将其覆盖globalData.userObj
				let code = 0; //模拟请求成功
				if(code == 0) {
					getApp().globalData.userObj[attrNameTmp] = Object.assign({}, {
						label: this.attrName,
						value: this.attrContent
					});
					console.log(getApp().globalData.userObj);
					uni.showToast({
						duration: 1500,
						icon: 'success',
						title: '添加信息成功！'
					});
					this.$EventBus.$emit("handleAddAttr", "");
					setTimeout(() => {
						uni.navigateBack({
							delta: 1
						});
					}, 1500);
				}
			}
		}
	}
</script>

<style lang="scss">
page {
	background-color: #FFFFFF!important;
}
</style>
