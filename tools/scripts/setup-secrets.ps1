<#
.SYNOPSIS
    本地生成 uni-id 真实配置（config.json），仓库里永远只有 example。

.DESCRIPTION
    做什么：
      1. 读 config.example.json
      2. 用密码学随机数生成 pepper / tokenSecret / requestAuthSecret
      3. 填入微信 AppSecret（参数或交互输入）
      4. 写出 config.json（已在 .gitignore 中，不会被提交）
      5. 跑一次密钥扫描确认没漏

    为什么用结构化改写而不是字符串替换：
      模板里的占位符文案以后可能改，字符串替换会静默失配，生成出「没换掉的配置」，
      那种错误要到线上登录失败才发现。

.EXAMPLE
    .\tools\scripts\setup-secrets.ps1
    .\tools\scripts\setup-secrets.ps1 -AppSecret "新的AppSecret" -OutFile C:\tmp\config.test.json
#>
param(
    [string]$AppSecret,
    [string]$AppId = "wxab71ca588522f56d",
    [string]$OutFile
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dir = Join-Path $root "apps\user\uniCloud-aliyun\cloudfunctions\common\uni-config-center\uni-id"
$example = Join-Path $dir "config.example.json"
if (-not $OutFile) { $OutFile = Join-Path $dir "config.json" }

if (-not (Test-Path $example)) { throw "找不到模板：$example" }

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

if (-not $AppSecret) {
    Write-Host "请粘贴微信小程序 AppSecret（微信公众平台 -> 开发管理 -> 开发设置 -> 重置后获取）：" -ForegroundColor Yellow
    $AppSecret = Read-Host "AppSecret"
}
if (-not $AppSecret -or $AppSecret.Length -lt 16) {
    throw "AppSecret 看起来不对（长度 $($AppSecret.Length)）"
}

Write-Host "生成随机密钥..." -ForegroundColor Cyan
$cfg = Get-Content $example -Raw -Encoding UTF8 | ConvertFrom-Json

# 去掉说明字段
if ($cfg.PSObject.Properties.Name -contains '_comment') {
    $cfg.PSObject.Properties.Remove('_comment')
}

# passwordSecret 必须有 value，否则 custom-password.js 会拒绝工作
$secret = [pscustomobject]@{
    type    = 'scrypt-salted'
    version = 1
    value   = (New-Secret)
}
$cfg.passwordSecret = @($secret)
$cfg.tokenSecret = (New-Secret)
$cfg.requestAuthSecret = (New-Secret)

$cfg.'mp-weixin'.oauth.weixin.appid = $AppId
$cfg.'mp-weixin'.oauth.weixin.appsecret = $AppSecret

$json = $cfg | ConvertTo-Json -Depth 12
# 校验能回读
$check = $json | ConvertFrom-Json
if ($check.passwordSecret[0].value.Length -lt 16) { throw "生成失败：pepper 太短" }
if ($check.tokenSecret.Length -lt 16) { throw "生成失败：tokenSecret 太短" }
if ($check.'mp-weixin'.oauth.weixin.appsecret -ne $AppSecret) { throw "生成失败：appsecret 不一致" }

[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "✓ 已写入 $OutFile" -ForegroundColor Green
Write-Host "  该文件在 .gitignore 中，不会被提交" -ForegroundColor DarkGray

Write-Host "`n密钥扫描..." -ForegroundColor Cyan
$nodeExe = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $nodeExe = $cmd.Source }
if (-not $nodeExe) {
    foreach ($cand in @("$env:ProgramFiles\nodejs\node.exe", "F:\deepseek\harness\dsh-home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe")) {
        if (Test-Path $cand) { $nodeExe = $cand; break }
    }
}
if ($nodeExe) {
    & $nodeExe (Join-Path $root "tools\scripts\check-secrets.mjs")
} else {
    Write-Warning "没找到 node.exe，跳过密钥扫描。请手动执行：node tools/scripts/check-secrets.mjs"
}
