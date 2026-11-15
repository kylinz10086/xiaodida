# 灰度Release 操作手册（新建独立空间 + 清理旧测试数据）

> 目标：不动现有的 `env-00jy72ju8b4z`，新建一个**干净的灰度空间**，
> 让 5–10 个真人用体验版跑通主链路，再把真实交易和测试数据彻底分开。
>
> 全程约 15–20 分钟（不含微信小程序上传审核）。凡是需要登录 DCloud / 微信后台的步骤都标了 👤。

---

## 1. 建空间 👤

1. 打开 <https://unicloud.dcloud.net.cn/>（支付宝云）
2. 左侧「创建服务空间」→ 服务商选 **支付宝云** → 名称如 `xiaodida-gray` → 创建
3. 记下新的 **空间 ID**（形如 `env-xxxxxxxxxxxx`），后面所有步骤都用它
4. ECharts / 免费额度：支付宝云有免费额度，灰度用途足够，不用买套餐

> 为什么不用老空间：老空间已经跑过真实 1 元支付，微信商户平台留着那些单号。
> 新空间从 0 开始，账和测试数据天然分离，出事也只需回滚一个空间。

---

## 2. 绑定并部署 👤 + 本地

### 2.1 在 HBuilderX 里绑新空间

1. HBuilderX 打开 `apps/user` → 右键 `uniCloud-alipay` → **关联云服务空间** → 选新空间
2. 同样对 `admin` 工程做一次（后台也要指向新空间）

### 2.2 改本地的空间 ID（3 处）

| 文件 | 字段 | 改成 |
| --- | --- | --- |
| `apps/user/manifest.json` | `_spaceID` | 新空间 ID |
| `admin/manifest.json` | `_spaceID` | 新空间 ID |
| `apps/user/uniCloud-alipay/cloudfunctions/xyyx-pay/pay-config.js` | `notifyUrl` | 第 5 步生成的新地址 |

> `manifest.json` 里还有 2 处 `static-env-00jy72ju8b4z...` 的 UniversalLinks，
> 那是 App 端才用到的，小程序灰度可以先不动。

改完自查：

```powershell
cd F:\xiaodida
Select-String -Path apps\user\manifest.json,admin\manifest.json -Pattern '_spaceID'
```

### 2.3 初始化数据库

1. uniCloud 控制台 → 新空间 → 云数据库 → 初始化 → 上传 `db_init.json`
2. **必须确认这 25 个集合都在**（尤其新加的 3 个）：

```
uni-id-users / xyyx-users / xyyx-tasks / xyyx-wallets / xyyx-transactions
xyyx-nonces / xyyx-ratelimits / xyyx-agreements / xyyx-reviews / xyyx-refunds
xyyx-payorders / xyyx-settings / xyyx-messages / xyyx-feedback / xyyx-withdrawals
xyyx-images / xyyx-audit-logs / xyyx-moderation
```

3. 建**唯一索引**（CLI 传不了 `.index.json`，只能控制台建）：

| 集合 | 字段 | 类型 |
| --- | --- | --- |
| `xyyx-nonces` | `key` | 唯一 |
| `xyyx-transactions` | `idempotency_key` | 唯一 |

> 这两个唯一索引是防重放和防重复记账的最后一道锁，漏了会在并发下出问题。

### 2.4 部署后端

```powershell
cd F:\xiaodida
.\tools\scripts\deploy-cloud.ps1
```

脚本会依次传：24 个 schema → `uni-cloud-common` 公共模块 → 7 个云函数
（`xyyx-user` / `xyyx-rider` / `xyyx-pay` / `xyyx-cron` / `xyyx-admin` / `xyyx-ops` / `pay-notify`）。

⚠️ 公共模块必须先于云对象；脚本已经按这个顺序排好了，别手动乱序。

核对：

```powershell
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" cloud functions --list cloudfunction --prj user --provider alipay --cloud
# 应看到 pay-notify / uni-id-co / xyyx-admin / xyyx-cron / xyyx-ops / xyyx-pay / xyyx-rider / xyyx-user
```

---

## 3. 清理旧空间的测试数据（可选，但建议做）

> 前提：你接受「老空间的账本原样封存」。`purgeBusiness` **不动** transactions / wallets /
> payorders / refunds / withdrawals，所以老空间的账仍然是完整可查的。

### 3.1 启动管理后台

```powershell
cd F:\xiaodida
node tools\admin-server.cjs
# 保持这个窗口别关
```

浏览器打开 <http://127.0.0.1:5180/admin/>，用管理员账号登录。

### 3.2 在浏览器 F12 控制台依次执行

```js
// ① 先看有多少（业务 / 账本分开列）
const ops = uniCloud.importObject('xyyx-ops', { customUI: true })
await ops.stats()

// ② 备份到云存储（返回 fileID，删错了能拉回来）
await ops.backup()

// ③ dry-run：只报「准备删多少」，一条都不删
await ops.purgeBusiness({ confirm: 'PURGE-BUSINESS' })

// ④ 确认上面数字确实是测试数据后，才真删
await ops.purgeBusiness({ confirm: 'PURGE-BUSINESS', dryRun: false })
```

> 如果第 ① 步里 `xyyx-tasks` 只有几十条、`xyyx-transactions` 有条数但不大，
> 说明确实是测试数据，可以放心删。
> **如果 tasks 里出现你不认识的标题、或 transactions 有几百条以上，先停下来问我。**

### 3.3 清理完自检

- `await ops.stats()` → business 全 0，ledger 保持原样
- 小程序端：清一次缓存（我的 → 退出登录 → 重新登录），确认不再显示旧订单

