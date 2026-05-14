# SSL 证书监控系统

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

一套完整的 SSL/TLS 证书过期监控解决方案，支持公网域名、内网域名和内网 IP 地址的监控，提供自动化告警和美观的监控面板。

[English](README.en.md) | 简体中文

## 功能特性

### 基础架构（单点部署）
- **多目标支持**: 监控公网域名、内网域名和 IP 地址
- **证书详情**: 追踪颁发者、主题、SANs、有效期和负责人信息
- **智能告警**: 可配置告警阈值（30 天预警，7 天紧急）
- **多渠道通知**: 支持飞书、邮件通知
- **自动发现**: 基于文件的目标自动发现
- **持久化存储**: Docker Volume 数据持久化
- **Grafana Provisioning**: 自动加载数据源和 Dashboard
- **安全登录**: 图形验证码 + 自定义账号密码 + 只读用户
- **Web Dashboard**: 漂亮的 React 管理界面
- **批量导入**: 支持 CSV、XLSX、XLS、WPS 等多种格式的批量导入
- **批量导出**: 证书列表支持 CSV / XLSX 格式导出，仪表盘支持 Markdown 报告导出

### Server-Agent 架构（分布式部署）
- **Server 主动拉取**: Server 主动从 Agent 拉取数据，Agent 不需对外暴露
- **内外网隔离**: Agent 部署在内网，Server 部署在外网
- **自动注册**: Agent 开机自动注册，无需手动配置
- **心跳检测**: 实时监控 Agent 在线状态
- **离线缓存**: 网络中断时本地缓存，恢复后自动补报
- **目标自动发现**: Server 从 Agent 自动发现并同步监控目标
- **HTTPS 加密通信**: Server-Agent 间支持 HTTPS 加密，自签名证书开箱即用
- **Prometheus 兼容**: 标准 Prometheus 格式指标输出

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并配置您的敏感信息：

```bash
cp .env.example .env
# 编辑 .env 文件，填入实际配置
```

### 2. 启动服务

```bash
# 克隆仓库
git clone https://github.com/eagle-qi/ssl-cert-monitoring.git
cd ssl-cert-monitoring

# 复制并配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 使用 docker-compose 启动
docker-compose up -d
```

### 3. Server-Agent 架构快速部署（内网监控）

如需监控内网隔离环境中的 SSL 证书，使用 Server-Agent 分布式架构：

#### 3.1 部署 Server（外网）

```bash
# 创建数据目录
mkdir -p data

# 复制配置示例
cp data/server_config.json.example data/server_config.json
cp data/agent_targets.json.example data/agent_targets.json

# 构建并启动 Server（使用主 docker-compose）
docker-compose up -d agent-server

# 验证 Server 运行状态（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/health
```

#### 3.2 部署 Agent（内网）

```bash
# 在内网机器上，复制 Agent 目录
scp -r user@your-server:/path/to/ssl-cert-monitoring/agent /path/to/local/

cd agent

# 复制并编辑配置
cp .env.agent.example .env
# 编辑 .env，设置 AGENT_ID、AGENT_IP 等

# 构建并运行
docker-compose -f docker-compose.agent.yml up -d
```

#### 3.3 在 Server 上注册 Agent

在 `data/server_config.json` 中添加 Agent 配置：

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

> **`use_https` 字段说明**：当 Agent 启用了 HTTPS（`AGENT_ENABLE_HTTPS=true`），需在 Server 配置中设置 `"use_https": true`，Server 会优先使用 HTTPS 协议拉取 Agent 数据。

#### 3.4 添加监控目标

```bash
curl -X POST http://localhost:8090/api/v1/targets \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.1.100:8443",
    "service_name": "内网服务",
    "owner": "运维团队",
    "owner_email": "ops@example.com",
    "timeout": 30
  }'
```

#### 3.5 配置 Prometheus 抓取

在 Prometheus 配置中添加：

```yaml
scrape_configs:
  - job_name: 'ssl-agent-server'
    static_configs:
      - targets: ['ssl-agent-server:8090']
    metrics_path: /metrics
```

### 4. HTTPS 加密配置（可选）

如需对 Server 与 Agent 之间的通信进行加密，可以启用 HTTPS：

#### 4.1 生成 SSL 证书

```bash
# 在 Server 机器上运行
./generate_https_certs.sh
```

