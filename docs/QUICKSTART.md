# Treatbot 快速开始指南

## 🎯 目标：30 分钟内部署上线！

---

## 前置要求

- [ ] 一台云服务器（推荐 4C8G）
- [ ] 一个已备案的域名
- [ ] 微信小程序 AppID
- [ ] 腾讯云账号（或阿里云）

---

## 第 1 步：购买云服务（10 分钟）

### 快速购买清单

| 服务 | 推荐配置 | 预估费用 |
|------|----------|----------|
| 云服务器 CVM | 4C8G × 2 台 | ¥1,600/月 |
| 云数据库 MySQL | 2C4G | ¥800/月 |
| 云数据库 Redis | 1GB | ¥250/月 |
| 对象存储 COS | 按量计费 | ¥100/月 |
| 文字识别 OCR | 1万次包 | ¥800/月 |

**快速购买链接**:
- [云服务器](https://buy.cloud.tencent.com/cvm) - 选择标准型 SA2, 4核8G
- [云数据库 MySQL](https://buy.cloud.tencent.com/cdb) - 选择基础版, 2核4G
- [云数据库 Redis](https://buy.cloud.tencent.com/redis) - 标准版, 1GB
- [对象存储 COS](https://console.cloud.tencent.com/cos/bucket) - 创建私有存储桶
- [文字识别 OCR](https://console.cloud.tencent.com/ocr/overview) - 开通通用印刷体识别

---

## 第 2 步：服务器初始化（5 分钟）

连接服务器并安装 Docker:

```bash
# SSH 连接服务器
ssh ubuntu@your-server-ip

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安装 Node.js 和 PM2
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 克隆项目
git clone https://github.com/your-repo/treatbot.git
cd treatbot/server
```

---

## 第 3 步：配置环境变量（5 分钟）

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件
nano .env
```

填写以下关键配置：

```env
# 基础配置
NODE_ENV=production
PORT=3000

# 数据库（从腾讯云控制台获取）
DB_HOST=your-mysql-host.mysql.tencentcdb.com
DB_PORT=3306
DB_USER=treatbot
DB_PASSWORD=your-password
DB_NAME=treatbot

# Redis（从腾讯云控制台获取）
REDIS_HOST=your-redis-host.redis.tencentcdb.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# JWT（生成随机密钥）
JWT_SECRET=your-random-secret-key-here

# 微信小程序（从微信公众平台获取）
WEAPP_APPID=wx1234567890abcdef
WEAPP_SECRET=your-weapp-secret

# 腾讯云 COS（从腾讯云控制台获取）
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_BUCKET=treatbot-files
COS_REGION=ap-shanghai

# 腾讯云 OCR（从腾讯云控制台获取）
OCR_SECRET_ID=your-secret-id
OCR_SECRET_KEY=your-secret-key
```

---

## 第 4 步：一键部署（5 分钟）

```bash
# 环境检查
./check-env.sh

# 启动服务（Docker 方式）
docker-compose up -d

# 或 PM2 方式
./start.sh production
```

---

## 第 5 步：配置 Nginx 和 HTTPS（5 分钟）

### 安装 Nginx
```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 申请 SSL 证书
```bash
sudo certbot --nginx -d api.treatbot.example.com
```

### 配置 Nginx
```bash
sudo nano /etc/nginx/sites-available/treatbot
```

添加配置：
```nginx
server {
    listen 80;
    server_name api.treatbot.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.treatbot.example.com;

    ssl_certificate /etc/letsencrypt/live/api.treatbot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.treatbot.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/treatbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 第 6 步：微信小程序配置（5 分钟）

### 1. 登录微信公众平台
https://mp.weixin.qq.com

### 2. 配置服务器域名
进入：开发 → 开发设置 → 服务器域名

添加以下域名：
```
request合法域名: https://api.treatbot.example.com
uploadFile合法域名: https://treatbot-files.cos.ap-shanghai.myqcloud.com
downloadFile合法域名: https://treatbot-files.cos.ap-shanghai.myqcloud.com
```

### 3. 修改小程序代码
编辑 `utils/api.js`，更新 base URL：
```javascript
const config = {
  development: {
    baseUrl: 'https://api.treatbot.example.com'
  },
  production: {
    baseUrl: 'https://api.treatbot.example.com'
  }
};
```

### 4. 上传代码
使用微信开发者工具上传代码并提交审核。

---

## 验证部署

### 1. 检查服务状态
```bash
# Docker 方式
docker-compose ps

# PM2 方式
pm2 list
```

### 2. 测试 API
```bash
# 健康检查
curl https://api.treatbot.example.com/health

# 预期输出
{"status":"ok","timestamp":"2026-02-25T...","version":"1.0.0"}
```

### 3. 测试微信登录
```bash
curl -X POST https://api.treatbot.example.com/api/auth/weapp-login \
  -H "Content-Type: application/json" \
  -d '{"code":"test-code"}'
```

---

## 监控和维护

### 查看日志
```bash
# Docker 方式
docker-compose logs -f api

# PM2 方式
pm2 logs treatbot-api
```

### 重启服务
```bash
# Docker 方式
docker-compose restart api

# PM2 方式
pm2 restart treatbot-api
```

### 备份数据库
```bash
# 手动备份
mysqldump -h your-host -u treatbot -p treatbot > backup-$(date +%Y%m%d).sql

# 或使用腾讯云自动备份功能
```

---

## 故障排查

### 问题 1：无法连接数据库
```bash
# 检查网络连通性
telnet your-mysql-host 3306

# 检查安全组配置
# 确保 CVM 安全组允许访问 MySQL
```

### 问题 2：OCR 识别失败
```bash
# 检查 OCR 密钥
echo $OCR_SECRET_ID
echo $OCR_SECRET_KEY

# 检查 OCR 服务状态
# 登录腾讯云控制台查看
```

### 问题 3：文件上传失败
```bash
# 检查 COS 配置
echo $COS_BUCKET
echo $COS_REGION

# 检查 COS 访问权限
# 确保存储桶为私有读写
```

---

## 下一步

- [ ] 配置监控告警（Prometheus + Grafana）
- [ ] 设置日志收集（ELK Stack）
- [ ] 配置 CI/CD 自动部署
- [ ] 进行等保测评（如需）
- [ ] 申请微信小程序审核上线

---

## 技术支持

遇到问题？

1. 查看详细文档：`docs/production-plan.md`
2. 查看 API 规范：`docs/api-spec.md`
3. 查看部署指南：`server/DEPLOYMENT.md`
4. 提交 GitHub Issue

---

**🎉 恭喜你！Treatbot 已经成功部署上线！**

**开始你的临床试验匹配之旅吧！**