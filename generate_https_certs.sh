#!/bin/bash
# HTTPS 证书生成脚本
# 用于为 Server 和 Agent 生成自签名 SSL 证书

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_CERTS_DIR="${SCRIPT_DIR}/server/certs"
AGENT_CERTS_DIR="${SCRIPT_DIR}/agent/certs"

echo "=========================================="
echo "SSL 证书生成脚本"
echo "=========================================="

# 创建证书目录
mkdir -p "${SERVER_CERTS_DIR}"
mkdir -p "${AGENT_CERTS_DIR}"

# 生成 Server 证书
echo ""
echo "生成 Server 证书..."
echo "----------------------------------------"

# 生成 CA 私钥
openssl genrsa -out "${SERVER_CERTS_DIR}/ca.key" 2048 2>/dev/null

# 生成 CA 证书（自签名）
openssl req -x509 -new -nodes -key "${SERVER_CERTS_DIR}/ca.key" \
    -sha256 -days 3650 \
    -out "${SERVER_CERTS_DIR}/ca.crt" \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=SSL Monitor/OU=CA/CN=SSL Monitor CA" 2>/dev/null

# 生成 Server 私钥
openssl genrsa -out "${SERVER_CERTS_DIR}/server.key" 2048 2>/dev/null

# 生成 Server CSR
openssl req -new -key "${SERVER_CERTS_DIR}/server.key" \
    -out "${SERVER_CERTS_DIR}/server.csr" \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=SSL Monitor/OU=Server/CN=localhost" 2>/dev/null

# 生成 Server 证书（使用 CA 签名）
openssl x509 -req -in "${SERVER_CERTS_DIR}/server.csr" \
    -CA "${SERVER_CERTS_DIR}/ca.crt" \
    -CAkey "${SERVER_CERTS_DIR}/ca.key" \
    -CAcreateserial \
    -out "${SERVER_CERTS_DIR}/server.crt" \
    -days 365 \
    -sha256 \
    -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:ssl-agent-server") 2>/dev/null

# 清理 CSR
rm -f "${SERVER_CERTS_DIR}/server.csr"

echo "Server 证书已生成:"
echo "  - CA 证书: ${SERVER_CERTS_DIR}/ca.crt"
echo "  - Server 证书: ${SERVER_CERTS_DIR}/server.crt"
echo "  - Server 私钥: ${SERVER_CERTS_DIR}/server.key"

# 生成 Agent 证书
echo ""
echo "生成 Agent 证书..."
echo "----------------------------------------"

# 复用 Server 的 CA（实际生产环境应使用统一的 CA）
openssl genrsa -out "${AGENT_CERTS_DIR}/agent.key" 2048 2>/dev/null

# 生成 Agent CSR
openssl req -new -key "${AGENT_CERTS_DIR}/agent.key" \
    -out "${AGENT_CERTS_DIR}/agent.csr" \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=SSL Monitor/OU=Agent/CN=ssl-cert-agent" 2>/dev/null

# 生成 Agent 证书（使用同一 CA 签名）
openssl x509 -req -in "${AGENT_CERTS_DIR}/agent.csr" \
    -CA "${SERVER_CERTS_DIR}/ca.crt" \
    -CAkey "${SERVER_CERTS_DIR}/ca.key" \
    -CAcreateserial \
    -out "${AGENT_CERTS_DIR}/agent.crt" \
    -days 365 \
    -sha256 \
    -extfile <(printf "subjectAltName=DNS:ssl-cert-agent,IP:127.0.0.1") 2>/dev/null

# 清理 CSR
rm -f "${AGENT_CERTS_DIR}/agent.csr"

echo "Agent 证书已生成:"
echo "  - Agent 证书: ${AGENT_CERTS_DIR}/agent.crt"
echo "  - Agent 私钥: ${AGENT_CERTS_DIR}/agent.key"

# 设置权限
chmod 600 "${SERVER_CERTS_DIR}"/*.key
chmod 600 "${AGENT_CERTS_DIR}"/*.key

echo ""
echo "=========================================="
echo "证书生成完成！"
echo "=========================================="
echo ""
echo "使用说明:"
echo ""
echo "1. Server HTTPS 配置:"
echo "   在 .env 文件中设置:"
echo "   ENABLE_HTTPS=true"
echo "   SSL_CERT_FILE=/app/certs/server.crt"
echo "   SSL_KEY_FILE=/app/certs/server.key"
echo ""
echo "2. Agent HTTPS 配置:"
echo "   在 Agent 机器的 .env 文件中设置:"
echo "   AGENT_ENABLE_HTTPS=true"
echo "   AGENT_VERIFY_SSL=true"
echo ""
echo "3. 将 CA 证书部署到 Agent 机器:"
echo "   路径: ${SERVER_CERTS_DIR}/ca.crt"
echo "   用于 Agent 验证 Server 证书"
echo ""
echo "4. 如果使用自签名证书且不需要验证:"
echo "   AGENT_VERIFY_SSL=false"
echo ""
