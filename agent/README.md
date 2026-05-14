# SSL Certificate Agent

内网 SSL 证书采集 Agent，部署在内网，定时检测 SSL 证书并通过 HTTP/HTTPS API 暴露数据，供 Server 主动拉取。

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Server                             │
│              (主动拉取模式)                                    │
│                                                              │
│  • 定时从各 Agent 拉取数据                                     │
│  • HTTP:8090 / HTTPS:8092                                    │
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

### 方式一：Docker 部署（推荐）

```bash
cd agent

# 复制并编辑配置
cp .env.agent.example .env
# 编辑 .env，设置 AGENT_ID、AGENT_IP 等

# 构建并运行
docker-compose -f docker-compose.agent.yml up -d

# 查看日志
docker-compose -f docker-compose.agent.yml logs -f
```

### 方式二：快速启动（开发/测试）

```bash
cd agent

# 添加执行权限
chmod +x start.sh

# 首次运行会自动检查依赖和配置
./start.sh
```

### 方式三：系统服务安装（生产环境）

```bash
cd agent

# 添加执行权限
chmod +x deploy.sh

# 一键安装并启动
sudo ./deploy.sh install

# 其他命令
sudo ./deploy.sh start      # 启动
sudo ./deploy.sh stop       # 停止
sudo ./deploy.sh restart    # 重启
sudo ./deploy.sh status     # 状态
sudo ./deploy.sh logs       # 日志
sudo ./deploy.sh uninstall  # 卸载
```

## 配置说明

### 方式一：环境变量配置（Docker 部署推荐）

编辑 `.env` 文件（复制 `.env.agent.example`）：

```env
# Agent 监听配置
AGENT_LISTEN_HOST=0.0.0.0
AGENT_LISTEN_PORT=48091

# Agent 身份标识
AGENT_ID=agent-001
AGENT_HOSTNAME=内网机房Agent
AGENT_IP=10.0.0.1

# 证书检测配置
SCRAPE_INTERVAL=180
SCRAPE_TIMEOUT=30

# HTTPS 配置（可选）
# AGENT_ENABLE_HTTPS=true
# AGENT_VERIFY_SSL=false
```

### 方式二：配置文件（直接运行）

编辑 `config.json` 配置文件：

```json
{
  "scrape_interval": 180,
  "timeout": 30,
  "listen_host": "0.0.0.0",
  "listen_port": 48091,
  "targets": [
    {
      "id": "1",
      "url": "https://192.168.1.100:8443",
      "service_name": "内网服务A",
      "owner": "运维团队",
      "timeout": 30,
      "enabled": true,
      "env": "production"
    }
  ]
}
```

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SCRAPE_INTERVAL` | 检测间隔（秒） | 180 |
| `SCRAPE_TIMEOUT` | 连接超时（秒） | 30 |
| `AGENT_LISTEN_HOST` | 监听地址 | 0.0.0.0 |
| `AGENT_LISTEN_PORT` | 监听端口 | 48091 |
| `AGENT_TARGETS_PATH` | 目标配置文件路径 | /app/data/targets.json |
| `AGENT_ID` | Agent 唯一标识 | 自动生成 |
| `AGENT_HOSTNAME` | Agent 主机名 | 自动获取 |
| `AGENT_IP` | Agent IP 地址 | 自动获取 |
| `AGENT_ENABLE_HTTPS` | 是否启用 HTTPS | true |
| `AGENT_VERIFY_SSL` | 是否验证 Server SSL 证书 | true |

## API 接口

Agent 暴露以下 HTTP/HTTPS API 供 Server 拉取：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/info` | GET | Agent 信息 |
| `/metrics` | GET | Prometheus 格式指标 |
| `/api/v1/metrics` | GET | JSON 格式指标 |
| `/api/v1/targets` | GET | 目标列表 |

## 功能特性

- 定时检测内网 SSL 证书
- 暴露 HTTP/HTTPS API 供 Server 拉取
- Prometheus 格式指标输出
- 离线缓存本地存储
- HTTPS 加密通信支持
- 自签名证书开箱即用
- 默认监听端口 48091

## HTTPS 加密配置

### 1. 生成证书

在 Server 端运行 `./generate_https_certs.sh`，然后将 Agent 证书复制到 Agent 机器：

```bash
scp agent/certs/agent.crt agent/certs/agent.key agent/certs/ca.crt user@agent-ip:/path/to/agent/certs/
```

### 2. 启用 HTTPS

在 `.env` 文件中设置：

```env
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false    # Server 使用自签名证书时设为 false
```

### 3. 在 Server 端配置

在 Server 的 `data/server_config.json` 中为该 Agent 设置 `"use_https": true`。

## 系统要求

- Python 3.7+
- Linux/macOS
- 需要开放 `48091` 端口供 Server 访问
- Docker（推荐）

## 依赖

- flask
- cryptography
- requests

安装依赖：`pip install -r requirements.txt`
