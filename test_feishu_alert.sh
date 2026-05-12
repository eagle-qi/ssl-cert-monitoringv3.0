#!/bin/bash
# 飞书告警问题排查脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    飞书告警问题排查脚本${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# 1. 检查 Docker 服务状态
echo -e "${YELLOW}[1/7] 检查 Docker 服务状态...${NC}"
if docker ps --filter "name=ssl-" --format "{{.Names}}: {{.Status}}" | grep -q "ssl-"; then
    echo -e "${GREEN}✓ Docker 服务正在运行${NC}"
    docker ps --filter "name=ssl-" --format "  {{.Names}}: {{.Status}}"
else
    echo -e "${RED}✗ Docker 服务未运行，请先启动服务${NC}"
    echo "  运行: docker-compose up -d"
    exit 1
fi
echo ""

# 2. 检查 feishu-webhook 服务日志
echo -e "${YELLOW}[2/7] 检查 feishu-webhook 服务日志...${NC}"
if docker logs ssl-feishu-webhook 2>&1 | tail -20 | grep -q "Running on"; then
    echo -e "${GREEN}✓ feishu-webhook 服务已启动${NC}"
else
    echo -e "${RED}✗ feishu-webhook 服务可能未正常启动${NC}"
    echo -e "${YELLOW}最近日志:${NC}"
    docker logs ssl-feishu-webhook 2>&1 | tail -30
fi
echo ""

# 3. 检查 feishu-webhook 健康状态
echo -e "${YELLOW}[3/7] 检查 feishu-webhook 健康状态...${NC}"
if curl -s http://localhost:18080/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ feishu-webhook 健康检查通过${NC}"
    curl -s http://localhost:18080/health | python3 -m json.tool 2>/dev/null || cat
else
    echo -e "${RED}✗ feishu-webhook 健康检查失败${NC}"
    echo "  请检查服务是否正常运行"
fi
echo ""

# 4. 测试飞书 Webhook 连接
echo -e "${YELLOW}[4/7] 测试飞书 Webhook 连接...${NC}"
echo "  发送测试消息到飞书..."
RESPONSE=$(curl -s -X POST http://localhost:18080/test)
if echo "$RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ 飞书消息发送成功！${NC}"
    echo "  请检查飞书群是否收到测试消息"
else
    echo -e "${RED}✗ 飞书消息发送失败${NC}"
    echo "  响应: $RESPONSE"
    echo -e "${YELLOW}可能原因:${NC}"
    echo "  1. Webhook URL 已过期或无效"
    echo "  2. 飞书机器人已被禁用"
    echo "  3. 网络连接问题"
fi
echo ""

# 5. 检查 alertmanager 配置
echo -e "${YELLOW}[5/7] 检查 alertmanager 配置...${NC}"
if grep -q "http://feishu-webhook:8080/webhook" /Users/monkey/ssl-cert-monitoring/alertmanager/alertmanager.yml; then
    echo -e "${GREEN}✓ alertmanager webhook URL 配置正确${NC}"
else
    echo -e "${RED}✗ alertmanager webhook URL 配置错误${NC}"
    echo "  应该使用: http://feishu-webhook:8080/webhook"
fi
echo ""

# 6. 检查 alertmanager 配置是否被正确加载
echo -e "${YELLOW}[6/7] 检查 alertmanager 配置加载状态...${NC}"
if docker exec ssl-alertmanager alertmanager --version 2>/dev/null; then
    echo -e "${GREEN}✓ AlertManager 版本检查通过${NC}"
else
    echo -e "${YELLOW}⚠ 无法检查 AlertManager 版本${NC}"
fi
echo ""

# 7. 检查 Prometheus 告警规则
echo -e "${YELLOW}[7/7] 检查 Prometheus 告警规则...${NC}"
if [ -f "/Users/monkey/ssl-cert-monitoring/prometheus/ssl_cert_alerts.yml" ]; then
    if grep -q "severity: critical" /Users/monkey/ssl-cert-monitoring/prometheus/ssl_cert_alerts.yml; then
        echo -e "${GREEN}✓ 告警规则包含 critical 告警${NC}"
    else
        echo -e "${YELLOW}⚠ 告警规则可能不包含 critical 告警${NC}"
    fi
    
    if grep -q "severity: warning" /Users/monkey/ssl-cert-monitoring/prometheus/ssl_cert_alerts.yml; then
        echo -e "${GREEN}✓ 告警规则包含 warning 告警${NC}"
    else
        echo -e "${YELLOW}⚠ 告警规则可能不包含 warning 告警${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 未找到告警规则文件${NC}"
fi
echo ""

# 总结
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}    排查总结${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}如果飞书仍然收不到告警，请检查：${NC}"
echo ""
echo "1. ${YELLOW}飞书 Webhook URL 是否有效${NC}"
echo "   - 登录飞书群"
echo "   - 群设置 → 群机器人 → 检查机器人是否被禁用"
echo "   - 重新创建机器人获取新的 Webhook URL"
echo ""
echo "2. ${YELLOW}AlertManager 是否收到告警${NC}"
echo "   - 访问 http://localhost:9093"
echo "   - 检查 'Alerts' 页面是否有告警"
echo "   - 查看 'Status' → 'Runtime & Build Information'"
echo ""
echo "3. ${YELLOW}重启服务${NC}"
echo "   cd /Users/monkey/ssl-cert-monitoring"
echo "   docker-compose restart alertmanager feishu-webhook"
echo ""
echo "4. ${YELLOW}查看详细日志${NC}"
echo "   docker-compose logs -f alertmanager"
echo "   docker-compose logs -f feishu-webhook"
echo ""

# 如果测试成功，提示用户
if curl -s http://localhost:18080/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ feishu-webhook 服务运行正常${NC}"
    echo ""
    echo -e "${YELLOW}请确认飞书群里是否收到了测试消息！${NC}"
fi
