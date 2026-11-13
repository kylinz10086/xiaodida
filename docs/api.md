# 校递达 · 云对象接口

> 所有接口返回 `{ code, msg, data }`，`code=0` 成功。
> 客户端用 `uniCloud.importObject('<对象名>', { customUI: true })` 调用。
> **用户端只能调 `xyyx-user`，骑手端只能调 `xyyx-rider`**，调错会被角色校验拒绝。
> **所有写接口**还必须带 `nonce` + `timestamp`（客户端 store 自动生成）：缺失返回 400，
> 同一 nonce 重复提交返回 409，超过 5 分钟返回 400。读接口不需要。

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
| `confirmReceipt(taskId)` | | 确认收货 → 触发结算；要求骑手已 `markDelivered`（有 `delivered_time`） |
| `submitReview(data)` | `{taskId, score(1-5), content}` | 评价骑手 |
| `listReviews(params)` | `{taskId? 或 riderId?, page?, pageSize?}` | 评价列表；taskId 仅订单双方可看，不返回评价人 uid |
| `getRiderProfile(riderId)` | `riderId` | 骑手公开资料：昵称/头像/评分/完成单数 |
| `uploadImage(data)` | `{base64, ext, dir}` | 服务端中转上传图片，返回 `{fileID,size}`；限 900KB |
| `listChats()` | — | 会话列表（最近聊过的订单 + 未读数） |
| `getChat(taskId, opts)` | `{after?}` | 拉消息；`after` 为增量轮询，打开即把对方消息标已读 |
| `sendChat(taskId, content, meta, type)` | `type='text'\|'image'` | 发消息；仅订单双方可发，限流 30 条/分钟 |
| `chatUnread(taskId)` | — | 单笔订单未读数（详情页小红点） |
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
| `markPicked(taskId, meta, proofImage?)` | | 标记已取件；`proofImage` 为可选留痕图片 fileID |
| `markDelivered(taskId, meta, proofImage?)` | | 标记已送达，写 `auto_confirm_at`；可带送达留痕 |
| `uploadImage(data)` | `{base64, ext, dir}` | 服务端中转上传图片 |
| `abandonTask(taskId, reason)` | | 放弃，订单回到大厅 |
| `listMyJobs(params)` | `{status?}` | 我的任务 |
| `getWallet()` | — | 余额 + 最近 50 条流水 |
| `requestWithdraw(data)` | `{amount}` | 提现（自动处理，不再人工审核）。最低 1 元、单笔 ≤200 元、每天 ≤20 次、单日累计 ≤500 元、两次间隔 10 分钟 |
| `listChats()` | — | 骑手侧会话列表 |
| `getChat(taskId, opts)` | `{after?}` | 拉消息（只允许该单骑手本人） |
| `sendChat(taskId, content, meta, type)` | `type='text'\|'image'` | 发消息 |
| `chatUnread(taskId)` | — | 单笔订单未读数 |
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
| `requestWithdraw({amount})` | 提现：扣余额 → 商家转账；返回 `{state, package_info, need_confirm, out_bill_no}` |
| `queryWithdraw(outBillNo)` | 查询某笔提现在微信侧的真实状态（含 `package_info`，可再次拉起确认页） |
| `myWithdrawals(limit)` | 我的提现记录（带 `state / state_text / rolled_back`） |
| `syncWithdrawals()` | 同步在途提现状态；客户端调用会被要求管理员权限（定时任务用） |
| `reissueWithdraw({outBillNo})` | 后台重发失败/过期的提现（内部接口，仅管理员/云函数） |

### 提现状态机（`xyyx-withdrawals`）

```
pending ──▶ WAIT_USER_CONFIRM ──▶ TRANSFERING ──▶ SUCCESS
   └────────── FAIL / CANCELLED / EXPIRED ──▶ 余额自动退回（rolled_back=true，只退一次）
```

> 图片接口：`getImageData(fileID, offset)` 返回 `{base64, mime, size, offset, chunk, done, source}`，
> `source='db'` 表示来自 `xyyx-images` 直存（不读云存储），`source='store'` 表示读云存储并已补存。


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
| `xyyx-user.*` | `taskForUser()` | 骑手只给昵称/头像/评分；发布者/接单者能看到门牌与联系方式，游客只看地点名 |
| `xyyx-rider.listHall / getTaskDetail` | `taskForRider()` | 未接单时 `contact=null`、`destination.detail=''`；只有**接单者本人**接单后才有完整手机号和门牌 |
| `xyyx-rider.listMyJobs` | `taskForRider()` | 自己的单才给完整手机号 |

---

## 六、订单内聊天

- 集合：`xyyx-messages`，字段 `{task_id, from_id, to_id, content, type, read_at, create_time}`。
- 权限：`permission:false`，客户端不直连；所有读写经过 `xyyx-user` / `xyyx-rider`。
- 成员校验：`task.publisher_id` 或 `task.runner_id` 等于当前 uid 才放行；没接单前骑手不是成员，发不出去。
- 系统消息：抢单、送达、放弃时自动插一条 `type='system'`，聊天里居中显示，用于交代上下文。
- 已读：`getChat` 会把 `to_id=当前用户` 且 `read_at=0` 的消息置为已读；未读数用 `chatUnread` 单独查。
- 轮询：客户端 4 秒一次 `getChat({after: 最后一条时间})`，没有 websocket，也不需要长连接。
- 文件：图片走 `uniCloud.uploadFile` 传到云存储，消息体里存 `fileID`，类型 `image`。

