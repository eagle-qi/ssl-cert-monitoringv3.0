# SSL Certificate Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

A complete SSL/TLS certificate expiration monitoring solution that supports monitoring of public domains, internal domains, and internal IP addresses, providing automated alerts and beautiful Grafana dashboards.

[English](README.md) | [简体中文](docs/README.zh-CN.md)

## Features

- **Multi-target Support**: Monitor public domains, internal domains, and IP addresses
- **Certificate Details**: Track issuer, subject, SANs, validity period, and owner information
- **Smart Alerts**: Configurable alert thresholds (30 days warning, 7 days critical)
- **Multi-channel Notifications**: Support DingTalk, WeChat Work, Email, Slack
- **Auto-discovery**: File-based target auto-discovery
- **Persistent Storage**: Docker Volume for data persistence
- **Grafana Provisioning**: Auto-loading dashboards and data sources
- **Secure Login**: Login with graphic captcha and custom credentials

## Quick Start

### 1. Start Services

```bash
# Clone the repository
git clone https://github.com/eagle-qi/ssl-cert-monitoring.git
cd ssl-cert-monitoring

# Start with docker-compose
docker-compose up -d

# Or use the startup script (auto-fixes Dashboard configuration)
./start.sh
```

### 2. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Web Dashboard | http://localhost:8080 | admin / admin123 |
| Captcha Service | http://localhost:3001 | - |
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Alertmanager | http://localhost:9093 | - |
| Blackbox Exporter | http://localhost:9115 | - |
| SSL Exporter | http://localhost:9116 | - |

### 3. View Dashboard

**Web Dashboard (推荐)**：http://localhost:8080

- 📊 **仪表盘**: 证书状态概览和统计图表
- 📋 **证书列表**: 所有证书详细信息列表
- 🔔 **告警管理**: 实时告警监控

**Grafana Dashboard**: http://localhost:3000/d/ssl-cert-monitoring

## Project Structure

```
ssl-cert-monitoring/
├── alertmanager/              # Alertmanager configuration
│   └── alertmanager.yml       # Alert receiver configuration
├── dashboard/                 # Web Dashboard (React)
│   ├── src/                   # React source code
│   │   ├── components/       # UI components
│   │   ├── pages/            # Page components
│   │   ├── utils/            # Utility functions
│   │   └── types/            # TypeScript types
│   ├── public/                # Static assets
│   ├── package.json           # Dependencies
│   ├── vite.config.ts         # Vite configuration
│   ├── tailwind.config.js     # Tailwind CSS config
│   ├── Dockerfile             # Docker image build
│   └── nginx.conf             # Nginx configuration
├── exporter/                  # SSL Exporter
│   ├── blackbox.yml           # Blackbox Exporter configuration
│   ├── config.json            # Monitoring target configuration
│   ├── Dockerfile             # Exporter image build
│   ├── requirements.txt        # Python dependencies
│   └── ssl_cert_exporter.py   # Custom SSL Exporter
├── grafana/                   # Grafana configuration
│   ├── grafana_ssl_dashboard.json  # Dashboard JSON
│   └── provisioning/          # Auto-configuration
│       ├── datasources/       # Data source configuration
│       ├── dashboards/        # Dashboard configuration
│       └── alerting/          # Alert configuration
├── nginx/                     # Nginx configuration
│   └── dashboard.conf          # Dashboard reverse proxy config
├── prometheus/                # Prometheus configuration
│   ├── prometheus.yml         # Main configuration file
│   ├── ssl_cert_alerts.yml    # Alert rules
│   └── ssl_targets.json        # Monitoring target list
├── docs/                      # Documentation
├── images/                    # Architecture diagrams
├── test-cert/                 # Test certificates
├── docker-compose.yml         # Docker Compose configuration
├── start.sh                   # Startup script
├── LICENSE
└── README.md
```

## Configuration

### 1. Add Monitoring Targets

Edit `exporter/config.json` to add domains or IPs to monitor:

```json
{
  "targets": [
    {
      "type": "domain",
      "url": "www.example.com:443",
      "owner": "ops-team",
      "env": "production",
      "service_name": "Official Website"
    },
    {
      "type": "ip",
      "url": "https://192.168.1.100:443",
      "owner": "dev-team",
      "env": "production",
      "service_name": "Internal System",
      "skip_verify": true
    }
  ]
}
```

**Configuration Fields:**

| Field | Description |
|-------|-------------|
| type | Target type: `domain` or `ip` |
| url | Complete HTTPS URL (with port) |
| owner | Owner/team |
| env | Environment: `production` or `test` |
| service_name | Service name |
| skip_verify | Skip certificate verification (set to true for internal certificates) |

### 2. Prometheus Configuration

