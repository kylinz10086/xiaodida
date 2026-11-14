<#
.SYNOPSIS
    只轮换微信小程序 AppSecret，不动 pepper / tokenSecret。

.DESCRIPTION
    为什么不用 setup-secrets.ps1 来干这件事：
    那个脚本会**重新生成** pepper 和 tokenSecret —— 跑一次等于把所有密码哈希作废、
    把所有人踢下线，而且它是从 config.example.json 重建的，会丢掉你在 config.json 里做的其它调整。
    重置 AppSecret 只需要改一个字段，就用这个脚本。

    它会：
      1. 备份现有 config.json 到 config.json.bak.<时间戳>
      2. 只替换 mp-weixin.oauth.weixin.appsecret
      3. 校验 pepper / tokenSecret 一个字节都没变
      4. 打印下一步（部署）

.EXAMPLE
    .\tools\scripts\rotate-appsecret.ps1 -AppSecret "新的32位AppSecret"
    .\tools\scripts\rotate-appsecret.ps1 -AppSecret "xxx" -OutFile C:\tmp\config.test.json
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$AppSecret,
    [string]$OutFile
)

$ErrorActionPreference = "Stop"

if ($AppSecret.Length -lt 16) {
    throw "AppSecret 看起来不对（长度 $($AppSecret.Length)）"
}
if ($AppSecret -match '^[0-9a-f]{32}$' -and $AppSecret -eq 'fe6f2fc5ee0f0ba8d103f0e22f7a4a65') {
    throw "这还是泄露的那个旧 AppSecret（fe6f2fc5...），请先去公众平台重置再跑"
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cloudDir = Get-ChildItem -Path (Join-Path $root "apps\user") -Directory -Filter "uniCloud-*" | Select-Object -First 1
if (-not $cloudDir) { throw "找不到 apps\user\uniCloud-* 目录" }

$cfgPath = Join-Path $cloudDir.FullName "cloudfunctions\common\uni-config-center\uni-id\config.json"
if (-not (Test-Path $cfgPath)) {
    throw "找不到 $cfgPath —— 先用 tools\scripts\setup-secrets.ps1 生成一次"
}
if (-not $OutFile) { $OutFile = $cfgPath }

$raw = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8)
$cfg = $raw | ConvertFrom-Json

$beforePepper = [string]$cfg.passwordSecret[0].value
$beforeToken = [string]$cfg.tokenSecret
$beforeSecret = [string]$cfg.'mp-weixin'.oauth.weixin.appsecret

if (-not $beforePepper -or -not $beforeToken) {
    throw "现有 config.json 缺 pepper 或 tokenSecret，先修好再轮换（否则会把登录搞坏）"
}

$cfg.'mp-weixin'.oauth.weixin.appsecret = $AppSecret
$json = $cfg | ConvertTo-Json -Depth 100

# 回读校验：只允许 appsecret 变，其它密钥必须一模一样
$check = $json | ConvertFrom-Json
if ([string]$check.passwordSecret[0].value -ne $beforePepper) { throw "校验失败：pepper 被改动了" }
if ([string]$check.tokenSecret -ne $beforeToken) { throw "校验失败：tokenSecret 被改动了" }
if ([string]$check.'mp-weixin'.oauth.weixin.appsecret -ne $AppSecret) { throw "校验失败：appsecret 没写进去" }
if ([string]$check.'mp-weixin'.oauth.weixin.appid -ne [string]$cfg.'mp-weixin'.oauth.weixin.appid) { throw "校验失败：appid 被改动了" }

if ($OutFile -eq $cfgPath) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $bak = "$cfgPath.bak.$stamp"
    Copy-Item $cfgPath $bak -Force
    Write-Host "✓ 已备份：$bak" -ForegroundColor DarkGray
}

[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "✓ 已更新 AppSecret（pepper / tokenSecret 未变）" -ForegroundColor Green
Write-Host "  文件：$OutFile" -ForegroundColor DarkGray

Write-Host "`n下一步（必须做，否则云端还在用旧 secret）：" -ForegroundColor Yellow
Write-Host "  .\tools\scripts\deploy-cloud.ps1" -ForegroundColor Cyan
Write-Host "  —— 它会先传 uni-config-center 公共模块，再传所有云函数，让新 secret 生效。" -ForegroundColor DarkGray
Write-Host "`n注意：后台「系统设置」里的 wxAppSecret 可以留空，代码会自动回落到 config.json。" -ForegroundColor DarkGray
