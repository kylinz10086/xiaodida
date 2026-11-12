# 校递达 · 开发者指南

> 从 `rule.md` 搬过来的「怎么做」部分。红线（不许做什么）在 [rule.md](../rule.md)。
> 面向接手开发的人，按顺序读就能上手。

---

## 一、一句话定位

浙江中医药大学的校园跑腿平台。**一个小程序**（用户 / 骑手两种身份）+ uniCloud 后端（**支付宝云**）。
资金走「预付托管」：下单付款进托管 → 骑手接单 → 送达 → 结算（平台服务费 8%）。

---

## 二、仓库结构

```
xiaodida/
├── rule.md                    红线（必须先读）
├── README.md
├── 测试目录.md                 验收清单
├── docs/                      使用/安全/接口/数据/资金/架构/本文件
├── apps/
│   └── user/                  唯一的小程序工程（用户 + 骑手 + 聊天）
│       ├── pages/xyyx/        首页 / 发布 / 详情 / 订单 / 我的 / 协议 / 反馈
│       ├── pages/rider/       骑手工作台 / 中心 / 申请 / 详情 / 收入
│       ├── pages/chat/        订单聊天
│       └── uniCloud-alipay/   ★ 后端唯一源码（支付宝云）
│           ├── cloudfunctions/
│           │   ├── common/xyyx-common/   鉴权·字段裁剪·记账·聊天
│           │   ├── xyyx-user/            用户端云对象
│           │   ├── xyyx-rider/           骑手端云对象
│           │   ├── xyyx-pay/             微信支付 V3 / mock
│           │   ├── xyyx-admin/           管理后台云对象
│           │   └── xyyx-cron/            定时任务（自动确认 + 清理 nonce）
│           └── database/                 表 schema + 索引
├── admin/                     后台（uni-admin）
├── tests/                     回归测试
├── tools/
│   ├── wx-mcp/                自研微信小程序开发插件（MCP）
│   └── scripts/               密钥、部署、测试、图片脚本
└── reference/                 uni-id 登录模板（参考，不部署）
```

**为什么后端只放 `apps/user` 一处**：uniCloud 要求云函数挂在某个 uni-app 工程下才能被 HBuilderX 上传。
骑手端不复制后端，靠 `manifest.json` 的 `_spaceID` 指向同一空间，运行时 `importObject` 按空间解析。

---

## 三、技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 客户端 | uni-app（Vue 2） | 用户端用 uView 1.x；骑手端纯手写 CSS（更轻） |
| 后端 | uniCloud **支付宝云** 云对象 | 空间 `env-00jy72ju8b4z`，provider `alipay` |
| 数据库 | uniCloud 文档型数据库 + schema | 所有集合 permission=false |
| 账号 | uni-id-pages / uni-id-common | 不自己造登录体系 |
| 支付 | 微信支付 V3 JSAPI + 平台托管账本 | 无证书时自动降级 mock |

新增依赖要说明理由、体积、可替代性。

---

## 四、代码约定

- 页面 `kebab-case`；云对象目录名 = `importObject` 名。
- 云对象方法统一返回 `{ code, msg, data }`，`code=0` 成功。
- 每个方法固定五步：**鉴权 → 参数校验 → 权限校验 → 业务 → 返回裁剪后的数据**。
- 注释写「为什么」，不写「做什么」。
- 页面里不写业务规则（金额、状态判断放服务端）。
- 不 `console.log` 敏感信息（手机号只打后 4 位）。

---

## 五、验证标准（提交前）

| 级别 | 做什么 | 命令 |
| --- | --- | --- |
| L1 静态 | 密钥扫描、JSON 校验、JS 语法 | `node tools/scripts/check-secrets.mjs` |
| L2 逻辑 | 隔离规则 + 记账断言 | `node tools/scripts/test-isolation.cjs`<br>`node tools/scripts/test-settlement.cjs` |
| L3 编译 | 两端都能编译出小程序产物 | 见下 |
| L4 真机 | 开发者工具/真机跑通主流程 | 人工 |

```powershell
# L3 编译（只有一个小程序工程）
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"
& $cli launch mp-weixin --project "F:\xiaodida\apps\user" --compile true
```

**不许**在没跑过 L1–L3 的情况下说「做完了」。

---

## 六、云端部署

### 6.1 前置

- HBuilderX 已登录 DCloud 账号
- 项目 `apps/user` 已导入，且已绑定空间 `env-00jy72ju8b4z`（支付宝云）
- 本地已生成 `uni-id/config.json`（含真实密钥）

### 6.2 生成密钥

```powershell
.\tools\scripts\setup-secrets.ps1          # 交互式，会提示粘贴 AppSecret
.\tools\scripts\setup-secrets.ps1 -AppSecret "xxx"
```

脚本会生成 pepper/tokenSecret/requestAuthSecret 并写入 `config.json`（gitignore）。

### 6.3 部署

```powershell
.\tools\scripts\deploy-cloud.ps1
```

顺序：schema → 公共模块 `xyyx-common` → 4 个云对象。