`prometheus/prometheus.yml` main configuration:

```yaml
scrape_configs:
  # Blackbox Exporter - File auto-discovery
  - job_name: 'ssl-blackbox'
    metrics_path: /probe
    params:
      module: [http_ssl_cert]
    file_sd_configs:
      - files:
          - '/etc/prometheus/ssl_targets.json'
        refresh_interval: 60s
    relabel_configs:
      - target_label: __address__
        replacement: ssl-blackbox:9115

  # Custom SSL Exporter - Detailed certificate info
  - job_name: 'ssl-cert-exporter'
    static_configs:
      - targets: ['ssl-custom-exporter:9116']
```

### 3. Alert Configuration

`alertmanager/alertmanager.yml` supports:

- **DingTalk Webhook**: Critical alert notifications
- **Email**: Warning notifications
- **Inhibition Rules**: Avoid duplicate alerts

## Alert Rules

| Alert Name | Condition | Severity |
|------------|-----------|----------|
| SSLCertExpiring | < 30 days | warning |
| SSLCertExpiringCritical | < 7 days | critical |
| SSLCertExpired | Expired | critical |
| SSLCertProbeFailed | Probe failed | warning |

## Service Ports

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| Web Dashboard | ssl-dashboard | 8080 | SSL certificate monitoring UI |
| Captcha Service | ssl-captcha-service | 3001 | Graphic captcha generation |
| Prometheus | ssl-prometheus | 9090 | Metrics collection & storage |
| Grafana | ssl-grafana | 3000 | Visualization |
| Alertmanager | ssl-alertmanager | 9093 | Alert management |
| Blackbox Exporter | ssl-blackbox | 9115 | SSL probing |
| SSL Exporter | ssl-custom-exporter | 9116 | Detailed certificate info |

## Web Dashboard Configuration

### 1. Custom Login Credentials

Edit `docker-compose.yml` to customize login credentials:

```yaml
dashboard:
  environment:
    - VITE_ADMIN_USERNAME=your_username
    - VITE_ADMIN_PASSWORD=your_password
```

### 2. Environment Variables

Create `dashboard/.env` file (copy from `.env.example`):

```bash
# 登录认证配置
VITE_ADMIN_USERNAME=admin
VITE_ADMIN_PASSWORD=admin123

# 验证码服务（Docker容器内部地址）
VITE_CAPTCHA_API_URL=http://ssl-captcha-service:3001

# 注意：Metrics 和 Alerts API 已通过 Nginx 反向代理配置
# 前端通过相对路径 /api/metrics 和 /api/alerts 访问
```

### 3. Captcha Service

The captcha service is automatically started with docker-compose. To manually test:

```bash
# Get captcha
curl http://localhost:3001/api/captcha

# Verify captcha
curl -X POST http://localhost:3001/api/captcha/verify \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","captcha":"abcd"}'
```

### 4. Nginx Reverse Proxy Configuration

The Dashboard uses Nginx to proxy internal Docker services:

| 前端路径 | 代理到容器 | 说明 |
|---------|-----------|------|
| /api/metrics | ssl-custom-exporter:9116/metrics | SSL证书指标 |
| /api/alerts | ssl-alertmanager:9090/api/v1/alerts | 告警数据 |
| /api/prometheus | ssl-prometheus:9090/ | Prometheus API |
| /api/* (other) | ssl-prometheus:9090/ | Prometheus API |

**配置文件位置**: `dashboard/nginx.conf`

### 5. Login Flow

1. User enters username and password
2. System validates graphic captcha (4 characters)
3. On success, JWT token is stored in localStorage
4. Session expires after 24 hours

## Data Persistence

Docker Volumes ensure data persistence:

```yaml
volumes:
  prometheus-data:/prometheus
  grafana-data:/var/lib/grafana
  alertmanager-data:/alertmanager
```

## Common Commands

```bash
# Start all services
docker-compose up -d

# View service status
docker-compose ps

# View logs
docker-compose logs -f prometheus
docker-compose logs -f grafana

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Rebuild and restart SSL Exporter
docker-compose build ssl-exporter
docker-compose up -d ssl-exporter
```

## Troubleshooting

### Dashboard Failed to Load
If Dashboard shows "Data source not found":
```bash
# Use startup script to auto-fix
./start.sh
```

### Certificate Info Fetch Failed
Check target configuration and `skip_verify` setting:
```bash
# View SSL Exporter logs
docker-compose logs ssl-custom-exporter
```

### Alerts Not Triggering
Verify Alertmanager configuration:
```bash
# Check Prometheus alert status
curl http://localhost:9090/api/v1/alerts
```

## License

MIT License - See [LICENSE](LICENSE) file for details.
