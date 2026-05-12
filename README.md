# SSL 证书监控系统

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

一套完整的 SSL/TLS 证书过期监控解决方案，支持公网域名、内网域名和内网 IP 地址的监控，提供自动化告警和美观的监控面板。

[English](README.en.md) | 简体中文

## 功能特性

- **多目标支持**: 监控公网域名、内网域名和 IP 地址
- **证书详情**: 追踪颁发者、主题、SANs、有效期和负责人信息
- **智能告警**: 可配置告警阈值（30 天预警，7 天紧急）
- **多渠道通知**: 支持飞书、邮件通知
- **自动发现**: 基于文件的目标自动发现
- **持久化存储**: Docker Volume 数据持久化
- **Grafana Provisioning**: 自动加载数据源和 Dashboard
- **安全登录**: 图形验证码 + 自定义账号密码
- **Web Dashboard**: 漂亮的 React 管理界面

## 快速开始

### 1. 启动服务

```bash
# 克隆仓库
git clone https://github.com/eagle-qi/ssl-cert-monitoring.git
cd ssl-cert-monitoring

# 使用 docker-compose 启动
docker-compose up -d
```

### 2. 访问服务

| 服务 | 地址 | 账号密码 |
|------|------|----------|
| Web Dashboard | http://localhost:48080 | gsadmin / REDACTED_ADMIN_PASSWORD |
| Grafana | http://localhost:43000 | gfadmin / REDACTED_ADMIN_PASSWORD |
| Prometheus | http://localhost:49090 | - |
| Alertmanager | http://localhost:9093 | - |
| Blackbox Exporter | http://localhost:9115 | - |
| SSL Exporter | http://localhost:9116 | - |
| Feishu Webhook | http://localhost:18080 | - |
| Email Webhook | http://localhost:18081 | - |

### 3. 查看监控面板

**Web Dashboard (推荐)**: http://localhost:48080

功能模块：
- 📊 **仪表盘**: 证书状态概览和统计图表
- 📋 **证书列表**: 所有证书详细信息列表
- 🔔 **告警管理**: 实时告警监控
- 🎯 **目标管理**: 监控目标管理

**Grafana Dashboard**: http://localhost:43000

## 项目结构

```
ssl-cert-monitoring/
├── alertmanager/              # Alertmanager 配置
│   └── alertmanager.yml       # 告警接收者配置（飞书+邮件）
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
├── data/                       # 共享数据目录
│   └── ssl_targets.json        # 统一目标配置
├── docker-compose.yml           # Docker Compose 配置
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
│                        │   (9116)    │     │   / 邮件   │   │
│                        └──────┬───────┘     └──────────────┘   │
│                               │                              │
│                    ┌──────────▼──────────┐                   │
│                    │   Blackbox Exporter  │                   │
│                    │      (9115)          │                   │
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

## 配置说明

### 1. 添加监控目标

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

### 2. 飞书 Webhook 配置

系统使用独立的飞书 Webhook 服务（`feishu-webhook`）将 AlertManager 告警转换为飞书消息格式。

#### 2.1 配置飞书 Webhook URL

编辑 `docker-compose.yml` 中的 `feishu-webhook` 服务环境变量：

```yaml
feishu-webhook:
  build:
    context: ./feishu
    dockerfile: Dockerfile.feishu-webhook
  environment:
    - FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/你的飞书Webhook地址
    - SEND_RESOLVED=true
```

#### 2.2 创建飞书群机器人

1. 打开飞书 → 进入目标群 → 群设置 → 群机器人
2. 点击 "添加机器人" → "自定义机器人"
3. 设置机器人名称并复制 Webhook 地址
4. 将地址配置到 `FEISHU_WEBHOOK_URL` 环境变量

### 3. 告警通知配置

#### 3.1 Alertmanager 配置

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

#### 3.2 邮件告警配置

邮件服务通过 `docker-compose.yml` 配置 SMTP：

```yaml
email-webhook:
  environment:
    - SMTP_HOST=smtp.example.com
    - SMTP_PORT=587
    - SMTP_USER=your_email@example.com
    - SMTP_PASSWORD=your_smtp_password
    - SMTP_FROM=your_email@example.com
    - SMTP_USE_TLS=true