**CLI 的两个注意点**：

- `--upload db` 的 `--name` 必须带扩展名，如 `xyyx-users.schema.json`
- `--upload db` **不接受** `.index.json`，索引要去 uniCloud 网页控制台建，或在 HBuilderX 里右键「上传所有 DB Schema」

### 6.4 部署后核对

```powershell
& $cli cloud functions --list cloudfunction --prj user --provider alipay --cloud
# 应看到 xyyx-user / xyyx-rider / xyyx-pay / xyyx-cron
```

---

## 七、常用命令

```powershell
# 密钥扫描（提交前必跑）
node tools/scripts/check-secrets.mjs

# L2 测试
node tools/scripts/test-isolation.cjs
node tools/scripts/test-settlement.cjs

# 清洗模板里的真实密钥（一次性）
node tools/scripts/sanitize-templates.mjs

# 把硬编码的腾讯地图 key 抽到本地
node tools/scripts/extract-map-key.mjs

# 只看会传哪些文件（不真传）
python upload_xiaodida.py --dry-run
```

---

## 八、变更流程

1. 改规则 → 先改 `rule.md`。
2. 改 schema → 同步 `docs/data-model.md`，写迁移说明。
3. 加接口 → 同步 `docs/api.md`，补对应测试。
4. 涉及钱/权限 → 在 `rule.md` 对应条目留痕。
5. 发现新风险 → 写进 `docs/security.md`，不要只记脑子里。

---

## 九、踩坑记录

| 坑 | 现象 | 处理 |
| --- | --- | --- |
| `uni.scss` 缺 `$uni-*` 变量 | 编译报 `SassError: Undefined variable` | 保留 uni-app 标准变量；骑手端不 import uview |
| manifest 带 BOM | `manifest.json解析失败 / Unexpected token` | 存成无 BOM UTF-8 |
| `.ps1` 带中文但无 BOM | PowerShell 语法解析错乱 | `.ps1` **必须存成带 BOM 的 UTF-8** |
| HBuilderX 切换云服务商 | 目录被改名 `uniCloud-aliyun` → `uniCloud-alipay` | 脚本里自动探测 `uniCloud-*` |
| CLI 报 `appid 不存在` | manifest 的 `__UNI__xxx` 不是账号下真实 appid | 用已注册的 appid |
| `--assignspace` 找不到空间 | 空间未进 HBuilderX 缓存 | 只能在 UI 里刷新空间列表并绑定 |

---

## 十、部署踩坑补充（2026-11-11 实测）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 云对象报「用户函数代码语法或逻辑异常」 | 云函数 `require('xyyx-common')` 找不到公共模块 | 每个云函数的 `package.json` 必须写 `"xyyx-common": "file:../common/xyyx-common"`；`xyyx-common` 自己也要写 `"uni-id-common": "file:../uni-id-common"` |
| 未登录调用返回「函数异常」而不是 401 | 云对象方法直接抛 BizError | 导出时统一包一层 `C.guard(fn)`，把业务异常转成 `{code,msg}` |
| 云对象 `request:fail` | 开发者工具校验合法域名 | `unpackage/.../project.private.config.json` 的 `urlCheck` 改 `false`（它会覆盖 `project.config.json`）；真机还要在微信后台加请求域名 |
| `--upload db` 报 `paths[3] must be string` | 没给 `--name` | `--name xyyx-users.schema.json`（必须带扩展名） |
| `.index.json` 传不上去 | CLI 只接受 `.schema.json` | 索引去 uniCloud 网页控制台建 |

### 支付宝云的额外注意

- 目录名是 `uniCloud-alipay`，CLI 的 `--provider` 是 `alipay`
- 编译产物里会内嵌该空间的 `accessKey/secretKey`（uniCloud 客户端 SDK 的正常设计），
  所以 `unpackage/` 必须在 `.gitignore` 里
- 请求域名：`https://<spaceId>.api-hz.cloudbasefunction.cn`
### 部署清单（别漏）

登录是走 `uni-id-co` 的，它依赖一堆公共模块。**只部署 xyyx-* 会导致登录直接失败**：

```
公共模块（必须先传）：
  uni-config-center / uni-id-common / uni-captcha / uni-cloud-s2s / uni-open-bridge-common
  + 自己的 xyyx-common

云函数：
  uni-id-co   ← 登录/注册/绑定手机号，漏了它登录必失败
  xyyx-user / xyyx-rider / xyyx-pay / xyyx-cron
```

核对命令：

```powershell
& $cli cloud functions --list cloudfunction --prj user --provider alipay --cloud
# 应看到 uni-id-co + xyyx-user/rider/pay/cron
```
### 骑手怎么审核（冷启动）

管理后台还没做，所以加了一条冷启动规则：
**平台还没有任何一个「已通过」的骑手时，第一个提交申请的人自动通过**（`rider_status` 直接置 2）。
之后所有申请都需要人工在 uniCloud 控制台 `xyyx-users` 里把 `rider_status` 改成 `2`。

代码位置：`xyyx-rider/index.obj.js` 的 `applyRider()`。