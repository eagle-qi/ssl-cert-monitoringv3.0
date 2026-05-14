#!/bin/bash
# Agent 自动发现功能更新脚本
# 
# 使用方法:
#   1. 直接运行: ./update_agent.sh
#      - 如果本地有运行的 Agent，会直接更新
#   2. 指定远程服务器: ./update_agent.sh user@remote-server
#      - 会 SSH 到远程服务器更新 Agent
#
# 功能:
#   添加 /api/v1/targets 端点，返回 Agent 本地配置的目标列表
#   这样 Server 就可以自动发现 Agent 的目标

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认参数
REMOTE_HOST=""
SSH_PORT="22"

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            REMOTE_HOST="$2"
            shift 2
            ;;
        -p|--port)
            SSH_PORT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 如果没有指定主机，检查本地 Agent
check_local_agent() {
    echo -e "${YELLOW}检查本地 Agent...${NC}"
    
    # 检查 Agent 容器
    if docker ps | grep -q "ssl-cert-agent"; then
        echo -e "${GREEN}找到本地 Agent 容器${NC}"
        
        # 获取 Agent 容器内的 targets.json 路径
        AGENT_TARGETS_PATH=$(docker exec ssl-cert-agent env | grep AGENT_TARGETS_PATH | cut -d= -f2)
        if [ -z "$AGENT_TARGETS_PATH" ]; then
            AGENT_TARGETS_PATH="/app/data/targets.json"
        fi
        
        echo "Agent targets 路径: $AGENT_TARGETS_PATH"
        
        # 检查目标文件
        if docker exec ssl-cert-agent test -f "$AGENT_TARGETS_PATH"; then
            echo -e "${GREEN}读取 Agent 目标配置...${NC}"
            docker exec ssl-cert-agent cat "$AGENT_TARGETS_PATH" | python3 -m json.tool
        else
            echo -e "${RED}目标配置文件不存在${NC}"
        fi
        return 0
    fi
    
    return 1
}

# 检查 Agent 服务
check_agent_service() {
    local host=$1
    local port=${2:-8091}
    
    echo -e "${YELLOW}检查 Agent 服务 (${host}:${port})...${NC}"
    
    # 检查 /health 端点
    if curl -s -m 5 "http://${host}:${port}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}Agent 服务在线${NC}"
        return 0
    fi
    
    echo -e "${RED}Agent 服务不可达${NC}"
    return 1
}

# 检查 Agent API 版本
check_agent_api() {
    local host=$1
    local port=${2:-8091}
    
    echo -e "${YELLOW}检查 Agent API 版本...${NC}"
    
    # 尝试 /api/v1/targets 端点
    response=$(curl -s -m 5 "http://${host}:${port}/api/v1/targets" 2>/dev/null || echo "FAILED")
    
    if echo "$response" | grep -q "status"; then
        echo -e "${GREEN}Agent 支持自动发现 API${NC}"
        echo "$response" | python3 -m json.tool
        return 0
    else
        echo -e "${RED}Agent 不支持自动发现 API (需要更新 Agent)${NC}"
        return 1
    fi
}

# 更新本地 Agent
update_local_agent() {
    echo -e "${YELLOW}更新本地 Agent...${NC}"
    
    # 获取当前工作目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    AGENT_DIR="${SCRIPT_DIR}/agent"
    
    if [ ! -d "$AGENT_DIR" ]; then
        echo -e "${RED}Agent 目录不存在: $AGENT_DIR${NC}"
        return 1
    fi
    
    # 检查 ssl_cert_agent.py 是否存在
    if [ ! -f "${AGENT_DIR}/ssl_cert_agent.py" ]; then
        echo -e "${RED}ssl_cert_agent.py 不存在${NC}"
        return 1
    fi
    
    echo -e "${GREEN}复制更新的 Agent 代码到容器...${NC}"
    
    # 复制 Agent 代码到容器
    docker cp "${AGENT_DIR}/ssl_cert_agent.py" ssl-cert-agent:/app/ssl_cert_agent.py
    
    # 重启 Agent 容器
    echo -e "${YELLOW}重启 Agent 容器...${NC}"
    docker restart ssl-cert-agent
    
    # 等待容器启动
    sleep 3
    
    # 检查是否启动成功
    if docker ps | grep -q "ssl-cert-agent"; then
        echo -e "${GREEN}Agent 容器已重启${NC}"
        
        # 等待服务就绪
        sleep 2
        
        # 检查 API
        check_agent_api "localhost" "8091"
    else
        echo -e "${RED}Agent 容器启动失败${NC}"
        return 1
    fi
}

# 显示使用帮助
show_help() {
    echo "SSL Certificate Monitoring - Agent 自动发现更新脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --host <主机>     Agent 服务器地址"
    echo "  -p, --port <端口>     SSH 端口 (默认: 22)"
    echo "  --help                显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                                    # 检查本地 Agent"
    echo "  $0 -h user@192.168.1.100              # 检查远程 Agent"
    echo "  $0 --update-local                     # 更新本地 Agent"
    echo ""
}

# 主函数
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}SSL Agent 自动发现更新工具${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    if [ -z "$REMOTE_HOST" ]; then
        # 本地检查
        if check_local_agent; then
            # 检查 API
            check_agent_api "localhost" "8091" || {
                echo ""
                echo -e "${YELLOW}需要更新 Agent 以支持自动发现功能${NC}"
                read -p "是否现在更新本地 Agent? (y/n) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    update_local_agent
                fi
            }
        else
            echo -e "${YELLOW}未找到本地 Agent${NC}"
            echo ""
            echo "请确保 Agent 容器正在运行，或者使用 -h 选项指定远程服务器"
            show_help
        fi
    else
        # 远程检查
        check_agent_service "$REMOTE_HOST" "8091"
        check_agent_api "$REMOTE_HOST" "8091" || {
            echo ""
            echo -e "${RED}Agent 不支持自动发现 API${NC}"
            echo ""
            echo "请手动更新远程服务器上的 Agent 代码:"
            echo "  1. 将 ${SCRIPT_DIR}/agent/ssl_cert_agent.py 复制到远程服务器"
            echo "  2. 重启 Agent 服务"
        }
    fi
}

# 运行主函数
main "$@"
