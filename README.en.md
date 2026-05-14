# SSL Certificate Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.x-E6522C)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Latest-F46800)](https://grafana.com/)

A complete SSL/TLS certificate expiration monitoring solution that supports monitoring of public domains, internal domains, and internal IP addresses, providing automated alerts and beautiful dashboards.

[English](README.md) | [简体中文](README.md)

## Features

### Basic Architecture (Single-node Deployment)
- **Multi-target Support**: Monitor public domains, internal domains, and IP addresses
- **Certificate Details**: Track issuer, subject, SANs, validity period, and owner information
- **Smart Alerts**: Configurable alert thresholds (30 days warning, 7 days critical)
- **Multi-channel Notifications**: Support Feishu (Lark) and Email notifications
- **Auto-discovery**: File-based target auto-discovery
- **Persistent Storage**: Docker Volume for data persistence
- **Grafana Provisioning**: Auto-loading dashboards and data sources
- **Secure Login**: Login with graphic captcha and custom credentials + read-only user
- **Web Dashboard**: Beautiful React-based UI for certificate management
- **Batch Import**: Support CSV, XLSX, XLS, WPS and other formats for batch import
- **Batch Export**: Certificate list supports CSV / XLSX export, Dashboard supports Markdown report export

### Server-Agent Architecture (Distributed Deployment)
- **Server Pull Mode**: Server actively pulls data from Agents, no need for Agents to expose externally
- **Internal/External Network Isolation**: Agent deployed internally, Server deployed externally
- **Auto Registration**: Agent auto-registers on startup, no manual configuration needed
- **Heartbeat Detection**: Real-time monitoring of Agent online status
- **Offline Cache**: Local cache during network outages, auto-retry on recovery
- **Auto Target Discovery**: Server automatically discovers and syncs monitoring targets from Agents
- **HTTPS Encrypted Communication**: HTTPS encryption between Server-Agent, self-signed certificates supported
- **Prometheus Compatible**: Standard Prometheus format metrics output

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and configure your sensitive information:

```bash
cp .env.example .env
# Edit .env file with actual values
```

### 2. Start Services

```bash
# Clone the repository
git clone https://github.com/eagle-qi/ssl-cert-monitoring.git
cd ssl-cert-monitoring

# Copy and configure environment variables
cp .env.example .env
# Edit .env file

# Start with docker-compose
docker-compose up -d
```

### 3. Server-Agent Architecture Quick Deploy (Internal Network Monitoring)

To monitor SSL certificates in isolated internal networks, use the Server-Agent distributed architecture:

#### 3.1 Deploy Server (External Network)

```bash
# Create data directory
mkdir -p data

# Copy configuration examples
cp data/server_config.json.example data/server_config.json
cp data/agent_targets.json.example data/agent_targets.json

# Build and start Server (using main docker-compose)
docker-compose up -d agent-server

# Verify Server is running (access inside container)
docker exec ssl-agent-server curl -s http://localhost:8090/health
```

#### 3.2 Deploy Agent (Internal Network)

```bash
# On the internal machine, copy the Agent directory
scp -r user@your-server:/path/to/ssl-cert-monitoring/agent /path/to/local/

cd agent

# Copy and edit configuration
cp .env.agent.example .env
# Edit .env, set AGENT_ID, AGENT_IP, etc.

# Build and run
docker-compose -f docker-compose.agent.yml up -d
```

#### 3.3 Register Agent on Server

Add Agent configuration in `data/server_config.json`:

```json
{
  "agents": [
    {
      "agent_id": "agent-1",
      "host": "10.0.0.1",
      "port": 48091,
      "name": "Internal Network Agent",
      "enabled": true,
      "use_https": true
    }
  ],
  "settings": {
    "scrape_interval": 60
  }
}
```

> **`use_https` field**: When Agent has HTTPS enabled (`AGENT_ENABLE_HTTPS=true`), set `"use_https": true` in the Server config. Server will prefer HTTPS protocol when pulling Agent data.

