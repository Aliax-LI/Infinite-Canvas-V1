@echo off
cd /d "%~dp0"

echo ============================================
echo   安装依赖
echo ============================================
echo.

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
    echo [错误] 未找到 Python。请先安装 Python 3.10+：
    echo https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] 使用 %PYEXE%
echo.

"%PYEXE%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [1/2] 正在安装 pip...
    "%PYEXE%" -m ensurepip --upgrade
    if errorlevel 1 (
        echo [错误] pip 安装失败。
        pause
        exit /b 1
    )
)

echo [2/2] 正在从清华镜像安装 requirements.txt 中的依赖...
"%PYEXE%" -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn
if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败，请检查网络连接后重试。
    pause
    exit /b 1
)

echo.
echo [额外] 安装 WebSocket 支持（清华镜像）...
"%PYEXE%" -m pip install "uvicorn[standard]" -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn
if errorlevel 1 (
    echo [警告] uvicorn[standard] 安装失败，WebSocket 功能可能不可用。
)

echo.
echo ============================================
echo   安装完成。可运行桌面应用或 run.bat 启动。
echo ============================================
pause
