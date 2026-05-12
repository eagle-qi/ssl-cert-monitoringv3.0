# 飞书告警配置快速指南

## 当前状态

✅ **已完成配置修改**，飞书 Webhook 转换服务已创建完成。

## 快速部署（选择一种方式）

### 方式1：Docker Compose（推荐用于生产环境）

```bash
# 进入项目目录
cd /Users/monkey/ssl-cert-monitoring

# 重新构建并启动所有服务
docker-compose down
docker-compose build
docker-compose up -d

# 查看飞书webhook服务状态
docker-compose logs -f feishu-webhook

# 测试飞书连接（应该在飞书群里收到测试消息）
curl http://localhost:18080/test
```

### 方式2：本地运行（用于开发测试）

```bash
# 进入项目目录
cd /Users/monkey/ssl-cert-monitoring

# 安装依赖
pip install flask requests

# 启动服务
./feishu/start_feishu_webhook.sh

# 或手动启动
python3 feishu/webhook_feishu.py
```

## 配置检查清单

### 1. ✅ AlertManager 配置已修改

文件：`alertmanager/alertmanager.yml`

```yaml
receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:8080/webhook'  # 或 Docker 环境用 http://feishu-webhook:8080/webhook
        send_resolved: true
```

### 2. ✅ 飞书 Webhook 服务已创建

- 主服务文件：`feishu/webhook_feishu.py`
- Docker 配置：`feishu/Dockerfile.feishu-webhook`
- 启动脚本：`feishu/start_feishu_webhook.sh`
- 详细文档：`feishu/FEISHU_WEBHOOK_README.md`

### 3. ⏳ 等待您操作

**请确认飞书 Webhook URL 是否正确：**

当前配置中使用的 Webhook URL：
```
https://open.feishu.cn/open-apis/bot/v2/hook/REDACTED_WEBHOOK_ID
```

**如果需要更换 Webhook URL：**

1. 修改 `docker-compose.yml` 中的环境变量：
```yaml
environment:
  - FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_NEW_WEBHOOK_URL
```

2. 或者设置环境变量：
```bash
export FEISHU_WEBHOOK_URL='https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_NEW_WEBHOOK_URL'
```

## 测试流程

### 1. 测试飞书连接

```bash
curl http://localhost:18080/test
```

应该收到类似的消息：
```
🧪 **SSL 证书监控系统测试消息**

这是一条来自 AlertManager-Feishu 转换服务的测试消息。

如果收到此消息，说明配置正确！

⏰ 测试时间: 2024-01-01 10:00:00
```

### 2. 测试告警接收

手动发送测试告警：

```bash
curl -X POST http://localhost:18080/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "firing",
    "alerts": [
      {
        "status": "firing",
        "labels": {
          "alertname": "TestAlert",
          "severity": "critical",
          "instance": "test.example.com:443"
        },
        "annotations": {
          "summary": "测试告警",
          "description": "这是一条测试告警消息"
        },
        "startsAt": "2024-01-01T10:00:00Z"
      }
    ]
  }'
```

### 3. 重启 AlertManager

配置修改后需要重启 AlertManager：

```bash
# Docker 环境
docker-compose restart alertmanager

# 本地环境
# 找到并重启 AlertManager 进程
```

## 故障排查

### 问题1：服务启动失败

**检查端口占用：**
```bash
lsof -i :8080
lsof -i :18080
```

**检查 Python 依赖：**
```bash
pip list | grep -E "flask|requests"
```

### 问题2：收不到飞书消息

**检查顺序：**

1. 确认飞书 Webhook URL 有效
   ```bash
   # 直接测试飞书 Webhook
   curl -X POST 'https://open.feishu.cn/open-apis/bot/v2/hook/REDACTED_WEBHOOK_ID' \
     -H 'Content-Type: application/json' \
     -d '{"msg_type":"text","content":{"text":"测试"}}'
   ```

2. 确认转换服务运行正常
   ```bash
   curl http://localhost:18080/health
   ```

3. 检查 AlertManager 日志
   ```bash
   docker-compose logs alertmanager
   ```

### 问题3：AlertManager 无法连接转换服务

**Docker 环境**需要使用容器网络名：

修改 `alertmanager.yml`：
```yaml
webhook_configs:
  - url: 'http://feishu-webhook:8080/webhook'  # 使用 Docker 服务名
```

然后重启：
```bash
docker-compose restart alertmanager feishu-webhook
```

## 监控和维护

### 查看服务日志

```bash
# Docker 环境
docker-compose logs -f feishu-webhook

# 本地运行
# 查看终端输出
```

### 健康检查

```bash
# 服务健康状态
curl http://localhost:18080/health

# AlertManager 状态
curl http://localhost:9093/-/healthy
```

### 更新配置

1. 修改 `webhook_feishu.py` 中的逻辑
2. 重新构建 Docker 镜像
3. 重启服务

## 性能优化

### 并发处理

当前配置支持基本的告警处理。如需高并发场景：

1. 使用 gunicorn 或 uwsgi
2. 增加工作进程数
3. 使用消息队列异步处理

### 日志管理

建议配置日志轮转，避免日志文件过大：

```yaml
# docker-compose.yml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 安全建议

1. **Webhook URL 安全**：不要在公开仓库中暴露真实的 Webhook URL
2. **网络隔离**：生产环境使用内网或 VPN
3. **HTTPS**：确认飞书 Webhook 使用 HTTPS
4. **访问控制**：限制 `/test` 和 `/health` 接口的访问

## 获取帮助

- 详细文档：`feishu/FEISHU_WEBHOOK_README.md`
- 飞书官方文档：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/bot-v3/bot-overview
- AlertManager文档：https://prometheus.io/docs/alerting/latest/alertmanager/
