#!/usr/bin/env python3
"""
SSL Certificate Exporter for Prometheus
支持两种监控目标格式：
1. 域名格式: www.example.com:443
2. IP格式: 192.168.1.100:8443

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
import re
import ssl
import socket
import time
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import argparse
import logging
from urllib.parse import urlparse

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 全局变量存储配置
CONFIG = {
    "targets": []
}

# 需要跳过证书验证的域名/IP模式
SKIP_VERIFY_PATTERNS = [
    'ssl-test.local',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
]


def load_config(config_file):
    """加载配置文件"""
    global CONFIG
    try:
        with open(config_file, 'r') as f:
            CONFIG = json.load(f)
        logger.info(f"Loaded config from {config_file}, found {len(CONFIG.get('targets', []))} targets")
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        raise


def should_skip_verify(hostname):
    """判断是否需要跳过证书验证"""
    if hostname in SKIP_VERIFY_PATTERNS:
        return True
    if hostname.endswith('.local'):
        return True
    # 检查是否是私有IP范围
    try:
        parts = hostname.split('.')
        if len(parts) == 4:
            first = int(parts[0])
            # 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            if first == 10:
                return True
            if first == 172 and 16 <= int(parts[1]) <= 31:
                return True
            if first == 192 and parts[1] == '168':
                return True
    except:
        pass
    return False


def parse_target_url(url):
    """
    解析目标URL，支持以下格式：
    - www.example.com:443 (域名:端口)
    - 192.168.1.100:8443 (IP:端口)
    - https://www.example.com (带协议前缀)
    - https://192.168.1.100:8443/path (带协议和路径)
    
    Returns:
        dict: {host, port, path, is_ip}
    """
    result = {
        'host': None,
        'port': 443,
        'path': '',
        'is_ip': False
    }
    
    # 移除协议前缀
    parsed = urlparse(url if '://' in url else f'//{url}')
    host_port = parsed.netloc or parsed.path
    result['path'] = parsed.path
    
    # 分离主机和端口
    if ':' in host_port:
        host, port_str = host_port.rsplit(':', 1)
        result['host'] = host
        result['port'] = int(port_str)
    else:
        result['host'] = host_port
        result['port'] = 443 if parsed.scheme == 'https' else 80
    
    # 判断是否为IP
    result['is_ip'] = _is_ip_address(result['host'])
    
    return result


def _is_ip_address(host):
    """判断是否为IP地址"""
    try:
        socket.inet_aton(host)
        return True
    except socket.error:
        return False
    except Exception:
        return False


def get_cert_info(hostname, port=443, skip_verify=False, timeout=30):
    """
    获取SSL证书信息
    
    Args:
        hostname: 主机名或IP地址
        port: 端口号
        skip_verify: 是否跳过证书验证
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
    
    # 如果没有明确指定skip_verify，根据hostname判断
    if not skip_verify:
        skip_verify = should_skip_verify(hostname)
    
    try:
        # 创建SSL上下文
        context = ssl.create_default_context()
        
        if skip_verify:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        
        # 连接目标服务器
        connect_host = hostname
        # 对于IP直连，使用IP地址作为server_hostname
        server_hostname = hostname if not skip_verify else None
        
        logger.info(f"Connecting to {connect_host}:{port} (skip_verify={skip_verify})")
        
        with socket.create_connection((connect_host, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=server_hostname) as ssock:
                cert_der = ssock.getpeercert(binary_form=True)
                
                if not cert_der:
                    result['error'] = 'No certificate found'
                    return result
                
                result['success'] = True
                
                # 使用 cryptography 库解析 DER 格式证书
                try:
                    from cryptography import x509
                    from cryptography.hazmat.backends import default_backend
                    
                    cert_obj = x509.load_der_x509_certificate(cert_der, default_backend())
                    
                    # 时间信息
                    not_after = cert_obj.not_valid_after_utc
                    not_before = cert_obj.not_valid_before_utc
                    now = datetime.datetime.now(datetime.timezone.utc)
                    
                    result['not_after'] = int(not_after.timestamp())
                    result['not_before'] = int(not_before.timestamp())
                    result['days_left'] = (not_after.replace(tzinfo=None) - now.replace(tzinfo=None)).days
                    
                    # 主题信息
                    for attr in cert_obj.subject:
                        result['subject'][attr.oid._name] = attr.value
                    
                    # 发行者信息
                    for attr in cert_obj.issuer:
                        result['issuer'][attr.oid._name] = attr.value
                    
                    # 序列号
                    result['serial'] = format(cert_obj.serial_number, 'X')
                    
                    # 版本
                    result['version'] = str(cert_obj.version.value)
                    
                    # SANs
                    try:
                        san_ext = cert_obj.extensions.get_extension_for_oid(x509.oid.ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
                        result['sans'] = [name.value for name in san_ext.value]
                    except:
                        pass
                        
                except ImportError:
                    cert = ssock.getpeercert()
                    if cert:
                        if 'notAfter' in cert:
                            not_after = datetime.datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                            not_before = datetime.datetime.strptime(cert['notBefore'], '%b %d %H:%M:%S %Y %Z')
                            now = datetime.datetime.now()
                            
                            result['not_after'] = int(not_after.timestamp())
                            result['not_before'] = int(not_before.timestamp())
                            result['days_left'] = (not_after - now).days
                        
                        if 'subject' in cert:
                            for item in cert['subject']:
                                for key, value in item:
                                    result['subject'][key] = value
                        
                        if 'issuer' in cert:
                            for item in cert['issuer']:
                                for key, value in item:
                                    result['issuer'][key] = value
                        
                        if 'serialNumber' in cert:
                            result['serial'] = cert['serialNumber']
                        
                        if 'version' in cert:
                            result['version'] = str(cert['version'])
                        
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


def generate_blackbox_targets():
    """生成blackbox探针目标列表"""
    targets = []
    for target in CONFIG.get('targets', []):
        url = target.get('url')
        service_name = target.get('service_name', url)
        
        # 根据URL格式确定探针协议
        parsed = parse_target_url(url)
        if parsed['port'] == 443 or url.startswith('https://'):
            probe_url = f"https://{parsed['host']}:{parsed['port']}{parsed['path']}"
        else:
            probe_url = f"http://{parsed['host']}:{parsed['port']}{parsed['path']}"
        
        targets.append({
            'targets': [probe_url],
            'labels': {
                'job': 'ssl-cert-exporter',
                'service_name': service_name,
                'owner': target.get('owner', 'unknown'),
                'env': target.get('env', 'unknown')
            }
        })
    return targets


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
        url = target.get('url')
        owner = target.get('owner', 'unknown')
        env = target.get('env', 'unknown')
        service_name = target.get('service_name', url)
        skip_verify = target.get('skip_verify', False)
        
        if not url:
            continue
        
        # 解析URL
        parsed = parse_target_url(url)
        hostname = parsed['host']
        port = parsed['port']
        
        if not hostname:
            continue
        
        logger.info(f"Checking certificate for {hostname}:{port}")
        cert_info = get_cert_info(hostname, port, skip_verify=skip_verify)
        
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
        elif self.path == '/targets':
            # 返回blackbox探针目标（用于动态配置）
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            targets = generate_blackbox_targets()
            self.wfile.write(json.dumps(targets, ensure_ascii=False).encode('utf-8'))
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
    logger.info(f"Blackbox targets available at http://{host}:{port}/targets")
    
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