---

## 4. 配置（新空间第一次必须做）

在管理后台「系统设置」里填：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `commissionRate` | `0.08` | 平台抽佣 8% |
| `contentCheckMode` | `log` | 灰度期只留档不拦，看一周误报再切 `block` |
| `wxAppid` | `wxab71ca588522f56d` | 内容安全取 access_token 用 |
| `wxAppSecret` | ← 填**重置后**的新值 | ⚠️ 旧值已泄露，见 `docs/security.md` |
| `riskCancelDailyLimit` | `5` | 24h 取消 5 单触发风控 |
| `riskCancelRate` | `0.5` | 且取消率 ≥50% 才触发 |
| `riskNewAccountHours` | `0` | 0 = 关闭新账号限额 |
| `supportMobile` | 你的手机号 | 客服入口展示 |

> `wxAppSecret` 只存在 `yyyx-settings`（schema 全禁，客户端读不到），
> 但仍是**明文存库**。要更严的做法是接 uni-open-bridge，见后续计划。
> （1.2.0 起这条可以留空：代码会回落到 `uni-id/config.json` 里的同一个 AppSecret。）

### 4.1 加管理员账号

后台目前只有一个初始管理员 `xyyxadmin`。加人要两步：先登录现有管理员，再由后端建号。

**为什么不能用 `uni-id-co.registerAdmin`**：它发现库里已有管理员就直接拒绝（`ERROR.ADMIN_EXISTS`），
只适合首次初始化。`registerUser` 又要图形验证码，服务端调不了。
所以 `yyyx-admin.createAdmin` 自己建 `uni-id-users` 文档，密码算法和
`custom-password.js` 完全一致（有测试用官方 `verifyPassword` 反向校验，防止两套实现漂移）。

在管理后台（登录后）浏览器控制台执行：

```js
const adm = uniCloud.importObject('xyyx-admin', { customUI: true })

// 建号：用户名只能小写字母/数字/下划线 3-20 位；密码 8-64 位，弱密码会被拒
await adm.createAdmin({ username: 'admin2', password: '换成你要的密码', nickname: '审核员' })

// 看现有管理员
await adm.listAdmins()

// 撤销（不能撤自己；至少保留一个）
await adm.revokeAdmin({ uid: '要撤销的uid' })
```

注意事项：

- 新账号**不绑 dcloud_appid**（全局账号），管理后台 H5 能登录，小程序端也能登录（在用户端就是个普通用户）。
- 密码只以 `scrypt$v1$<salt>$<hash>` 入库，谁都读不回来；忘了就 `revokeAdmin` 再建一个。
- 建号/撤销都会写 `admin.create` / `admin.revoke` 审计。
- 新管理员第一次登录后建议去「修改密码」页换掉初始密码。

---

## 5. 支付与域名 👤

### 5.1 URL 化回调

1. uniCloud 控制台 → 新空间 → 云函数 → `pay-notify` → **开启 URL 化 / HTTP 访问**
2. 拿到形如 `https://<新空间>.dev-hz.cloudbasefunction.cn/pay-notify` 的地址
3. 填进 `pay-config.js` 的 `notifyUrl`，**重新部署 `xyyx-pay` 和 `pay-notify`**

### 5.2 微信侧

1. 微信公众平台 → 开发管理 → 开发设置 → **服务器域名**
   - request 合法域名：`https://<新空间>.api-hz.cloudbasefunction.cn`
2. 微信支付商户平台 → 产品中心 → **商家转账** → 开通（需要时）
3. 商户平台 → 账户中心 → API 安全 → **接口安全 IP**
   - 云函数出口 IP 会变；若提现报「此IP地址不允许调用接口」，用后台「查出口IP」把 IP 加进白名单，
     或启用 `pay-config.js` 里的 `relay`（固定 IP 转发器）

### 5.3 体验版

1. 微信公众平台 → 版本管理 → 把新构建设为**体验版**
2. 添加 5–10 个体验成员（灰度名单）
3. 灰度用户扫码进入 → 跑 `测试目录.md` 的 P0-01 ~ P0-10

---

## 6. 上线前自检（打勾）

- [ ] `yyyx-ops.stats()` 业务集合为 0（新空间）
- [ ] `pay-notify` 回调地址已 URL 化，且 GET 不带签名返回 `400 缺少签名头`
- [ ] 一笔 1 元真实支付：微信扣款 → 回调 200 SUCCESS → 订单 `pay_status=paid` → `xyyx-transactions` 有 1 条 `escrow_in`
- [ ] 骑手抢单 → 取件 → 送达 → 结算 8%/92% 金额正确
- [ ] `contentCheckMode=log` 下发一条含敏感词的测试文案 → `yyyx-moderation` 出现待复核记录
- [ ] 用同一手机号注册两个号（发单 + 接单）→ 抢单被拒，`yyyx-audit-logs` 有 `risk.block`
- [ ] `check-secrets.mjs` 无泄露
- [ ] 老空间的两个无源码函数 `z-test-prepare` / `z-test-upload` 已删除

---

## 7. 回滚

```powershell
# 代码整体回滚
cd F:\xiaodida
git revert --no-commit 58228cc && git commit -m "revert 1.2.0"

# 云端回滚（改完代码必须重跑部署，云端不会自动跟着变）
.\tools\scripts\deploy-cloud.ps1
```

只回滚后门一处：

```powershell
git checkout 2b9b615 -- apps/user/uniCloud-alipay/cloudfunctions/pay-notify/index.js
.\tools\scripts\deploy-cloud.ps1 -SkipSchema -SkipCommon
```
