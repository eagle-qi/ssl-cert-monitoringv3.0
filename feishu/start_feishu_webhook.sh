#!/bin/bash
# 启动飞书 Webhook 转换服务

# 设置工作目录
cd "$(dirname "$0")"

# 检查 Python3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

# 检查 Flask 和 requests
echo "📦 检查依赖..."
python3 -c "import flask; import requests" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 安装依赖 Flask 和 requests..."
    pip3 install flask requests
fi

# 启动服务
echo "🚀 启动飞书 Webhook 转换服务..."
echo "   服务地址: http://localhost:8080"
echo "   告警端点: POST /webhook"
echo "   测试端点: GET  /test"
echo ""

python3 webhook_feishu.py
