# 微信支付 V3 接入步骤（校递达）

> 当前状态：**mock 支付已可用**；真实微信支付代码已写，但缺少商户证书/APIv3 配置，所以还不能真实扣款。
> 本文件是上线前的操作清单。

---

## 0. 前置条件

1. 小程序 `wxab71ca588522f56d` 已完成微信认证（个人主体通常不能开通微信支付）。
2. 已开通**微信支付商户号**（`mchid`）。
3. 商户平台 → 产品中心 → **AppID 账号管理**，绑定小程序 appid `wxab71ca588522f56d`。
4. 商户平台 → 账户中心 → **API 安全**：
   - 申请 API 证书（`apiclient_cert.pem`、`apiclient_key.pem`，记录证书序列号 `serialNo`）；
   - 设置 APIv3 密钥（32 位）；
   - 下载/获取微信支付平台证书（`platformSerial` + 公钥 PEM）。
5. 小程序后台 request 合法域名已包含 uniCloud 域名（本项目已配置）。

---

## 1. 放商户配置

复制模板：

```powershell
cd F:\xiaodida
Copy-Item apps\user\uniCloud-alipay\cloudfunctions\xyyx-pay\pay-config.example.js `
          apps\user\uniCloud-alipay\cloudfunctions\xyyx-pay\pay-config.js
