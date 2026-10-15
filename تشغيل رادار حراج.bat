@echo off
chcp 65001 >nul
title رادار حراج
cd /d "%~dp0express-app"

rem --- Node.js موجود؟ (يلزم 22.5 أو أحدث) ---
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js غير مثبت. سيُفتح موقع التحميل، ثبّت نسخة LTS ثم شغّل هذا الملف مرة أخرى.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
if errorlevel 1 (
  echo.
  echo  نسخة Node.js قديمة. حدّثها إلى LTS من https://nodejs.org ثم أعد المحاولة.
  pause
  exit /b 1
)

rem --- إذا كانت نسخة قديمة تعمل على المنفذ 3000 نوقفها، حتى يعمل آخر تحديث دائماً ---
powershell -NoProfile -Command "$ids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($i in $ids) { $p = Get-Process -Id $i -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $i -Force; Write-Host '  Restarting...' } }"

rem --- أول مرة: تثبيت المكتبات ---
if not exist "node_modules\" (
  echo  أول تشغيل: نثبت المكتبات، قد يستغرق دقيقة...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  تعذّر تثبيت المكتبات. تأكد من اتصال الإنترنت ثم أعد المحاولة.
    pause
    exit /b 1
  )
  echo  نثبت متصفح الاحتياط، مرة واحدة فقط...
  call npx playwright install chromium
)

rem --- افتح المتصفح بعد ثوانٍ من بدء الخادم ---
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000'"

echo.
echo  رادار حراج يعمل على http://localhost:3000
echo  لإيقافه: أغلق هذه النافذة.
echo.
node server.js
echo.
echo  توقف الخادم.
pause
