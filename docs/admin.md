# 校递达管理后台（本地 H5）

> 交付时间：2026-11-11 深夜
> 访问地址：<http://127.0.0.1:5180/admin/>
> 管理员账号：`xyyxadmin`
> 初始密码：见本次交付消息（不写进仓库）

---

## 1. 现在能做什么

| 页面 | 路径 | 功能 |
| --- | --- | --- |
| 用户数据 | `#/pages/xyyx/users/list` | 查看全部账号：昵称、用户名、手机号、角色、骑手状态、真实姓名、学号、注册时间；支持关键词搜索、分页、详情弹窗 |
| 骑手审核 | `#/pages/xyyx/riders/list` | 待审核 / 已通过 / 已拒绝 / 全部；通过、拒绝（可填原因）、分页 |
| 骑手状态 | 同上 | 通过后 `rider_status=2`，用户端立刻可抢单；拒绝后 `rider_status=3` 并记录原因 |

数据来源：`xyyx-admin` 云对象（`apps/user/uniCloud-alipay/cloudfunctions/xyyx-admin`），
**不把 `xyyx-users` 的读写权限开放给浏览器**；所有列表/审核先过 `requireAdmin`。

管理员鉴权：
1. `uni-id-pages` 账号密码登录，拿 `uni-id-token`；
2. `xyyx-admin` 校验 `uni-id-users.role` 包含 `admin`（或 `xyyx-users.role=admin`）；
3. 非管理员返回 403。

---

## 2. 启动 / 重启后台

后台是 uni-admin（Vue3）编译出的 H5，不是独立服务器；本地用 Node 静态服务器 + 同源云代理。

```powershell
$node = "F:\deepseek\harness\dsh-home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd F:\xiaodida
& $node tools\admin-server.cjs
```

打开 <http://127.0.0.1:5180/admin/>。

> 本机已把启动脚本放到 Windows「启动」目录：`xiaodida-admin.cmd`，
> 下次登录 Windows 会自动在后台起 5180 服务（若端口已被占用则跳过，不会重复起）。

服务器做了两件事：
- 静态托管 `admin/unpackage/dist/build/web`；
- 把 `/admin/cloud/*` 反向代理到 `https://env-00jy72ju8b4z.api-hz.cloudbasefunction.cn/*`，规避 uniCloud H5 的跨域限制（生产环境应改为在 uniCloud 控制台绑定安全域名）。

> 重新编译 admin 后，需要重新执行 `node tools/patch-admin-cloud.cjs`，把产物里的云地址改成 `/admin/cloud` 并注入兼容补丁。

重新编译：

```powershell
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"
& $cli publish --platform h5 --project F:\xiaodida\admin
& $node tools/patch-admin-cloud.cjs
```

---

## 3. 账号与首次初始化

- 已有管理员：`xyyxadmin`（超级管理员）
- 备用：`admin`（同一密码；登录失败次数多会要求图形验证码，日常用 `xyyxadmin`）
- 新增管理员：
  1. 打开 `#/uni_modules/uni-id-pages/pages/register/register-admin`；
  2. 填用户名/昵称/密码；
  3. 注册成功后用新账号登录。

> 密码策略：`uni-config-center/uni-id/config.json` 使用 `type: "custom"` + `custom-password.js` 的 scrypt 方案。
> 不要把 `config.json` 提交到公开仓库。

---

## 4. 骑手审核流程

1. 用户端「我的 → 骑手中心 → 申请成为骑手」提交真实姓名/学号/手机号；
2. 后台「骑手审核 → 待审核」出现记录；
3. 点「通过」→ 用户端 `rider_status=2`，可抢单；
4. 点「拒绝」→ 填写原因 → `rider_status=3`，用户端显示未通过/原因；
5. 「已通过 / 已拒绝 / 全部」可复查。

云对象方法：

```js
xyyx-admin.listUsers({ page, pageSize, keyword })
xyyx-admin.listRiders({ status, page, pageSize })
xyyx-admin.reviewRider({ userId, action: 'approve'|'reject', reason })
xyyx-admin.overview()
```

---

## 5. 常见问题

| 现象 | 处理 |
| --- | --- |
| 打开 5180 空白 | 先确认 `tools/admin-server.cjs` 在运行；浏览器强刷 |
| 登录提示 `[uni-id-co] 用户函数代码语法或逻辑异常` | 已注入兼容补丁隐藏；功能不受影响。根因是 uni-id-pages 调用了旧版 `getUserInfo`，后台已加兼容方法 |
| 页面 403 / 需要管理员 | 确认账号 `role` 包含 `admin`；`xyyx-users.role` 也可是 admin |
| 菜单没有“校递达管理” | 右边栏静态菜单在 `admin/admin.config.js`；确认用的是最新 H5 构建 |
| `request:fail` / 跨域 | 本地必须走 `admin-server.cjs` 的 `/admin/cloud` 代理；不要直接双击 index.html |

---

## 6. 安全边界

- 管理后台只监听 `127.0.0.1:5180`，不对外网开放；
- `xyyx-admin` 所有方法先 `requireAdmin`；
- 审核写操作只允许 `approve` / `reject`，不接收任意字段；
- 不返回密码、token、支付密钥；
- `apps/user/.../uni-id/config.json` 含 AppSecret/pepper，已在 `.gitignore`。
