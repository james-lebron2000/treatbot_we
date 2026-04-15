#!/bin/bash
#
# SSL 证书 DNS-01 自动续期脚本
# 适用场景：80 端口被拦截（如腾讯云未备案），无法使用 HTTP-01 验证
#
# 方案 A：使用 certbot + DNS TXT 记录（半自动，需手动添加 DNS 记录）
# 方案 B：使用 certbot + DNSPod API 插件（全自动，推荐）
#
# 当前证书位置：/etc/caddy/ssl/
# 当前证书到期：2026-06-07（预留 30 天续期窗口）
#
# 使用方法：
#   方案 A（手动 DNS）：sudo bash renew-cert-dns.sh manual
#   方案 B（自动 DNS）：sudo bash renew-cert-dns.sh auto
#

set -euo pipefail

DOMAIN="inseq.top"
CERT_DIR="/etc/caddy/ssl"
EMAIL="${CERT_EMAIL:-admin@inseq.top}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# ============================================================
# 方案 A：手动 DNS 验证（certbot manual）
# ============================================================
manual_dns_renew() {
  log "=== 手动 DNS-01 验证模式 ==="
  log "将引导您在 DNSPod 控制台添加 TXT 记录"
  log ""

  # 安装 certbot（如未安装）
  if ! command -v certbot &>/dev/null; then
    log "安装 certbot..."
    apt-get update -qq && apt-get install -y -qq certbot
  fi

  # 使用 manual 模式申请/续期证书
  certbot certonly \
    --manual \
    --preferred-challenges dns \
    -d "${DOMAIN}" \
    -d "*.${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --manual-public-ip-logging-ok

  # certbot 会提示：
  # 1. 请在 DNS 中添加 _acme-challenge.inseq.top TXT 记录
  # 2. 等待 DNS 生效后按 Enter 继续
  # 3. 可能需要添加两条 TXT 记录（一条用于主域名，一条用于通配符）

  log "证书申请完成"
  copy_certs_to_caddy
}

# ============================================================
# 方案 B：使用 certbot-dns-dnspod 自动续期
# ============================================================
auto_dns_renew() {
  log "=== 自动 DNS-01 验证模式（DNSPod API）==="

  DNSPOD_CREDENTIALS="/etc/letsencrypt/dnspod.ini"

  # 安装 certbot + DNSPod 插件
  if ! command -v certbot &>/dev/null; then
    log "安装 certbot..."
    apt-get update -qq && apt-get install -y -qq certbot python3-pip
  fi

  # 检查 DNSPod 插件
  if ! pip3 show certbot-dns-dnspod &>/dev/null 2>&1; then
    log "安装 certbot-dns-dnspod 插件..."
    pip3 install certbot-dns-dnspod
  fi

  # 检查凭据文件
  if [ ! -f "$DNSPOD_CREDENTIALS" ]; then
    log "错误: 缺少 DNSPod API 凭据文件 ${DNSPOD_CREDENTIALS}"
    log ""
    log "请创建凭据文件："
    log "  sudo mkdir -p /etc/letsencrypt"
    log "  sudo cat > ${DNSPOD_CREDENTIALS} << 'EOF'"
    log "  dns_dnspod_api_id = <你的 DNSPod API ID>"
    log "  dns_dnspod_api_token = <你的 DNSPod API Token>"
    log "  EOF"
    log "  sudo chmod 600 ${DNSPOD_CREDENTIALS}"
    log ""
    log "获取 API Key：https://console.dnspod.cn/account/token/apikey"
    exit 1
  fi

  certbot certonly \
    --authenticator dns-dnspod \
    --dns-dnspod-credentials "${DNSPOD_CREDENTIALS}" \
    --dns-dnspod-propagation-seconds 60 \
    -d "${DOMAIN}" \
    -d "*.${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --keep-until-expiring \
    --non-interactive

  log "证书申请/续期完成"
  copy_certs_to_caddy
}

