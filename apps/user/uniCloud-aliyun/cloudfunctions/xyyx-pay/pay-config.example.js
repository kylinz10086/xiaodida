// 微信支付配置模板 —— 复制本文件为 pay-config.js 并填入真实值（pay-config.js 已 gitignore）
//
// 需要准备：
//   1. 微信支付商户号（mchid）
//   2. API 证书私钥 apiclient_key.pem 的**文件内容**（含首尾 -----BEGIN PRIVATE KEY----- 行）
//   3. 证书序列号 serialNo（商户平台-账户中心-API安全-API证书）
//   4. APIv3 密钥 apiV3Key（商户平台-账户中心-API安全-设置APIv3密钥，32位）
//   5. 微信支付平台证书公钥 platformPublicKey（用于回调验签）
//   6. 平台证书序列号 platformSerial
//   7. 回调地址 notifyUrl（必须是 HTTPS，且能被微信访问到；建议用 uniCloud 云函数 URL 化地址）
//
// 留空 = 走 mock 模式（开发联调用，只能模拟支付）
module.exports = {
  appid: '',              // 小程序 appid，与 uni-id config 里的一致
  mchid: '',              // 商户号
  serialNo: '',           // 商户 API 证书序列号
  privateKey: '',         // apiclient_key.pem 内容
  apiV3Key: '',           // APIv3 密钥（32 位）
  platformSerial: '',     // 微信支付平台证书序列号
  platformPublicKey: '',  // 微信支付平台证书公钥（PEM）
  notifyUrl: ''           // 支付结果回调地址
}
