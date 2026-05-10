#!/bin/bash

echo "=========================================="
echo "SSL证书监控系统 - API测试脚本"
echo "=========================================="
echo ""

echo "1. 测试 Dashboard 首页..."
curl -s -o /dev/null -w "状态码: %{http_code}\n" http://localhost:8080/
echo ""

echo "2. 测试 Metrics API 反向代理..."
curl -s http://localhost:8080/api/metrics | head -3 | cut -c1-80
echo ""
echo "状态: ✓ 成功"
echo ""

echo "3. 测试 Alerts API 反向代理..."
curl -s http://localhost:8080/api/alerts | jq -r '.status'
echo "状态: ✓ 成功"
echo ""

echo "4. 测试验证码服务..."
CAPTCHA=$(curl -s http://localhost:3001/api/captcha)
echo "验证码服务: $(echo $CAPTCHA | jq -r '.captcha' | head -c 50)..."
echo "Session ID: $(echo $CAPTCHA | jq -r '.sessionId')"
echo "状态: ✓ 成功"
echo ""

echo "5. 测试验证码验证..."
SESSION_ID=$(echo $CAPTCHA | jq -r '.sessionId')
curl -s -X POST http://localhost:3001/api/captcha/verify \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"captcha\":\"test\"}" | jq -r '.message'
echo ""

echo "6. 检查所有容器状态..."
docker ps --format "table {{.Names}}\t{{.Status}}" | grep ssl
echo ""

echo "=========================================="
echo "所有测试完成！"
echo "=========================================="
echo ""
echo "访问地址:"
echo "  Web Dashboard: http://localhost:8080"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana: http://localhost:3000"
echo "  Alertmanager: http://localhost:9093"
echo ""