这会在 `server/certs/` 和 `agent/certs/` 目录生成：
- CA 证书：`server/certs/ca.crt`
- Server 证书：`server/certs/server.crt` + `server/certs/server.key`
- Agent 证书：`agent/certs/agent.crt` + `agent/certs/agent.key`

#### 4.2 启用 HTTPS

**Server 端**（支持 HTTP + HTTPS 双端口）：
- HTTP 端口 `8090`：供 Nginx 代理内部使用
- HTTPS 端口 `8092`：供 Agent 连接使用

在 `.env` 文件中设置：
```bash
ENABLE_HTTPS=true
SERVER_VERIFY_SSL=false   # Agent 使用自签名证书时设为 false
```

**Agent 端**：
在 Agent 机器的 `.env` 文件中设置：
```bash
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false    # Server 使用自签名证书时设为 false
```

同时需要在 Server 的 `data/server_config.json` 中为该 Agent 添加 `"use_https": true`。

#### 4.3 部署 CA 证书到 Agent

将 CA 证书复制到 Agent 机器：
```bash
scp user@your-server:/path/to/ssl-cert-monitoring/server/certs/ca.crt /path/to/agent/certs/
```

#### 4.4 注意事项

- 如果使用自签名证书且不需要验证，可以设置 `SERVER_VERIFY_SSL=false` / `AGENT_VERIFY_SSL=false`
- 生产环境建议保持 SSL 验证开启以确保通信安全
- 证书默认有效期为 365 天，请注意定期更新
- Server 启用 HTTPS 后同时监听 HTTP（8090）和 HTTPS（8092）两个端口

### 5. 访问服务

| 服务 | 地址 | 账号密码 |
|------|------|----------|
| Web Dashboard | http://localhost:48080 | 见 `.env` 文件 |
| Grafana | http://localhost:43000 | 见 `.env` 文件 |
| Prometheus | http://localhost:49090 | - |

> 内部服务（Agent Server、Feishu Webhook、Email Webhook）不对外暴露端口，仅在 Docker 网络内部通信。

### 6. 查看监控面板

**Web Dashboard (推荐)**: http://localhost:48080

功能模块：
- **仪表盘**: 证书状态概览和统计图表，支持导出 Markdown 报告
- **证书列表**: 所有证书详细信息列表，支持批量导出（CSV / XLSX），异常状态自动置顶排序
- **告警管理**: 实时告警监控
- **目标管理**: 监控目标管理，支持单个添加和批量导入（CSV/XLSX/XLS/WPS）
- **Agent 管理**: Agent 状态监控和目标发现

批量导入功能：
- 支持 CSV、XLSX、XLS、WPS 等多种格式
- 提供一键下载导入模板功能（CSV/Excel格式）
- 自动跳过重复的URL
- 详细的导入结果统计和错误提示

批量导出功能：
- 证书列表支持 CSV 和 XLSX 格式导出
- 仪表盘支持 Markdown 格式报告导出（含概览统计、异常证书、全部证书列表）
- 证书列表按状态自动排序（紧急 > 即将过期 > 已过期 > 正常）

**Grafana Dashboard**: http://localhost:43000

## 项目结构

