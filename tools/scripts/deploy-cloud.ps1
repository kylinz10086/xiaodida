<#
.SYNOPSIS
    一键部署校递达后端到 uniCloud（阿里云）。

.DESCRIPTION
    因为 HBuilderX CLI 的云开发命令需要 IDE 处于打开状态、且项目已绑定云空间，
    这个脚本把顺序固定下来，避免漏传 schema 或公共模块。

    前置条件：
      1. HBuilderX 已启动且已登录 DCloud 账号
      2. 项目 apps\user 已在 HBuilderX 中导入
      3. 已为项目绑定云空间（uniCloud 面板 -> 设为当前项目使用的云服务空间）
      4. 本地已按 docs/usage.md 4.2 准备好 config.json（真实密钥）

.EXAMPLE
    .\tools\scripts\deploy-cloud.ps1
    .\tools\scripts\deploy-cloud.ps1 -SkipSchema
#>
param(
    [string]$Project = "user",
    [string]$Provider = "aliyun",
    [switch]$SkipSchema,
    [switch]$Only
)

$ErrorActionPreference = "Stop"
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"

if (-not (Test-Path $cli)) {
    throw "找不到 HBuilderX CLI：$cli（改脚本顶部的 \$cli）"
}

function Invoke-Cli([string[]]$Arguments) {
    $label = $Arguments -join ' '
    Write-Host "`n>>> $label" -ForegroundColor Cyan
    & $cli @Arguments 2>&1 | ForEach-Object { "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "命令返回码 $LASTEXITCODE（继续执行，请自行确认上面的输出）"
    }
}

# 0. 确认 IDE 在跑
Write-Host "检查 HBuilderX 是否在运行..." -ForegroundColor Yellow
$probe = & $cli project list 2>&1 | Out-String
if ($probe -match "未检测到已打开的") {
    throw "HBuilderX 没有运行，请先执行: `"$cli`" open"
}
Write-Host $probe -ForegroundColor DarkGray

# 1. 上传所有数据库 schema
if (-not $SkipSchema) {
    Invoke-Cli @("cloud", "functions", "--upload", "db", "--prj", $Project, "--provider", $Provider)
}

# 2. 公共模块（必须早于云对象，否则 require 失败）
Invoke-Cli @("cloud", "functions", "--upload", "common", "--prj", $Project, "--provider", $Provider, "--name", "xyyx-common")

# 3. 三个云对象
foreach ($fn in @("xyyx-user", "xyyx-rider", "xyyx-pay", "xyyx-cron")) {
    Invoke-Cli @("cloud", "functions", "--upload", "cloudfunction", "--prj", $Project, "--provider", $Provider, "--name", $fn)
}

Write-Host "`n=== 部署完成 ===" -ForegroundColor Green
Write-Host "下一步验证：" -ForegroundColor Yellow
Write-Host "  1. 微信开发者工具里跑用户端，下单后点支付（没配商户证书会走模拟支付）"
Write-Host "  2. 用另一个账号跑骑手端，抢单 -> 已取件 -> 已送达"
Write-Host "  3. 用户端确认收货，检查 xyyx-transactions 是否有 income/commission 两条流水"
