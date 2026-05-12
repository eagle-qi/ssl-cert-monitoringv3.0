#!/bin/bash
# SSL证书告警测试启动脚本
# 用于启动测试HTTPS服务器

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/server.pid"
HOSTS_ENTRY="127.0.0.1 ssl-test.local"

# 检查是否需要添加hosts条目
setup_hosts() {
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
}

# 启动服务器
start_server() {
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "✗ 服务器已在运行 (PID: $OLD_PID)"
            echo "  请先执行: $0 stop"
            exit 1
        else
            rm -f "$PID_FILE"
        fi
    fi
    
    setup_hosts
    
    cd "$SCRIPT_DIR"
    python3 test_server.py &
    PID=$!
    echo $PID > "$PID_FILE"
    echo "✓ 服务器已启动 (PID: $PID)"
    echo "  访问地址: https://ssl-test.local:48443"
    echo "  PID文件: $PID_FILE"
}

# 停止服务器
stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        echo "✗ 未找到PID文件，服务器可能未运行"
        # 尝试查找并终止
        PIDS=$(pgrep -f "test_server.py")
        if [ -n "$PIDS" ]; then
            echo "  找到运行中的进程: $PIDS"
            echo "  正在终止..."
            kill $PIDS 2>/dev/null
            sleep 1
            # 强制终止
            pkill -9 -f "test_server.py" 2>/dev/null
            echo "✓ 服务器已停止"
        fi
        exit 0
    fi
    
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "正在停止服务器 (PID: $PID)..."
        kill "$PID" 2>/dev/null
        sleep 1
        # 如果还没停止，强制终止
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_FILE"
        echo "✓ 服务器已停止"
    else
        echo "✗ 服务器进程不存在"
        rm -f "$PID_FILE"
    fi
}

# 查看状态
status_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "✓ 服务器运行中 (PID: $PID)"
            echo "  访问地址: https://ssl-test.local:48443"
        else
            echo "✗ PID文件存在但进程已停止"
            rm -f "$PID_FILE"
        fi
    else
        PIDS=$(pgrep -f "test_server.py")
        if [ -n "$PIDS" ]; then
            echo "✓ 服务器运行中 (PID: $PIDS)"
            echo "  访问地址: https://ssl-test.local:48443"
        else
            echo "✗ 服务器未运行"
        fi
    fi
}

# 显示帮助
show_help() {
    echo "SSL证书测试服务器管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start   启动服务器 (后台运行)"
    echo "  stop    停止服务器"
    echo "  restart 重启服务器"
    echo "  status  查看服务器状态"
    echo "  help    显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start    # 后台启动服务器"
    echo "  $0 stop     # 停止服务器"
    echo "  $0 restart  # 重启服务器"
}

# 主逻辑
case "${1:-start}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_server
        ;;
    status)
        status_server
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "未知命令: $1"
        echo "输入 '$0 help' 查看帮助"
        exit 1
        ;;
esac
