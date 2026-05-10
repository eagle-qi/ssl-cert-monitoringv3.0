# SSL Certificate Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

A complete SSL/TLS certificate expiration monitoring solution that supports monitoring of public domains, internal domains, and internal IP addresses, providing automated alerts and beautiful dashboards.

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
- **Web Dashboard**: Beautiful React-based UI for certificate management

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
| Web Dashboard | http://localhost:48080 | gsadmin / REDACTED_ADMIN_PASSWORD |
| Grafana | http://localhost:43000 | gfadmin / REDACTED_ADMIN_PASSWORD |
| Prometheus | http://localhost:49090 | - |
| Alertmanager | http://localhost:9093 | - |
| Blackbox Exporter | http://localhost:9115 | - |
| SSL Exporter | http://localhost:9116 | - |

### 3. View Dashboard

**Web Dashboard (Recommended)**: http://localhost:48080

Features:
- 📊 **Dashboard**: Certificate status overview and statistics
- 📋 **Certificates**: Detailed certificate list
- 🔔 **Alerts**: Real-time alert monitoring
- 🎯 **Targets**: Target management

**Grafana Dashboard**: http://localhost:43000

## Project Structure

```
ssl-cert-monitoring/
├── alertmanager/              # Alertmanager configuration
│   └── alertmanager.yml       # Alert receiver configuration
├── dashboard/                 # Web Dashboard (React + Vite)
│   ├── src/                   # React source code
│   │   ├── components/        # UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── utils/             # Utility functions
│   │   └── types/             # TypeScript types
│   ├── server/                # Captcha service (Node.js)
│   ├── public/                # Static assets
│   ├── dist/                  # Build output
│   ├── package.json           # Dependencies
│   ├── vite.config.ts         # Vite configuration
│   ├── tailwind.config.js     # Tailwind CSS config
│   ├── Dockerfile             # Dashboard Docker image
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
├── prometheus/                # Prometheus configuration
│   ├── prometheus.yml         # Main configuration file
│   ├── ssl_cert_alerts.yml    # Alert rules
│   └── ssl_targets.json        # Monitoring target list
├── data/                      # Shared data directory
│   └── ssl_targets.json        # Unified target configuration
├── test-cert/                 # Test certificates
├── docker-compose.yml         # Docker Compose configuration
├── start.sh                   # Startup script
├── LICENSE
└── README.md
```

## Configuration

### 1. Add Monitoring Targets

Edit `data/ssl_targets.json` to add domains or IPs to monitor:

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

### 2. Web Dashboard Configuration

Edit `data/ssl_targets.json` to customize login credentials:

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

### 3. Captcha Service

The captcha service is automatically started with docker-compose. It generates graphic captchas for secure login.

### 4. Alert Configuration

`alertmanager/alertmanager.yml` supports:

- **DingTalk Webhook**: Critical alert notifications
- **Lark (Feishu) Webhook**: Critical alert notifications
- **Email**: Warning notifications
- **Inhibition Rules**: Avoid duplicate alerts

### 5. Lark (Feishu) Configuration

Edit `data/ssl_targets.json` to add Lark webhook:

```json
{
  "settings": {
    "lark_webhook": {
      "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx",
      "secret": ""
    }
  }
}
```

**To create a Lark webhook:**
1. Open Lark → Group Settings → Group Bots
2. Click "Add Bot" → "Custom Bot"
3. Set a name and copy the Webhook URL
4. Paste the URL into `lark_webhook.webhook_url`

Lark API endpoint: `POST /api/webhooks/lark`

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
| Web Dashboard | ssl-dashboard | 48080 | SSL certificate monitoring UI |
| Captcha Service | ssl-captcha-service | 3001 | Graphic captcha generation |
| Prometheus | ssl-prometheus | 49090 | Metrics collection & storage |
| Grafana | ssl-grafana | 43000 | Visualization |
| Alertmanager | ssl-alertmanager | 9093 | Alert management |
| Blackbox Exporter | ssl-blackbox | 9115 | SSL probing |
| SSL Exporter | ssl-custom-exporter | 9116 | Detailed certificate info |

## Common Commands

```bash
# Start all services
docker-compose up -d

# View service status
docker-compose ps

# View logs
docker-compose logs -f prometheus
docker-compose logs -f grafana
docker-compose logs -f dashboard

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Rebuild and restart a specific service
docker-compose build ssl-exporter
docker-compose up -d ssl-exporter
```

## Troubleshooting

### Dashboard Failed to Load
If Dashboard shows errors:
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
curl http://localhost:49090/api/v1/alerts
```

## License

MIT License - See [LICENSE](LICENSE) file for details.