#### 3.4 Add Monitoring Targets

```bash
curl -X POST http://localhost:8090/api/v1/targets \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.1.100:8443",
    "service_name": "Internal Service",
    "owner": "Ops Team",
    "owner_email": "ops@example.com",
    "timeout": 30
  }'
```

#### 3.5 Configure Prometheus Scrape

Add to Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'ssl-agent-server'
    static_configs:
      - targets: ['ssl-agent-server:8090']
    metrics_path: /metrics
```

### 4. HTTPS Encryption Configuration (Optional)

To encrypt communication between Server and Agent, enable HTTPS:

#### 4.1 Generate SSL Certificates

```bash
# Run on the Server machine
./generate_https_certs.sh
```

This generates in `server/certs/` and `agent/certs/` directories:
- CA Certificate: `server/certs/ca.crt`
- Server Certificate: `server/certs/server.crt` + `server/certs/server.key`
- Agent Certificate: `agent/certs/agent.crt` + `agent/certs/agent.key`

#### 4.2 Enable HTTPS

**Server side** (supports HTTP + HTTPS dual ports):
- HTTP port `8090`: For Nginx proxy internal use
- HTTPS port `8092`: For Agent connections

Set in `.env` file:
```bash
ENABLE_HTTPS=true
SERVER_VERIFY_SSL=false   # Set to false when Agent uses self-signed certificates
```

**Agent side**:
Set in Agent's `.env` file:
```bash
AGENT_ENABLE_HTTPS=true
AGENT_VERIFY_SSL=false    # Set to false when Server uses self-signed certificates
```

Also add `"use_https": true` for the Agent in Server's `data/server_config.json`.

#### 4.3 Deploy CA Certificate to Agent

Copy CA certificate to Agent machine:
```bash
scp user@your-server:/path/to/ssl-cert-monitoring/server/certs/ca.crt /path/to/agent/certs/
```

#### 4.4 Notes

- If using self-signed certificates and don't need verification, set `SERVER_VERIFY_SSL=false` / `AGENT_VERIFY_SSL=false`
- For production, keep SSL verification enabled for secure communication
- Certificates are valid for 365 days by default, remember to update regularly
- When HTTPS is enabled, Server listens on both HTTP (8090) and HTTPS (8092) ports

### 5. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Web Dashboard | http://localhost:48080 | See `.env` file |
| Grafana | http://localhost:43000 | See `.env` file |
| Prometheus | http://localhost:49090 | - |

> Internal services (Agent Server, Feishu Webhook, Email Webhook) are not exposed externally and communicate only within the Docker network.

### 6. View Dashboard

**Web Dashboard (Recommended)**: http://localhost:48080

Features:
- **Dashboard**: Certificate status overview and statistics, supports Markdown report export
- **Certificates**: Detailed certificate list, supports batch export (CSV / XLSX), abnormal status auto-pinned to top
- **Alerts**: Real-time alert monitoring
- **Targets**: Target management, supports single add and batch import (CSV/XLSX/XLS/WPS)
- **Agent Management**: Agent status monitoring and target discovery

Batch Import:
- Support CSV, XLSX, XLS, WPS and other formats
- One-click download import template (CSV/Excel format)
- Automatically skip duplicate URLs
- Detailed import result statistics and error messages

Batch Export:
- Certificate list supports CSV and XLSX format export
- Dashboard supports Markdown format report export (includes overview stats, abnormal certs, full cert list)
- Certificate list auto-sorted by status (Critical > Warning > Expired > Valid)

**Grafana Dashboard**: http://localhost:43000

## Project Structure

```
ssl-cert-monitoring/
├── server/                     # Agent Server (deployed externally, integrated into main project)
│   ├── agent_server.py         # Flask main program
│   ├── certs/                  # SSL certificates directory
│   │   ├── ca.crt              # CA root certificate
│   │   ├── server.crt          # Server certificate
│   │   └── server.key          # Server private key
│   ├── Dockerfile              # Image build
│   ├── config.json.example     # Configuration example
│   └── requirements.txt        # Python dependencies
│
├── agent/                      # SSL Agent (deployed separately on internal network)
│   ├── ssl_cert_agent.py       # Agent main program
│   ├── certs/                  # Agent SSL certificates directory
│   │   ├── ca.crt              # CA root certificate copy
│   │   ├── agent.crt           # Agent certificate
│   │   └── agent.key           # Agent private key
│   ├── data/                   # Data storage (runtime cache)
│   ├── Dockerfile              # Image build
│   ├── docker-compose.agent.yml # Standalone deployment config
│   ├── deploy.sh               # Docker deployment script
│   ├── deploy_to_agent.sh      # System service deployment script
│   ├── start.sh                # Quick start script
│   ├── .env.example            # Environment variables example (quick start)
│   ├── .env.agent.example      # Environment variables example (remote deploy)
│   └── targets.json.example    # Target configuration example
│
├── data/                       # Shared data directory
│   ├── server_config.json      # Server Agent configuration
│   ├── ssl_targets.json        # Unified monitoring target configuration
│   ├── agent_targets.json      # Agent managed target configuration
│   ├── metrics.json            # Metrics data storage
│   └── prometheus_targets.json # Prometheus target configuration
│
├── alertmanager/              # Alertmanager configuration
│   ├── alertmanager.yml       # Alert receiver configuration (Feishu + Email)
│   ├── alertmanager.yml.template  # Configuration template
│   └── entrypoint.sh          # Configuration generation script
├── dashboard/                  # Web Dashboard (React + Vite)
│   ├── src/                    # React source code
│   ├── server/                 # Captcha service (Node.js)
│   └── Dockerfile             # Dashboard Docker image
├── exporter/                   # SSL Exporter
│   ├── blackbox.yml           # Blackbox Exporter configuration
│   ├── ssl_cert_exporter.py   # Custom SSL Exporter
│   └── Dockerfile             # Exporter image build
├── feishu/                     # Feishu alert related
│   ├── webhook_feishu.py       # Feishu Webhook conversion service
│   ├── Dockerfile.feishu-webhook  # Feishu service image build
│   ├── test_feishu_alert.sh    # Feishu alert troubleshooting script
│   ├── fix_feishu_alert.sh     # Feishu alert fix script
│   └── FEISHU_SETUP.md         # Feishu setup guide
├── email/                      # Email alert related
│   ├── webhook_email.py        # Email alert service
│   └── Dockerfile              # Email service image build
├── grafana/                    # Grafana configuration
│   └── provisioning/           # Auto-configuration
├── prometheus/                 # Prometheus configuration
│   ├── prometheus.yml          # Main configuration file
│   ├── ssl_cert_alerts.yml     # Alert rules
│   └── ssl_targets.json        # Monitoring target list
├── docker-compose.yml           # Docker Compose configuration (includes Server)
├── generate_https_certs.sh     # HTTPS certificate generation script
├── .env.example                 # Environment variables example
├── .gitignore                  # Git ignore file
├── LICENSE
└── README.md
```

## Architecture Design

### Server-Agent Distributed Architecture

When monitoring SSL certificates in **isolated internal networks**, use the Server-Agent distributed architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Network (Public)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Agent Server (HTTP:8090 / HTTPS:8092)            │  │
│  │  • Actively pulls certificate data from Agents            │  │
│  │  • Provides Prometheus format interface                   │  │
│  │  • Agent registration and heartbeat management            │  │
│  │  • Monitoring target configuration management             │  │
│  │  • Auto-discovers monitoring targets from Agents          │  │
│  │  • No external port exposure, internal communication only │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ Prometheus scrape                    │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │     Prometheus → AlertManager → Alert Notifications       │  │
│  │                                ├→ Feishu Webhook (internal)│  │
│  │                                └→ Email Webhook (internal) │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           ▲ Server actively pulls (HTTPS/HTTP)
           │
┌──────────┴──────────────────────────────────────────────────────┐
│                        Internal Network                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SSL Agent (:48091)                       │  │
│  │  • Deployed on internal network                            │  │
│  │  • Periodically checks internal SSL certificates           │  │
│  │  • Exposes HTTP/HTTPS API for Server to pull               │  │
│  │  • Offline cache, auto-retry on recovery                   │  │
│  │  • Supports HTTPS encrypted communication                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ Check                               │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Internal Targets                         │  │
│  │  • 192.168.1.100:8443                                      │  │
│  │  • https://internal.example.com                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Comparison

| Feature | Basic Architecture | Server-Agent Architecture |
|---------|-------------------|--------------------------|
| Deployment | Single node | Separated |
| Data Collection | Prometheus directly scrapes | Server actively pulls from Agents |
| Network Requirement | Prometheus can access targets | Server can access Agents |
| Use Case | Targets accessible externally | Internal network isolation |
| HTTPS Support | No | HTTPS encryption between Server-Agent |
| Complexity | Simple | Medium |

## Configuration

### 1. Environment Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `GRAFANA_ADMIN_USER` | Grafana username | `gfadmin` |
| `GRAFANA_ADMIN_PASSWORD` | Grafana password | `your_password` |
| `DASHBOARD_ADMIN_USER` | Dashboard admin username | `gsadmin` |
| `DASHBOARD_ADMIN_PASSWORD` | Dashboard admin password | `your_password` |
| `DASHBOARD_READONLY_USER` | Dashboard read-only username (optional) | `readonly` |
| `DASHBOARD_READONLY_PASSWORD` | Dashboard read-only password (optional) | `readonly_password` |
| `FEISHU_WEBHOOK_URL` | Feishu Webhook URL | `https://open.feishu.cn/...` |
| `FEISHU_SEND_RESOLVED` | Send resolved notifications | `true` |
| `SMTP_HOST` | SMTP server address | `smtp.example.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `your_email@example.com` |
| `SMTP_PASSWORD` | SMTP password | `your_password` |
| `SMTP_FROM` | Sender email | `your_email@example.com` |
| `SMTP_USE_TLS` | Use TLS | `true` |
| `ENABLE_HTTPS` | Enable Server HTTPS | `false` |
| `SERVER_VERIFY_SSL` | Server verifies Agent SSL certificate | `false` |

> **User Roles:**
> - **Admin**: Access all features including "Target Management" and "Agent Management" pages
> - **Read-only User**: Access Dashboard, Certificates, Alerts pages, cannot access "Target Management" and "Agent Management"

### 2. Server-Agent Configuration

Server manages Agent list through `data/server_config.json`:

```json
{
  "agents": [
    {
      "agent_id": "agent-1",
      "host": "10.0.0.1",
      "port": 48091,
      "name": "Internal Network Agent",
      "enabled": true,
      "use_https": true
    }
  ],
  "settings": {
    "scrape_interval": 60
  }
}
```

**Agent Configuration Fields:**

| Field | Description |
|-------|-------------|
| agent_id | Agent unique identifier |
| host | Agent address (IP or domain) |
| port | Agent listening port (default 48091) |
| name | Agent display name |
| enabled | Whether enabled |
| use_https | Whether to use HTTPS to connect to Agent (set true when Agent has HTTPS enabled) |

### 3. Alert Rules

| Alert Name | Condition | Severity | Notification |
|------------|-----------|----------|-------------|
| SSLCertCheckFailed | Certificate check failed | warning | Feishu + Email |
| SSLCertExpiringWarning | < 30 days to expire | warning | Feishu + Email |
| SSLCertExpiringCritical | < 7 days to expire | critical | Feishu + Email |
| SSLCertExpired | Expired | critical | Feishu + Email |

### 4. Common Commands

```bash
# Start all services
docker-compose up -d

