#!/bin/bash
# Treatbot 云服务器部署状态检查脚本
# 用法: ssh ubuntu@49.235.162.129 'bash -s' < scripts/check-deploy.sh

set -e

echo "========================================="
echo "  Treatbot 部署状态检查"
echo "  服务器: $(hostname) / $(curl -s ifconfig.me 2>/dev/null || echo 'N/A')"
echo "  时间: $(date)"
echo "========================================="
echo

# 1. 系统信息
echo "--- [1/8] 系统信息 ---"
echo "OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "Kernel: $(uname -r)"
echo "Memory: $(free -h | awk '/Mem:/{print $2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $4 " free / " $2 " total"}')"
echo

# 2. Docker
echo "--- [2/8] Docker ---"
if command -v docker &>/dev/null; then
    echo "Docker version: $(docker --version)"
    echo "Docker Compose: $(docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo 'not installed')"
    echo
    echo "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (permission denied, try with sudo)"
    echo
    echo "All containers:"
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null || echo "  (permission denied)"
else
    echo "Docker: NOT INSTALLED"
fi
echo

# 3. Nginx
echo "--- [3/8] Nginx ---"
if command -v nginx &>/dev/null; then
    echo "Nginx version: $(nginx -v 2>&1)"
    echo "Nginx status: $(systemctl is-active nginx 2>/dev/null || echo 'unknown')"
    echo "Nginx config test: $(sudo nginx -t 2>&1)"
elif docker ps 2>/dev/null | grep -q nginx; then
    echo "Nginx running in Docker"
    docker ps --filter "name=nginx" --format "{{.Names}}: {{.Status}} ({{.Ports}})"
else
    echo "Nginx: NOT FOUND"
fi
echo

# 4. SSL 证书
echo "--- [4/8] SSL 证书 ---"
CERT_PATHS=(
    "/etc/nginx/ssl/fullchain.pem"
    "/etc/letsencrypt/live/inseq.top/fullchain.pem"
    "/root/ssl/fullchain.pem"
    "/home/ubuntu/ssl/fullchain.pem"
)
FOUND_CERT=0
for cert_path in "${CERT_PATHS[@]}"; do
    if [ -f "$cert_path" ]; then
        echo "Found certificate: $cert_path"
        openssl x509 -in "$cert_path" -noout -subject -issuer -dates 2>/dev/null || echo "  (cannot parse)"
        FOUND_CERT=1
        break
    fi
done
# Check Docker volumes too
if [ $FOUND_CERT -eq 0 ]; then
    for d in /opt/treatbot/nginx/ssl /srv/treatbot/nginx/ssl ./nginx/ssl; do
        if [ -f "$d/fullchain.pem" ]; then
            echo "Found certificate: $d/fullchain.pem"
            openssl x509 -in "$d/fullchain.pem" -noout -subject -issuer -dates 2>/dev/null
            FOUND_CERT=1
            break
        fi
    done
fi
if [ $FOUND_CERT -eq 0 ]; then
    echo "SSL certificate: NOT FOUND in common paths"
fi
echo

# 5. 端口监听
echo "--- [5/8] 端口监听 ---"
sudo ss -tlnp 2>/dev/null | grep -E ':80|:443|:3000|:3306|:6379' || \
sudo netstat -tlnp 2>/dev/null | grep -E ':80|:443|:3000|:3306|:6379' || \
echo "  (cannot check ports)"
echo

# 6. Node.js / PM2
echo "--- [6/8] Node.js 应用 ---"
if command -v node &>/dev/null; then
    echo "Node.js: $(node -v)"
fi
if command -v pm2 &>/dev/null; then
    echo "PM2 processes:"
    pm2 list 2>/dev/null || echo "  (no PM2 processes)"
fi
echo

# 7. 域名解析验证
echo "--- [7/8] 域名解析 ---"
RESOLVED_IP=$(dig +short inseq.top 2>/dev/null | head -1 || nslookup inseq.top 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')
echo "inseq.top -> ${RESOLVED_IP:-unknown}"
LOCAL_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo "Server IP -> ${LOCAL_IP:-unknown}"
if [ -n "$RESOLVED_IP" ] && [ -n "$LOCAL_IP" ] && [ "$RESOLVED_IP" = "$LOCAL_IP" ]; then
    echo "DNS: OK (domain points to this server)"
else
    echo "DNS: WARNING (domain may not point to this server)"
fi
echo

# 8. 健康检查
echo "--- [8/8] 应用健康检查 ---"
HEALTH=$(curl -s --connect-timeout 3 http://127.0.0.1:3000/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo "Backend (port 3000): RUNNING"
    echo "Response: $HEALTH"
else
    echo "Backend (port 3000): NOT RESPONDING"
fi

NGINX_HEALTH=$(curl -s --connect-timeout 3 -H "Host: inseq.top" http://127.0.0.1/health 2>/dev/null)
if [ -n "$NGINX_HEALTH" ]; then
    echo "Nginx proxy: RUNNING"
    echo "Response: $NGINX_HEALTH"
else
    echo "Nginx proxy: NOT RESPONDING or not configured"
fi
echo

echo "========================================="
echo "  检查完成"
echo "========================================="
