# 校递达 · 云对象接口

> 所有接口返回 `{ code, msg, data }`，`code=0` 成功。
> 客户端用 `uniCloud.importObject('<对象名>', { customUI: true })` 调用。
> **用户端只能调 `xyyx-user`，骑手端只能调 `xyyx-rider`**，调错会被角色校验拒绝。

---

## 一、xyyx-user（用户端）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getProfile()` | — | 我的资料 + 钱包 + 抽佣比例 |
| `updateProfile(data)` | `{nickname?, avatar?, mobile?}` | 改资料 |
| `publishTask(data)` | 见下 | 下单，返回 `{id, amount}`，此时 `pay_status=unpaid` |
| `createPayment(taskId)` | `taskId` | 向 `xyyx-pay` 申请支付参数，返回 `{mode:'wechat'|'mock', ...}` |
| `listHall(params)` | `{type?, page?, pageSize?}` | 任务大厅（只要已支付、待接单的） |
| `getTaskDetail(taskId)` | `taskId` | 订单详情（字段裁剪后） |
| `listMyTasks(params)` | `{role?:'publisher'|'runner'|'all', status?}` | 我的订单 |
| `cancelTask(taskId, reason)` | | 未接单可取消，自动退款 |
| `confirmReceipt(taskId)` | | 确认收货 → 触发结算 |
| `submitReview(data)` | `{taskId, score(1-5), content}` | 评价骑手 |
| `acceptAgreement(data)` | `{version}` | 协议同意留痕 |

### publishTask 的 data

```js
{
  title: '东门驿站取快递',        // 必填，4-40 字
  type: 1,                        // 1快递 2带餐 3其他
  amount: 5.5,                    // 必填，元，服务端转分
  description: '两个中等箱子',
  item_type: '快递',
  item_size: '中件',
  item_weight: '约2kg',
  time_option: '30分钟内',
  origin: { name: '东门菜鸟驿站', detail: '3号柜', latitude: 30.24, longitude: 120.21 },
  destination: { name: '学生公寓3号楼', detail: '302', latitude: 30.24, longitude: 120.21 },
  mobile: '13800000000',          // 必填（可从资料带出）
  wechat_id: '',
  remark: '',
  images: []
}
```

> 服务端会**丢弃** allowed 列表之外的字段（包括 `status`、`publisher_id`），
> 所以客户端塞不进去。

---

## 二、xyyx-rider（骑手端）

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getProfile()` | — | 资料 + 钱包 + 骑手统计（完成数/进行中/评分） |
| `applyRider(data)` | `{real_name, student_no, mobile}` | 申请成为骑手，状态置 1 |
| `updateProfile(data)` | `{nickname?, avatar?, mobile?}` | 改资料 |
| `listHall(params)` | `{type?, page?, pageSize?}` | 抢单大厅（接单前视图） |
| `getTaskDetail(taskId)` | | 订单详情（接单前看不到联系方式） |
| `grabTask(taskId)` | | 抢单，用状态 CAS 防并发 |
| `markPicked(taskId)` | | 标记已取件 |
| `markDelivered(taskId)` | | 标记已送达，写 `auto_confirm_at` |
| `abandonTask(taskId, reason)` | | 放弃，订单回到大厅 |
| `listMyJobs(params)` | `{status?}` | 我的任务 |
| `getWallet()` | — | 余额 + 最近 50 条流水 |
| `requestWithdraw(data)` | `{amount}` | 提现申请（人工审核），最低 10 元 |
| `acceptAgreement(data)` | `{version}` | 协议留痕 |

---

## 三、xyyx-pay（支付）

| 方法 | 说明 |
| --- | --- |
| `getPayMode()` | 返回 `{mode:'wechat'|'mock'}`，客户端据此显示按钮 |
| `createJsapiOrder({taskId, amountCent?})` | 微信 V3 下单；mock 模式返回假参数 |
| `mockPaySuccess(taskId)` | **仅 mock 模式可用**；配置了真实支付后调用会 403 |
| `queryOrder(taskId)` | 主动查单（对账兜底） |
| `handleNotify(headers, rawBody)` | 支付回调：验签 → 解密 → 幂等入账 |

---

## 四、错误码

| code | 含义 |
| --- | --- |
| 0 | 成功 |
| 400 | 参数不合法 / 状态不允许 |
| 401 | 未登录 / token 失效 |
| 403 | 无权限（不是你的订单、不是骑手、角色不对） |
| 404 | 资源不存在 |
| 409 | 冲突（重复提交、手慢了被抢走、状态已变） |
| 429 | 操作太频繁 |
| 500 | 服务端异常（不返回堆栈） |

---

## 五、字段裁剪对照

| 接口 | 使用视图 | 效果 |
| --- | --- | --- |
| `xyyx-user.*` | `taskForUser()` | 骑手只给昵称/头像/评分；发布者能看到自己填的联系方式 |
| `xyyx-rider.listHall / getTaskDetail` | `taskForRider()` | 未接单时 `contact=null`、`destination.detail=''`；接单后 `contact.mobile_masked` |
| `xyyx-rider.listMyJobs` | `taskForRider()` | 自己的单才给脱敏号 |
