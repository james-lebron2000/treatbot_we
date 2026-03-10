#!/bin/bash

# Treatbot 完整环境安装脚本
# 支持 Ubuntu/Debian/CentOS

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用 sudo 运行此脚本"
    exit 1
fi

# 检测操作系统
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VERSION=$VERSION_ID
else
    log_error "无法检测操作系统"
    exit 1
fi

log_info "检测到操作系统: $OS $VERSION"

# 安装基础依赖
install_base() {
    log_info "安装基础依赖..."
    
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        apt-get update
        apt-get install -y \
            curl \
            wget \
            git \
            vim \
            htop \
            net-tools \
            unzip \
            build-essential
    elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
        yum update -y
        yum install -y \
            curl \
            wget \
            git \
            vim \
            htop \
            net-tools \
            unzip \
            gcc \
            gcc-c++ \
            make
    fi
    
    log_success "基础依赖安装完成"
}

# 安装 Node.js
install_nodejs() {
    log_info "安装 Node.js 18..."
    
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            apt-get install -y nodejs
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
            yum install -y nodejs
        fi
        
        log_success "Node.js 安装完成: $(node -v)"
    else
        log_warning "Node.js 已安装: $(node -v)"
    fi
    
    # 安装 PM2
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
        log_success "PM2 安装完成"
    fi
}

# 安装 Docker
install_docker() {
    log_info "安装 Docker..."
    
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
        
        # 添加当前用户到 docker 组
        usermod -aG docker ${SUDO_USER:-$USER}
        
        log_success "Docker 安装完成: $(docker -v)"
    else
        log_warning "Docker 已安装: $(docker -v)"
    fi
    
    # 安装 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
        curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        
        log_success "Docker Compose 安装完成: $(docker-compose -v)"
    fi
}

# 安装 MySQL Client
install_mysql_client() {
    log_info "安装 MySQL 客户端..."
    
    if ! command -v mysql &> /dev/null; then
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            apt-get install -y mysql-client
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
            yum install -y mysql
        fi
        
        log_success "MySQL 客户端安装完成"
    fi
}

# 安装 Redis Client
install_redis_client() {
    log_info "安装 Redis 客户端..."
    
    if ! command -v redis-cli &> /dev/null; then
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            apt-get install -y redis-tools
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
            yum install -y redis
        fi
        
        log_success "Redis 客户端安装完成"
    fi
}

# 安装 Nginx
install_nginx() {
    log_info "安装 Nginx..."
    
    if ! command -v nginx &> /dev/null; then
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            apt-get install -y nginx
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
            yum install -y epel-release
            yum install -y nginx
        fi
        
        systemctl enable nginx
        systemctl start nginx
        
        log_success "Nginx 安装完成"
    fi
}

# 安装 Certbot
install_certbot() {
    log_info "安装 Certbot..."
    
    if ! command -v certbot &> /dev/null; then
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            apt-get install -y certbot python3-certbot-nginx
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]]; then
            yum install -y certbot python3-certbot-nginx
        fi
        
        log_success "Certbot 安装完成"
    fi
}

# 配置防火墙
configure_firewall() {
    log_info "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow 22/tcp    # SSH
        ufw allow 80/tcp    # HTTP
        ufw allow 443/tcp   # HTTPS
        ufw allow 3000/tcp  # Application
        
        echo "y" | ufw enable || true
        
        log_success "UFW 防火墙配置完成"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-service=ssh
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --permanent --add-port=3000/tcp
        firewall-cmd --reload
        
        log_success "Firewalld 配置完成"
    fi
}

# 创建项目目录
setup_project() {
    log_info "设置项目目录..."
    
    PROJECT_DIR="/opt/treatbot"
    
    if [ ! -d "$PROJECT_DIR" ]; then
        mkdir -p $PROJECT_DIR
        chown ${SUDO_USER:-$USER}:${SUDO_USER:-$USER} $PROJECT_DIR
        log_success "项目目录创建: $PROJECT_DIR"
    fi
    
    # 创建日志目录
    mkdir -p /var/log/treatbot
    chown ${SUDO_USER:-$USER}:${SUDO_USER:-$USER} /var/log/treatbot
}

# 安装完成提示
print_completion() {
    echo ""
    echo "======================================"
    log_success "Treatbot 环境安装完成！"
    echo "======================================"
    echo ""
    echo "已安装组件:"
    echo "  - Node.js $(node -v 2>/dev/null || echo 'N/A')"
    echo "  - PM2 $(pm2 -v 2>/dev/null || echo 'N/A')"
    echo "  - Docker $(docker -v 2>/dev/null || echo 'N/A')"
    echo "  - Docker Compose $(docker-compose -v 2>/dev/null || echo 'N/A')"
    echo "  - Nginx $(nginx -v 2>&1 | head -1 || echo 'N/A')"
    echo ""
    echo "下一步:"
    echo "  1. 将项目代码复制到 /opt/treatbot"
    echo "  2. 运行: cd /opt/treatbot && make install"
    echo "  3. 运行: make deploy"
    echo ""
    echo "======================================"
}

# 主函数
main() {
    echo "======================================"
    echo "Treatbot 环境安装脚本"
    echo "======================================"
    echo ""
    
    install_base
    install_nodejs
    install_docker
    install_mysql_client
    install_redis_client
    install_nginx
    install_certbot
    configure_firewall
    setup_project
    
    print_completion
}

main
