#!/bin/bash
# SSL证书测试服务器停止脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/server.pid"

echo "正在停止SSL测试服务器..."

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "终止进程 (PID: $PID)..."
        kill "$PID" 2>/dev/null
        sleep 1
        # 如果还没停止，强制终止
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null
        fi
        echo "✓ 服务器已停止"
    else
        echo "进程已停止，清理PID文件..."
    fi
    rm -f "$PID_FILE"
else
    echo "未找到PID文件，尝试查找进程..."
fi

# 查找并终止残留进程
PIDS=$(pgrep -f "test_server.py" 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "发现残留进程: $PIDS，正在终止..."
    for pid in $PIDS; do
        kill "$pid" 2>/dev/null
    done
    sleep 1
    pkill -9 -f "test_server.py" 2>/dev/null
    echo "✓ 残留进程已清理"
else
    echo "✓ 无残留进程"
fi

echo "完成"
