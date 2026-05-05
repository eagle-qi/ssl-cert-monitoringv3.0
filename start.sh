#!/bin/bash
# SSL Certificate Monitoring - 启动脚本
# 确保 Dashboard JSON 文件中的数据源 UID 正确

DASHBOARD_FILE="./grafana/grafana_ssl_dashboard.json"
CONTAINER_NAME="ssl-grafana"

echo "检查 Dashboard 配置..."

# 检查文件是否存在
if [ ! -f "$DASHBOARD_FILE" ]; then
    echo "错误: $DASHBOARD_FILE 不存在"
    exit 1
fi

# 检查是否需要修复 (包含 ${DS_PROMETHEUS} 变量)
if grep -q '\${DS_PROMETHEUS}' "$DASHBOARD_FILE"; then
    echo "发现无效的数据源变量，正在修复..."
    # 将 ${DS_PROMETHEUS} 替换为实际的数据源 UID
    sed -i.bak 's/\${DS_PROMETHEUS}/prometheus/g' "$DASHBOARD_FILE"
    echo "修复完成"
else
    echo "Dashboard 配置正确，无需修改"
fi

# 启动服务
echo "启动服务..."
docker-compose up -d

# 等待服务启动
sleep 5

# 检查 Grafana 是否运行
if docker ps | grep -q "$CONTAINER_NAME"; then
    echo "复制 Dashboard 到容器..."
    docker cp "$DASHBOARD_FILE" "$CONTAINER_NAME:/etc/grafana/provisioning/dashboards/grafana_ssl_dashboard.json"
    
    echo "触发 Grafana 重新加载 Dashboard..."
    sleep 2
    curl -s -u admin:admin -X POST "http://localhost:3000/api/admin/provisioning/dashboards/reload" > /dev/null
    
    echo ""
    echo "=== 启动完成 ==="
    echo "Grafana: http://localhost:3000"
    echo "Dashboard: http://localhost:3000/d/ssl-cert-monitoring"
    echo "Prometheus: http://localhost:9090"
    echo "Alertmanager: http://localhost:9093"
    echo ""
    echo "登录凭证: admin / admin"
else
    echo "错误: Grafana 容器未启动"
    exit 1
fi
