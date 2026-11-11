# 校递达 · 使用文档

> 面向：**接手开发的人** 和 **要把它跑起来的人**。
> 规则与红线见 [`../rule.md`](../rule.md)，改代码前先读它。

---

## 一、这个项目是什么

浙江中医药大学的校园跑腿平台，拆成**两个小程序**：

| 端 | 目录 | 谁用 | 能干什么 |
| --- | --- | --- | --- |
| 用户端 | `apps/user` | 下单的同学 | 发需求、支付、看进度、确认收货、评价 |
| 骑手端 | `apps/rider` | 跑腿的同学 | 抢单、取件、送达、看收入、提现 |
| 后台 | `admin` | 平台运营 | uni-admin 模板（业务页还没做） |

资金走**预付托管**：用户下单先付钱到平台 → 骑手接单送达 → 用户确认（或 24 小时自动确认）→ 平台抽佣 10% 后结算给骑手。

---

## 二、目录速览

```
xiaodida/
├── rule.md                 项目规则（先读）
├── README.md
├── docs/                   设计、使用、安全、资金文档
├── apps/
│   ├── user/               用户端（uni-app，含唯一的后端源码）
│   │   └── uniCloud-aliyun/
│   │       ├── cloudfunctions/
│   │       │   ├── common/xyyx-common/   鉴权·字段裁剪·记账
│   │       │   ├── xyyx-user/            用户端云对象
│   │       │   ├── xyyx-rider/           骑手端云对象
│   │       │   └── xyyx-pay/             微信支付 / mock
│   │       └── database/                 8 张表 schema + 索引
│   └── rider/              骑手端（uni-app，无 uView）
├── admin/                  后台（uni-admin）
├── tools/
│   ├── wx-mcp/             自研微信小程序开发插件
│   └── scripts/            密钥扫描、模板清洗、地图 key 抽取
├── miniprogram/            原生小程序离线演示版（历史产物）
└── reference/              uni-id 登录模板（参考，不部署）
```

---

## 三、本地怎么跑

### 3.1 前置

| 工具 | 位置（本机） | 说明 |
| --- | --- | --- |
| HBuilderX | `F:\HBuilderX.5.05.2026032417\HBuilderX\` | 需要登录 DCloud 账号 |
| 微信开发者工具 | `F:\微信web开发者工具\` | 需要微信扫码登录，并开启「设置-安全设置-服务端口」 |

### 3.2 用户端

1. HBuilderX → 文件 → 导入 → 选择 `F:\xiaodida\apps\user`
2. 先配好云空间（见第四章）并部署云对象
3. 运行 → 运行到小程序模拟器 → 微信开发者工具

命令行（HBuilderX 已打开的情况下）：

```powershell
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\user" --compile true
```

### 3.3 骑手端

```powershell
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" project open --path "F:\xiaodida\apps\rider"
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\rider" --compile true
```

> ⚠️ 骑手端现在和用户端用同一个小程序 appid（`wxab71ca588522f56d`），
> 同时只能跑一个。正式上线要**再申请一个小程序 appid**，填到
> `apps/rider/manifest.json` 的 `mp-weixin.appid`。

---

## 四、云端配置（只做一次）

### 4.1 绑定 uniCloud 空间

当前空间：`env-00jy72ju8b4z`（`apps/user/manifest.json` 的 `_spaceID`）。

如果 HBuilderX 里看不到这个空间：
1. 打开 uniCloud 面板 → 右键刷新空间列表
2. 找到 `env-00jy72ju8b4z` → 右键「设为当前项目使用的云服务空间」

### 4.2 密钥（重要）

仓库里**没有任何真实密钥**。部署前需要本地生成：

```powershell
# 1. 复制模板
copy "apps\user\uniCloud-aliyun\cloudfunctions\common\uni-config-center\uni-id\config.example.json" `
     "apps\user\uniCloud-aliyun\cloudfunctions\common\uni-config-center\uni-id\config.json"

# 2. 把里面的 <PASSWORD_PEPPER> / <TOKEN_SECRET> / <REQUEST_AUTH_SECRET> / <WX_APP_SECRET> 换成真实值
#    随机串可用：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. 支付（可选，不配就是模拟支付）
copy "apps\user\uniCloud-aliyun\cloudfunctions\xyyx-pay\pay-config.example.js" `
     "apps\user\uniCloud-aliyun\cloudfunctions\xyyx-pay\pay-config.js"
