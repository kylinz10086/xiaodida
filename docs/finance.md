# 校递达 · 资金口径与对账

> 目标：任何时候，**订单金额 = 骑手收入 + 平台佣金**，**钱包余额 = 流水求和**。

---

## 一、一笔订单的钱怎么走

以 10 元订单、抽佣 5% 为例：

| 时机 | 触发 | 流水（元） | 骑手钱包 | 平台 |
| --- | --- | --- | --- | --- |
| 用户支付 | `markPaid` | `escrow_in +10` | — | 托管 +10 |
| 骑手接单 | `grabTask` | 无 | — | — |
| 用户确认收货 | `settleTask` | `income +9.5`、`commission +0.5`、`escrow_out -10` | +9.5 | 托管 -10、佣金 +0.5 |
| 骑手提现 | `requestWithdraw` | `withdraw -9.5` | 余额 -9.5、冻结 +9.5 | — |

**接单不产生任何资金变动**，这是「外卖式托管」的关键：钱在平台手里，跑完才结算。

---

## 二、退款

只有「待接单」状态可以取消：

| 触发 | 流水 | 结果 |
| --- | --- | --- |
| `cancelTask` | `refund +10` | 用户原路退回；订单状态 → 4 |

已接单的订单不能自助取消（需要客服介入），避免骑手白跑。

---

## 三、对账口径

### 3.1 单笔订单对账

```js
// 刘海的伪代码，真实对账脚本见 tools/scripts（待补）
income + commission === amount_cent   // 必须成立
```

### 3.2 平台账户对账

```
平台托管余额 = Σ escrow_in - Σ escrow_out - Σ refund
平台佣金收入 = Σ commission
```

### 3.3 骑手钱包对账

```
wallets.balance_cent === Σ transactions(amount_cent) where user_id = uid
```

因为 `transactions` 只增不改、且 `idempotency_key` 唯一，这个等式应当永远成立；
一旦不等，说明有人绕过记账函数直接改了余额（**违规**）。

---

## 四、幂等与并发

| 场景 | 保护 |
| --- | --- |
| 支付回调重复到达 | `markPaid` 用 `pay_status != paid` 做 CAS；流水 `idempotency_key = escrow_in:<taskId>` 唯一 |
| 用户重复点确认收货 | `settleTask` 用 `status === 2` 做 CAS；`income:<taskId>` 唯一 |
| 两人同时抢单 | `where({_id, status:1}).update()`，`updated === 1` 才算成功 |
| 重复提现 | 扣余额用 `where({_id, balance_cent >= amount})`，失败即拒绝 |

---

## 五、抽佣

- 比例来自 `xyyx-settings`（后台可改，代码兜底 `DEFAULT_SETTINGS.commissionRate = 0.05`）
- **客户端不可传**，服务端计算后写入 `commission_cent`
- 改比例属于资金规则变更，需同步更新 `rule.md` 第 6 节并记录

---

## 六、待补

| 项 | 说明 |
| --- | --- |
| ~~自动确认定时任务~~ | ✅ 已实现 `xyyx-cron`（每 10 分钟扫一次 `auto_confirm_at < now` 的订单并结算，同时清理过期 nonce） |
| 提现打款 | 目前只扣余额进冻结，需要人工在后台打款后改状态 |
| 对账脚本 | `tools/scripts/reconcile.mjs`（按 3.3 的等式跑） |
| 平台账户表 | 目前佣金只记流水，没有单独的 `platform` 钱包行 |
