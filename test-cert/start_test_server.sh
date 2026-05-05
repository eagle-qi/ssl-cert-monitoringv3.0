#!/bin/bash
# SSL证书告警测试启动脚本
# 用于启动测试HTTPS服务器

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOSTS_ENTRY="127.0.0.1 ssl-test.local"

# 检查是否需要添加hosts条目
if ! grep -q "ssl-test.local" /etc/hosts 2>/dev/null; then
    echo "添加 hosts 条目..."
    echo "$HOSTS_ENTRY" | sudo tee -a /etc/hosts > /dev/null
    if [ $? -eq 0 ]; then
        echo "✓ hosts 条目已添加"
    else
        echo "✗ 需要手动添加hosts条目："
        echo "  echo '$HOSTS_ENTRY' | sudo tee -a /etc/hosts"
    fi
else
    echo "✓ ssl-test.local 已配置在 hosts 中"
fi

# 启动测试服务器
echo "启动SSL测试服务器..."
echo "访问地址: https://ssl-test.local:8443"
echo "按 Ctrl+C 停止服务器"
echo ""
cd "$SCRIPT_DIR"
python3 test_server.py
