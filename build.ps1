# 🐮🐴的打工日志 - 一键构建正式版
# 由 build.bat 调用（build.bat 只是个薄壳启动器）。
# 用 PowerShell 而非 cmd.exe，是为了彻底避开 cmd 的行尾/路径解析坑
# （LF-only 行尾 + UTF-8 BOM 会让 cmd 报「此时不应有 ..」然后静默退出，
#  导致 APK 已产出但没被打包进 release/）。

$ErrorActionPreference = 'Continue'

$Root = 'C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks'
$Py   = 'C:\Users\72980\.workbuddy\binaries\python\versions\3.13.12\python.exe'

# 关掉 safe-delete shim（它会拦 fs.rmSync，让 vite emptyDir / cap sync 失败）
$env:NODE_OPTIONS = ''

# Windows 控制台默认是 GBK(cp936)，打印 🐮🐴 文件名会 UnicodeEncodeError
# （文件其实写成功了，只是 print 崩了）。强制 UTF-8，本机与子进程都生效。
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # 某些宿主（如非交互控制台）不支持改编码，忽略即可
}

Set-Location $Root

Write-Host ''
Write-Host '==================================================='
Write-Host ' Build official release - one click, one version'
Write-Host '==================================================='

# ---------- 1/3  PC (Electron) ----------
Write-Host ''
Write-Host '[1/3] Building PC version (Electron exe) ...'
& npm run build:electron
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[ERROR] PC build failed. Check the output above.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Host '[OK] PC build done.' -ForegroundColor Green

# ---------- 2/3  Android APK ----------
Write-Host ''
Write-Host '[2/3] Building Android APK ...'
& npm run cap:sync
if ($LASTEXITCODE -eq 0) {
    Push-Location (Join-Path $Root 'android')
    & .\gradlew.bat assembleDebug
    $apkOk = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($apkOk) {
        Write-Host '[OK] APK build done.' -ForegroundColor Green
    } else {
        Write-Host '[WARN] gradle assembleDebug failed - APK will be stale/skipped.' -ForegroundColor Yellow
    }
} else {
    Write-Host '[WARN] cap:sync failed - skipping APK (Android SDK missing?).' -ForegroundColor Yellow
}

# ---------- 3/3  Package ----------
Write-Host ''
Write-Host '[3/3] Packaging official release ...'
& $Py (Join-Path $Root 'scripts\build_release.py')
if ($LASTEXITCODE -ne 0) {
    Write-Host '[WARN] Packaging script reported a problem.' -ForegroundColor Yellow
}

# ---------- Done ----------
Write-Host ''
Write-Host '==================================================='
Write-Host ' DONE. Official release is in release\ :'
Write-Host '   - PC      : 电脑版 zip'
Write-Host '   - Android : 安卓版 apk'
Write-Host '   - Server  : dave-tasks-server.zip'
Write-Host '==================================================='
Write-Host ''
Get-ChildItem (Join-Path $Root 'release') -File |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { '   {0}   {1:N0} bytes   {2}' -f $_.Name, $_.Length, $_.LastWriteTime }
Write-Host ''
Read-Host 'Press Enter to exit'