```

#### 3.3 配置负责人邮箱

在目标管理中添加负责人邮箱：

| 字段 | 说明 |
|------|------|
| owner_email | 负责人邮箱，用于接收告警邮件 |

邮件服务会根据告警目标的 `owner_email` 自动发送邮件。

#### 3.2 飞书 Webhook 服务

`feishu/webhook_feishu.py` 是独立的 Python 服务，负责：
- 接收 AlertManager 的 webhook 请求
- 将告警格式转换为飞书消息
- 发送到飞书群机器人

服务已集成在 docker-compose.yml 中，自动与 AlertManager 一起启动。

### 4. 告警规则

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

### 5. 常用命令

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

# 测试飞书告警
curl -X POST http://localhost:18080/test

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose down
docker-compose up -d --build
```

### 6. 故障排查

#### 飞书告警问题排查

```bash
# 运行排查脚本
./feishu/test_feishu_alert.sh
```

#### 检查飞书 Webhook 服务状态

```bash
# 检查健康状态
curl http://localhost:18080/health

# 查看服务日志
docker-compose logs feishu-webhook
```

#### 检查 AlertManager 告警

```bash
# 查看当前告警
docker exec ssl-alertmanager amtool --alertmanager.url=http://localhost:9093 alert query
```

## 监控指标

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| ssl_cert_days_left | Gauge | 证书剩余天数 |
| ssl_cert_not_after_timestamp | Gauge | 证书过期时间戳 |
| ssl_cert_not_before_timestamp | Gauge | 证书生效时间戳 |
| ssl_cert_check_success | Gauge | 检查是否成功 (1=成功, 0=失败) |
| ssl_cert_issuer | Label | 证书发行机构 |
| ssl_cert_subject | Label | 证书主题/CN |
| ssl_cert_owner | Label | 证书负责人 |

## 服务端口

| 服务 | 容器名 | 端口 | 用途 |
|------|--------|------|------|
| Web Dashboard | ssl-dashboard | 48080 | SSL 证书监控 Web UI |
| Captcha Service | ssl-captcha-service | 3001 | 图形验证码服务 |
| Prometheus | ssl-prometheus | 49090 | 指标收集与存储 |
| Grafana | ssl-grafana | 43000 | 可视化面板 |
| Alertmanager | ssl-alertmanager | 9093 | 告警管理 |
| Blackbox Exporter | ssl-blackbox | 9115 | SSL 探测 |
| SSL Exporter | ssl-custom-exporter | 9116 | 详细证书信息 |
| Feishu Webhook | ssl-feishu-webhook | 18080 | 飞书通知服务 |
| Email Webhook | ssl-email-webhook | 18081 | 邮件通知服务 |

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
直接在 `data/ssl_targets.json` 的 `targets` 数组中添加新的目标即可。

### Q4: 告警通知没有收到？
1. 检查飞书 Webhook 服务状态：`curl http://localhost:18080/health`
2. 检查 Alertmanager 日志：`docker-compose logs alertmanager`
3. 确认告警规则是否触发：`docker exec ssl-alertmanager amtool alert query`
4. 运行排查脚本：`./feishu/test_feishu_alert.sh`

### Q5: 飞书机器人 Webhook URL 失效？
飞书群机器人的 Webhook URL 可能会过期，请重新创建机器人获取新的 Webhook 地址，并更新 `docker-compose.yml` 中的 `FEISHU_WEBHOOK_URL` 环境变量。

## 许可证

MIT License - 详见 [LICENSE](../LICENSE) 文件。
