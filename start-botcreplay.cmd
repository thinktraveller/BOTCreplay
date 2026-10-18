@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the supported version shown in package.json.
  pause
  exit /b 1
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (!(major === 22 && minor >= 12 || major === 24 || major >= 26)) { console.error('Unsupported Node.js version. Use Node 22.12+, 24.x or 26+.'); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\start-local.mjs
if errorlevel 1 (
  echo Startup failed. See runtime-data for service logs.
  pause
  exit /b 1
)
if not defined PORT set "PORT=5173"
start "" "http://127.0.0.1:%PORT%"
endlocal
