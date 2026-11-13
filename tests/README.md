# 回归测试（不需要连 uniCloud）

这几个脚本用「内存数据库 + 假登录态」直接跑云函数的真实代码，专门盯金额和状态流转，
因为这些地方错了就是真金白银的事。

```bash
# 订单金额 / 修改订单 / 退款（67 项断言）
node tests/money-flow.spec.js

# 骑手抢单 → 取件 → 送达 → 结算（59 项断言）
node tests/rider-flow.spec.js

# 图片：头像（压缩/高清）、聊天缩略图、服务端取图、订单/留痕缩略图、列表不带图（39 项断言）
node tests/image-flow.spec.js

# 提现：自动处理 + 风控（认证、单笔/单日上限、冷却、冻结退回）（18 项断言）
node tests/withdraw-flow.spec.js

# 静态检查：.vue 的 <script> 能不能解析、<template> 标签有没有配对
node --experimental-vm-modules tests/check-vue-scripts.js
node tests/check-vue-templates.js
```

> Windows 上如果 `node` 不在 PATH，可以用 HBuilderX 自带的：
> `F:\HBuilderX.5.05.2026032417\HBuilderX\plugins\node\node.exe`

## 这两个 spec 在守什么

`money-flow.spec.js` 对应的就是「1 元的单改成 3 元，结果付了 4 元」这个 bug：

1. 下单付 1 元 → 实付 100 分
2. 改成 3 元 → **只要求补 2 元**，订单 paid_cent 仍是 100
3. 补 2 元 → 累计实付 300 分（不是 400）
4. 改回 1 元 → **退 2 元**，payments 里记清楚是哪一笔退了多少
5. 取消订单 → 剩下 1 元继续退，`退款总额 == 实付总额`
6. 老数据（没有 payments 字段）也能正常退
7. 骑手已接单的订单不能改价
8. 退款不能超过可退金额
9. 微信支付订单走微信原路退款（用假 HTTP 响应验证请求体）

`rider-flow.spec.js` 对应「接单之后无法完成订单」：

- 大厅里「可赚」显示的是预期收入（不是 ¥0）
- 接单前拿不到手机号/门牌，接单后才给
- 没取件不能点送达
- **点送达 = 订单完成 + 钱进骑手钱包**，重复点不会重复结算
- 学号必须 15 位，并按 学年/学院专业/班级 分段解析

## 加测试怎么加

`tests/fake-uni.js` 提供了 `createEnv()`，返回内存库、假登录态和各种云对象的调用入口：

```js
const { createEnv } = require('./fake-uni')
const env = createEnv({ uid: 'someone' })
env.addDoc('xyyx-tasks', { _id: 'task-xxxxxx', /* ... */ })
const res = await env.call(env.userObj.cancelTask, 'task-xxxxxx', '不想要了', env.meta())
```

注意：内存库的查询只实现了比较常用的操作符（`inc/push/neq/gt/gte/lt/lte/in`），
如果云函数里用了新的操作符，需要在 `fake-uni.js` 的 `matchOne` / `applyPatch` 里补上。
