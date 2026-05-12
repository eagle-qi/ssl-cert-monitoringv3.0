#!/bin/bash
# 飞书告警配置修复脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    飞书告警配置修复脚本${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}错误：请在项目目录下运行此脚本${NC}"
    echo "  cd /Users/monkey/ssl-cert-monitoring"
    exit 1
fi

# 1. 检查并创建 Dockerfile.feishu-webhook
echo -e "${YELLOW}[1/5] 检查 Dockerfile.feishu-webhook...${NC}"
if [ ! -f "Dockerfile.feishu-webhook" ]; then
    echo -e "${YELLOW}创建 Dockerfile.feishu-webhook...${NC}"
    cat > Dockerfile.feishu-webhook << 'EOF'
FROM python:3.9-slim

# 安装 curl 用于健康检查
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY webhook_feishu.py .

RUN pip install --no-cache-dir flask requests

EXPOSE 8080

ENV FLASK_APP=webhook_feishu.py
ENV FLASK_ENV=production
ENV SEND_RESOLVED=true

CMD ["python", "webhook_feishu.py"]
EOF
    echo -e "${GREEN}✓ Dockerfile.feishu-webhook 已创建${NC}"
else
    echo -e "${GREEN}✓ Dockerfile.feishu-webhook 已存在${NC}"
fi
echo ""

# 2. 检查并创建 webhook_feishu.py
echo -e "${YELLOW}[2/5] 检查 webhook_feishu.py...${NC}"
if [ ! -f "webhook_feishu.py" ]; then
    echo -e "${RED}错误：webhook_feishu.py 不存在${NC}"
    echo "  请先确保 webhook_feishu.py 文件存在"
    exit 1
else
    echo -e "${GREEN}✓ webhook_feishu.py 已存在${NC}"
fi
echo ""

# 3. 检查 alertmanager.yml 配置
echo -e "${YELLOW}[3/5] 检查 alertmanager.yml 配置...${NC}"
if grep -q "http://feishu-webhook:8080/webhook" alertmanager/alertmanager.yml; then
    echo -e "${GREEN}✓ alertmanager webhook URL 已正确配置${NC}"
else
    echo -e "${YELLOW}修复 alertmanager webhook URL...${NC}"
    sed -i.bak 's|http://localhost:8080/webhook|http://feishu-webhook:8080/webhook|g' alertmanager/alertmanager.yml
    echo -e "${GREEN}✓ alertmanager webhook URL 已修复${NC}"
fi
echo ""

# 4. 确保 docker-compose.yml 包含 feishu-webhook 服务
echo -e "${YELLOW}[4/5] 检查 docker-compose.yml...${NC}"
if ! grep -q "feishu-webhook:" docker-compose.yml; then
    echo -e "${YELLOW}添加 feishu-webhook 服务到 docker-compose.yml...${NC}"
    # 在 alertmanager 服务后添加 feishu-webhook 服务
    cat >> docker-compose.yml << 'EOF'

  feishu-webhook:
    build:
      context: .
      dockerfile: Dockerfile.feishu-webhook
    container_name: ssl-feishu-webhook
    environment:
      - FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/REDACTED_WEBHOOK_ID
      - SEND_RESOLVED=true
    ports:
      - "18080:8080"
    restart: unless-stopped
    networks:
      - default
EOF
    echo -e "${GREEN}✓ feishu-webhook 服务已添加${NC}"
else
    echo -e "${GREEN}✓ feishu-webhook 服务已存在${NC}"
fi

# 添加网络配置（如果没有）
if ! grep -q "networks:" docker-compose.yml; then
    echo -e "${YELLOW}添加网络配置...${NC}"
    # 在 volumes 部分前添加 networks
    sed -i '/^volumes:/i\
networks:\
  default:\
    name: ssl-monitoring-network\
    driver: bridge\
' docker-compose.yml
    echo -e "${GREEN}✓ 网络配置已添加${NC}"
fi
echo ""

# 5. 重启服务
echo -e "${YELLOW}[5/5] 重启 Docker 服务...${NC}"
echo -e "${YELLOW}这可能需要几分钟时间...${NC}"
docker-compose down
docker-compose build feishu-webhook
docker-compose up -d
echo -e "${GREEN}✓ 服务已重启${NC}"
echo ""

# 等待服务启动
echo -e "${YELLOW}等待服务启动...${NC}"
sleep 10

# 检查服务状态
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    服务状态检查${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

docker ps --filter "name=ssl-" --format "{{.Names}}: {{.Status}}"

echo ""

# 测试飞书连接
echo -e "${YELLOW}测试飞书连接...${NC}"
sleep 2
if curl -s http://localhost:18080/test | grep -q "success"; then
    echo -e "${GREEN}✓✓✓ 飞书连接测试成功！${NC}"
    echo -e "${GREEN}请检查飞书群是否收到测试消息！${NC}"
else
    echo -e "${RED}✗ 飞书连接测试失败${NC}"
    echo "  响应: $(curl -s http://localhost:18080/test)"
    echo ""
    echo -e "${YELLOW}可能的原因：${NC}"
    echo "  1. 飞书 Webhook URL 已过期"
    echo "  2. 飞书机器人已被禁用"
    echo "  3. 请重新创建飞书机器人获取新的 Webhook URL"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    后续步骤${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}如果测试成功，但告警仍然收不到，请检查：${NC}"
echo ""
echo "1. ${YELLOW}确认 Prometheus 告警规则正确${NC}"
echo "   - 访问 http://localhost:49090"
echo "   - 检查 'Alerts' 页面是否有告警"
echo ""
echo "2. ${YELLOW}确认 AlertManager 路由配置${NC}"
echo "   - 访问 http://localhost:9093"
echo "   - 检查 'Status' → 'Silences' 是否有静默规则阻止告警"
echo ""
echo "3. ${YELLOW}查看实时日志${NC}"
echo "   docker-compose logs -f alertmanager"
echo "   docker-compose logs -f feishu-webhook"
echo ""

echo -e "${GREEN}完成！${NC}"
