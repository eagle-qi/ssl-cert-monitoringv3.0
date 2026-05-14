#!/bin/bash
#
# SSL Certificate Monitoring - Agent 部署脚本
# 用于在 203.0.113.1 上的内网服务器部署 Agent
#
set -e

echo "=========================================="
echo "SSL Certificate Agent 部署脚本"
echo "=========================================="

# 配置变量
AGENT_IP="${AGENT_IP:-10.0.0.1}"  # Agent 本机 IP
SERVER_URL="${SERVER_URL:-http://203.0.113.1:8090}"  # Server 地址
AGENT_PORT="${AGENT_PORT:-8091}"  # Agent 监听端口

echo "配置信息："
echo "  - Agent IP: $AGENT_IP"
echo "  - Server URL: $SERVER_URL"
echo "  - Agent 端口: $AGENT_PORT"
echo ""

# 1. 创建工作目录
WORK_DIR="/opt/ssl-cert-agent"
echo "[1/7] 创建工作目录: $WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# 2. 创建目录结构
echo "[2/7] 创建目录结构"
mkdir -p data

# 3. 复制配置文件
echo "[3/7] 配置环境变量"
cat > .env << EOF
# Agent 基本配置
AGENT_LISTEN_HOST=0.0.0.0
AGENT_LISTEN_PORT=$AGENT_PORT

# Agent 身份信息
AGENT_HOSTNAME=$(hostname)
AGENT_IP=$AGENT_IP
AGENT_ID=$(cat /proc/sys/kernel/random/uuid)

# Server 连接配置（重要！用于从 Server 同步目标）
SERVER_URL=$SERVER_URL
SYNC_INTERVAL=300

# 检测配置
SCRAPE_INTERVAL=180
SCRAPE_TIMEOUT=30

# 目标配置文件路径
AGENT_TARGETS_PATH=/app/data/targets.json
EOF

echo "  .env 文件已创建"

# 4. 复制 docker-compose 和代码
echo "[4/7] 复制配置文件"
# 注意：需要先在 Server 端准备好 agent 目录的代码
# 假设 agent 目录已经同步到此服务器

# 5. 创建初始 targets.json（空目标，后续由 Server 下发）
echo "[5/7] 创建初始目标配置文件"
cat > data/targets.json << 'EOF'
{
  "targets": []
}
EOF

# 6. 启动 Agent
echo "[6/7] 启动 Agent 服务"
docker-compose -f docker-compose.agent.yml up -d --build

# 7. 验证部署
echo "[7/7] 验证部署"
sleep 5

echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
echo "Agent 信息："
echo "  - 监听地址: 0.0.0.0:$AGENT_PORT"
echo "  - Agent ID: $(grep AGENT_ID .env | cut -d= -f2)"
echo "  - Server URL: $SERVER_URL"
echo ""
echo "API 接口："
echo "  - 健康检查: http://localhost:$AGENT_PORT/health"
echo "  - Agent 信息: http://localhost:$AGENT_PORT/info"
echo "  - Prometheus指标: http://localhost:$AGENT_PORT/metrics"
echo "  - JSON指标: http://localhost:$AGENT_PORT/api/v1/metrics"
echo ""
echo "查看日志："
echo "  docker-compose -f $WORK_DIR/docker-compose.agent.yml logs -f"
echo ""
echo "=========================================="
echo "后续步骤："
echo "1. 在 Dashboard 前端添加此 Agent（IP: $AGENT_IP:$AGENT_PORT）"
echo "2. 在 AgentTargets 页面添加监控目标"
echo "3. 目标会自动同步到 Agent"
echo "=========================================="
