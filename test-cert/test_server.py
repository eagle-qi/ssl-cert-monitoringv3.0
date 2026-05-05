#!/usr/bin/env python3
"""
测试用HTTPS服务器 - 使用6天有效期的自签证书
用于测试SSL证书即将过期告警功能
"""
import http.server
import ssl
import os
from datetime import datetime

PORT = 8443

class TestHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html; charset=utf-8')
        self.end_headers()
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SSL测试页面</title></head>
<body>
<h1>SSL证书监控测试页面</h1>
<p>此页面使用自签证书，有效期为6天，用于测试告警功能</p>
<p>创建时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
<p>访问地址: https://localhost:{PORT}</p>
</body>
</html>"""
        self.wfile.write(html.encode())
    
    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {args[0]}")

if __name__ == '__main__':
    cert_file = os.path.join(os.path.dirname(__file__), 'cert.pem')
    key_file = os.path.join(os.path.dirname(__file__), 'key.pem')
    
    server = http.server.HTTPServer(('0.0.0.0', PORT), TestHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_file, key_file)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    
    print(f"SSL测试服务器启动在 https://0.0.0.0:{PORT}")
    print(f"证书文件: {cert_file}")
    server.serve_forever()
