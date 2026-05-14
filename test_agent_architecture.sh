#!/bin/bash
# SSL Certificate Monitoring - Agent 架构测试脚本

set -e

echo "=========================================="
echo "SSL Certificate Monitoring - Agent 测试"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 配置
SERVER_URL="http://127.0.0.1:8090"
AGENT_URL="http://203.0.113.1:8091"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_curl() {
    if ! command -v curl &> /dev/null; then
        log_error "curl 未安装"
        exit 1
    fi
}

# 1. 测试 Server 健康检查
test_server_health() {
    log_info "测试 Server 健康状态..."
    
    response=$(curl -s "${SERVER_URL}/health")
    if [ $? -eq 0 ]; then
        log_info "Server 健康检查通过: $response"
    else
        log_error "Server 健康检查失败"
        exit 1
    fi
}

# 2. 测试 Server Agent 列表
test_server_agents() {
    log_info "测试 Server Agent 列表..."
    
    response=$(curl -s "${SERVER_URL}/api/v1/agents")
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

# 3. 测试 Server 目标列表
test_server_targets() {
    log_info "测试 Server 目标列表..."
    
    response=$(curl -s "${SERVER_URL}/api/v1/targets")
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

# 4. 测试添加 Agent
test_add_agent() {
    log_info "测试添加 Agent..."
    
    response=$(curl -s -X POST "${SERVER_URL}/api/v1/agents" \
        -H "Content-Type: application/json" \
        -d '{
            "agent_id": "test-agent-001",
            "host": "203.0.113.1",
            "port": 8091,
            "name": "测试Agent"
        }')
    
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

# 5. 测试添加目标
test_add_target() {
    log_info "测试添加目标..."
    
    # 添加一个由 Agent 监控的目标
    response=$(curl -s -X POST "${SERVER_URL}/api/v1/targets" \
        -H "Content-Type: application/json" \
        -d '{
            "url": "https://192.168.1.100:8443",
            "service_name": "测试内网服务",
            "owner": "测试团队",
            "agent_id": "test-agent-001"
        }')
    
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    
    # 添加一个由 Server 直接监控的目标
    log_info "添加 Server 直接监控的目标..."
    response2=$(curl -s -X POST "${SERVER_URL}/api/v1/targets" \
        -H "Content-Type: application/json" \
        -d '{
            "url": "https://www.baidu.com:443",
            "service_name": "百度首页（直接监控）",
            "owner": "测试团队"
        }')
    
    echo "$response2" | python3 -m json.tool 2>/dev/null || echo "$response2"
}

# 6. 测试 Agent 健康检查（如果 Agent 可访问）
test_agent_health() {
    log_info "测试 Agent 健康状态..."
    
    response=$(curl -s "${AGENT_URL}/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
        log_info "Agent 健康检查通过: $response"
    else
        log_warn "Agent 不可访问（可能需要部署或网络不通）"
    fi
}

# 7. 测试 Agent 目标同步（如果 Agent 可访问）
test_agent_targets() {
    log_info "测试 Agent 目标同步..."
    
    response=$(curl -s "${AGENT_URL}/api/v1/metrics" 2>/dev/null)
    if [ $? -eq 0 ]; then
        log_info "Agent 指标获取成功"
        echo "$response" | head -20
    else
        log_warn "Agent 不可访问"
    fi
}

# 8. 测试 Server Prometheus 指标
test_prometheus_metrics() {
    log_info "测试 Server Prometheus 指标..."
    
    response=$(curl -s "${SERVER_URL}/metrics")
    echo "$response" | head -30
}

# 9. 手动触发一次拉取
test_manual_scrape() {
    log_info "手动触发数据拉取..."
    
    response=$(curl -s -X POST "${SERVER_URL}/api/v1/scrape")
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
}

# 显示帮助
show_help() {
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  all          运行所有测试（默认）"
    echo "  server       只测试 Server"
    echo "  agent        只测试 Agent"
    echo "  add-test     添加测试数据"
    echo "  help         显示帮助"
}

# 主函数
main() {
    check_curl
    
    COMMAND=${1:-all}
    
    case $COMMAND in
        all)
            test_server_health
            test_server_agents
            test_server_targets
            test_add_agent
            test_add_target
            test_agent_health
            test_agent_targets
            test_manual_scrape
            sleep 3
            test_prometheus_metrics
            ;;
        server)
            test_server_health
            test_server_agents
            test_server_targets
            test_prometheus_metrics
            ;;
        agent)
            test_agent_health
            test_agent_targets
            ;;
        add-test)
            test_add_agent
            test_add_target
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
    
    echo ""
    log_info "测试完成!"
}

main "$@"
