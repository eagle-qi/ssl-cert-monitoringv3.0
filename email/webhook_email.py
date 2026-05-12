#!/usr/bin/env python3
"""
AlertManager Email Alert Service
接收 AlertManager 告警，根据目标的 owner_email 发送邮件通知
"""

from flask import Flask, request, jsonify
import smtplib
import os
import json
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

app = Flask(__name__)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# SMTP 配置（从环境变量获取）
SMTP_HOST = os.getenv('SMTP_HOST', '')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USER = os.getenv('SMTP_USER', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
SMTP_FROM = os.getenv('SMTP_FROM', SMTP_USER)
SMTP_USE_TLS = os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'

# 配置文件路径
CONFIG_PATH = os.getenv('TARGETS_CONFIG_PATH', '/app/data/ssl_targets.json')


def load_targets_config():
    """加载目标配置"""
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"加载配置文件失败: {e}")
        return {}


def build_targets_map(config):
    """构建 URL -> 目标信息 的映射"""
    targets_map = {}
    targets = config.get('targets', [])
    for target in targets:
        url = target.get('url', '')
        targets_map[url] = target
    return targets_map


def get_owner_email(instance):
    """从实例 URL 获取负责人邮箱"""
    # 去掉端口号
    base_url = instance.split(':')[0] if instance else ''
    
    config = load_targets_config()
    targets_map = build_targets_map(config)
    
    # 精确匹配
    if instance in targets_map:
        email = targets_map[instance].get('owner_email', '')
        if email:
            return email
    
    # URL 前缀匹配
    for url, target in targets_map.items():
        if base_url.startswith(url.split(':')[0]) or url.startswith(base_url):
            email = target.get('owner_email', '')
            if email:
                return email
    
    return None


def send_email(to_email, subject, html_body):
    """发送邮件"""
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        logger.error("SMTP 配置不完整")
        return False, "SMTP 配置不完整"
    
    if not to_email:
        return False, "收件人邮箱为空"
    
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = SMTP_FROM
        msg['To'] = to_email
        
        # 添加 HTML 内容
        html_part = MIMEText(html_body, 'html', 'utf-8')
        msg.attach(html_part)
        
        # 发送邮件
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())
        
        logger.info(f"邮件发送成功: {to_email}")
        return True, "邮件发送成功"
    
    except smtplib.SMTPAuthenticationError:
        return False, "SMTP 认证失败，请检查用户名和密码"
    except smtplib.SMTPException as e:
        logger.error(f"SMTP 错误: {e}")
        return False, f"SMTP 错误: {str(e)}"
    except Exception as e:
        logger.error(f"发送邮件失败: {e}")
        return False, f"发送邮件失败: {str(e)}"


