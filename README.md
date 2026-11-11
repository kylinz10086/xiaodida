# 校递达 · 校园跑腿小程序

浙江中医药大学的校园快递代取 / 代带餐食互助平台。
**一个小程序，进去选身份**（用户 / 骑手）+ **uniCloud 后端（支付宝云）**，资金走「预付托管」模式。

> 想直接体验：看 [docs/try-it.md](docs/try-it.md)

```
用户下单付款 ──▶ 平台托管 ──▶ 骑手接单 ──▶ 送达 ──▶ 用户确认 ──▶ 结算（平台抽佣 10%）
```

---

## 仓库结构

```
xiaodida/
├── rule.md                 ← 项目全局规则（务必先读）
├── README.md
├── docs/                   ← 使用文档、安全说明、数据模型、资金口径
├── apps/
│   ├── user/               ← 小程序主工程（用户 + 骑手两种身份）
│   │   ├── pages/xyyx/     首页 / 发布 / 详情 / 订单 / 我的 / 协议
│   │   ├── store/          Vuex，只调云对象 xyyx-user
│   │   └── uniCloud-aliyun/  ★ 后端唯一源码
│   │       ├── cloudfunctions/
│   │       │   ├── common/xyyx-common/   鉴权·字段裁剪·记账
│   │       │   ├── xyyx-user/            用户端云对象
│   │       │   ├── xyyx-rider/           骑手端云对象
│   │       │   └── xyyx-pay/             微信支付 V3 / mock
│   │       └── database/                 8 张表 schema + 索引
│   └── rider/              ← 原独立骑手端（已合并进 apps/user/pages/rider，仅存档）
├── admin/                  ← 后台管理（uni-admin 模板，业务页待做）
├── reference/              ← uni-id 登录模板（参考，不部署）
├── tools/
│   ├── wx-mcp/             ← 自研微信小程序开发插件（MCP）
│   └── scripts/            ← 密钥扫描 / 模板清洗 / 地图 key 抽取
└── miniprogram/            ← 原生小程序离线演示版（历史产物）
```

---

## 快速开始

### 只想看效果（不需要云端）

```powershell
& "F:\微信web开发者工具\cli.bat" open --project "F:\xiaodida\miniprogram"
```

原生演示版，5 个页面、3 条示例任务、数据存本地，能完整走完下单 → 抢单 → 送达 → 确认。

### 跑正经的两个端

需要：HBuilderX（已登录 DCloud 账号）+ 微信开发者工具（已扫码登录）+ 已绑定的 uniCloud 空间。

```powershell
# 1. 配密钥（仓库里没有真实密钥）
copy "apps\user\uniCloud-aliyun\cloudfunctions\common\uni-config-center\uni-id\config.example.json" `
     "apps\user\uniCloud-aliyun\cloudfunctions\common\uni-config-center\uni-id\config.json"
# 然后把里面的占位符换成真实值

# 2. 打开工程
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" project open --path "F:\xiaodida\apps\user"
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" project open --path "F:\xiaodida\apps\rider"

# 3. 编译到微信小程序
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\user"  --compile true
& "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" launch mp-weixin --project "F:\xiaodida\apps\rider" --compile true
```

云端部署（数据库、云对象、支付）详见 **[docs/usage.md](docs/usage.md)**。

---

## 两个端是怎么隔离的

| 层 | 做法 |
| --- | --- |
| 接口 | 用户端只能调 `xyyx-user`，骑手端只能调 `xyyx-rider`，方法集不重叠 |
| 字段 | 服务端 `taskForUser()` / `taskForRider()` 两套白名单 |
| 数据 | 所有集合 `permission: false`，客户端无法直连数据库 |

**骑手接单前拿不到任何手机号**；接单后只给 `138****5678`。
用户永远拿不到骑手的真名、学号、学校。

---

## 安全

- 密码 `scrypt` + 每用户随机盐 + pepper（不用明文、不用裸哈希）
- 写接口带 nonce 防重放，按 uid 限流，参数白名单
- 记账有 `idempotency_key` 唯一索引，重复回调不重复入账
- 仓库零密钥：提交前跑 `node tools/scripts/check-secrets.mjs`

详见 **[docs/security.md](docs/security.md)**。

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [rule.md](rule.md) | 项目全局规则与红线 |
| [docs/usage.md](docs/usage.md) | 怎么跑、怎么部署、怎么配支付 |
| [docs/api.md](docs/api.md) | 云对象接口清单 |
| [docs/data-model.md](docs/data-model.md) | 集合与字段 |
| [docs/finance.md](docs/finance.md) | 资金流转与对账口径 |
| [docs/security.md](docs/security.md) | 安全措施与泄露处置 |

---

## 开发工具链

本机已装微信开发者工具与 HBuilderX。仓库里还带了自研的
[`tools/wx-mcp/`](tools/wx-mcp/) 插件（MCP），可以让我直接：
环境自检 / 打开工程 / 出预览二维码 / 上传体验版 / 静态体检 / 编译 uni-app。

---

## License

ISC。`static/`、`uni_modules/` 中的第三方资源版权归原作者（uView、uni-id 等）。
