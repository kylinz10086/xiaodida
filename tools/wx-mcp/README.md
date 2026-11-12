# wx-devtools · 微信小程序开发插件（MCP）

给 DSH 用的 MCP stdio 服务，把**微信开发者工具 CLI** 和 **HBuilderX CLI** 包成 agent 能直接调用的工具。
零依赖：手写 JSON-RPC 帧，不用装 `@modelcontextprotocol/sdk`，拷到任何有 node 的机器都能跑。

## 为什么自己做

DSH 里原有插件只有 B 站 / QQ / 搜索类，没有小程序开发能力。与其每次改完代码让人去点鼠标，
不如让 agent 自己打开工程、跑体检、出预览二维码。

## 工具列表（12 个）

| 工具 | 作用 |
| --- | --- |
| `wx_env` | 环境自检：工具版本、登录状态、工程路径是否存在 |
| `wx_login` | 拉起扫码登录 |
| `wx_open_project` | 用开发者工具打开工程（默认 `miniprogram/`） |
| `wx_preview` | 编译并生成预览二维码 PNG |
| `wx_upload` | 上传体验版 |
| `wx_build_npm` | 构建 npm |
| `wx_auto` | 打开自动化调试端口 |
| `wx_audit` | 静态体检：页面文件、主包体积、分包、tabBar 图标、appid |
| `wx_hbx_open` | 启动 HBuilderX 并打开 uni-app 源码工程 |
| `wx_compile_mp` | 用 HBuilderX CLI 编译到 mp-weixin |
| `wx_close_project` | 关闭工程窗口 |
| `wx_quit` | 退出开发者工具 |

## 安装（注册到 DSH profile）

在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: mcp-wx-devtools
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wx-devtools
        transport: stdio
        command: '<node.exe 绝对路径>'
        args:
          - '<本目录>/server.mjs'
        toolCallTimeoutMs: 600000
```

改完重启 DSH 生效。本机实际注册在
`F:\deepseek\harness\dsh-home\profiles\desktop\cordis.patch.yml`。

## 环境变量（都有默认值）

| 变量 | 默认 |
| --- | --- |
| `WX_CLI` | `F:\微信web开发者工具\cli.bat` |
| `HBX_CLI` | `F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe` |
| `WX_REPO` | `F:\xiaodida` |
| `WX_PROJECT` | `<WX_REPO>\miniprogram` |
| `WX_UNI_DIST` | `<WX_REPO>\apps\user\unpackage\dist\build\mp-weixin`（自动兼容 `dist\dev`） |

换机器记得改这几个变量，或者改文件顶部常量。

## 自测

```bash
node smoke.mjs            # initialize + tools/list + wx_audit
node smoke.mjs wx_env     # 顺便跑环境自检
```

## 踩过的坑

- `cli.bat` 必须经 `cmd.exe` 执行，且路径要自己加引号（有中文和空格）
- `cli.bat islogin` 的 JSON 结果混在日志里，得从后往前逐行找可解析的那行
- HBuilderX CLI 必须先 `cli open` 把 IDE 起起来，否则所有命令都回「未检测到已打开的HBuilderX」
- 未登录时 `preview` / `upload` 一定失败，先跑 `wx_env` 看 `login` 是不是 true