```

这两个 `config.json` / `pay-config.js` 都已写进 `.gitignore`，**不要提交**。

提交前务必跑一遍：

```powershell
node tools/scripts/check-secrets.mjs
```

### 4.3 部署数据库和云对象

在 HBuilderX 里：

1. 右键 `uniCloud-aliyun/database` → **上传所有 DB Schema**
2. 右键 `uniCloud-aliyun/database/db_init.json` → **初始化云数据库**（会建集合）
3. 右键 `cloudfunctions/common/xyyx-common` → **上传公共模块**
4. 右键 `cloudfunctions/xyyx-user` → **上传部署**
5. 右键 `cloudfunctions/xyyx-rider` → **上传部署**
6. 右键 `cloudfunctions/xyyx-pay` → **上传部署**

命令行方式：

```powershell
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"
& $cli cloud functions --upload common --prj user --provider aliyun --name xyyx-common
& $cli cloud functions --upload cloudfunction --prj user --provider aliyun --name xyyx-user
& $cli cloud functions --upload cloudfunction --prj user --provider aliyun --name xyyx-rider
& $cli cloud functions --upload cloudfunction --prj user --provider aliyun --name xyyx-pay
```

### 4.4 让骑手账号能接单

骑手需要审核通过（`xyyx-users.rider_status = 2`）。V1 阶段没有后台审核页，可以手工在
uniCloud 控制台把对应用户的 `rider_status` 改成 `2`，或者临时用云函数改。

---

## 五、支付怎么配

| 阶段 | 配置 | 行为 |
| --- | --- | --- |
| 开发 | 不建 `pay-config.js` | 走 **mock**：下单后点「模拟支付」即视为支付成功 |
| 生产 | 建 `pay-config.js` 填 mchid / 私钥 / APIv3 / 平台证书 | 走**微信支付 V3 JSAPI**，真实扣款与回调 |

注意：

- mock 模式在服务端有硬校验：一旦配置了真实支付，`mockPaySuccess` 会被拒绝（403）。
- 支付回调需要 HTTPS 地址，建议把 `xyyx-pay` 的 `handleNotify` 通过云函数 URL 化暴露。

---

## 六、钱是怎么走的

```
用户下单 ──支付──▶ 平台托管(escrow_in 流水)
                      │
              骑手接单（不结算）
                      │
            送达 + 用户确认（或 24h 自动确认）
                      │
      ┌───────────────┴───────────────┐
   骑手收入(income, 90%)        平台佣金(commission, 10%)
```

- 金额全部用**整数分**存储（`*_cent`），前端只显示元。
- 每一笔变动都写 `xyyx-transactions`，`idempotency_key` 有唯一索引，重复回调不会重复记账。
- 未接单可取消 → 全额退款（`refund` 流水）。
- 骑手提现走人工审核，扣余额进 `frozen_cent`。

---

## 七、两端口是怎么隔离的

详见 [`security.md`](security.md) 与 `rule.md` 第 9 节。要点：

1. 两个端调**不同的云对象**（`xyyx-user` / `xyyx-rider`），方法集不重叠。
2. 服务端两个「视图函数」决定字段：`taskForUser()` / `taskForRider()`。
   - 骑手**接单前**拿不到手机号、拿不到门牌详情
   - 骑手**接单后**只拿到 `138****5678` 这种脱敏号
   - 用户永远拿不到骑手的真名、学号、学校
3. 数据库 schema 全部 `permission: false`，客户端**无法**直连读写。

---

## 八、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 编译报 `Undefined variable` | `uni.scss` 缺 `$uni-*` 变量，uni_modules 组件需要它们 |
| 编译报 `manifest.json解析失败` | 文件带 BOM，用无 BOM 的 UTF-8 重存 |
| 运行报「云端未就绪」 | 没绑云空间 / 云对象没部署 |
| 抢单提示「你还不是骑手」 | `rider_status` 不是 2，见 4.4 |
| 预览二维码出不来 | 微信开发者工具没登录，或没开服务端口 |
| `wx.preview` 失败 | 同上；另外 `wx_env` 的 `login:false` 就是没登录 |

---

## 九、常用命令

```powershell
# 密钥扫描（提交前必跑）
node tools/scripts/check-secrets.mjs

# 清洗模板里的真实密钥（一次性）
node tools/scripts/sanitize-templates.mjs

# 把硬编码的腾讯地图 key 抽到本地文件
node tools/scripts/extract-map-key.mjs

# 编译两端
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\user" --compile true
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\rider" --compile true

# 自研插件自测
node tools/wx-mcp/smoke.mjs
```
