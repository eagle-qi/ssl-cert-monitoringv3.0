# SSL证书有效期监控系统实施方案

> 基于 Prometheus + Blackbox Exporter + Grafana + Alertmanager
> 支持公网域名、内网域名、内网IP的HTTPS证书监控
> 证书有效期低于30天自动告警

---

## 目录

1. [方案概述](#方案概述)
2. [架构设计](#架构设计)
3. [一、SSL证书采集脚本](#一ssl证书采集脚本)
4. [二、Prometheus配置](#二prometheus配置)
5. [三、Alertmanager告警配置](#三alertmanager告警配置)
6. [四、Grafana监控面板](#四grafana监控面板)
7. [五、完整使用指南](#五完整使用指南)
8. [六、部署验证](#六部署验证)

---

## 方案概述

### 功能特性

- ✅ 支持公网域名URL监控（如：https://www.google.com）
- ✅ 支持内网域名URL监控（如：https://internal.example.com）
- ✅ 支持内网IP的URL监控（如：https://192.168.1.100:8443）
- ✅ 采集证书详细信息：发行机构(CN)、负责人、剩余天数、序列号等
- ✅ 证书有效期低于30天自动告警
- ✅ 支持邮件、钉钉、企业微信等多种告警方式

### 监控指标

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
| ssl_cert_sans_count | Gauge | SANs域名数量 |

---

## 架构设计

### 可视化架构图

点击查看完整的架构设计图：[ssl-architecture-diagram.html](./ssl-architecture-diagram.html)

### 文本架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        监控系统架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐  │
│   │   Grafana    │     │  Prometheus  │     │ Alertmanager │  │
│   │   Dashboard  │◄────│    Server    │────►│   告警发送   │  │
│   └──────────────┘     └──────┬───────┘     └──────┬───────┘  │
│                               │                    │           │
│                               │                    │           │
│                        ┌──────▼───────┐     ┌──────▼───────┐  │
│                        │ SSL Exporter │     │  钉钉/邮件   │  │
│                        │   (9116)    │     │   Webhook    │  │
│                        └──────┬───────┘     └──────────────┘   │
│                               │                               │
│                               │                               │
│                    ┌──────────▼──────────┐                    │
│                    │   目标服务器        │                    │
│                    │  HTTPS证书探测      │                    │
│                    └───────────────────┘                    │
│                                                                 │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│    │  公网域名   │  │  内网域名   │  │  内网IP    │        │
│    │ google.com │  │internal.com │  │192.168.1.x│        │
│    └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 架构组件说明

| 组件 | 端口 | 说明 |
|------|------|------|
| **SSL Exporter** | 9116 | 自定义Python采集器，采集证书详细信息 |
| **Prometheus** | 9090 | 时序数据库，采集和存储指标 |
| **Grafana** | 3000 | 可视化看板，展示证书状态 |
| **Alertmanager** | 9093 | 告警管理，发送通知 |
| **钉钉/邮件** | - | 告警通知渠道 |

### 告警规则

| 级别 | 条件 | 动作 |
|------|------|------|
| 🔴 **严重** | 证书 < 7 天过期 | 立即发送告警 |
| 🟡 **警告** | 7 天 ≤ 证书 < 30 天 | 定时发送提醒 |
| ℹ️ **信息** | 证书 ≥ 30 天 | 正常监控 |

### 数据流程

```
1. SSL Exporter 定期采集目标URL的证书信息
2. Prometheus 每5分钟抓取 Exporter 指标
3. Prometheus 评估告警规则
4. 触发告警 → Alertmanager
5. Alertmanager 发送通知到 钉钉/邮件/企业微信
6. Grafana 展示证书状态看板
```

---

## 一、SSL证书采集脚本

### 1.1 安装依赖

```bash
# 创建工作目录
mkdir -p /opt/ssl-monitor
cd /opt/ssl-monitor

# 安装Python依赖
pip3 install prometheus_client
```

### 1.2 完整采集脚本 ssl_cert_exporter.py

```python
#!/usr/bin/env python3
"""
SSL Certificate Exporter for Prometheus
======================================
支持公网域名、内网域名、内网IP的HTTPS证书监控
证书有效期低于30天自动告警

Author: SSL Monitor Team
Version: 1.0.0
"""

import json
import ssl
import socket
import time
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import argparse
import logging
import re

# ============================================
# 配置
# ============================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

CONFIG = {
    "targets": []
}

def load_config(config_file):
    """加载配置文件"""
    global CONFIG
    try:
        with open(config_file, 'r') as f:
            CONFIG = json.load(f)
        logger.info(f"✓ 成功加载配置文件: {config_file}")
    except Exception as e:
        logger.error(f"✗ 加载配置文件失败: {e}")
        raise

def get_cert_info(hostname, port=443, timeout=10):
    """
    获取SSL证书信息
    
    Args:
        hostname: 主机名或IP地址
        port: 端口号
        timeout: 超时时间（秒）
    
    Returns:
        dict: 证书详细信息
    """
    result = {
        'success': False,
        'error': None,
        'days_left': -1,
        'not_after': None,
        'not_before': None,
        'subject': {},
        'issuer': {},
        'serial': '',
        'version': '',
        'sans': []
    }
    
    try:
        # 创建SSL上下文
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        # 连接目标服务器
        logger.info(f"  连接 {hostname}:{port}...")
        with socket.create_connection((hostname, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                if not cert:
                    result['error'] = 'No certificate found'
                    return result
                
                result['success'] = True
                
                # =================
                # 解析时间信息
                # =================
                if 'notAfter' in cert:
                    not_after_str = cert['notAfter']
                    not_before_str = cert['notBefore']
                    
                    # 解析不同格式的日期
                    try:
                        not_after = parse_date(not_after_str)
                        not_before = parse_date(not_before_str)
                    except:
                        not_after = datetime.datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
                        not_before = datetime.datetime.strptime(not_before_str, '%b %d %H:%M:%S %Y %Z')
                    
                    now = datetime.datetime.now()
                    
                    result['not_after'] = int(not_after.timestamp())
                    result['not_before'] = int(not_before.timestamp())
                    result['days_left'] = (not_after - now).days
                    
                    logger.info(f"    证书有效期至: {not_after_str}, 剩余: {result['days_left']} 天")
                
                # =================
                # 解析主题信息 (Subject)
                # =================
                if 'subject' in cert:
                    for item in cert['subject']:
                        for key, value in item:
                            result['subject'][key] = value
                
                # =================
                # 解析发行机构 (Issuer)
                # =================
                if 'issuer' in cert:
                    for item in cert['issuer']:
                        for key, value in item:
                            result['issuer'][key] = value
                
                # =================
                # 序列号
                # =================
                if 'serialNumber' in cert:
                    result['serial'] = cert['serialNumber']
                
                # =================
                # 版本
                # =================
                if 'version' in cert:
                    result['version'] = str(cert['version'])
                
                # =================
                # SANs (Subject Alternative Names)
                # =================
                if 'subjectAltName' in cert:
                    result['sans'] = [name[1] for name in cert['subjectAltName']]
                
                # 记录发行机构信息
                issuer_org = result['issuer'].get('organizationName', 'Unknown')
                subject_cn = result['subject'].get('commonName', hostname)
                logger.info(f"    主题: {subject_cn}")
                logger.info(f"    发行机构: {issuer_org}")
        
    except socket.timeout:
        result['error'] = f'连接超时 {hostname}:{port}'
        logger.warning(f"  ✗ {result['error']}")
    except ConnectionRefusedError:
        result['error'] = f'连接被拒绝 {hostname}:{port}'
        logger.warning(f"  ✗ {result['error']}")
    except ssl.SSLError as e:
        result['error'] = f'SSL错误 {hostname}:{port}: {e}'
        logger.warning(f"  ✗ {result['error']}")
    except Exception as e:
        result['error'] = f'检查失败 {hostname}:{port}: {e}'
        logger.warning(f"  ✗ {result['error']}")
    
    return result

def parse_date(date_str):
    """解析证书日期，支持多种格式"""
    formats = [
        '%b %d %H:%M:%S %Y %Z',
        '%b %d %H:%M:%S %Y GMT',
        '%Y-%m-%d %H:%M:%S %Z',
        '%Y-%m-%dT%H:%M:%SZ',
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"无法解析日期: {date_str}")

def escape_label(value):
    """转义Prometheus标签值"""
    if value is None:
        return ''
    return str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')

def generate_prometheus_metrics():
    """生成Prometheus格式的metrics"""
    metrics_lines = []
    
    # 指标定义（HELP和TYPE）
    metrics_lines.extend([
        '# HELP ssl_cert_days_left SSL证书剩余有效天数',
        '# TYPE ssl_cert_days_left gauge',
        '# HELP ssl_cert_not_after_timestamp SSL证书过期时间戳（Unix）',
        '# TYPE ssl_cert_not_after_timestamp gauge',
        '# HELP ssl_cert_not_before_timestamp SSL证书生效时间戳（Unix）',
        '# TYPE ssl_cert_not_before_timestamp gauge',
        '# HELP ssl_cert_check_success SSL证书检查是否成功（1=成功，0=失败）',
        '# TYPE ssl_cert_check_success gauge',
        '# HELP ssl_cert_sans_count SSL证书SANs域名数量',
        '# TYPE ssl_cert_sans_count gauge',
    ])
    
    total_count = len(CONFIG.get('targets', []))
    success_count = 0
    warning_count = 0
    critical_count = 0
    
    logger.info(f"\n{'='*60}")
    logger.info(f"开始检查 {total_count} 个证书...")
    logger.info(f"{'='*60}")
    
    for target in CONFIG.get('targets', []):
        hostname = target.get('hostname')
        port = target.get('port', 443)
        owner = target.get('owner', '未知负责人')
        env = target.get('env', 'unknown')
        service_name = target.get('service_name', hostname)
        url = target.get('url', f'https://{hostname}:{port}')
        
        if not hostname:
            continue
        
        logger.info(f"\n▶ 检查: {hostname}:{port}")
        cert_info = get_cert_info(hostname, port)
        
        # 统计
        total_count += 1
        if cert_info['success']:
            success_count += 1
            if cert_info['days_left'] < 7:
                critical_count += 1
            elif cert_info['days_left'] < 30:
                warning_count += 1
        
        # =================
        # 生成指标
        # =================
        
        # 基础标签
        labels_base = (
            f'hostname="{escape_label(hostname)}",'
            f'port="{port}",'
            f'owner="{escape_label(owner)}",'
            f'env="{escape_label(env)}",'
            f'service_name="{escape_label(service_name)}"'
        )
        
        # 检查是否成功
        success_value = 1 if cert_info['success'] else 0
        metrics_lines.append(f'ssl_cert_check_success{{{labels_base}}} {success_value}')
        
        if not cert_info['success']:
            logger.warning(f"  ✗ 获取证书失败: {cert_info.get('error')}")
            # 即使失败也输出指标，便于监控
            metrics_lines.append(f'ssl_cert_days_left{{{labels_base}}} -1')
            continue
        
        # 证书剩余天数
        metrics_lines.append(f'ssl_cert_days_left{{{labels_base}}} {cert_info["days_left"]}')
        
        # 过期时间戳
        if cert_info['not_after']:
            metrics_lines.append(f'ssl_cert_not_after_timestamp{{{labels_base}}} {cert_info["not_after"]}')
        
        # 生效时间戳
        if cert_info['not_before']:
            metrics_lines.append(f'ssl_cert_not_before_timestamp{{{labels_base}}} {cert_info["not_before"]}')
        
        # =================
        # 带详细信息的标签（发行机构、主题等）
        # =================
        subject_cn = cert_info['subject'].get('commonName', '')
        issuer_cn = cert_info['issuer'].get('commonName', '')
        issuer_org = cert_info['issuer'].get('organizationName', issuer_cn)
        
        # JSON编码的主题和发行机构
        subject_json = json.dumps(cert_info['subject'], ensure_ascii=False).replace('"', '\\"')
        issuer_json = json.dumps(cert_info['issuer'], ensure_ascii=False).replace('"', '\\"')
        
        labels_detail = (
            f'{labels_base},'
            f'subject_cn="{escape_label(subject_cn)}",'
            f'issuer_cn="{escape_label(issuer_cn)}",'
            f'issuer_org="{escape_label(issuer_org)}"'
        )
        
        # SANs数量
        metrics_lines.append(f'ssl_cert_sans_count{{{labels_detail}}} {len(cert_info["sans"])}')
        
        # SANs列表（用分号分隔）
        if cert_info['sans']:
            sans_str = ';'.join(cert_info['sans'][:10])  # 最多10个
            metrics_lines.append(f'ssl_cert_sans{{{labels_detail}}} "{escape_label(sans_str)}"')
        
        # 警告日志
        if cert_info['days_left'] < 7:
            logger.warning(f"  ⚠️ 严重: 证书 {cert_info['days_left']} 天后过期!")
        elif cert_info['days_left'] < 30:
            logger.warning(f"  ⚡ 警告: 证书 {cert_info['days_left']} 天后过期")
    
    logger.info(f"\n{'='*60}")
    logger.info(f"检查完成: 成功 {success_count}, 警告 {warning_count}, 严重 {critical_count}")
    logger.info(f"{'='*60}\n")
    
    return '\n'.join(metrics_lines) + '\n'

class MetricsHandler(BaseHTTPRequestHandler):
    """HTTP请求处理器"""
    
    def do_GET(self):
        """处理GET请求"""
        if self.path == '/metrics':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            
            metrics_output = generate_prometheus_metrics()
            self.wfile.write(metrics_output.encode('utf-8'))
            
        elif self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'healthy',
                'timestamp': int(time.time())
            }).encode('utf-8'))
            
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html = """
            <!DOCTYPE html>
            <html>
            <head><title>SSL Certificate Exporter</title></head>
            <body>
            <h1>SSL Certificate Exporter</h1>
            <ul>
                <li><a href="/metrics">/metrics</a> - Prometheus指标</li>
                <li><a href="/health">/health</a> - 健康检查</li>
            </ul>
            </body>
            </html>
            """
            self.wfile.write(html.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """自定义日志"""
        pass  # 使用logging替代

def run_server(host, port, config_file):
    """运行Exporter服务器"""
    load_config(config_file)
    
    server = HTTPServer((host, port), MetricsHandler)
    logger.info(f"""
╔════════════════════════════════════════════════════════════╗
║           SSL Certificate Exporter 已启动                  ║
╠════════════════════════════════════════════════════════════╣
║  监听地址: http://{host}:{port}                           
║  指标端点: http://{host}:{port}/metrics                    
║  健康检查: http://{host}:{port}/health                     
║  配置文件: {config_file}                                  
╚════════════════════════════════════════════════════════════╝
    """)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("正在关闭 Exporter...")
        server.shutdown()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='SSL证书Exporter - Prometheus监控采集器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s -c config.json -p 9116
  %(prog)s --config /etc/ssl-monitor/config.json --port 9116
        """
    )
    parser.add_argument('-c', '--config', default='config.json',
                        help='配置文件路径 (默认: config.json)')
    parser.add_argument('-p', '--port', type=int, default=9116,
                        help='监听端口 (默认: 9116)')
    parser.add_argument('--host', default='0.0.0.0',
                        help='监听地址 (默认: 0.0.0.0)')
    
    args = parser.parse_args()
    run_server(args.host, args.port, args.config)
```

### 1.3 配置文件 config.json

```json
{
  "targets": [
    {
      "hostname": "www.google.com",
      "port": 443,
      "owner": "运维团队-张三",
      "env": "production",
      "service_name": "Google搜索",
      "url": "https://www.google.com"
    },
    {
      "hostname": "github.com",
      "port": 443,
      "owner": "开发团队-李四",
      "env": "production",
      "service_name": "GitHub代码托管",
      "url": "https://github.com"
    },
    {
      "hostname": "www.baidu.com",
      "port": 443,
      "owner": "运维团队-王五",
      "env": "production",
      "service_name": "百度搜索",
      "url": "https://www.baidu.com"
    },
    {
      "hostname": "internal.example.com",
      "port": 443,
      "owner": "基础架构团队-赵六",
      "env": "production",
      "service_name": "内部门户",
      "url": "https://internal.example.com"
    },
    {
      "hostname": "jenkins.internal.com",
      "port": 443,
      "owner": "DevOps团队-钱七",
      "env": "staging",
      "service_name": "Jenkins CI",
      "url": "https://jenkins.internal.com"
    },
    {
      "hostname": "192.168.1.100",
      "port": 8443,
      "owner": "测试团队-孙八",
      "env": "test",
      "service_name": "测试环境API",
      "url": "https://192.168.1.100:8443"
    },
    {
      "hostname": "10.0.0.50",
      "port": 443,
      "owner": "安全团队-周九",
      "env": "production",
      "service_name": "安全扫描服务",
      "url": "https://10.0.0.50"
    },
    {
      "hostname": "gitlab.internal.com",
      "port": 443,
      "owner": "开发团队-吴十",
      "env": "production",
      "service_name": "GitLab代码仓库",
      "url": "https://gitlab.internal.com"
    }
  ]
}
```

---

## 二、Prometheus配置

### 2.1 prometheus.yml 完整配置

```yaml
# prometheus.yml
global:
  scrape_interval: 5m      # 采集间隔5分钟
  evaluation_interval: 30s  # 告警规则评估间隔
  external_labels:
    cluster: 'ssl-monitor'
    env: 'production'

# Alertmanager配置
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - 'localhost:9093'

# 告警规则文件
rule_files:
  - 'rules/ssl_cert_alerts.yml'

scrape_configs:
  # ============================================
  # SSL证书Exporter采集任务
  # ============================================
  - job_name: 'ssl-cert-exporter'
    scrape_interval: 5m
    scrape_timeout: 30s
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'localhost:9116'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '(.+):\d+'
        replacement: '${1}'

  # ============================================
  # Blackbox Exporter (备用/补充)
  # ============================================
  - job_name: 'blackbox-ssl'
    metrics_path: /probe
    params:
      module: [http_ssl]
    scrape_interval: 1h
    static_configs:
      - targets:
        # 公网域名
        - https://www.google.com
        - https://github.com
        - https://www.baidu.com
        # 内网域名
        - https://internal.example.com
        - https://jenkins.internal.com
        # 内网IP
        - https://192.168.1.100:8443
        - https://10.0.0.50:443
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115

  # Prometheus自我监控
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### 2.2 SSL证书告警规则 rules/ssl_cert_alerts.yml

```yaml
# rules/ssl_cert_alerts.yml
groups:
  - name: ssl_certificate_alerts
    interval: 5m
    rules:
      # ========================================
      # 严重告警：证书7天内过期
      # ========================================
      - alert: SSLCertExpiryCritical
        expr: ssl_cert_days_left < 7 and ssl_cert_check_success == 1
        for: 5m
        labels:
          severity: critical
          team: ops
          component: ssl-cert
        annotations:
          summary: "🔴 SSL证书严重过期警告"
          description: |
            ⚠️ 证书即将过期，请立即处理！
            
            📌 目标: {{ $labels.hostname }}:{{ $labels.port }}
            🏢 负责人: {{ $labels.owner }}
            📊 环境: {{ $labels.env }}
            🏷️ 服务: {{ $labels.service_name }}
            
            ⏰ 剩余天数: {{ printf "%.0f" $value }} 天
            
            🔗 URL: https://{{ $labels.hostname }}:{{ $labels.port }}
            
            🚨 请立即更新SSL证书！
          runbook_url: "https://wiki.example.com/runbook/ssl-renewal"

      # ========================================
      # 警告告警：证书30天内过期
      # ========================================
      - alert: SSLCertExpiryWarning
        expr: ssl_cert_days_left >= 7 and ssl_cert_days_left < 30 and ssl_cert_check_success == 1
        for: 5m
        labels:
          severity: warning
          team: ops
          component: ssl-cert
        annotations:
          summary: "🟡 SSL证书即将过期"
          description: |
            ⚡ 证书即将过期，请及时处理！
            
            📌 目标: {{ $labels.hostname }}:{{ $labels.port }}
            🏢 负责人: {{ $labels.owner }}
            📊 环境: {{ $labels.env }}
            🏷️ 服务: {{ $labels.service_name }}
            🏛️ 发行机构: {{ $labels.issuer_org }}
            
            ⏰ 剩余天数: {{ printf "%.0f" $value }} 天
            
            🔗 URL: https://{{ $labels.hostname }}:{{ $labels.port }}
            
            💡 建议：请在一周内完成证书更新。

      # ========================================
      # 信息告警：证书即将超过90天
      # ========================================
      - alert: SSLCertExpiringSoonInfo
        expr: ssl_cert_days_left >= 30 and ssl_cert_days_left < 90 and ssl_cert_check_success == 1
        for: 0m
        labels:
          severity: info
          team: ops
          component: ssl-cert
        annotations:
          summary: "ℹ️ SSL证书60天后过期"
          description: |
            📅 证书将在 {{ printf "%.0f" $value }} 天后过期
            
            📌 目标: {{ $labels.hostname }}:{{ $labels.port }}
            🏢 负责人: {{ $labels.owner }}

      # ========================================
      # 证书检查失败
      # ========================================
      - alert: SSLCertCheckFailed
        expr: ssl_cert_check_success == 0
        for: 5m
        labels:
          severity: warning
          team: ops
          component: ssl-cert
        annotations:
          summary: "⚠️ SSL证书检查失败"
          description: |
            ❌ 无法获取SSL证书信息
            
            📌 目标: {{ $labels.hostname }}:{{ $labels.port }}
            🏢 负责人: {{ $labels.owner }}
            📊 环境: {{ $labels.env }}
            
            💡 可能原因：服务不可达、端口错误、证书配置问题

      # ========================================
      # 证书数量统计
      # ========================================
      - alert: SSLCertCriticalCount
        expr: count(ssl_cert_days_left < 7 and ssl_cert_check_success == 1) > 0
        for: 5m
        labels:
          severity: critical
          team: ops
          component: ssl-cert
        annotations:
          summary: "🚨 有 {{ $value }} 个SSL证书严重过期"
          description: |
            发现 {{ $value }} 个SSL证书在7天内过期，请立即处理！

      # ========================================
      # 证书即将过期总数
      # ========================================
      - alert: SSLCertWarningCount
        expr: count(ssl_cert_days_left < 30 and ssl_cert_days_left >= 7 and ssl_cert_check_success == 1) > 0
        for: 5m
        labels:
          severity: warning
          team: ops
          component: ssl-cert
        annotations:
          summary: "⚡ 有 {{ $value }} 个SSL证书即将过期"
          description: |
            发现 {{ $value }} 个SSL证书在30天内过期，请及时处理！
```

---

## 三、Alertmanager告警配置

### 3.1 alertmanager.yml 完整配置

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'ssl-alert@example.com'
  smtp_auth_username: 'ssl-alert'
  smtp_auth_password: 'your-password'
  
  # 钉钉配置
  dingtalk_configs:
    - api_url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
      secret: 'YOUR_SECRET'
      
  # 企业微信配置  
  wechat_configs:
    - api_url: 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'
      corp_id: 'wwxxxxx'
      to_user: '@all'
      agent_id: '1000001'
      api_secret: 'YOUR_SECRET'

# 路由配置
route:
  group_by: ['alertname', 'severity', 'owner']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'dingtalk-default'
  routes:
    # 严重告警 - 立即通知
    - match:
        severity: critical
      receiver: 'dingtalk-critical'
      group_wait: 10s
      repeat_interval: 1h
      continue: true
    
    # 警告告警 - 正常工作日通知
    - match:
        severity: warning
      receiver: 'dingtalk-warning'
      group_wait: 30s
      continue: true
    
    # 信息告警 - 合并通知
    - match:
        severity: info
      receiver: 'email-info'

# 接收者配置
receivers:
  # 默认钉钉接收者
  - name: 'dingtalk-default'
    dingtalk_configs:
      - api_url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
        secret: 'YOUR_SECRET'
        message:
          msgtype: markdown
          markdown:
            title: "【SSL证书告警】{{ .CommonLabels.alertname }}"
  
  # 严重告警 - 钉钉
  - name: 'dingtalk-critical'
    dingtalk_configs:
      - api_url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
        secret: 'YOUR_SECRET'
        message:
          msgtype: markdown
          markdown:
            title: "🚨【严重】SSL证书告警"
            content: |
              ## 🚨 SSL证书严重过期警告
              
              ### ⚠️ 证书即将过期！
              
              **目标**: {{ range .Alerts }}{{ .Labels.hostname }}:{{ .Labels.port }}{{ end }}
              **负责人**: {{ range .Alerts }}{{ .Labels.owner }}{{ end }}
              **环境**: {{ range .Alerts }}{{ .Labels.env }}{{ end }}
              **服务**: {{ range .Alerts }}{{ .Labels.service_name }}{{ end }}
              
              ### ⏰ 剩余天数: {{ range .Alerts }}{{ printf "%.0f" .Value }} 天{{ end }}
              
              ### 🔗 访问链接
              {{ range .Alerts }}[点击访问](https://{{ .Labels.hostname }}:{{ .Labels.port }}){{ end }}
              
              ---
              > 🚨 请立即处理此告警！
  
  # 警告告警 - 钉钉
  - name: 'dingtalk-warning'
    dingtalk_configs:
      - api_url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
        secret: 'YOUR_SECRET'
        message:
          msgtype: markdown
          markdown:
            title: "⚡【警告】SSL证书即将过期"
            content: |
              ## ⚡ SSL证书即将过期
              
              **目标**: {{ range .Alerts }}{{ .Labels.hostname }}:{{ .Labels.port }}{{ end }}
              **负责人**: {{ range .Alerts }}{{ .Labels.owner }}{{ end }}
              **环境**: {{ range .Alerts }}{{ .Labels.env }}{{ end }}
              **服务**: {{ range .Alerts }}{{ .Labels.service_name }}{{ end }}
              
              ### ⏰ 剩余天数: {{ range .Alerts }}{{ printf "%.0f" .Value }} 天{{ end }}
              
              ### 🔗 访问链接
              {{ range .Alerts }}[点击访问](https://{{ .Labels.hostname }}:{{ .Labels.port }}){{ end }}
              
              ---
              > 💡 请及时处理此告警！

  # 邮件接收
  - name: 'email-info'
    email_configs:
      - to: 'ops-team@example.com'
        headers:
          subject: '【SSL监控】{{ .GroupLabels.alertname }}'
        html: |
          <html>
          <body>
          <h2>SSL证书监控报告</h2>
          {{ range .Alerts }}
          <div style="margin: 10px; padding: 10px; border: 1px solid #ccc;">
            <p><strong>目标:</strong> {{ .Labels.hostname }}:{{ .Labels.port }}</p>
            <p><strong>负责人:</strong> {{ .Labels.owner }}</p>
            <p><strong>剩余天数:</strong> {{ printf "%.0f" .Value }} 天</p>
          </div>
          {{ end }}
          </body>
          </html>

# 抑制规则
inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match_re:
      severity: 'warning|info'
    equal: ['alertname', 'hostname']
```

---

## 四、Grafana监控面板

### 4.1 Dashboard JSON 配置 (grafana_ssl_dashboard.json)

```json
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "-- Grafana --",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "liveNow": false,
  "panels": [
    {
      "collapsed": false,
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 0 },
      "id": 100,
      "title": "📊 概览统计",
      "type": "row"
    },
    {
      "id": 1,
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 1 },
      "type": "stat",
      "title": "证书总数",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count(ssl_cert_check_success == 1)",
          "legendFormat": "总数",
          "refId": "A"
        }
      ],
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "blue", "value": null }
            ]
          },
          "unit": "none"
        }
      }
    },
    {
      "id": 2,
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 1 },
      "type": "stat",
      "title": "严重告警 (<7天)",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count(ssl_cert_days_left < 7 and ssl_cert_check_success == 1)",
          "legendFormat": "严重",
          "refId": "A"
        }
      ],
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 1 }
            ]
          },
          "unit": "none"
        }
      }
    },
    {
      "id": 3,
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 1 },
      "type": "stat",
      "title": "警告告警 (7-30天)",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count(ssl_cert_days_left >= 7 and ssl_cert_days_left < 30 and ssl_cert_check_success == 1)",
          "legendFormat": "警告",
          "refId": "A"
        }
      ],
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "orange", "value": 1 }
            ]
          },
          "unit": "none"
        }
      }
    },
    {
      "id": 4,
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 1 },
      "type": "stat",
      "title": "正常 (>30天)",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count(ssl_cert_days_left >= 30 and ssl_cert_check_success == 1)",
          "legendFormat": "正常",
          "refId": "A"
        }
      ],
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null }
            ]
          },
          "unit": "none"
        }
      }
    },
    {
      "collapsed": false,
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 5 },
      "id": 101,
      "title": "📋 证书详情",
      "type": "row"
    },
    {
      "id": 5,
      "gridPos": { "h": 10, "w": 24, "x": 0, "y": 6 },
      "type": "table",
      "title": "SSL证书详细信息",
      "description": "显示所有监控的SSL证书详细信息",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "ssl_cert_days_left",
          "format": "table",
          "instant": true,
          "refId": "A"
        }
      ],
      "transformations": [
        {
          "id": "organize",
          "options": {
            "excludeByName": {
              "Time": true,
              "__name__": true
            },
            "indexByName": {},
            "renameByName": {
              "Value": "剩余天数",
              "hostname": "主机名",
              "port": "端口",
              "owner": "负责人",
              "env": "环境",
              "service_name": "服务名称",
              "subject_cn": "证书主题",
              "issuer_cn": "发行机构CN",
              "issuer_org": "发行机构"
            }
          }
        }
      ],
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "red", "value": null },
              { "color": "orange", "value": 7 },
              { "color": "yellow", "value": 30 },
              { "color": "green", "value": 90 }
            ]
          }
        },
        "overrides": [
          {
            "matcher": { "id": "byName", "options": "剩余天数" },
            "properties": [
              { "id": "unit", "value": "d" },
              { "id": "decimals", "value": 0 }
            ]
          }
        ]
      },
      "options": {
        "showHeader": true,
        "sortBy": [
          { "desc": false, "displayName": "剩余天数" }
        ]
      }
    },
    {
      "collapsed": false,
      "gridPos": { "h": 1, "w": 24, "x": 0, "y": 16 },
      "id": 102,
      "title": "⚠️ 告警相关",
      "type": "row"
    },
    {
      "id": 6,
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 17 },
      "type": "bargauge",
      "title": "证书剩余有效期 (按目标)",
      "description": "各证书剩余有效天数排序",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "ssl_cert_days_left{ssl_cert_check_success=\"1\"}",
          "legendFormat": "{{hostname}}:{{port}}",
          "refId": "A"
        }
      ],
      "options": {
        "displayMode": "gradient",
        "minVizHeight": 10,
        "minVizWidth": 0,
        "orientation": "horizontal",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showUnfilled": true
      },
      "fieldConfig": {
        "defaults": {
          "min": 0,
          "max": 365,
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "darkred", "value": 0 },
              { "color": "red", "value": 7 },
              { "color": "orange", "value": 30 },
              { "color": "yellow", "value": 60 },
              { "color": "green", "value": 90 }
            ]
          },
          "unit": "d",
          "decimals": 0
        }
      }
    },
    {
      "id": 7,
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 17 },
      "type": "piechart",
      "title": "证书状态分布",
      "description": "按状态显示证书分布",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count by (status) (label_replace(ssl_cert_days_left{ssl_cert_check_success=\"1\"}, \"status\", \"严重(<7天)\", \"\", \"ssl_cert_days_left < 7\"))",
          "legendFormat": "{{status}}",
          "refId": "A"
        }
      ],
      "options": {
        "displayLabels": ["name", "percent"],
        "legend": {
          "displayMode": "table",
          "placement": "right",
          "showLegend": true,
          "values": ["value"]
        },
        "pieType": "donut",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        }
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          }
        }
      }
    },
    {
      "id": 8,
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 25 },
      "type": "bargauge",
      "title": "按负责人分布",
      "description": "各负责人管理的证书数量",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count by (owner) (ssl_cert_days_left)",
          "legendFormat": "{{owner}}",
          "refId": "A"
        }
      ],
      "options": {
        "displayMode": "gradient",
        "orientation": "horizontal",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showUnfilled": true
      }
    },
    {
      "id": 9,
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 25 },
      "type": "bargauge",
      "title": "按发行机构分布",
      "description": "各证书发行机构分布",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "count by (issuer_org) (ssl_cert_days_left{ssl_cert_check_success=\"1\"})",
          "legendFormat": "{{issuer_org}}",
          "refId": "A"
        }
      ],
      "options": {
        "displayMode": "gradient",
        "orientation": "horizontal",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showUnfilled": true
      }
    },
    {
      "id": 10,
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 33 },
      "type": "table",
      "title": "🔴 即将过期的证书 (<30天)",
      "description": "列出所有在30天内即将过期的SSL证书",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "expr": "ssl_cert_days_left < 30 and ssl_cert_check_success == 1",
          "format": "table",
          "instant": true,
          "refId": "A"
        }
      ],
      "transformations": [
        {
          "id": "organize",
          "options": {
            "excludeByName": {
              "Time": true,
              "__name__": true
            },
            "renameByName": {
              "Value": "剩余天数",
              "hostname": "主机名",
              "port": "端口",
              "owner": "负责人",
              "env": "环境",
              "service_name": "服务",
              "issuer_org": "发行机构"
            }
          }
        }
      ],
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "darkred", "value": 0 },
              { "color": "red", "value": 7 },
              { "color": "orange", "value": 30 }
            ]
          }
        }
      },
      "options": {
        "showHeader": true,
        "sortBy": [
          { "desc": false, "displayName": "剩余天数" }
        ]
      }
    }
  ],
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["ssl", "certificate", "monitoring"],
  "templating": {
    "list": [
      {
        "current": {},
        "name": "DS_PROMETHEUS",
        "type": "datasource",
        "query": { "queryType": "", "query": "prometheus" }
      },
      {
        "current": {},
        "includeAll": true,
        "multi": true,
        "name": "owner",
        "query": {
          "query": "label_values(ssl_cert_days_left, owner)",
          "refId": "StandardVariableQuery"
        },
        "type": "query"
      },
      {
        "current": {},
        "includeAll": true,
        "multi": true,
        "name": "env",
        "query": {
          "query": "label_values(ssl_cert_days_left, env)",
          "refId": "StandardVariableQuery"
        },
        "type": "query"
      },
      {
        "current": {},
        "includeAll": true,
        "multi": true,
        "name": "issuer_org",
        "query": {
          "query": "label_values(ssl_cert_days_left{ssl_cert_check_success=\"1\"}, issuer_org)",
          "refId": "StandardVariableQuery"
        },
        "type": "query"
      }
    ]
  },
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "timezone": "",
  "title": "SSL证书监控看板",
  "uid": "ssl-cert-monitoring",
  "version": 1,
  "refresh": "5m"
}
```

---

## 五、完整使用指南

### 5.1 一键部署脚本 deploy.sh

```bash
#!/bin/bash
#
# SSL证书监控系统 - 一键部署脚本
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   SSL证书监控系统 - 一键部署脚本       ${NC}"
echo -e "${GREEN}========================================${NC}"

# 创建目录
echo -e "\n${YELLOW}[1/6] 创建目录...${NC}"
mkdir -p /opt/ssl-monitor/{config,rules,logs}
cd /opt/ssl-monitor

# 安装Python依赖
echo -e "\n${YELLOW}[2/6] 安装Python依赖...${NC}"
pip3 install prometheus_client --quiet

# 复制配置文件
echo -e "\n${YELLOW}[3/6] 复制配置文件...${NC}"
cp config.json config/config.json
cp prometheus.yml config/prometheus.yml
cp alertmanager.yml config/alertmanager.yml
cp ssl_cert_alerts.yml config/rules/ssl_cert_alerts.yml

# 设置权限
echo -e "\n${YELLOW}[4/6] 设置权限...${NC}"
chmod +x ssl_cert_exporter.py

# 启动Exporter
echo -e "\n${YELLOW}[5/6] 启动SSL证书Exporter...${NC}"
nohup python3 ssl_cert_exporter.py -c config/config.json -p 9116 > logs/exporter.log 2>&1 &
echo $! > logs/exporter.pid
sleep 2

# 验证
echo -e "\n${YELLOW}[6/6] 验证部署...${NC}"
if curl -s http://localhost:9116/metrics | grep -q "ssl_cert_days_left"; then
    echo -e "${GREEN}✓ SSL证书Exporter启动成功!${NC}"
else
    echo -e "${RED}✗ SSL证书Exporter启动失败!${NC}"
    cat logs/exporter.log
    exit 1
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}   部署完成!                             ${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "
📌 访问地址:
   - Exporter:  http://localhost:9116/metrics
   - Prometheus: http://localhost:9090
   - Grafana:   http://localhost:3000
   
📝 配置文件:
   - /opt/ssl-monitor/config/config.json
   
📜 日志文件:
   - /opt/ssl-monitor/logs/exporter.log
"
```

### 5.2 使用步骤

#### 第一步：准备配置文件

编辑 `config.json`，添加你需要监控的证书：

```json
{
  "targets": [
    {
      "hostname": "www.yoursite.com",
      "port": 443,
      "owner": "张三",
      "env": "production",
      "service_name": "官网"
    }
  ]
}
```

#### 第二步：启动Exporter

```bash
# 直接运行
python3 ssl_cert_exporter.py -c config.json -p 9116

# 后台运行
nohup python3 ssl_cert_exporter.py -c config.json -p 9116 &
```

#### 第三步：验证Exporter

```bash
curl http://localhost:9116/metrics | head -50
```

#### 第四步：导入Prometheus配置

将 `prometheus.yml` 复制到Prometheus配置目录，并重启Prometheus。

#### 第五步：导入Grafana Dashboard

1. 登录Grafana
2. 点击 "+" → "Import"
3. 上传 `grafana_ssl_dashboard.json`

#### 第六步：配置Alertmanager

将 `alertmanager.yml` 复制到Alertmanager配置目录，配置你的钉钉/邮件参数后重启。

---

## 六、部署验证

### 6.1 验证Exporter

```bash
# 检查进程
ps aux | grep ssl_cert_exporter

# 检查端口
netstat -tlnp | grep 9116

# 查看指标
curl -s http://localhost:9116/metrics | grep ssl_cert
```

### 6.2 验证Prometheus

访问 Prometheus Web UI → Status → Targets，确认 `ssl-cert-exporter` 状态为 UP。

### 6.3 验证Grafana

1. 登录 Grafana
2. 进入 "SSL证书监控看板"
3. 确认能看到所有证书的详细信息

### 6.4 测试告警

```bash
# 手动触发告警测试
curl -X POST http://localhost:9093/api/v1/alerts \
  -H 'Content-Type: application/json' \
  -d '[{"labels":{"alertname":"TestAlert"}}]'
```

---

## 常见问题

### Q1: 内网IP无法访问？
检查防火墙规则，确保监控服务器可以访问内网IP的443端口。

### Q2: 自签名证书检查失败？
Exporter默认会检查证书，但会跳过证书链验证。如果需要忽略证书验证，可以修改脚本中的 `context.verify_mode = ssl.CERT_NONE`。

### Q3: 如何添加更多监控目标？
直接在 `config.json` 的 `targets` 数组中添加新的目标即可。

### Q4: 告警通知没有收到？
检查Alertmanager日志，确认Webhook配置正确。

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| 1.0.0 | 2026-05-01 | 初始版本，支持公网/内网域名和IP监控 |

---

*文档版本: 1.0.0*  
*更新时间: 2026-05-01*  
*作者: SSL Monitor Team*