# View service status
docker-compose ps

# View logs
docker-compose logs -f alertmanager
docker-compose logs -f feishu-webhook

# Stop services
docker-compose down

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Server-Agent architecture commands

# Start Agent Server
docker-compose up -d agent-server

# Check Agent Server status (access inside container)
docker exec ssl-agent-server curl -s http://localhost:8090/health

# View online Agents
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/agents

# Discover targets from Agent
docker exec ssl-agent-server curl -s -X POST http://localhost:8090/api/v1/agents/agent-1/discover

# View all monitoring targets
docker exec ssl-agent-server curl -s http://localhost:8090/api/v1/targets

# View Prometheus format metrics
docker exec ssl-agent-server curl -s http://localhost:8090/metrics

# View Server logs
docker logs -f ssl-agent-server

# View Agent logs
docker logs -f ssl-cert-agent

# Check Agent health (on Agent machine)
curl -k https://localhost:48091/health
```

## Monitoring Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| ssl_cert_days_left | Gauge | Days until certificate expires |
| ssl_cert_not_after_timestamp | Gauge | Certificate expiration timestamp |
| ssl_cert_not_before_timestamp | Gauge | Certificate effective timestamp |
| ssl_cert_check_success | Gauge | Check success (1=success, 0=failure) |
| ssl_cert_is_webtrust | Gauge | WebTrust certification (1=yes, 0=no) |
| ssl_cert_sans_count | Gauge | Number of SANs |
| ssl_cert_issuer | Label | Certificate issuer |
| ssl_cert_subject | Label | Certificate subject/CN |
| ssl_cert_owner | Label | Certificate owner |

## Service Ports

| Service | Container | Host Port | Container Port | Purpose |
|---------|-----------|-----------|----------------|---------|
| Web Dashboard | ssl-dashboard | 48080 | 80 | SSL certificate monitoring UI |
| Prometheus | ssl-prometheus | 49090 | 9090 | Metrics collection & storage |
| Grafana | ssl-grafana | 43000 | 3000 | Visualization |
| Alertmanager | ssl-alertmanager | 9093 | 9093 | Alert management |
| Agent Server | ssl-agent-server | - | 8090/8092 | Server-Agent architecture (internal only) |
| Feishu Webhook | ssl-feishu-webhook | - | 8080 | Feishu notification (internal only) |
| Email Webhook | ssl-email-webhook | - | 8080 | Email notification (internal only) |
| Blackbox Exporter | ssl-blackbox | - | 9115 | SSL probing (internal only) |
| SSL Exporter | ssl-custom-exporter | - | 9116 | Detailed cert info (internal only) |
| Captcha Service | ssl-captcha-service | - | 3001 | Captcha service (internal only) |

> Agent port: `48091` (exposed on Agent machine for Server to pull remotely)

## FAQ

### Q1: Internal IP not accessible?
Check firewall rules to ensure the monitoring server can access the internal IP's port 443.

### Q2: Self-signed certificate check failed?
The exporter checks certificates by default but skips chain verification. Set `skip_verify: true` in the configuration to ignore verification.

### Q3: How to add more monitoring targets?
Add new targets in the `targets` array of `data/ssl_targets.json`, or use the Web Dashboard's "Target Management" page for single add or batch import.

### Q4: Not receiving alert notifications?
1. Check Feishu Webhook service logs: `docker-compose logs feishu-webhook`
2. Check Alertmanager logs: `docker-compose logs alertmanager`
3. Verify alert rules are triggered: `docker exec ssl-alertmanager amtool alert query`
4. Run troubleshooting script: `./feishu/test_feishu_alert.sh`

### Q5: Agent shows offline?
1. Confirm Agent service is running: `curl -k https://<agent-ip>:48091/health`
2. Confirm Server can access Agent's IP and port
3. Check `use_https` config matches Agent's actual protocol
4. If using self-signed certificates, confirm `SERVER_VERIFY_SSL=false`

### Q6: How to export certificate data?
- **Certificates page**: Click "Batch Export" button, supports CSV and XLSX formats
- **Dashboard page**: Click "Export Report" button, generates Markdown format monitoring report

## License

MIT License - See [LICENSE](LICENSE) file for details.