```

填写 `pay-config.js`：

```js
module.exports = {
  appid: 'wxab71ca588522f56d',
  mchid: '你的商户号',
  serialNo: '商户 API 证书序列号',
  privateKey: `apiclient_key.pem 的完整内容（含 PEM 首尾行）`,
  apiV3Key: '32位APIv3密钥',
  platformSerial: '微信支付公钥 ID（PUB_KEY_ID_ 开头）',
  platformPublicKey: `微信支付公钥的完整 PEM 内容`,
  notifyUrl: 'https://env-00jy72ju8b4z.dev-hz.cloudbasefunction.cn/pay-notify'
}
```

> `pay-config.js` 已在 `.gitignore`，不要提交、不要发群。
> 商户平台现在是「微信支付公钥」模式：`platformSerial` 填 `PUB_KEY_ID_...`，
> `platformPublicKey` 填商户平台下载的公钥 PEM 全文；不再需要平台证书。
>
> 填完先自检（只输出有没有/能不能解析，不打印密钥）：
>
> ```powershell
> node tools/scripts/check-pay-keys.cjs
> ```

---

## 2. 部署支付回调云函数

回调函数已写好：`apps/user/uniCloud-alipay/cloudfunctions/pay-notify/index.js`。

它做三件事：

1. 读取微信 POST 的原始 body 和 `Wechatpay-*` 头；
2. 调用 `xyyx-pay.handleNotify` 验签 + 解密 + 幂等入账；
3. 返回微信要求的 `{"code":"SUCCESS","message":"成功"}`。

部署：

```powershell
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"
& $cli cloud functions --upload cloudfunction --prj user --provider alipay --name pay-notify
& $cli cloud functions --upload cloudfunction --prj user --provider alipay --name xyyx-pay
```

### 开启 HTTP 访问服务 / URL 化

1. 打开 uniCloud 控制台：<https://unicloud.dcloud.net.cn/>
2. 选空间 `env-00jy72ju8b4z`；
3. 进入 `pay-notify` 云函数；
4. 找到 **URL 化 / HTTP 访问服务**，开启；
5. 路由填 `/pay-notify`（不同版本界面可能叫「HTTP 访问服务」「URL 化」「函数路由」）；
6. 保存后得到公网 HTTPS 地址：

```text
https://env-00jy72ju8b4z.dev-hz.cloudbasefunction.cn/pay-notify
```

> URL 化的默认域名是 `dev-hz`，不是云对象的请求域名 `api-hz`；
> 以控制台「云函数 URL 化」页面显示的域名为准。

7. 把这个地址填回 `pay-config.js` 的 `notifyUrl`，重新上传 `xyyx-pay`。

> 浏览器直接 GET 根域名返回 `50002 函数请求不合法` 是正常的；根路径没有函数路由。
> 只要 `POST /pay-notify` 能返回 JSON，就说明路由通了。

---

## 3. 微信商户平台配置

1. 商户平台 → 产品中心 → **JSAPI 支付** 开通；
2. 产品中心 → **AppID 账号管理** → 绑定小程序 appid；
3. 开发配置 → **支付授权目录**：V3 JSAPI 一般不需要单独配 H5 目录，但小程序 appid 必须绑定；
4. 若商户平台有「支付回调链接」配置，填上面的 `notifyUrl`；
5. V3 下单请求里的 `notify_url` 已经由 `createJsapiOrder` 使用 `PAY_CONFIG.notifyUrl`。

---

## 4. 代码链路（已实现）

| 步骤 | 文件/方法 | 说明 |
| --- | --- | --- |
| 获取支付模式 | `xyyx-pay.getPayMode` | 有完整配置返回 `wechat`，否则 `mock` |
| 创建预支付单 | `xyyx-pay.createJsapiOrder` | 服务端金额校验；`/v3/pay/transactions/jsapi` |
| 返回小程序参数 | `payParams` | `timeStamp/nonceStr/package/signType: RSA/paySign` |
| 拉起支付 | `apps/user/store/index.js` `payWithWechat` | `uni.requestPayment` |
| 支付回调 | `pay-notify` → `xyyx-pay.handleNotify` | 验签、AES-256-GCM 解密、CAS 入账 |
| 主动查单 | `xyyx-pay.queryOrder` | 回调丢失时兜底 |
| 幂等 | `markPaid` + `escrow_in:${taskId}` | 重复回调不会重复加钱 |

当前前端逻辑：

- `pay-config.js` 不存在 → 发布任务后弹「模拟支付」确认框；
- 配好 `pay-config.js` → 发布任务后走 `uni.requestPayment` 真实支付。

---

## 5. 测试（建议 1 元）

1. 真机登录（必须拿到 `wx_openid['mp-weixin']`，否则 `createJsapiOrder` 会报“缺少微信 openid”）；
2. 发布 1 元任务 → 确认支付 → 微信支付收银台；
3. 支付成功后检查：
   - `xyyx-tasks.pay_status = paid`
   - `xyyx-tasks.transaction_id` 有值
   - `xyyx-transactions` 有一条 `escrow_in`
4. 在 uniCloud 控制台看 `pay-notify` 调用日志：
   - 200 且 body 为 `{"code":"SUCCESS"}`
   - 若 400，按 `errMsg` 查：证书序列号、平台公钥、APIv3 密钥、时间戳；
5. 重复投递同一回调，确认不会重复加钱（`markPaid` CAS + 唯一幂等键）。

---

## 6. 常见错误

| 错误 | 原因 |
| --- | --- |
| `缺少微信 openid` | 用户不是通过微信登录；新版 uni-id-co 存在 `wx_openid.mp` / `mp_<appid>`，旧代码只读 `mp-weixin` 会误报 |
| `微信下单失败` | 商户号/appid 未绑定、证书序列号错、私钥不匹配 |
| `回调验签失败` | `platformPublicKey` 不是微信支付公钥 PEM，或 body 被框架改写 |
| `证书序列号不匹配` | `platformSerial` 应为 `PUB_KEY_ID_...` 微信支付公钥 ID，不是商户证书序列号 |
| `401 签名错误` | `serialNo` 与 `privateKey` 不是同一张证书，或证书已被吊销 |
| `回调已过期` | 服务器时间不准；校时 |
| `未配置真实支付` | `isRealPay()` 缺少 `mchid/serialNo/privateKey/apiV3Key/appid` 之一 |
| `50002` | HTTP 访问服务/函数路由未开启；不是支付代码问题 |

---

## 7. 安全要求

- `pay-config.js`、`apiclient_key.pem`、APIv3 密钥只放服务器/本地，不进代码库；
- 金额只信服务端 `task.amount_cent`，客户端传的金额仅校验；
- 回调必须验签 + 解密，失败一律不记账；
- 回调返回非 200 微信会重试，逻辑必须幂等；
- 上线前用微信支付「1 分/1 元」真实订单走一遍，并测试退款/关单。
