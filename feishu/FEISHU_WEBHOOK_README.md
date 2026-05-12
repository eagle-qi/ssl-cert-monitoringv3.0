# 飞书 Webhook 转换服务

## 概述

这个服务用于将 AlertManager 的告警格式转换为飞书（Feishu/Lark）机器人支持的消息格式，实现告警通知。

## 功能特点

- ✅ 将 AlertManager JSON 格式转换为飞书文本消息
- ✅ 支持告警触发和恢复通知
- ✅ 美化的消息格式，包含告警详情
- ✅ 支持环境变量配置
- ✅ 提供健康检查和测试接口

## 快速开始

### 方式1：Docker Compose（推荐）

```bash
# 构建并启动服务
docker-compose build feishu-webhook
docker-compose up -d feishu-webhook

# 查看日志
docker-compose logs -f feishu-webhook

# 测试服务
curl http://localhost:18080/test
```

### 方式2：直接运行 Python

```bash
# 安装依赖
pip install flask requests

# 设置飞书 Webhook URL（可选，使用默认配置）
export FEISHU_WEBHOOK_URL='https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_URL'

# 启动服务
python3 webhook_feishu.py
```

## API 接口

### POST /webhook
接收 AlertManager 的 Webhook 请求

```bash
# 测试接口
curl -X POST http://localhost:18080/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "alerts": [
      {
        "status": "firing",
        "labels": {
          "alertname": "SSLCertExpiringCritical",
          "severity": "critical",
          "instance": "example.com:443"
        },
        "annotations": {
          "summary": "SSL证书即将过期",
          "description": "证书将在 5 天后过期"
        },
        "startsAt": "2024-01-01T00:00:00Z"
      }
    ]
  }'
```

### GET /health
健康检查接口

```bash
curl http://localhost:18080/health
```

### GET /test
测试飞书连接，发送测试消息到飞书

```bash
curl http://localhost:18080/test
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook URL | `https://open.feishu.cn/open-apis/bot/v2/hook/REDACTED_WEBHOOK_ID` |
| `SEND_RESOLVED` | 是否发送恢复通知 | `true` |
| `DEBUG` | 调试模式 | `false` |

## 飞书消息格式示例

转换后的飞书消息格式：

```
🔴 **告警触发** 🚨
━━━━━━━━━━━━━━━━━━━━
**告警名称**: SSL证书严重警告 - example.com
**严重程度**: CRITICAL
**触发时间**: 2024-01-01 10:30:00
**实例**: example.com:443
**监控任务**: ssl_cert_monitor
━━━━━━━━━━━━━━━━━━━━
**告警内容**:
example.com (HTTPS服务) 证书将在 5 天后过期! 请立即处理! 负责人: ops-team
━━━━━━━━━━━━━━━━━━━━
_< 这是一条由 SSL 证书监控系统自动发送的告警 >_
```

## AlertManager 配置

修改 `alertmanager/alertmanager.yml`：

```yaml
receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:8080/webhook'  # 指向转换服务
        send_resolved: true

  - name: 'feishu-critical'
    webhook_configs:
      - url: 'http://localhost:8080/webhook'
        send_resolved: true
```

如果是 Docker 环境，使用容器名：

```yaml
receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://feishu-webhook:8080/webhook'
        send_resolved: true
```

## 故障排除

### 1. 收不到告警

1. 检查 AlertManager 是否正确配置了 webhook
2. 测试 `/test` 接口确认飞书连接
3. 查看服务日志 `docker-compose logs feishu-webhook`

### 2. 服务启动失败

```bash
# 检查端口占用
lsof -i :8080

# 检查依赖
pip list | grep -E "flask|requests"
```

### 3. 飞书消息发送失败

1. 确认 Webhook URL 正确
2. 检查飞书机器人是否被禁用
3. 测试 Webhook URL 是否可用

## 部署架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Prometheus  │────▶│ AlertManager │────▶│ feishu-webhook │
└─────────────┘     └──────────────┘     │   (转换服务)  │
                                         └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  飞书机器人  │
                                         └─────────────┘
```

## License

MIT License
