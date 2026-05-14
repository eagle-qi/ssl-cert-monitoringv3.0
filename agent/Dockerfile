FROM python:3.11-slim

LABEL maintainer="SSL Cert Monitoring"
LABEL description="SSL Certificate Agent for internal network monitoring"

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用文件
COPY ssl_cert_agent.py .

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 8091

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8091/health || exit 1

# 启动命令
CMD ["python", "ssl_cert_agent.py"]
