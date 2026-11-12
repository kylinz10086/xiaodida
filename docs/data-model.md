# 校递达 · 数据模型

> 所有集合 `permission` 全部为 `false` —— **客户端无法直接读写**，只能通过云对象。
> 金额一律整数**分**（`*_cent`），时间一律毫秒时间戳（`*_time`）。

---

## 1. `xyyx-users` —— 用户 / 骑手扩展资料

主键 `_id` 与 `uni-id-users._id` 一致（账号本身在 uni-id-users）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `role` | string | `user` / `rider` / `admin` |
| `nickname` `avatar` `mobile` | string | 资料；`avatar` 可能是静态路径或压缩后的 data URI，`mobile` 属敏感字段 |
| `school` | string | 固定「浙江中医药大学」 |
| `rider_status` | int | 0 未申请 / 1 审核中 / 2 已通过 / 3 已拒绝 |
| `real_name` `student_no` | string | **仅平台审核可见，任何端都不下发** |
| `rating` `rider_rating_count` | double / int | 骑手评分与评价次数 |
| `published_count` `accepted_count` | int | 发布数 / 完成数 |
| `total_income_cent` | int | 累计收入（分） |

---

## 2. `xyyx-tasks` —— 订单（核心表）

| 字段组 | 字段 | 说明 |
| --- | --- | --- |
| 内容 | `title` `type` `type_text` `description` | `type`: 1快递 2带餐 3其他 |
| 物品 | `item_type` `item_size` `item_weight` `time_option` | |
| 地点 | `origin` `destination` | `{name, detail, latitude, longitude}` |
| 联系 | `mobile` `wechat_id` | **按角色裁剪下发** |
| 金额 | `amount_cent` `commission_cent` `rider_income_cent` `refund_cent` | 分 |
| 状态 | `status` `pay_status` `pay_mode` `transaction_id` | 见状态机 |
| 双方 | `publisher_id/name/avatar` `runner_id/name/avatar/rating` | |
| 时间 | `create_time` `pay_time` `accept_time` `picked_time` `delivered_time` `auto_confirm_at` `complete_time` `cancel_time` | |
| 其他 | `remark` `images` `pick_proof` `deliver_proof` `abandon_reason` `cancel_reason` `complete_by` | 留痕图存 fileID |

### 状态机

| 值 | 含义 | 允许流转到 |
| --- | --- | --- |
| 1 | 待接单（已付款托管） | 2 接单、4 取消退款 |
| 2 | 进行中 | 3 结算、1 骑手放弃、5 售后 |
| 3 | 已完成（已结算） | — |
| 4 | 已取消（已退款） | — |
| 5 | 售后中 | 3、4 |

> 越级流转在云对象里直接报 400，且用 `where({_id, status: 旧值}).update()` 做 CAS，防并发。

### 索引

- `(status, pay_status, create_time)` —— 大厅查询
- `publisher_id` / `runner_id` —— 我的订单

---

## 3. `xyyx-wallets` —— 钱包

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 用户 uid |
| `balance_cent` | int | 可用余额 |
| `frozen_cent` | int | 提现审核中冻结 |
| `income_cent` | int | 累计收入 |
| `withdrawn_cent` | int | 累计已提现 |

> 只能通过记账函数变动，**禁止**任何地方直接 `update balance_cent`。

---

## 4. `xyyx-transactions` —— 资金流水（只增不改）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | `escrow_in` 托管入 / `escrow_out` 托管出 / `income` 骑手收入 / `commission` 平台佣金 / `refund` 退款 / `withdraw` 提现 |
| `user_id` | string | 归属用户；平台账户用 `platform` |
| `task_id` | string | 关联订单 |
| `amount_cent` | int | 正数入账、负数出账 |
| `idempotency_key` | string | **唯一索引**，防重复记账 |
| `remark` `create_time` | | |

幂等键命名约定：`income:<taskId>`、`commission:<taskId>`、`escrow_in:<taskId>`、`escrow_out:<taskId>`、`refund:<taskId>`、`withdraw:<uid>:<ts>`。

---

## 5. `xyyx-nonces` —— 防重放

| 字段 | 说明 |
| --- | --- |
| `key` | `uid:nonce`，**唯一索引**，重复即 409 |
| `uid` `create_time` `expire_time` | `expire_time` 有普通索引，便于清理 |

---

## 6. `xyyx-ratelimits` —— 限流计数

| 字段 | 说明 |
| --- | --- |
| `key` | `uid:action` |
| `count` `reset_time` | 窗口内次数与重置时间 |

---

## 7. `xyyx-agreements` —— 协议同意留痕（合规）

| 字段 | 说明 |
| --- | --- |
| `user_id` `version` `role` `create_time` | 谁、在哪个端、同意了哪一版 |

---

## 8. `xyyx-reviews` —— 评价

| 字段 | 说明 |
| --- | --- |
| `task_id` `from_id` `to_id` | 订单、评价人、被评价骑手 |
| `score` | 1-5 |
| `content` `create_time` | |

---

## 9. `xyyx-messages` —— 订单内聊天

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `task_id` | string | 所属订单 |
| `from_id` | string | 发送者 uid；`system` 表示系统提示 |
| `to_id` | string | 接收者 uid |
| `content` | string | 文字（≤300 字）或图片 `fileID` |
| `type` | string | `text` / `image` / `system` |
| `read_at` | timestamp | 已读时间；0 未读 |
| `create_time` | timestamp | 发送时间 |

索引：`(task_id, create_time)`、`(to_id, read_at)`。只有该单的发布者和骑手能读写，
`permission` 同样为 `false`，读写在云对象里做成员校验。

---

## 10. 数据库初始化

`apps/user/uniCloud-alipay/database/db_init.json` 列出了所有集合。
HBuilderX：右键 `database` → 上传所有 DB Schema → 右键 `db_init.json` → 初始化云数据库。
