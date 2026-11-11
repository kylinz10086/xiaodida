<#
.SYNOPSIS
    一键部署校递达后端到 uniCloud（支付宝云）。

.DESCRIPTION
    因为 HBuilderX CLI 的云开发命令有不少坑（schema 的 --name 必须带扩展名、
    .index.json 传不了、公共模块必须先于云对象），这个脚本把顺序和参数固定下来。

    前置条件：
      1. HBuilderX 已启动且已登录 DCloud 账号
      2. 项目 apps\user 已导入，且已绑定云空间 env-00jy72ju8b4z
      3. 本地已生成 uni-id/config.json（用 tools\scripts\setup-secrets.ps1）

.EXAMPLE
    .\tools\scripts\deploy-cloud.ps1
    .\tools\scripts\deploy-cloud.ps1 -SkipSchema -SkipCommon
#>
param(
    [string]$Project = "user",
    [string]$Provider = "alipay",
    [switch]$SkipSchema,
    [switch]$SkipCommon,
    [switch]$SkipFunction
)

$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cli = "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe"

if (-not (Test-Path $cli)) { throw "找不到 HBuilderX CLI：$cli" }

$cloudDir = Get-ChildItem -Path (Join-Path $root "apps\user") -Directory -Filter "uniCloud-*" | Select-Object -First 1
if (-not $cloudDir) { throw "找不到 apps\user\uniCloud-* 目录" }
Write-Host "云目录: $($cloudDir.Name)  provider: $Provider" -ForegroundColor DarkGray

function Invoke-Cli([string[]]$Arguments, [int]$TimeoutSec = 240) {
    $label = ($Arguments | Where-Object { $_ -notmatch '^--' }) -join ' '
    Write-Host "`n>>> $label" -ForegroundColor Cyan
    $job = Start-Job -ScriptBlock { param($a) & "F:\HBuilderX.5.05.2026032417\HBuilderX\cli.exe" @a 2>&1 } -ArgumentList (,$Arguments)
    if (Wait-Job $job -Timeout $TimeoutSec) {
        $out = (Receive-Job $job | Out-String).Trim()
        if ($out -match "OK") { Write-Host "    OK" -ForegroundColor Green }
        elseif ($out) { Write-Host "    $out" -ForegroundColor Yellow }
    } else {
        Write-Host "    超时 ${TimeoutSec}s" -ForegroundColor Red
        Stop-Job $job
    }
    Remove-Job $job -Force
}

# 0. 确认 IDE 在线
$probe = & $cli project list 2>&1 | Out-String
if ($probe -match "未检测到已打开的") { throw "HBuilderX 没运行，请先执行：`"$cli`" open" }

# 1. Schema（--name 必须带 .schema.json 后缀；.index.json 传不了，需在控制台建）
if (-not $SkipSchema) {
    $dbDir = Join-Path $cloudDir.FullName "database"
    Get-ChildItem $dbDir -Filter "*.schema.json" | ForEach-Object {
        Invoke-Cli @("cloud", "functions", "--upload", "db", "--prj", $Project, "--provider", $Provider, "--name", $_.Name)
    }
    Write-Host "`n提醒：.index.json 无法通过 CLI 上传，去 uniCloud 控制台建索引（nonces.key 唯一、transactions.idempotency_key 唯一）" -ForegroundColor Yellow
}

# 2. 公共模块（必须早于云对象）
if (-not $SkipCommon) {
    Invoke-Cli @("cloud", "functions", "--upload", "common", "--prj", $Project, "--provider", $Provider, "--name", "xyyx-common")
}

# 3. 云对象
if (-not $SkipFunction) {
    foreach ($fn in @("xyyx-user", "xyyx-rider", "xyyx-pay", "xyyx-cron")) {
        Invoke-Cli @("cloud", "functions", "--upload", "cloudfunction", "--prj", $Project, "--provider", $Provider, "--name", $fn)
    }
}

Write-Host "`n=== 部署完成 ===" -ForegroundColor Green
Write-Host "核对：" -ForegroundColor Yellow
Write-Host "  & `"$cli`" cloud functions --list cloudfunction --prj $Project --provider $Provider --cloud"
Write-Host "  应看到 xyyx-user / xyyx-rider / xyyx-pay / xyyx-cron"
Write-Host "`n联调顺序：用户端下单(mock 支付) -> 骑手端抢单/送达 -> 用户端确认收货 -> 查 xyyx-transactions"