```
ssl-cert-monitoring/
├── server/                     # Agent Server（部署在外网，整合到主项目）
│   ├── agent_server.py         # Flask 主程序
│   ├── certs/                  # SSL 证书目录
│   │   ├── ca.crt              # CA 根证书
│   │   ├── server.crt          # Server 证书
│   │   └── server.key          # Server 私钥
│   ├── Dockerfile              # 镜像构建
│   ├── config.json.example     # 配置示例
│   └── requirements.txt        # Python 依赖
│
├── agent/                      # SSL Agent（单独部署在内网）
│   ├── ssl_cert_agent.py       # Agent 主程序
│   ├── certs/                  # Agent SSL 证书目录
│   │   ├── ca.crt              # CA 根证书副本
│   │   ├── agent.crt           # Agent 证书
│   │   └── agent.key           # Agent 私钥
│   ├── data/                   # 数据存储（运行时缓存）
│   ├── Dockerfile              # 镜像构建
│   ├── docker-compose.agent.yml # 独立部署配置
│   ├── deploy.sh               # Docker 部署脚本
│   ├── deploy_to_agent.sh      # 系统服务部署脚本
│   ├── start.sh                # 快速启动脚本
│   ├── .env.example            # 环境变量示例（快速启动）
│   ├── .env.agent.example      # 环境变量示例（远程部署）
│   └── targets.json.example    # 目标配置示例
│
├── data/                       # 共享数据目录
│   ├── server_config.json      # Server Agent 配置
│   ├── ssl_targets.json        # 统一监控目标配置
│   ├── agent_targets.json      # Agent 管理目标配置
│   ├── metrics.json            # 指标数据存储
│   └── prometheus_targets.json # Prometheus 目标配置
│
├── alertmanager/              # Alertmanager 配置
│   ├── alertmanager.yml       # 告警接收者配置（飞书+邮件）
│   ├── alertmanager.yml.template  # 配置模板
│   └── entrypoint.sh          # 配置生成脚本
├── dashboard/                  # Web Dashboard (React + Vite)
│   ├── src/                    # React 源代码
│   ├── server/                 # 验证码服务 (Node.js)
│   └── Dockerfile             # Dashboard 镜像构建
├── exporter/                   # SSL Exporter
│   ├── blackbox.yml            # Blackbox Exporter 配置
│   ├── ssl_cert_exporter.py    # 自定义 SSL Exporter
│   └── Dockerfile             # Exporter 镜像构建
├── feishu/                     # 飞书告警相关
│   ├── webhook_feishu.py       # 飞书 Webhook 转换服务
│   ├── Dockerfile.feishu-webhook  # 飞书服务镜像构建
│   ├── test_feishu_alert.sh    # 飞书告警排查脚本
│   ├── fix_feishu_alert.sh     # 飞书告警修复脚本
│   └── FEISHU_SETUP.md         # 飞书配置详细指南
├── email/                      # 邮件告警相关
│   ├── webhook_email.py        # 邮件告警服务
│   └── Dockerfile              # 邮件服务镜像构建
├── grafana/                    # Grafana 配置
│   └── provisioning/           # 自动配置
├── prometheus/                 # Prometheus 配置
│   ├── prometheus.yml          # 主配置文件
│   ├── ssl_cert_alerts.yml     # 告警规则
│   └── ssl_targets.json        # 监控目标列表
├── docker-compose.yml           # Docker Compose 配置（包含 Server）
├── generate_https_certs.sh     # HTTPS 证书生成脚本
├── .env.example                 # 环境变量示例
├── .gitignore                  # Git 忽略文件
├── LICENSE
└── README.md
```

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        SSL 证书监控系统                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │   Web        │     │  Prometheus  │     │ Alertmanager │   │
│   │   Dashboard  │◄────│    Server   │────►│   告警发送   │   │
│   │   (48080)    │     └──────┬───────┘     └──────┬───────┘   │
│   └──────────────┘            │                    │           │
│                               │                    │           │
│                        ┌──────▼───────┐     ┌──────▼───────┐   │
│                        │ SSL Exporter │     │ 飞书Webhook │   │
│                        │  (内部9116)  │     │ / 邮件(内部)│   │
│                        └──────┬───────┘     └──────────────┘   │
│                               │                              │
│                    ┌──────────▼──────────┐                   │
│                    │   Blackbox Exporter  │                   │
│                    │      (内部9115)       │                   │
│                    └──────────┬──────────┘                   │
│                               │                               │
│                    ┌──────────▼──────────┐                   │
│                    │      目标服务器       │                   │
│                    │   HTTPS证书探测       │                   │
│                    └───────────────────┘                    │
│                                                                 │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│    │  公网域名   │  │  内网域名   │  │  内网IP    │        │
│    └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Server-Agent 分布式架构（内网监控）

当需要监控**内网隔离环境**中的 SSL 证书时，推荐使用 Server-Agent 分布式架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                        外网（公网）服务端                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Agent Server (HTTP:8090 / HTTPS:8092)        │  │
│  │  • 主动从 Agent 拉取证书数据                               │  │
│  │  • 提供 Prometheus 格式接口                               │  │
│  │  • Agent 注册与心跳管理                                   │  │
│  │  • 监控目标配置管理                                        │  │
│  │  • 自动发现 Agent 上的监控目标                             │  │
│  │  • 不对外暴露端口，仅容器内通信                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ Prometheus 抓取                      │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Prometheus → AlertManager → 告警通知              │  │
│  │                                    ├→ 飞书 Webhook (内部) │  │
│  │                                    └→ 邮件 Webhook (内部) │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           ▲ Server 主动拉取（HTTPS/HTTP）
           │
