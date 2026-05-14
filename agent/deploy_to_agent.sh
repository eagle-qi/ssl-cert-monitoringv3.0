# SSL Certificate Agent 部署脚本
# 用于在远程 Agent 机器上部署 SSL 证书监控 Agent

#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
AGENT_DIR="/opt/agent"
AGENT_USER="root"
SERVER_URL=""
AGENT_PORT=8091
AGENT_ID=""

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 root 权限
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_warn "建议使用 root 权限运行此脚本"
    fi
}

# 创建目录
create_dirs() {
    log_info "创建目录结构..."
    mkdir -p ${AGENT_DIR}/{data,logs}
    mkdir -p /etc/systemd/system
    log_info "目录创建完成"
}

# 检查 Python 环境
check_python() {
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 未安装，请先安装 Python 3.7+"
        exit 1
    fi
    log_info "Python 版本: $(python3 --version)"
}

# 安装依赖
install_dependencies() {
    log_info "安装 Python 依赖..."
    pip3 install flask cryptography requests --quiet
    log_info "依赖安装完成"
}

# 配置 Agent
configure_agent() {
    log_info "配置 Agent..."
    
    # 创建环境变量配置文件
    cat > ${AGENT_DIR}/.env << EOF
# Agent 监听配置
AGENT_LISTEN_HOST=0.0.0.0
AGENT_LISTEN_PORT=${AGENT_PORT}

# Agent 身份标识（用于 Server 识别）
AGENT_ID=${AGENT_ID}
AGENT_HOSTNAME=$(hostname)
AGENT_IP=$(hostname -I | awk '{print $1}')

# Server 连接配置
SERVER_URL=${SERVER_URL}
SYNC_INTERVAL=60

# 检测配置
SCRAPE_INTERVAL=180
SCRAPE_TIMEOUT=30

# 数据目录
AGENT_TARGETS_PATH=${AGENT_DIR}/data/targets.json
EOF

    log_info "配置文件已创建: ${AGENT_DIR}/.env"
}

# 创建 systemd 服务
create_service() {
    log_info "创建 systemd 服务..."
    
    cat > /etc/systemd/system/ssl-cert-agent.service << EOF
[Unit]
Description=SSL Certificate Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${AGENT_DIR}
EnvironmentFile=${AGENT_DIR}/.env
ExecStart=/usr/bin/python3 ${AGENT_DIR}/ssl_cert_agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    log_info "systemd 服务已创建"
}

# 复制 Agent 脚本
copy_agent() {
    log_info "复制 Agent 脚本..."
    
    # 如果是本地部署，直接复制
    if [ -f "$(dirname $0)/ssl_cert_agent.py" ]; then
        cp $(dirname $0)/ssl_cert_agent.py ${AGENT_DIR}/
        cp $(dirname $0)/requirements.txt ${AGENT_DIR}/ 2>/dev/null || true
    fi
    
    log_info "Agent 脚本已复制"
}

# 启动服务
start_service() {
    log_info "启动 SSL Certificate Agent 服务..."
    
    systemctl daemon-reload
    systemctl enable ssl-cert-agent.service
    systemctl start ssl-cert-agent.service
    
    sleep 2
    
    if systemctl is-active --quiet ssl-cert-agent.service; then
        log_info "服务启动成功"
    else
        log_error "服务启动失败，请检查日志"
        systemctl status ssl-cert-agent.service
        exit 1
    fi
}

# 检查服务状态
check_status() {
    log_info "检查服务状态..."
    systemctl status ssl-cert-agent.service --no-pager
    
    log_info "Agent 健康检查:"
    curl -s http://localhost:${AGENT_PORT}/health 2>/dev/null || log_warn "健康检查失败"
    
    log_info "Agent 信息:"
    curl -s http://localhost:${AGENT_PORT}/info 2>/dev/null || log_warn "无法获取 Agent 信息"
}

# 停止服务
stop_service() {
    log_info "停止服务..."
    systemctl stop ssl-cert-agent.service
    log_info "服务已停止"
}

# 卸载
uninstall() {
    log_warn "即将卸载 SSL Certificate Agent..."
    read -p "确认卸载? (y/N): " confirm
    if [ "$confirm" = "y" ]; then
        stop_service
        systemctl disable ssl-cert-agent.service
        rm -f /etc/systemd/system/ssl-cert-agent.service
        rm -rf ${AGENT_DIR}
        systemctl daemon-reload
        log_info "卸载完成"
    else
        log_info "取消卸载"
    fi
}

# 显示帮助
show_help() {
    echo "SSL Certificate Agent 部署脚本"
    echo ""
    echo "用法: $0 [命令] [选项]"
    echo ""
    echo "命令:"
    echo "  install     安装并启动 Agent"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  uninstall   卸载 Agent"
    echo "  help        显示帮助"
    echo ""
    echo "选项:"
    echo "  --server-url    Server 地址 (如 http://127.0.0.1:8090)"
    echo "  --agent-port    Agent 监听端口 (默认 8091)"
    echo "  --agent-id      Agent 唯一标识"
    echo ""
    echo "示例:"
    echo "  $0 install --server-url http://127.0.0.1:8090 --agent-id agent-001"
    echo "  $0 start"
    echo "  $0 status"
}

# 主函数
main() {
    COMMAND=${1:-help}
    shift || true
    
    # 解析选项
    while [[ $# -gt 0 ]]; do
        case $1 in
            --server-url)
                SERVER_URL="$2"
                shift 2
                ;;
            --agent-port)
                AGENT_PORT="$2"
                shift 2
                ;;
            --agent-id)
                AGENT_ID="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case $COMMAND in
        install)
            check_root
            check_python
            create_dirs
            install_dependencies
            copy_agent
            
            if [ -z "$SERVER_URL" ]; then
                read -p "请输入 Server 地址 (如 http://127.0.0.1:8090): " SERVER_URL
            fi
            
            if [ -z "$AGENT_ID" ]; then
                AGENT_ID="agent-$(date +%s)"
                log_info "自动生成 Agent ID: $AGENT_ID"
            fi
            
            configure_agent
            create_service
            start_service
            check_status
            ;;
        start)
            systemctl start ssl-cert-agent.service
            log_info "服务已启动"
            ;;
        stop)
            stop_service
            ;;
        restart)
            systemctl restart ssl-cert-agent.service
            log_info "服务已重启"
            ;;
        status)
            check_status
            ;;
        uninstall)
            uninstall
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
