#!/usr/bin/env python3
"""
SSL Certificate Exporter for Prometheus
自定义SSL证书Exporter，采集证书详细信息

Metric信息:
- ssl_cert_days_left: 证书剩余天数
- ssl_cert_not_after_timestamp: 证书过期时间戳
- ssl_cert_not_before_timestamp: 证书生效时间戳
- ssl_cert_subject: 证书主题 (标签)
- ssl_cert_issuer: 证书发行机构 (标签)
- ssl_cert_owner: 证书负责人 (标签，需在配置中指定)
- ssl_cert_serial: 证书序列号
- ssl_cert_version: 证书版本
- ssl_cert_sans: 证书SANs数量
- ssl_cert_check_success: 检查是否成功 (1=成功, 0=失败)
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

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 全局变量存储配置
CONFIG = {
    "targets": []
}

def load_config(config_file):
    """加载配置文件"""
    global CONFIG
    try:
        with open(config_file, 'r') as f:
            CONFIG = json.load(f)
        logger.info(f"Loaded config from {config_file}")
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        raise

def get_cert_info(hostname, port=443, timeout=10):
    """
    获取SSL证书信息
    
    Args:
        hostname: 主机名或IP地址
        port: 端口号
        timeout: 超时时间（秒）
    
    Returns:
        dict: 证书信息
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
        with socket.create_connection((hostname, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                if not cert:
                    result['error'] = 'No certificate found'
                    return result
                
                # 解析证书信息
                result['success'] = True
                
                # 时间信息
                if 'notAfter' in cert:
                    not_after = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    not_before = datetime.datetime.strptime(cert['notBefore'], '%b %d %H:%M:%S %Y %Z')
                    now = datetime.datetime.now()
                    
                    result['not_after'] = int(not_after.timestamp())
                    result['not_before'] = int(not_before.timestamp())
                    result['days_left'] = (not_after - now).days
                
                # 主题信息
                if 'subject' in cert:
                    for item in cert['subject']:
                        for key, value in item:
                            result['subject'][key] = value
                
                # 发行者信息
                if 'issuer' in cert:
                    for item in cert['issuer']:
                        for key, value in item:
                            result['issuer'][key] = value
                
                # 序列号
                if 'serialNumber' in cert:
                    result['serial'] = cert['serialNumber']
                
                # 版本
                if 'version' in cert:
                    result['version'] = str(cert['version'])
                
                # SANs (Subject Alternative Names)
                if 'subjectAltName' in cert:
                    result['sans'] = [name[1] for name in cert['subjectAltName']]
        
    except socket.timeout:
        result['error'] = f'Connection timeout to {hostname}:{port}'
        logger.warning(result['error'])
    except ssl.SSLError as e:
        result['error'] = f'SSL error for {hostname}:{port}: {e}'
        logger.warning(result['error'])
    except Exception as e:
        result['error'] = f'Error checking {hostname}:{port}: {e}'
        logger.warning(result['error'])
    
    return result

def generate_prometheus_metrics():
    """生成Prometheus格式的metrics"""
    metrics = []
    
    # 指标定义
    metrics.append('# HELP ssl_cert_days_left SSL certificate days left until expiry')
    metrics.append('# TYPE ssl_cert_days_left gauge')
    metrics.append('# HELP ssl_cert_not_after_timestamp SSL certificate notAfter timestamp')
    metrics.append('# TYPE ssl_cert_not_after_timestamp gauge')
    metrics.append('# HELP ssl_cert_not_before_timestamp SSL certificate notBefore timestamp')
    metrics.append('# TYPE ssl_cert_not_before_timestamp gauge')
    metrics.append('# HELP ssl_cert_check_success SSL certificate check success (1=success, 0=failure)')
    metrics.append('# TYPE ssl_cert_check_success gauge')
    metrics.append('# HELP ssl_cert_serial SSL certificate serial number (labels only)')
    metrics.append('# TYPE ssl_cert_serial gauge')
    metrics.append('# HELP ssl_cert_sans_count SSL certificate Subject Alternative Names count')
    metrics.append('# TYPE ssl_cert_sans_count gauge')
    
    for target in CONFIG.get('targets', []):
        hostname = target.get('hostname')
        port = target.get('port', 443)
        owner = target.get('owner', 'unknown')
        env = target.get('env', 'unknown')
        service_name = target.get('service_name', hostname)
        
        if not hostname:
            continue
        
        logger.info(f"Checking certificate for {hostname}:{port}")
        cert_info = get_cert_info(hostname, port)
        
        # 基础标签
        labels = (
            f'hostname="{hostname}",'
            f'port="{port}",'
            f'owner="{owner}",'
            f'env="{env}",'
            f'service_name="{service_name}"'
        )
        
        # SSL检查是否成功
        success_value = 1 if cert_info['success'] else 0
        metrics.append(f'ssl_cert_check_success{{{labels}}} {success_value}')
        
        if not cert_info['success']:
            logger.warning(f"Failed to get cert for {hostname}:{port}: {cert_info.get('error')}")
            continue
        
        # 证书剩余天数
        metrics.append(f'ssl_cert_days_left{{{labels}}} {cert_info["days_left"]}')
        
        # 证书过期时间
        if cert_info['not_after']:
            metrics.append(f'ssl_cert_not_after_timestamp{{{labels}}} {cert_info["not_after"]}')
        
        # 证书生效时间
        if cert_info['not_before']:
            metrics.append(f'ssl_cert_not_before_timestamp{{{labels}}} {cert_info["not_before"]}')
        
        # 添加带证书详细信息的标签
        subject_str = cert_info['subject'].get('commonName', '')
        issuer_str = cert_info['issuer'].get('commonName', cert_info['issuer'].get('organizationName', ''))
        
        detail_labels = (
            f'{labels},'
            f'subject_cn="{subject_str}",'
            f'issuer_cn="{issuer_str}",'
            f'subject="{json.dumps(cert_info["subject"]).replace(chr(34), chr(92)+chr(34))}",'
            f'issuer="{json.dumps(cert_info["issuer"]).replace(chr(34), chr(92)+chr(34))}"'
        )
        
        # SANs数量
        metrics.append(f'ssl_cert_sans_count{{{detail_labels}}} {len(cert_info["sans"])}')
        
        # 序列号（作为标签，值为1）
        serial = cert_info.get('serial', 'unknown')
        serial_labels = f'{detail_labels},serial="{serial}"'
        metrics.append(f'ssl_cert_serial{{{serial_labels}}} 1')
        
        logger.info(f"Certificate for {hostname}:{port} - Days left: {cert_info['days_left']}, Issuer: {issuer_str}")
    
    return '\n'.join(metrics) + '\n'

class MetricsHandler(BaseHTTPRequestHandler):
    """HTTP请求处理器，用于Prometheus scraping"""
    
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
            self.wfile.write(json.dumps({'status': 'healthy'}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """自定义日志输出"""
        logger.info(f"{self.address_string()} - {format % args}")

def run_server(host, port, config_file):
    """运行Exporter HTTP服务器"""
    load_config(config_file)
    
    server = HTTPServer((host, port), MetricsHandler)
    logger.info(f"SSL Certificate Exporter started on {host}:{port}")
    logger.info(f"Metrics available at http://{host}:{port}/metrics")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down exporter...")
        server.shutdown()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SSL Certificate Exporter for Prometheus')
    parser.add_argument('-c', '--config', default='config.json', help='Configuration file path')
    parser.add_argument('-p', '--port', type=int, default=9116, help='Exporter listen port')
    parser.add_argument('--host', default='0.0.0.0', help='Exporter listen host')
    
    args = parser.parse_args()
    
    run_server(args.host, args.port, args.config)
