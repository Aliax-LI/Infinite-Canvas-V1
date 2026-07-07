@echo off
cd /d "%~dp0"

set "PYEXE="
python --version >nul 2>&1
if not errorlevel 1 set "PYEXE=python"
if not defined PYEXE (
    py --version >nul 2>&1
    if not errorlevel 1 set "PYEXE=py"
)
if not defined PYEXE (
    python3 --version >nul 2>&1
    if not errorlevel 1 set "PYEXE=python3"
)

if not defined PYEXE (
    echo [错误] 未找到 Python。请先运行「安装依赖.bat」或安装 Python 3.10+。
    pause
    exit /b 1
)

echo Starting 无限画布...
echo Visit: http://127.0.0.1:3000/
echo Press Ctrl+C to stop.
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:3000/"
"%PYEXE%" main.py

echo.
echo Server stopped.
pause
