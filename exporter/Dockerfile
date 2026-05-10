FROM python:3.11-slim

WORKDIR /app

# 使用阿里云pip镜像
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip config set global.trusted-host mirrors.aliyun.com

# 预装 cryptography（使用预编译wheel避免编译）
RUN pip install --no-cache-dir cryptography

# Copy requirements and install other Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ssl_cert_exporter.py .

# Expose metrics port
EXPOSE 9116

# Run the exporter
CMD ["python", "ssl_cert_exporter.py"]
