# 校递达 · 安全说明

> 这份文档记录**做了哪些防护**、**发现并修掉了哪些问题**、**哪些还需要人工处理**。
> 每次安全相关改动都要在这里留痕（rule.md 第 12 节）。

---

## 一、必须人工处理的事（优先级最高）

### 🔴 1. 微信小程序 AppSecret 已泄露，必须重置

**事实**：`uni-id/config.json` 里曾以明文保存 `mp-weixin.oauth.weixin.appsecret`
（appid `wxab71ca588522f56d`），并且在 2026-11-10 的首次提交里被推到了公开仓库。

**处理**：

1. 打开 [微信公众平台](https://mp.weixin.qq.com/) → 开发管理 → 开发设置 → **重置 AppSecret**
2. 把新的 AppSecret 填进本地 `apps/user/uniCloud-alipay/cloudfunctions/common/uni-config-center/uni-id/config.json`
   （该文件已在 `.gitignore` 中，不会被提交）
3. 重置后旧的 AppSecret 立即失效，历史泄露无危害

### 🟠 2. 腾讯位置服务 Key 已泄露

**事实**：地图 key `29f0...6085` 硬编码在 9 个 `.vue` 文件里。

**已处理**：抽到 `apps/user/common/map-key.js`（gitignore），仓库只留 `map-key.example.js`。

**建议**：去 [腾讯位置服务控制台](https://lbs.qq.com/dev/console/) 给这个 key 加
「小程序 appid 白名单」或直接换一个新 key。

### 🟠 3. 微信支付密钥文件仍在磁盘明文

`F:\xiaodida\微信支付信息.txt` 里有商户号、APIv2/V3 密钥、证书序列号。
该文件已被 `.gitignore` 排除，**没有进过仓库**，但建议：

- 迁移到密码管理器或 `.secrets/`（gitignore）
- 如果这份文件曾发给别人，去商户平台重置 APIv3 密钥

---

## 二、已实施的防护

### 2.1 密码存储（加盐）

| 项 | 做法 |
| --- | --- |
| 算法 | `scrypt`（N=16384, r=8, p=1, keylen=32），内存硬，抗 GPU 暴力破解 |
| 盐 | **每用户 16 字节随机盐**，与哈希一起存 |
| pepper | 全局密钥，放 `uni-id/config.json` 的 `passwordSecret[0].value`，不进数据库 |
| 比对 | `crypto.timingSafeEqual`，防时序侧信道 |
| 格式 | `scrypt$v1$<salt_b64>$<hash_b64>` |

实现：`apps/user/uniCloud-alipay/cloudfunctions/common/uni-config-center/uni-id/custom-password.js`

> 原实现是 `passwordHash: password` —— **明文存储**。已废弃，且旧格式密码一律判定不匹配，强制重设。

### 2.2 数据访问

- 所有集合 schema `permission: { read:false, create:false, update:false, delete:false }`
  → 客户端**无法**直接读写数据库，只能走云对象。
- 云对象每个方法固定五步：**鉴权 → 参数校验 → 权限校验 → 业务 → 字段裁剪**。

### 2.3 接口防护

| 防护 | 实现 |
| --- | --- |
| 身份 | `uni-id-common.checkToken`，role 以数据库为准（不信 token 里的旧值） |
| 防重放 | `nonce + timestamp`（5 分钟窗口），`xyyx-nonces.key` 唯一索引，重复即 409 |
| 限流 | 写操作按 `uid:action` 计数（如发单 10 次/分钟、抢单 30 次/分钟） |
| 参数白名单 | `pick(data, ALLOWED)`，多余字段直接丢弃，客户端塞不进 `status`/`money` |
| 越权 | 所有资源操作校验 `publisher_id/runner_id === 当前 uid` |
| 金额 | 只认服务端计算值；客户端传的 `amountCent` 不一致直接 400 |
| 幂等 | 记账用 `idempotency_key` 唯一索引 + 任务状态 CAS |

### 2.4 字段裁剪（两端口隔离）

服务端两个视图函数决定「谁能看到什么」：

```js
taskForUser(task, viewerId)   // 用户端：骑手只有昵称/头像/评分
taskForRider(task, riderId)   // 骑手端：接单前无手机号，接单后脱敏号
```

| 字段 | 骑手看（接单前） | 骑手看（接单后） |
| --- | --- | --- |
| 手机号 | ❌ 完全没有该字段 | ✅ `138****5678` |
| 详细门牌 | ❌ 只有地点名 | ✅ |
| 备注 | ❌ | ✅ |
| 用户昵称/头像 | ✅ | ✅ |
| 用户真实姓名/学号 | ❌ | ❌ |

### 2.5 日志

- 不打印完整手机号、token、openid（`maskMobile` 只输出 `138****5678`）
- 未知异常统一返回「服务开小差了」，不暴露堆栈/集合名

---

## 三、密钥管理流程

```
仓库（只放占位符）                      本地（gitignore）
config.example.json          ──复制──▶  config.json（真实值）
pay-config.example.js        ──复制──▶  pay-config.js（真实值）
                                        ↑ HBuilderX 上传时读的是这份
```

提交前的强制检查：

```powershell
node tools/scripts/check-secrets.mjs
```

检查项：
1. 敏感键名（`appsecret`/`tokenSecret`/`apiv3`/`privateKey`…）带真实值
2. 32 位十六进制（微信 AppSecret 形态）
3. 私钥文件头
4. 不该入库的文件（支付凭据、`.secrets/`、真实 `uni-id/config.json`、`*.pem`）

扫描范围会**自动跳过 `.gitignore` 里的文件**，所以本地留着真实配置不会被误报。

---

## 四、已知风险与后续计划

| 风险 | 现状 | 计划 |
| --- | --- | --- |
| 提现无自动化打款 | 人工审核，只扣余额 | 后续接企业付款到零钱 |
| 无风控（刷单/恶意取消） | 仅限流 | 加信用分、取消率统计、黑名单 |
| 无后台审核页 | 手工改 `rider_status` | 在 `admin` 里加骑手审核页 |
| 图片上传未做病毒扫描 | 仅限制类型与大小 | 接内容安全接口（微信 mediaCheckAsync） |
| 支付回调地址 | 需手工 URL 化 `handleNotify` | 部署后补齐 |
| 无操作审计日志 | 关键操作有流水，但无通用日志表 | 加 `xyyx-audit-logs` |

---

## 五、变更记录

| 日期 | 内容 |
| --- | --- |
| 2026-11-11 | 建立本文件；清理全部明文密钥；密码改 scrypt+盐；地图 key 外置；新增密钥扫描脚本 |
