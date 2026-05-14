# Agent 部署指南

本文档说明如何将 SSL Certificate Agent 部署到远程服务器（内网机器）。

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                  Server (公网机器)                             │
│              Agent Server (HTTP:8090 / HTTPS:8092)            │
│                                                              │
│  • 主动从 Agent 拉取证书数据                                   │
│  • 直接监控未分配 Agent 的目标                                  │
│  • 提供 Prometheus 格式指标接口                                │
│  • 自动发现 Agent 上的监控目标                                  │
│  • 不对外暴露端口，仅容器内通信                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Server 主动拉取 (HTTPS/HTTP)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent (内网机器)                                  │
│                    Agent :48091                               │
│                                                              │
│  • 定时检测内网 SSL 证书                                       │
│  • 暴露 HTTP/HTTPS API 供 Server 拉取                         │
│  • 离线缓存，网络恢复后自动补报                                  │
└─────────────────────────────────────────────────────────────┘
```

> **重要**：当前架构为 **Server 主动拉取模式**，Server 定时从 Agent 拉取数据。Agent 不需要主动连接 Server，但需要确保 Server 能够网络访问 Agent 的 IP 和端口（默认 48091）。

## 部署步骤

### 方式一：Docker 部署（推荐）

#### 1. 复制 Agent 目录到远程服务器

```bash
# 在本地机器执行，复制 Agent 目录到远程服务器
scp -r agent/ user@10.0.0.1:/opt/agent/
```

#### 2. 在远程服务器上配置

```bash
# 进入 Agent 目录
cd /opt/agent

# 复制并编辑环境变量配置
cp .env.agent.example .env

# 编辑配置文件
vim .env
```

关键配置项：
```env
# Agent 监听配置
AGENT_LISTEN_HOST=0.0.0.0
AGENT_LISTEN_PORT=48091

# Agent 身份标识
AGENT_ID=agent-1
AGENT_HOSTNAME=内网机房Agent
AGENT_IP=10.0.0.1

# 证书检测配置
SCRAPE_INTERVAL=180
SCRAPE_TIMEOUT=30

# HTTPS 配置（如需加密通信）
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false
```

#### 3. 构建并启动 Agent

```bash
# 构建 Docker 镜像
docker build -t ssl-cert-agent .

# 启动 Agent
docker-compose -f docker-compose.agent.yml up -d

# 查看日志
docker-compose -f docker-compose.agent.yml logs -f
```

#### 4. 在 Server 上注册 Agent

在 Server 的 `data/server_config.json` 中添加 Agent 配置：

```json
{
  "agents": [
    {
      "agent_id": "agent-1",
      "host": "10.0.0.1",
      "port": 48091,
      "name": "内网机房Agent",
      "enabled": true,
      "use_https": true
    }
  ],
  "settings": {
    "scrape_interval": 60
  }
}
```

### 方式二：直接部署（系统服务）

#### 1. 复制 Agent 文件

```bash
scp -r agent/*.py agent/requirements.txt user@10.0.0.1:/opt/agent/
```

#### 2. 安装依赖

```bash
# 在远程服务器执行
pip3 install -r requirements.txt
```

#### 3. 使用部署脚本安装

```bash
# 添加执行权限
chmod +x deploy_to_agent.sh

# 安装并启动
./deploy_to_agent.sh install \
    --agent-id agent-1

# 查看状态
./deploy_to_agent.sh status
```

## HTTPS 加密配置

如需对 Server-Agent 通信进行加密，按以下步骤操作：

### 1. 生成证书

在 Server 机器上运行：

```bash
cd /path/to/ssl-cert-monitoring
./generate_https_certs.sh
```

### 2. 复制证书到 Agent

```bash
# 复制 Agent 证书和 CA 证书
scp agent/certs/agent.crt agent/certs/agent.key server/certs/ca.crt user@agent-ip:/path/to/agent/certs/
```

### 3. 启用 HTTPS

在 Agent 的 `.env` 文件中设置：

```env
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false    # Server 使用自签名证书时设为 false
```

### 4. 更新 Server 配置

在 Server 的 `data/server_config.json` 中为该 Agent 添加 `"use_https": true`。

### 5. 重启服务

```bash
# 重启 Agent
docker-compose -f docker-compose.agent.yml up -d --force-recreate

# 重启 Server
docker-compose up -d --force-recreate agent-server
```

## 验证部署

### 检查 Agent 状态

```bash
# 在 Agent 服务器上执行
# HTTP 模式
curl http://localhost:48091/health

# HTTPS 模式
curl -k https://localhost:48091/health

# 查看 Agent 信息
curl -k https://localhost:48091/info
```

### 检查 Server 状态

```bash
# 在 Server 上执行（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/agents
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/targets

# 触发从 Agent 发现目标
docker exec ssl-agent-server curl -s -X POST http://localhost:8090/api/v1/agents/agent-1/discover
```

### 查看 Server 日志

```bash
docker logs ssl-agent-server -f
```

## 多 Agent 部署

支持部署多个 Agent 监控不同的内网网段：

### Agent 1 - 监控内网机房

```bash
# 在内网机房机器上部署
# .env 配置
AGENT_ID=agent-1
AGENT_HOSTNAME=内网机房Agent
AGENT_IP=10.0.0.1
AGENT_LISTEN_PORT=48091
AGENT_ENABLE_HTTPS=true
```

### Agent 2 - 监控云服务器

```bash
# 在云服务器上部署
# .env 配置
AGENT_ID=agent-2
AGENT_HOSTNAME=云服务器Agent
AGENT_IP=203.0.113.1
AGENT_LISTEN_PORT=48091
AGENT_ENABLE_HTTPS=true
```

### 在 Server 上注册所有 Agent

```json
{
  "agents": [
    {
      "agent_id": "agent-1",
      "host": "10.0.0.1",
      "port": 48091,
      "name": "内网机房Agent",
      "enabled": true,
      "use_https": true
    },
    {
      "agent_id": "agent-2",
      "host": "203.0.113.1",
      "port": 48091,
      "name": "云服务器Agent",
      "enabled": true,
      "use_https": true
    }
  ],
  "settings": {
    "scrape_interval": 60
  }
}
```

## 故障排查

### Agent 显示 offline

1. 确认 Agent 服务正在运行：`curl -k https://<agent-ip>:48091/health`
2. 确认 Server 可以网络访问 Agent 的 IP 和端口
3. 检查防火墙规则
4. 确认 `use_https` 配置与 Agent 实际协议一致
5. 如使用自签名证书，确认 Server 端 `SERVER_VERIFY_SSL=false`

### Agent 没有获取到目标

1. 检查 Agent 日志中的检测信息
2. 确认 `data/targets.json` 中配置了监控目标
3. 手动触发 Server 发现：`docker exec ssl-agent-server curl -s -X POST http://localhost:8090/api/v1/agents/agent-1/discover`

### 证书检测失败

1. 检查目标 URL 是否可从 Agent 机器访问
2. 检查超时设置
3. 对于自签名证书，确保配置正确

### HTTPS 连接失败

1. 确认 Agent 证书文件存在：`ls agent/certs/agent.crt agent/certs/agent.key`
2. 确认 `AGENT_ENABLE_HTTPS=true`
3. 确认 Server 配置中 `"use_https": true`
4. 如使用自签名证书，设置 `AGENT_VERIFY_SSL=false` 和 `SERVER_VERIFY_SSL=false`