# ============================================================
# 方案 C：使用 acme.sh + DNSPod（更轻量的替代方案）
# ============================================================
acme_dns_renew() {
  log "=== acme.sh + DNSPod API 自动续期模式 ==="

  # 安装 acme.sh（如未安装）
  if [ ! -f "$HOME/.acme.sh/acme.sh" ]; then
    log "安装 acme.sh..."
    curl https://get.acme.sh | sh -s email="${EMAIL}"
  fi

  # 检查 DNSPod 环境变量
  if [ -z "${DP_Id:-}" ] || [ -z "${DP_Key:-}" ]; then
    log "错误: 缺少 DNSPod API 环境变量"
    log ""
    log "请设置："
    log "  export DP_Id='你的 DNSPod API ID'"
    log "  export DP_Key='你的 DNSPod API Token'"
    log ""
    log "获取 API Key：https://console.dnspod.cn/account/token/apikey"
    log ""
    log "建议写入 /root/.bashrc 或 /etc/environment 以持久化"
    exit 1
  fi

  "$HOME/.acme.sh/acme.sh" --issue \
    --dns dns_dp \
    -d "${DOMAIN}" \
    -d "*.${DOMAIN}" \
    --force

  log "证书申请完成"

  # 安装证书到 Caddy 目录
  "$HOME/.acme.sh/acme.sh" --install-cert \
    -d "${DOMAIN}" \
    --cert-file "${CERT_DIR}/cert.pem" \
    --key-file "${CERT_DIR}/key.pem" \
    --fullchain-file "${CERT_DIR}/fullchain.pem" \
    --reloadcmd "systemctl reload caddy || true"

  log "证书已安装到 ${CERT_DIR}，Caddy 已重载"
}

# ============================================================
# 将 certbot 生成的证书拷贝到 Caddy 目录
# ============================================================
copy_certs_to_caddy() {
  local LE_DIR="/etc/letsencrypt/live/${DOMAIN}"

  if [ ! -d "$LE_DIR" ]; then
    log "警告: Let's Encrypt 证书目录不存在: ${LE_DIR}"
    return 1
  fi

  mkdir -p "${CERT_DIR}"

  cp "${LE_DIR}/fullchain.pem" "${CERT_DIR}/fullchain.pem"
  cp "${LE_DIR}/privkey.pem" "${CERT_DIR}/key.pem"
  chmod 644 "${CERT_DIR}/fullchain.pem" "${CERT_DIR}/key.pem"

  log "证书已拷贝到 ${CERT_DIR}"

  # 重载 Caddy
  if command -v caddy &>/dev/null; then
    caddy reload --config /etc/caddy/Caddyfile 2>/dev/null && log "Caddy 已重载" || log "Caddy 重载失败，请手动执行: caddy reload"
  elif systemctl is-active caddy &>/dev/null; then
    systemctl reload caddy && log "Caddy 已重载" || log "Caddy 重载失败"
  fi
}

# ============================================================
# 设置 crontab 自动续期（配合方案 B 使用）
# ============================================================
setup_cron() {
  local CRON_LINE="0 3 1 */2 * /bin/bash $(readlink -f "$0") auto >> /var/log/cert-renew.log 2>&1"

  if crontab -l 2>/dev/null | grep -qF "renew-cert-dns"; then
    log "crontab 已存在续期任务，跳过"
  else
    (crontab -l 2>/dev/null; echo "${CRON_LINE}") | crontab -
    log "已添加 crontab：每 2 个月 1 日凌晨 3 点自动续期"
  fi
}

# ============================================================
# Main
# ============================================================
main() {
  local mode="${1:-help}"

  case "$mode" in
    manual)
      manual_dns_renew
      ;;
    auto)
      auto_dns_renew
      ;;
    acme)
      acme_dns_renew
      ;;
    cron)
      setup_cron
      ;;
    *)
      echo "SSL 证书 DNS-01 续期工具"
      echo ""
      echo "用法: sudo bash $0 <命令>"
      echo ""
      echo "命令："
      echo "  manual  — 手动 DNS 验证（需在 DNSPod 添加 TXT 记录）"
      echo "  auto    — 自动 DNS 验证（需配置 DNSPod API，推荐）"
      echo "  acme    — 使用 acme.sh + DNSPod API（轻量替代方案）"
      echo "  cron    — 设置 crontab 自动续期（配合 auto/acme 使用）"
      echo ""
      echo "推荐步骤（全自动）："
      echo "  1. 获取 DNSPod API Key: https://console.dnspod.cn/account/token/apikey"
      echo "  2. 运行: sudo bash $0 acme"
      echo "  3. 运行: sudo bash $0 cron"
      echo ""
      echo "快速步骤（半自动）："
      echo "  1. 运行: sudo bash $0 manual"
      echo "  2. 根据提示在 DNSPod 控制台添加 TXT 记录"
      echo "  3. 证书到期前再次运行"
      ;;
  esac
}

main "$@"