def build_email_content(alerts, status='firing'):
    """构建邮件内容"""
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    alert_rows = ""
    for alert in alerts:
        labels = alert.get('labels', {})
        annotations = alert.get('annotations', {})
        
        alertname = labels.get('alertname', '未知告警')
        severity = labels.get('severity', 'warning')
        instance = labels.get('instance', 'N/A')
        service_name = labels.get('service_name', labels.get('job', 'N/A'))
        description = annotations.get('description', annotations.get('summary', '无'))
        starts_at = alert.get('startsAt', '')
        
        # 格式化时间
        try:
            starts_dt = datetime.strptime(starts_at.replace('Z', '+0000'), '%Y-%m-%dT%H:%M:%S+0000')
            starts_at = starts_dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            pass
        
        severity_color = '#dc2626' if severity == 'critical' else '#f59e0b'
        status_text = '🔴 告警中' if status == 'firing' else '✅ 已恢复'
        
        alert_rows += f"""
        <tr>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">{alertname}</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">
                <span style="color: {severity_color}; font-weight: bold;">{severity.upper()}</span>
            </td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">{status_text}</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">{service_name}</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">{instance}</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">{starts_at}</td>
        </tr>
        """
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 800px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }}
            .info {{ margin-bottom: 20px; }}
            table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 8px; }}
            th {{ background: #f3f4f6; padding: 12px; text-align: left; border: 1px solid #e5e7eb; }}
            .footer {{ margin-top: 20px; text-align: center; color: #6b7280; font-size: 12px; }}
            .critical {{ background: #fef2f2; }}
            .warning {{ background: #fffbeb; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔔 SSL 证书告警通知</h1>
            </div>
            <div class="content">
                <div class="info">
                    <p><strong>通知时间:</strong> {now}</p>
                    <p><strong>告警数量:</strong> {len(alerts)} 条</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>告警名称</th>
                            <th>严重程度</th>
                            <th>状态</th>
                            <th>服务</th>
                            <th>实例</th>
                            <th>触发时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alert_rows}
                    </tbody>
                </table>
                
                <h3 style="margin-top: 20px;">告警详情</h3>
                <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
    """
    
    for alert in alerts:
        labels = alert.get('labels', {})
        annotations = alert.get('annotations', {})
        description = annotations.get('description', annotations.get('summary', '无'))
        instance = labels.get('instance', 'N/A')
        
        html += f"""
                    <p><strong>{instance}</strong></p>
                    <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; margin-bottom: 15px;">{description}</p>
        """
    
    html += f"""
                </div>
            </div>
            <div class="footer">
                <p>由 SSL Certificate Monitoring System 自动发送</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html


def group_alerts_by_email(alerts):
    """按负责人邮箱分组告警"""
    groups = {}
    
    for alert in alerts:
        labels = alert.get('labels', {})
        instance = labels.get('instance', '')
        
        email = get_owner_email(instance)
        if not email:
            # 使用默认邮箱或跳过
            email = 'default'
        
        if email not in groups:
            groups[email] = []
        groups[email].append(alert)
    
    return groups


@app.route('/webhook', methods=['POST'])
def receive_alertmanager_webhook():
    """
    接收 AlertManager 的 Webhook 请求
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'No data received'
            }), 400
        
        alerts = data.get('alerts', [])
        
        if not alerts:
            return jsonify({
                'status': 'success',
                'message': 'No alerts in payload'
            })
        
        # 按邮箱分组
        email_groups = group_alerts_by_email(alerts)
        
        results = []
        for email, email_alerts in email_groups.items():
            status = 'firing'
            if email_alerts and email_alerts[0].get('status') == 'resolved':
                status = 'resolved'
            
            subject = f"🔔 SSL证书告警 - {len(email_alerts)}条" if status == 'firing' else f"✅ SSL证书告警恢复 - {len(email_alerts)}条"
            html_body = build_email_content(email_alerts, status)
            
            if email == 'default':
                # 没有配置邮箱的告警，记录日志
                logger.warning(f"告警无对应负责人邮箱: {[a.get('labels', {}).get('instance') for a in email_alerts]}")
                results.append({
                    'email': email,
                    'status': 'skipped',
                    'message': '无负责人邮箱配置'
                })
            else:
                success, msg = send_email(email, subject, html_body)
                results.append({
                    'email': email,
                    'status': 'success' if success else 'error',
                    'message': msg
                })
        
        # 返回结果
        success_count = len([r for r in results if r['status'] == 'success'])
        return jsonify({
            'status': 'success',
            'message': f'处理完成，成功发送 {success_count}/{len(results)} 封邮件',
            'results': results
        })
    
    except Exception as e:
        logger.error(f"处理告警失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f'处理告警失败: {str(e)}'
        }), 500


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'service': 'email-alert-service',
        'smtp_configured': bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
    })


@app.route('/test', methods=['GET', 'POST'])
def test_email():
    """测试邮件发送"""
    test_email_addr = request.args.get('to') or os.getenv('TEST_EMAIL', '')
    
    if not test_email_addr:
        return jsonify({
            'status': 'error',
            'message': '请提供测试邮箱地址 ?to=email@example.com'
        }), 400
    
    subject = "🔔 SSL证书监控系统 - 测试邮件"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body>
        <h2>这是一封测试邮件</h2>
        <p>如果您收到此邮件，说明 SSL 证书监控系统的邮件告警功能配置正确！</p>
        <p>发送时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </body>
    </html>
    """
    
    success, msg = send_email(test_email_addr, subject, html_body)
    
    return jsonify({
        'status': 'success' if success else 'error',
        'message': msg,
        'to': test_email_addr
    })


if __name__ == '__main__':
    print("=" * 60)
    print("AlertManager Email Alert Service")
    print("=" * 60)
    print(f"SMTP Host: {SMTP_HOST or '未配置'}")
    print(f"SMTP Port: {SMTP_PORT}")
    print(f"SMTP User: {SMTP_USER or '未配置'}")
    print(f"SMTP From: {SMTP_FROM}")
    print(f"Config Path: {CONFIG_PATH}")
    print("=" * 60)
    print("端点:")
    print("  - POST /webhook   - 接收 AlertManager 告警")
    print("  - GET  /health   - 健康检查")
    print("  - GET  /test     - 测试邮件发送")
    print("=" * 60)
    
    # 检查 SMTP 配置
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        print("⚠️ 警告: SMTP 配置不完整，请在环境变量中设置 SMTP_HOST, SMTP_USER, SMTP_PASSWORD")
    
    app.run(
        host='0.0.0.0',
        port=8080,
        debug=os.getenv('DEBUG', 'false').lower() == 'true'
    )
