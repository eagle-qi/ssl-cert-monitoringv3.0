# SSL Certificate Monitoring - 部署指南 (Agent 架构)

## 架构说明

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           监控服务器 (203.0.113.1)                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Docker Compose Stack                           │ │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐  │ │
│  │  │  Dashboard (:80) │──▶│ Agent Server    │   │ Prometheus (:9090)   │  │ │
│  │  │                  │   │ (:8090/8092)   │   │                      │  │ │
│  │  │  前端展示        │◀──│ 聚合Agent数据   │◀──│ Grafana (:3000)       │  │ │
│  │  └─────────────────┘   └────────┬────────┘   └─────────────────────┘  │ │
│  └──────────────────────────────────┼───────────────────────────────────────┘ │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │ Server 主动拉取数据 (容器内通信)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          内网服务器 (Agent)                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ssl-cert-agent (:48091)                                               │ │
│  │  - 检测内网 SSL 证书                                                    │ │
│  │  - 暴露 /metrics 接口供 Server 拉取                                     │ │
│  │  - 支持 HTTPS 加密通信                                                  │ │
│  │                                                                        │ │
│  │  监控目标:                                                              │ │
│  │  - https://172.31.15.43:48444  (内网 API)                              │ │
│  │  - https://192.168.1.100:8443  (内网管理后台)                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

> **重要**：当前架构为 **Server 主动拉取模式**，Agent 不需要主动连接 Server。Server 通过容器网络访问 Agent，Agent 暴露 48091 端口供 Server 远程拉取数据。

## 部署步骤

### 第一部分：在监控服务器 (203.0.113.1) 部署 Server 端

```bash
# 1. 克隆或上传代码
cd /opt/ssl-cert-monitoring

# 2. 创建环境配置文件
cat > .env << 'EOF'
# Dashboard
VITE_API_BASE_URL=/api

# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin123

# Alertmanager
ALERTMANAGER_URL=http://localhost:9093

# Feishu Webhook
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
FEISHU_SEND_RESOLVED=true

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=alert@example.com
SMTP_PASSWORD=password
SMTP_FROM=alert@example.com
SMTP_USE_TLS=true

# HTTPS
ENABLE_HTTPS=false
SERVER_VERIFY_SSL=false
EOF

# 3. 启动服务
docker-compose up -d

# 4. 验证服务状态
docker-compose ps
```

### 第二部分：在内网服务器部署 Agent

```bash
# 1. 复制 Agent 目录到内网服务器
# 从监控服务器复制：
scp -r /opt/ssl-cert-monitoring/agent user@内网服务器IP:/opt/

# 或者手动上传 agent 目录

# 2. 在内网服务器上编辑配置
cd /opt/ssl-cert-agent

# 3. 创建 .env 文件
cat > .env << 'EOF'
# Agent 监听配置
AGENT_LISTEN_HOST=0.0.0.0
AGENT_LISTEN_PORT=48091

# Agent 身份信息
AGENT_HOSTNAME=内网服务器-1
AGENT_IP=172.31.15.1
AGENT_ID=

# 检测配置
SCRAPE_INTERVAL=180
SCRAPE_TIMEOUT=30

# HTTPS 配置（如需加密通信）
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false

# 目标配置文件路径
AGENT_TARGETS_PATH=/app/data/targets.json
EOF

# 4. 启动 Agent
docker-compose -f docker-compose.agent.yml up -d

# 5. 验证 Agent 状态
curl -k https://localhost:48091/health
```

### 第三部分：在 Server 配置 Agent 和目标

1. 在 `data/server_config.json` 中添加 Agent：

```json
{
  "agents": [
    {
      "agent_id": "agent-1",
      "host": "172.31.15.1",
      "port": 48091,
      "name": "内网服务器-1",
      "enabled": true,
      "use_https": true
    }
  ],
  "settings": {
    "scrape_interval": 60
  }
}
```

2. 访问 Dashboard: http://203.0.113.1:48080
3. 进入 "Agent 管理" 页面查看 Agent 状态
4. 进入 "Agent 目标" 页面添加监控目标：
   ```json
   {
     "url": "https://172.31.15.43:48444",
     "service_name": "内部API服务",
     "owner": "运维组",
     "env": "production",
     "timeout": 10
   }
   ```

## 验证流程

### 1. 验证 Agent 状态
```bash
# 在 Agent 服务器上
curl -k https://localhost:48091/health

# 预期输出：
# {"status":"healthy","service":"ssl-cert-agent","targets_count":1,...}
```

### 2. 验证 Agent 目标检测
```bash
# 查看 Agent 日志
docker logs ssl-cert-agent

# 预期日志：
# 检测证书: 172.31.15.43:48444
```

### 3. 验证 Server 拉取
```bash
# 在监控服务器上（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/agents

# 预期输出：显示所有在线 Agent
```

### 4. 验证前端数据
1. 访问 http://203.0.113.1:48080/certificates
2. 应该能看到内网目标的证书信息
3. 证书列表按状态自动排序（紧急 > 即将过期 > 已过期 > 正常）

## 数据流程

1. **证书检测**:
   ```
   Agent → 检测内网目标 SSL 证书 → 存储到 METRICS_BUFFER
   ```

2. **数据拉取**:
   ```
   Server 定时拉取 → Agent Server (聚合) → Dashboard 展示
   ```

3. **告警触发**:
   ```
   Prometheus → Alertmanager → Feishu/Email Webhook (容器内通信)
   ```

## 常见问题

### Q1: Agent 显示 offline
1. 确认 Agent 服务正在运行：`curl -k https://<agent-ip>:48091/health`
2. 确认 Server 可以网络访问 Agent 的 IP 和端口
3. 检查 `use_https` 配置与 Agent 实际协议一致
4. 如使用自签名证书，确认 `SERVER_VERIFY_SSL=false`

### Q2: 目标配置没有同步到 Agent
1. 检查 Agent 日志：`docker logs ssl-cert-agent 2>&1 | grep -i sync`
2. 手动触发 Server 发现：`docker exec ssl-agent-server curl -s -X POST http://localhost:8090/api/v1/agents/agent-1/discover`

### Q3: 证书检测失败
```bash
# 在 Agent 服务器上手动测试
timeout 10 openssl s_client -connect 172.31.15.43:48444 </dev/null 2>/dev/null | \
  openssl x509 -noout -dates

# 检查目标是否可达
ping 172.31.15.43
```

### Q4: 前端仍然显示加载中
```bash
# 检查 Agent Server 的 metrics 接口（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/metrics

# 检查 Dashboard Nginx 代理
curl http://localhost:48080/api/agent/metrics
```
