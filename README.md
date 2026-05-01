# SSL Certificate Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-8.x-F46800)](https://grafana.com/)

English | [简体中文](docs/README.zh-CN.md)

A complete solution for monitoring SSL/TLS certificate expiration across public domains, internal domains, and internal IP addresses. Features automated alerts, beautiful Grafana dashboards, and support for multiple monitoring systems (Prometheus, Zabbix, Nightingale).

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Dashboard](#-dashboard)
- [Alerting](#-alerting)
- [Multiple Solutions](#-multiple-solutions)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

- ✅ **Multi-target Support**: Monitor public domains, internal domains, and IP addresses
- ✅ **Certificate Details**: Track issuer, subject, SANs, validity period, and owner information
- ✅ **Flexible Monitoring**: Choose from Prometheus, Zabbix, or Nightingale solutions
- ✅ **Smart Alerts**: Configurable alert thresholds (30 days warning, 7 days critical)
- ✅ **Beautiful Dashboards**: Grafana dashboards with charts, tables, and statistics
- ✅ **Multi-channel Notifications**: Email, DingTalk, WeChat, Slack support
- ✅ **Easy Deployment**: Docker and manual deployment options
- ✅ **Production Ready**: Tested in production environments

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SSL Certificate Monitoring                 │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌───────────────┐        ┌──────────────┐
│   Targets    │────────▶│  Probe/Exporter│──────▶│  Prometheus  │
│              │         │               │        │              │
│ • Public    │         │ • Blackbox    │        │ • Scrape     │
│   Domain    │         │   Exporter    │        │ • Store      │
│             │         │               │        │ • Alert Rule │
│ • Internal  │         │ • Custom      │        │              │
│   Domain    │         │   Exporter    │        └──────┬───────┘
│             │         │               │               │
│ • Internal  │         └───────────────┘               │
│   IP        │                                         │
└──────────────┘                                         ▼
                                            ┌────────────────────┐
                                            │     Grafana        │
                                            │                    │
                                            │ • Dashboard        │
                                            │ • Chart            │
                                            │ • Alert            │
                                            └────────────────────┘
                                                     │
                                                     ▼
                                            ┌────────────────────┐
                                            │   Alertmanager     │
                                            │                    │
                                            │ • Route            │
                                            │ • Inhibit          │
                                            │ • Notify           │
                                            └────────────────────┘
                                                     │
                                                     ▼
                                            ┌────────────────────┐
                                            │  Notification      │
                                            │                    │
                                            │ • Email            │
                                            │ • DingTalk         │
                                            │ • WeChat           │
                                            │ • Slack            │
                                            └────────────────────┘
```

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/eagle-qi/ssl-cert-monitoring.git
cd ssl-cert-monitoring
```

### 2. Configure Targets

Edit `exporter/config.json` to add your domains:

```json
{
  "targets": [
    {
      "hostname": "www.google.com",
      "port": 443,
      "owner": "ops-team",
      "env": "production",
      "service_name": "Official Website"
    }
  ]
}
```

### 3. Start with Docker Compose

```bash
docker-compose up -d
```

### 4. Access the Dashboard

Open your browser and visit:
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

## 📦 Installation

### Option 1: Using Docker (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus:/etc/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana-storage:/var/lib/grafana
      - ./grafana:/etc/grafana/provisioning

  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    ports:
      - "9115:9115"
    volumes:
      - ./exporter/blackbox.yml:/etc/blackbox_exporter/config.yml

  ssl-exporter:
    build: ./exporter
    ports:
      - "9116:9116"
    volumes:
      - ./exporter:/app

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager:/etc/alertmanager

volumes:
  grafana-storage:
```

### Option 2: Manual Installation

#### Install Prometheus

```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Copy configuration
cp ../prometheus/prometheus.yml ./prometheus.yml
cp ../prometheus/ssl_cert_alerts.yml ./ssl_cert_alerts.yml

# Start Prometheus
./prometheus --config.file=./prometheus.yml
```

#### Install Grafana

```bash
# Ubuntu/Debian
sudo apt-get install -y grafana

# Start Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Install Dashboard
curl -X POST \
  -H "Content-Type: application/json" \
  -d @grafana/grafana_ssl_dashboard.json \
  http://admin:admin@localhost:3000/api/dashboards/db
```

#### Install Custom Exporter

```bash
cd exporter
pip install -r requirements.txt
python ssl_cert_exporter.py
```

## ⚙️ Configuration

### 1. Target Configuration (`config.json`)

```json
{
  "targets": [
    {
      "hostname": "www.example.com",
      "port": 443,
      "owner": "ops-team-zhangsan",
      "env": "production",
      "service_name": "Official Website"
    },
    {
      "hostname": "internal-app.local",
      "port": 443,
      "owner": "dev-team-lisi",
      "env": "staging",
      "service_name": "Internal App"
    },
    {
      "hostname": "192.168.1.100",
      "port": 443,
      "owner": "network-team-wangwu",
      "env": "production",
      "service_name": "Internal Service"
    }
  ]
}
```

### 2. Prometheus Configuration (`prometheus.yml`)

Key configuration points:

```yaml
scrape_configs:
  # Blackbox Exporter - for basic SSL probing
  - job_name: 'ssl-blackbox'
    metrics_path: /probe
    params:
      module: [http_ssl_cert]
    static_configs:
      - targets:
        - https://www.google.com
        - https://github.com
    relabel_configs:
      - target_label: __address__
        replacement: localhost:9115

  # Custom Exporter - for detailed certificate info
  - job_name: 'ssl-cert-exporter'
    static_configs:
      - targets: ['localhost:9116']
```

### 3. Alertmanager Configuration (`alertmanager.yml`)

Configure notification channels:

```yaml
receivers:
  - name: 'critical-alerts'
    webhook_configs:
      # DingTalk
      - url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
      
  - name: 'warning-alerts'
    email_configs:
      - to: 'team@example.com'
```

## 📊 Dashboard

Import the Grafana dashboard from `grafana/grafana_ssl_dashboard.json`.

### Dashboard Features:

1. **SSL Certificate Expiry Status** (Table)
   - Domain/URL
   - Certificate expiration date
   - Days until expiry (with color coding)
   - Certificate issuer
   - Owner

2. **Expiry Distribution** (Pie Chart)
   - < 7 days (Critical)
   - 7-30 days (Warning)
   - > 30 days (Normal)
   - Expired

3. **Certificates by Environment** (Bar Chart)
   - Production
   - Staging
   - Testing

4. **Alert History** (List)
   - Recent alerts
   - Alert status
   - Timestamp

### Screenshot

![Dashboard Screenshot](images/ssl-architecture-diagram.png)

## 🔔 Alerting

### Alert Rules

| Alert Name | Trigger Condition | Severity | Description |
|-----------|------------------|----------|-------------|
| SSLCertificateExpiringSoon | < 30 days | Warning | Certificate expiring in 30 days |
| SSLCertificateExpiringCritical | < 7 days | Critical | Certificate expiring in 7 days |
| SSLCertificateExpired | Already expired | Critical | Certificate has expired |
| SSLProbeFailed | probe_success == 0 | Warning | Failed to probe certificate |

### Alert Flow

```
Certificate Expiring
         │
         ▼
   Prometheus Alert
         │
         ▼
   Alertmanager
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  Route    Inhibit
    │         │
    ▼         ▼
  Notify   Suppress
```

## 🔧 Multiple Solutions

This project provides three monitoring solutions:

### 1. Prometheus + Blackbox Exporter + Grafana (Recommended)

**Pros:**
- Rich ecosystem
- Flexible querying (PromQL)
- Beautiful dashboards
- Active community

**Best for:** Teams already using Prometheus

### 2. Zabbix

**Pros:**
- All-in-one solution
- Built-in alerting
- Web interface
- Low learning curve

**Best for:** Traditional IT infrastructure monitoring

### 3. Nightingale (夜莺)

**Pros:**
- Cloud-native design
- Supports multiple data sources
- Chinese localization
- Enterprise features

**Best for:** Chinese enterprises, cloud-native environments

For detailed comparison, see [Solution Comparison](docs/README.zh-CN.md#多种监控方案对比).

## 📁 Project Structure

```
ssl-cert-monitoring/
├── exporter/                 # Custom SSL exporter
│   ├── ssl_cert_exporter.py # Main exporter script
│   ├── config.json          # Target configuration
│   └── requirements.txt    # Python dependencies
├── grafana/                 # Grafana dashboards
│   └── grafana_ssl_dashboard.json
├── prometheus/              # Prometheus configuration
│   ├── prometheus.yml
│   └── ssl_cert_alerts.yml
├── alertmanager/            # Alertmanager configuration
│   └── alertmanager.yml
├── docs/                    # Documentation
│   ├── README.zh-CN.md     # Chinese documentation
│   └── images/             # Documentation images
├── images/                  # Architecture diagrams
│   └── ssl-architecture-diagram.png
└── docker-compose.yml      # Docker deployment
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Prometheus](https://prometheus.io/) - Monitoring system
- [Grafana](https://grafana.com/) - Visualization platform
- [Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) - Probing exporter

## 📧 Contact

- Author: eagle-qi
- Email: REDACTED_EMAIL@gmail.com
- GitHub: [@eagle-qi](https://github.com/eagle-qi)

---

**⭐ If this project helps you, please give it a star!**
