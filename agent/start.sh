#!/bin/bash
#
# SSL Certificate Agent 快速启动脚本
# 无需 root 权限，直接在前台运行
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   SSL Certificate Agent 快速启动${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "错误: 未找到 Python"
    exit 1
fi

PYTHON_CMD="python3"
command -v python3 &> /dev/null || PYTHON_CMD="python"

echo "使用 Python: ${PYTHON_CMD}"
echo ""

# 检查配置
if [[ ! -f "config.json" ]]; then
    if [[ -f "config.json.example" ]]; then
        echo "复制配置文件..."
        cp config.json.example config.json
        echo ""
        echo -e "${GREEN}警告: 请先编辑 config.json 设置 server_url${NC}"
        echo "编辑器: nano config.json"
        exit 1
    else
        echo "错误: 未找到配置文件"
        exit 1
    fi
fi

# 检查依赖
if ! ${PYTHON_CMD} -c "import requests" 2>/dev/null; then
    echo "安装依赖..."
    ${PYTHON_CMD} -m pip install -q -r requirements.txt
    echo ""
fi

echo "启动 Agent..."
echo "按 Ctrl+C 停止"
echo ""
echo -e "${GREEN}========================================${NC}"
echo ""

# 运行
${PYTHON_CMD} ssl_cert_agent.py
