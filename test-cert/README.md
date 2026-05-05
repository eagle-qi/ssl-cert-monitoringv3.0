# SSL证书告警测试页面

此目录包含用于测试SSL证书即将过期告警功能的自签证书和测试服务器。

## 文件说明
- `cert.pem`: 自签SSL证书（有效期6天）
- `key.pem`: 证书私钥
- `test_server.py`: Python HTTPS测试服务器

## 使用方法

### 1. 添加hosts条目（需要sudo权限）
```bash
echo "127.0.0.1 ssl-test.local" | sudo tee -a /etc/hosts
```

### 2. 启动测试服务器
```bash
python3 test_server.py
```

### 3. 测试证书状态
验证证书信息：
```bash
echo | openssl s_client -connect localhost:8443 -servername ssl-test.local 2>/dev/null | openssl x509 -noout -dates -subject -issuer
```

### 4. 检查证书有效期
```bash
openssl x509 -in cert.pem -noout -dates
```

## 预期结果
- 证书状态：即将过期（剩余6天）
- 告警触发：应触发"即将过期"告警（<30天阈值）

## 验证监控数据
服务器启动后，可以从Prometheus查询：
```bash
curl "http://localhost:9090/api/v1/query?query=ssl_cert_days_left{service_name='证书告警测试'}"
```
