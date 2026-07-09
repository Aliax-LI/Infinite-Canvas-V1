#!/bin/bash
cd "$(dirname "$0")"

PIP_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple"
PIP_HOST="pypi.tuna.tsinghua.edu.cn"

echo "============================================"
echo "   安装依赖（国内镜像）"
echo "============================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python 3.10+"
    exit 1
fi

python3 --version
echo ""

python3 -m pip install -r requirements.txt -i "$PIP_INDEX" --trusted-host "$PIP_HOST" || {
    echo "[重试] 切换阿里云镜像..."
    PIP_INDEX="https://mirrors.aliyun.com/pypi/simple"
    PIP_HOST="mirrors.aliyun.com"
    python3 -m pip install -r requirements.txt -i "$PIP_INDEX" --trusted-host "$PIP_HOST"
}

python3 -m pip install "uvicorn[standard]" -i "$PIP_INDEX" --trusted-host "$PIP_HOST"

echo ""
echo "安装完成。"
