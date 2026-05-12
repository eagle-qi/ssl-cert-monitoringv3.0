FROM python:3.11-slim

WORKDIR /app

# 安装依赖
RUN pip install --no-cache-dir flask gunicorn

# 复制应用
COPY webhook_email.py /app/

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

# 启动命令
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "120", "webhook_email:app"]