┌──────────┴──────────────────────────────────────────────────────┐
│                          内网                                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SSL Agent (:48091)                      │  │
│  │  • 部署在内网                                               │  │
│  │  • 定时检测内网 SSL 证书                                    │  │
│  │  • 暴露 HTTP/HTTPS API 供 Server 拉取                      │  │
│  │  • 离线缓存，网络恢复后自动补报                              │  │
│  │  • 支持 HTTPS 加密通信                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ 检测                                │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    内网目标                                 │  │
│  │  • 192.168.1.100:8443                                      │  │
│  │  • https://internal.example.com                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 架构对比

| 特性 | 原架构 | Server-Agent 架构 |
|------|--------|------------------|
| 部署方式 | 单点部署 | 分离部署 |
| 数据获取 | Prometheus 直接抓取 | Server 主动从 Agent 拉取 |
| 网络要求 | Prometheus 能访问目标 | Server 能访问 Agent |
| 适用场景 | 目标可被外网访问 | 内网隔离场景 |
| HTTPS 支持 | 无 | Server-Agent 间 HTTPS 加密 |
| 复杂度 | 简单 | 中等 |

## 配置说明

### 1. 环境变量配置 (.env)

所有敏感配置信息通过 `.env` 文件管理。复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

**配置项说明：**

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GRAFANA_ADMIN_USER` | Grafana 用户名 | `gfadmin` |
| `GRAFANA_ADMIN_PASSWORD` | Grafana 密码 | `your_password` |
| `DASHBOARD_ADMIN_USER` | Web Dashboard 管理员用户名 | `gsadmin` |
| `DASHBOARD_ADMIN_PASSWORD` | Web Dashboard 管理员密码 | `your_password` |
| `DASHBOARD_READONLY_USER` | Web Dashboard 只读用户名（可选） | `readonly` |
| `DASHBOARD_READONLY_PASSWORD` | Web Dashboard 只读密码（可选） | `readonly_password` |
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook 地址 | `https://open.feishu.cn/...` |
| `FEISHU_SEND_RESOLVED` | 是否发送恢复通知 | `true` |
| `SMTP_HOST` | SMTP 服务器地址 | `smtp.example.com` |
| `SMTP_PORT` | SMTP 端口 | `587` |
| `SMTP_USER` | SMTP 用户名 | `your_email@example.com` |
| `SMTP_PASSWORD` | SMTP 密码 | `your_password` |
| `SMTP_FROM` | 发件人邮箱 | `your_email@example.com` |
| `SMTP_USE_TLS` | 是否使用 TLS | `true` |
| `ENABLE_HTTPS` | 是否启用 Server HTTPS | `false` |
| `SERVER_VERIFY_SSL` | Server 验证 Agent SSL 证书 | `false` |

> **用户角色说明：**
> - **管理员**：可访问所有功能，包括「目标管理」和「Agent 管理」页面
> - **只读用户**：可访问仪表盘、证书列表、告警管理页面，无法访问「目标管理」和「Agent 管理」页面

### 2. 添加监控目标

编辑 `data/ssl_targets.json` 添加要监控的域名或 IP：

```json
{
  "targets": [
    {
      "type": "domain",
      "url": "www.example.com:443",
      "owner": "运维团队",
      "env": "production",
      "service_name": "官网"
    },
    {
      "type": "ip",
      "url": "https://192.168.1.100:443",
      "owner": "开发团队",
      "env": "production",
      "service_name": "内部系统",
      "skip_verify": true
    }
  ]
}
```

**配置说明：**

| 字段 | 说明 |
|------|------|
| type | 目标类型：`domain`（域名）或 `ip`（IP 地址） |
| url | 完整的 HTTPS URL（含端口） |
| owner | 负责人/团队 |
| owner_email | 负责人邮箱，用于接收告警邮件 |
| env | 环境：`production`（生产）或 `test`（测试） |
| service_name | 服务名称 |
| skip_verify | 是否跳过证书验证（内网证书通常设为 true） |

### 3. Server-Agent 配置

Server 通过 `data/server_config.json` 管理 Agent 列表：

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

| 字段 | 说明 |
|------|------|
| agent_id | Agent 唯一标识 |
| host | Agent 地址（IP 或域名） |
| port | Agent 监听端口（默认 48091） |
| name | Agent 显示名称 |
| enabled | 是否启用 |
| use_https | 是否使用 HTTPS 协议连接 Agent（Agent 启用 HTTPS 时设为 true） |

### 4. 飞书 Webhook 配置

系统使用独立的飞书 Webhook 服务（`feishu-webhook`）将 AlertManager 告警转换为飞书消息格式。

#### 4.1 配置飞书 Webhook URL

