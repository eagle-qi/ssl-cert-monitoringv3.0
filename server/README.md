# SSL Certificate Server

服务端程序，主动从内网 Agent 拉取证书监控数据，提供 Prometheus 格式指标接口。

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Server                             │
│              (HTTP:8090 / HTTPS:8092)                        │
│                                                              │
│  • 主动从各 Agent 拉取数据                                     │
│  • HTTP 端口供 Nginx 代理使用                                  │
│  • HTTPS 端口供 Agent 通信使用                                 │
│  • 提供 Prometheus 格式指标接口                                │
│  • 自动发现 Agent 上的监控目标                                  │
│  • 不对外暴露端口，仅容器内通信                                 │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ Agent 1  │    │ Agent 2  │    │ Agent N  │
        │ :48091   │    │ :48091   │    │ :48091   │
        └──────────┘    └──────────┘    └──────────┘
              │               │               │
              ▼               ▼               ▼
  检测内网SSL证书，暴露HTTP/HTTPS API供Server拉取
```

## 快速开始

### 方式一：Docker 运行（推荐）

```bash
# 使用主项目 docker-compose 启动
cd /path/to/ssl-cert-monitoring
docker-compose up -d agent-server

# 验证运行状态（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/health
```

### 方式二：直接运行

```bash
cd server

# 安装依赖
pip install -r requirements.txt

# 创建数据目录
mkdir -p data

# 运行
python agent_server.py
```

### 方式三：独立 Docker 运行

```bash
cd server

# 构建镜像
docker build -t ssl-cert-server .

# 运行（不暴露端口到宿主机，仅容器内通信）
docker run -d \
  --name ssl-cert-server \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/certs:/app/certs:ro \
  --network ssl-monitoring-network \
  ssl-cert-server
```

## 配置说明

### Agent 配置

编辑 `data/server_config.json` 配置文件，添加要管理的 Agent：

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

**Agent 配置字段说明：**

| 字段 | 说明 | 默认值 |
|------|------|--------|
| agent_id | Agent 唯一标识 | - |
| host | Agent 地址（IP 或域名） | - |
| port | Agent 监听端口 | 48091 |
| name | Agent 显示名称 | - |
| enabled | 是否启用 | true |
| use_https | 是否使用 HTTPS 连接 Agent | false |

> **`use_https` 说明**：当 Agent 启用了 HTTPS（`AGENT_ENABLE_HTTPS=true`），需设置 `"use_https": true`，Server 会优先使用 HTTPS 协议。设为 `false` 或不设置时，Server 优先使用 HTTP 协议，失败后回退 HTTPS。

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SERVER_CONFIG_PATH` | Agent 配置路径 | /app/data/server_config.json |
| `SERVER_DATA_PATH` | 指标数据路径 | /app/data/metrics.json |
| `SERVER_LISTEN_HOST` | HTTP 监听地址 | 0.0.0.0 |
| `SERVER_LISTEN_PORT` | HTTP 监听端口 | 8090 |
| `SERVER_HTTPS_PORT` | HTTPS 监听端口 | 8092 |
| `ENABLE_HTTPS` | 是否启用 HTTPS | false |
| `SSL_CERT_FILE` | SSL 证书路径 | /app/certs/server.crt |
| `SSL_KEY_FILE` | SSL 私钥路径 | /app/certs/server.key |
| `SERVER_VERIFY_SSL` | 验证 Agent SSL 证书 | false |

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/stats` | GET | 统计信息 |
| `/metrics` | GET | Prometheus 格式指标 |
| `/api/v1/agents` | GET | 列出所有 Agent |
| `/api/v1/agents` | POST | 添加 Agent |
| `/api/v1/agents/<id>` | DELETE | 删除 Agent |
| `/api/v1/agents/<id>/discover` | POST | 从 Agent 自动发现目标 |
| `/api/v1/targets` | GET | 列出所有监控目标 |
| `/api/v1/targets` | POST | 添加监控目标 |
| `/api/v1/scrape` | POST | 手动触发一次拉取 |

## 功能特性

- 主动拉取模式，Agent 不需对外暴露
- 支持 HTTP 和 HTTPS 双端口（HTTP:8090 供 Nginx 代理，HTTPS:8092 供 Agent 通信）
- 定时从 Agent 获取指标数据
- 从 Agent 自动发现并同步监控目标
- 提供 Prometheus 格式输出
- Web 管理界面
- Agent 动态管理（增删改查）
- Agent 心跳检测和在线状态监控
- 不对外暴露端口，仅 Docker 网络内部通信

## 端口说明

| 组件 | 端口 | 协议 | 说明 |
|------|------|------|------|
| Server | 8090 | HTTP | Nginx 代理内部使用（不对外暴露） |
| Server | 8092 | HTTPS | Agent 通信使用（不对外暴露） |
| Agent | 48091 | HTTP/HTTPS | 暴露给 Server 拉取 |

## 系统要求

- Python 3.7+
- 能够访问 Agent 的 48091 端口
- Docker（推荐）

## 依赖

- flask
- requests
- cryptography

安装依赖：`pip install -r requirements.txt`
