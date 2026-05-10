# SSL 证书监控系统

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

一套完整的 SSL/TLS 证书过期监控解决方案，支持公网域名、内网域名和内网 IP 地址的监控，提供自动化告警和美观的监控面板。

[English](../README.md) | 简体中文

## 功能特性

- **多目标支持**: 监控公网域名、内网域名和 IP 地址
- **证书详情**: 追踪颁发者、主题、SANs、有效期和负责人信息
- **智能告警**: 可配置告警阈值（30 天预警，7 天紧急）
- **多渠道通知**: 支持钉钉、企业微信、邮件、Slack
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

# 或使用启动脚本（自动修复 Dashboard 配置）
./start.sh
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
│   └── alertmanager.yml       # 告警接收者配置
├── dashboard/                  # Web Dashboard (React + Vite)
│   ├── src/                    # React 源代码
│   │   ├── components/         # UI 组件
│   │   ├── pages/              # 页面组件
│   │   │   ├── Dashboard.tsx    # 仪表盘
│   │   │   ├── Certificates.tsx # 证书列表
│   │   │   ├── Alerts.tsx       # 告警管理
│   │   │   ├── Targets.tsx      # 目标管理
│   │   │   └── Login.tsx       # 登录页面
│   │   ├── hooks/              # 自定义 Hooks
│   │   ├── utils/              # 工具函数
│   │   └── types/              # TypeScript 类型
│   ├── server/                 # 验证码服务 (Node.js)
│   ├── public/                 # 静态资源
│   ├── dist/                   # 构建输出
│   ├── package.json            # 依赖管理
│   ├── vite.config.ts          # Vite 配置
│   ├── tailwind.config.js      # Tailwind CSS 配置
│   ├── Dockerfile              # Dashboard 镜像构建
│   └── nginx.conf              # Nginx 配置
├── exporter/                   # SSL Exporter
│   ├── blackbox.yml            # Blackbox Exporter 配置
│   ├── config.json             # 监控目标配置
│   ├── Dockerfile              # Exporter 镜像构建
│   ├── requirements.txt        # Python 依赖
│   └── ssl_cert_exporter.py    # 自定义 SSL Exporter
├── grafana/                    # Grafana 配置
│   ├── grafana_ssl_dashboard.json  # Dashboard JSON
│   └── provisioning/           # 自动配置
│       ├── datasources/        # 数据源配置
│       ├── dashboards/          # Dashboard 配置
│       └── alerting/            # 告警配置
├── prometheus/                 # Prometheus 配置
│   ├── prometheus.yml          # 主配置文件
│   ├── ssl_cert_alerts.yml     # 告警规则
│   └── ssl_targets.json        # 监控目标列表
├── data/                       # 共享数据目录
│   └── ssl_targets.json        # 统一目标配置
├── test-cert/                  # 测试证书
├── docker-compose.yml          # Docker Compose 配置
├── start.sh                    # 启动脚本
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
│                        │ SSL Exporter │     │  钉钉/邮件   │   │
│                        │   (9116)    │     │   Webhook    │   │
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
│    │ google.com │  │internal.com │  │192.168.1.x│        │
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
| env | 环境：`production`（生产）或 `test`（测试） |
| service_name | 服务名称 |
| skip_verify | 是否跳过证书验证（内网证书通常设为 true） |

### 2. Web Dashboard 配置

编辑 `data/ssl_targets.json` 自定义登录账号密码：

```json
{
  "settings": {
    ...
  },
  "admin": {
    "username": "your_username",
    "password": "your_password"
  }
}
```

### 3. 验证码服务

验证码服务随 docker-compose 自动启动，用于生成图形验证码实现安全登录。

### 4. 告警配置

`alertmanager/alertmanager.yml` 支持：

- **钉钉 Webhook**: 紧急告警通知
- **邮件**: 预警通知
- **抑制规则**: 避免重复告警

## 告警规则

| 告警名称 | 触发条件 | 严重级别 |
|----------|----------|----------|
| SSLCertExpiring | < 30 天过期 | warning |
| SSLCertExpiringCritical | < 7 天过期 | critical |
| SSLCertExpired | 已过期 | critical |
| SSLCertProbeFailed | 探测失败 | warning |

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
| ssl_cert_serial | Label | 证书序列号 |
| ssl_cert_sans | Gauge | SANs 域名数量 |

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

## 数据持久化

使用 Docker Volume 确保数据持久化：

```yaml
volumes:
  prometheus-data:/prometheus      # Prometheus 数据
  grafana-data:/var/lib/grafana    # Grafana 数据
  alertmanager-data:/alertmanager  # Alertmanager 数据
```

## 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f prometheus
docker-compose logs -f grafana
docker-compose logs -f dashboard

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建 SSL Exporter
docker-compose build ssl-exporter
docker-compose up -d ssl-exporter
```

## 故障排查

### Dashboard 加载失败
如果 Dashboard 显示错误：
```bash
# 使用启动脚本自动修复
./start.sh
```

### 证书信息获取失败
检查目标配置和 `skip_verify` 设置：
```bash
# 查看 SSL Exporter 日志
docker-compose logs ssl-custom-exporter
```

### 告警未触发
确认 Alertmanager 配置正确：
```bash
# 查看 Prometheus 告警状态
curl http://localhost:49090/api/v1/alerts
```

## 常见问题

### Q1: 内网 IP 无法访问？
检查防火墙规则，确保监控服务器可以访问内网 IP 的 443 端口。

### Q2: 自签名证书检查失败？
Exporter 默认会检查证书，但会跳过证书链验证。如果需要忽略证书验证，可以在配置中设置 `skip_verify: true`。

### Q3: 如何添加更多监控目标？
直接在 `data/ssl_targets.json` 的 `targets` 数组中添加新的目标即可。

### Q4: 告警通知没有收到？
检查 Alertmanager 日志，确认 Webhook 配置正确。

## 许可证

MIT License - 详见 [LICENSE](../LICENSE) 文件。