飞书 Webhook URL 在 `.env` 文件中配置：

```
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/你的飞书Webhook地址
```

#### 4.2 创建飞书群机器人

1. 打开飞书 → 进入目标群 → 群设置 → 群机器人
2. 点击 "添加机器人" → "自定义机器人"
3. 设置机器人名称并复制 Webhook 地址
4. 将地址配置到 `FEISHU_WEBHOOK_URL` 环境变量

### 5. 告警通知配置

#### 5.1 Alertmanager 配置

编辑 `alertmanager/alertmanager.yml`：

```yaml
route:
  group_by: ['alertname', 'severity', 'env']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'all-notifications'

receivers:
  # 所有告警 - 同时发送飞书和邮件
  - name: 'all-notifications'
    # 飞书通知
    webhook_configs:
      - url: 'http://feishu-webhook:8080/webhook'
        send_resolved: true
    # 邮件服务（根据负责人邮箱发送）
    webhook_configs:
      - url: 'http://email-webhook:8080/webhook'
        send_resolved: true
```

#### 5.2 邮件告警配置

邮件服务通过 `.env` 文件配置 SMTP：

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM=your_email@example.com
SMTP_USE_TLS=true
```

#### 5.3 配置负责人邮箱

在目标管理中添加负责人邮箱：

| 字段 | 说明 |
|------|------|
| owner_email | 负责人邮箱，用于接收告警邮件 |

邮件服务会根据告警目标的 `owner_email` 自动发送邮件。

#### 5.4 飞书 Webhook 服务

`feishu/webhook_feishu.py` 是独立的 Python 服务，负责：
- 接收 AlertManager 的 webhook 请求
- 将告警格式转换为飞书消息
- 发送到飞书群机器人

服务已集成在 docker-compose.yml 中，自动与 AlertManager 一起启动。

### 6. 告警规则

编辑 `prometheus/ssl_cert_alerts.yml`：

| 告警名称 | 触发条件 | 严重级别 | 通知方式 |
|----------|----------|----------|----------|
| SSLCertCheckFailed | 证书检查失败 | warning | 飞书+邮件 |
| SSLCertExpiringWarning | < 30 天过期 | warning | 飞书+邮件 |
| SSLCertExpiringCritical | < 7 天过期 | critical | 飞书+邮件 |
| SSLCertExpired | 已过期 | critical | 飞书+邮件 |

**告警描述示例：**
```
10.0.0.1 (官网) 证书将在 19.9 天后过期. 负责人: 运维团队
```

### 7. 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 重启飞书 Webhook 服务
docker-compose restart feishu-webhook

# 查看日志
docker-compose logs -f alertmanager
docker-compose logs -f feishu-webhook

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose down
docker-compose up -d --build

# Server-Agent 架构常用命令

# 启动 Agent Server（使用主 docker-compose）
docker-compose up -d agent-server

# 查看 Agent Server 状态（容器内访问）
docker exec ssl-agent-server curl -s http://localhost:8090/health

# 查看在线 Agent
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/agents

# 从 Agent 自动发现目标
docker exec ssl-agent-server curl -s -X POST http://localhost:8090/api/v1/agents/agent-1/discover

# 查看所有监控目标
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/targets

# 查看 Prometheus 格式指标
docker exec ssl-agent-server curl -s http://localhost:8090/metrics

# 查看 Server 日志
docker logs -f ssl-agent-server

# 查看 Agent 日志
docker logs -f ssl-cert-agent

# 查看 Agent 健康状态（在 Agent 机器上）
curl -k https://localhost:48091/health
```

### 8. 故障排查

#### 飞书告警问题排查

```bash
# 运行排查脚本
./feishu/test_feishu_alert.sh
```

#### 检查飞书 Webhook 服务状态

```bash
# 查看服务日志
docker-compose logs feishu-webhook
```

#### 检查 AlertManager 告警

```bash
# 查看当前告警
docker exec ssl-alertmanager amtool --alertmanager.url=http://localhost:9093 alert query
```

#### Agent 连接问题排查

1. 检查 Agent 是否在线：`docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/agents`
2. 检查 Agent 本地健康状态：`curl -k https://<agent-ip>:48091/health`
3. 检查 Server 是否能访问 Agent：确认网络连通性和防火墙规则
4. 如使用 HTTPS，确认 `use_https` 配置正确，自签名证书需设置 `SERVER_VERIFY_SSL=false`

