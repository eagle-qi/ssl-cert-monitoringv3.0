#!/bin/bash
# AlertManager 配置生成脚本
# 从模板生成 alertmanager.yml，替换环境变量

CONFIG_FILE="/etc/alertmanager/alertmanager.yml"

# 替换模板中的环境变量
sed -e "s|\${ALERT_SMTP_SMARTHOST}|${ALERT_SMTP_SMARTHOST:-smtp.example.com:587}|g" \
    -e "s|\${ALERT_SMTP_FROM}|${ALERT_SMTP_FROM:-noreply@example.com}|g" \
    -e "s|\${ALERT_SMTP_AUTH_USERNAME}|${ALERT_SMTP_AUTH_USERNAME:-}|g" \
    -e "s|\${ALERT_SMTP_AUTH_PASSWORD}|${ALERT_SMTP_AUTH_PASSWORD:-}|g" \
    -e "s|\${ALERT_EMAIL_TO}|${ALERT_EMAIL_TO:-}|g" \
    /etc/alertmanager/alertmanager.yml.template > ${CONFIG_FILE}

echo "AlertManager 配置已生成"
# 注意：不打印配置内容，避免敏感信息泄露到日志

exec /bin/alertmanager "$@"