## 监控指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| ssl_cert_days_left | Gauge | 证书剩余天数 |
| ssl_cert_not_after_timestamp | Gauge | 证书过期时间戳 |
| ssl_cert_not_before_timestamp | Gauge | 证书生效时间戳 |
| ssl_cert_check_success | Gauge | 检查是否成功 (1=成功, 0=失败) |
| ssl_cert_is_webtrust | Gauge | 是否 WebTrust 认证 (1=是, 0=否) |
| ssl_cert_sans_count | Gauge | SAN 数量 |
| ssl_cert_issuer | Label | 证书发行机构 |
| ssl_cert_subject | Label | 证书主题/CN |
| ssl_cert_owner | Label | 证书负责人 |

## 服务端口

| 服务 | 容器名 | 宿主机端口 | 容器端口 | 说明 |
|------|--------|-----------|---------|------|
| Web Dashboard | ssl-dashboard | 48080 | 80 | SSL 证书监控 Web UI |
| Prometheus | ssl-prometheus | 49090 | 9090 | 指标收集与存储 |
| Grafana | ssl-grafana | 43000 | 3000 | 可视化面板 |
| Alertmanager | ssl-alertmanager | 9093 | 9093 | 告警管理 |
| Agent Server | ssl-agent-server | - | 8090/8092 | Server-Agent 架构服务端（仅容器内通信） |
| Feishu Webhook | ssl-feishu-webhook | - | 8080 | 飞书通知服务（仅容器内通信） |
| Email Webhook | ssl-email-webhook | - | 8080 | 邮件通知服务（仅容器内通信） |
| Blackbox Exporter | ssl-blackbox | - | 9115 | SSL 探测（仅容器内通信） |
| SSL Exporter | ssl-custom-exporter | - | 9116 | 详细证书信息（仅容器内通信） |
| Captcha Service | ssl-captcha-service | - | 3001 | 验证码服务（仅容器内通信） |

> Agent 端口：`48091`（在 Agent 机器上暴露，供 Server 远程拉取）

## 数据持久化

使用 Docker Volume 确保数据持久化：

```yaml
volumes:
  prometheus-data:/prometheus      # Prometheus 数据
  grafana-data:/var/lib/grafana    # Grafana 数据
  alertmanager-data:/alertmanager  # Alertmanager 数据
```

## 常见问题

### Q1: 内网 IP 无法访问？
检查防火墙规则，确保监控服务器可以访问内网 IP 的 443 端口。

### Q2: 自签名证书检查失败？
Exporter 默认会检查证书，但会跳过证书链验证。如果需要忽略证书验证，可以在配置中设置 `skip_verify: true`。

### Q3: 如何添加更多监控目标？
直接在 `data/ssl_targets.json` 的 `targets` 数组中添加新的目标即可，也可通过 Web Dashboard 的「目标管理」页面添加或批量导入。

### Q4: 告警通知没有收到？
1. 检查飞书 Webhook 服务日志：`docker-compose logs feishu-webhook`
2. 检查 Alertmanager 日志：`docker-compose logs alertmanager`
3. 确认告警规则是否触发：`docker exec ssl-alertmanager amtool alert query`
4. 运行排查脚本：`./feishu/test_feishu_alert.sh`

### Q5: 飞书机器人 Webhook URL 失效？
飞书群机器人的 Webhook URL 可能会过期，请重新创建机器人获取新的 Webhook 地址，并更新 `.env` 中的 `FEISHU_WEBHOOK_URL` 环境变量。

### Q6: 如何使用 Server-Agent 架构监控内网？
主要步骤：
1. 在外网部署 Agent Server：`docker-compose up -d agent-server`
2. 在内网部署 SSL Agent：使用 `docker-compose.agent.yml`
3. 在 `data/server_config.json` 中配置 Agent 信息
4. Server 会主动从 Agent 拉取数据，并提供 Prometheus 格式指标

### Q7: Agent 显示 offline？
1. 确认 Agent 服务正在运行：`curl -k https://<agent-ip>:48091/health`
2. 确认 Server 可以网络访问 Agent 的 IP 和端口
3. 检查 `use_https` 配置是否与 Agent 实际协议一致
4. 如使用自签名证书，确认 `SERVER_VERIFY_SSL=false`

### Q8: 如何导出证书数据？
- **证书列表页**：点击「批量导出」按钮，支持 CSV 和 XLSX 格式
- **仪表盘页**：点击「导出报告」按钮，生成 Markdown 格式的监控报告

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。
