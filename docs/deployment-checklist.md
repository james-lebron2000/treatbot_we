# Treatbot 部署检查清单

## 部署前准备

### 1. 域名和证书
- [ ] 购买域名（如 treatbot.example.com）
- [ ] 域名备案（如需要）
- [ ] 申请 SSL 证书（Let's Encrypt 或商业证书）
- [ ] 配置 DNS 解析

### 2. 云服务采购
- [ ] 云服务器 CVM（2台 × 4C8G）
- [ ] 云数据库 MySQL（2C4G）
- [ ] 云数据库 Redis（1GB）
- [ ] 对象存储 COS
- [ ] 文字识别 OCR
- [ ] 配置安全组规则

### 3. 微信小程序
- [ ] 注册小程序账号
- [ ] 完成企业认证（¥300）
- [ ] 获取 AppID 和 AppSecret
- [ ] 配置服务器域名
- [ ] 配置隐私保护指引
- [ ] 配置用户权限

---

## 服务器部署

### 1. 环境准备
```bash
# 连接服务器
ssh ubuntu@your-server-ip

# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt-get install -y nginx
```

### 2. 代码部署
```bash
# 克隆代码
git clone https://github.com/your-repo/treatbot.git
cd treatbot/server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 运行环境检查
./check-env.sh
```

### 3. 数据库初始化
```bash
# 创建数据库（使用 MySQL 客户端）
mysql -h your-host -u root -p
create database treatbot character set utf8mb4;

# 运行迁移
node scripts/migrate.js

# 导入种子数据（可选）
node scripts/seed.js
```

### 4. 启动服务
```bash
# Docker 方式（推荐）
docker-compose up -d

# 或 PM2 方式
./start.sh production
```

### 5. Nginx 配置
```bash
# 申请 SSL 证书
sudo certbot --nginx -d api.treatbot.example.com

# 配置 Nginx
sudo nano /etc/nginx/sites-available/treatbot

# 启用站点
sudo ln -s /etc/nginx/sites-available/treatbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 验证部署

### 1. 服务状态检查
```bash
# Docker 方式
docker-compose ps
docker-compose logs api

# PM2 方式
pm2 list
pm2 logs treatbot-api
```

### 2. API 测试
```bash
# 健康检查
curl https://api.treatbot.example.com/health

# 微信登录测试（需要真实 code）
curl -X POST https://api.treatbot.example.com/api/auth/weapp-login \
  -H "Content-Type: application/json" \
  -d '{"code":"test"}'
```

### 3. 数据库连接测试
```bash
mysql -h your-host -u treatbot -p -e "select 1"
```

### 4. Redis 连接测试
```bash
redis-cli -h your-host ping
```

---

## 小程序发布

### 1. 配置小程序
- [ ] 登录微信公众平台
- [ ] 配置服务器域名
- [ ] 配置业务域名（如需）
- [ ] 配置隐私保护指引

### 2. 上传代码
- [ ] 使用微信开发者工具上传
- [ ] 填写版本号
- [ ] 填写项目备注

### 3. 提交审核
- [ ] 准备测试账号
- [ ] 编写测试说明
- [ ] 准备资质证明
- [ ] 提交审核

### 4. 发布上线
- [ ] 审核通过后发布
- [ ] 配置灰度发布（可选）

---

## 监控配置

### 1. 日志监控
- [ ] 配置日志轮转
- [ ] 配置日志收集（ELK/EFK）
- [ ] 配置告警规则

### 2. 性能监控
- [ ] 部署 Prometheus
- [ ] 配置 Grafana 仪表盘
- [ ] 配置告警通道（邮件/短信/钉钉）

### 3. 业务监控
- [ ] 配置关键指标监控
- [ ] 配置转化率漏斗
- [ ] 配置错误率监控

---

## 备份策略

### 1. 数据库备份
```bash
# 添加到 crontab
crontab -e

# 每天凌晨 2 点备份
0 2 * * * /opt/treatbot/server/scripts/backup.sh >> /var/log/treatbot-backup.log 2>&1
```

### 2. 日志清理
```bash
# 每周日凌晨 3 点清理
0 3 * * 0 /opt/treatbot/server/scripts/cleanup-logs.sh >> /var/log/treatbot-cleanup.log 2>&1
```

---

## 安全加固

### 1. 服务器安全
- [ ] 配置防火墙（UFW）
- [ ] 配置 fail2ban
- [ ] 禁用 root 登录
- [ ] 配置 SSH 密钥登录

### 2. 应用安全
- [ ] 更新所有依赖
- [ ] 配置 CORS 白名单
- [ ] 配置限流保护
- [ ] 配置 WAF（可选）

### 3. 数据安全
- [ ] 启用数据库 SSL
- [ ] 配置数据脱敏
- [ ] 配置审计日志

---

## 上线后检查

### 功能验证
- [ ] 用户注册/登录
- [ ] 病历上传
- [ ] AI 解析
- [ ] 试验匹配
- [ ] 在线报名

### 性能验证
- [ ] 页面加载速度 < 3s
- [ ] API 响应时间 < 500ms
- [ ] 并发用户支持

### 监控验证
- [ ] 日志正常收集
- [ ] 告警正常触发
- [ ] 仪表盘数据正常

---

## 故障应对

### 常见问题

#### 1. 服务无法启动
```bash
# 检查日志
docker-compose logs
pm2 logs

# 检查端口占用
netstat -tulnp | grep :3000
```

#### 2. 数据库连接失败
```bash
# 检查网络
telnet db-host 3306

# 检查配置
cat .env | grep DB_
```

#### 3. 502 Bad Gateway
```bash
# 检查 Nginx 配置
sudo nginx -t

# 检查后端服务
pm2 list
docker-compose ps
```

---

## 回滚方案

### 1. 代码回滚
```bash
# 回滚到上一版本
git log --oneline -5
git reset --hard HEAD~1
./deploy.sh production
```

### 2. 数据库回滚
```bash
# 使用备份恢复
mysql -h host -u user -p database < backup.sql
```

### 3. Docker 回滚
```bash
# 回滚到上一镜像
docker-compose down
docker pull your-image:previous-tag
docker-compose up -d
```

---

## 联系方式

部署过程中遇到问题？

- 📧 技术支持：support@treatbot.example.com
- 📖 详细文档：docs/production-plan.md
- 🐛 提交 Issue：[GitHub Issues](https://github.com/your-repo/treatbot/issues)

---

**恭喜！完成以上所有步骤后，你的 Treatbot 平台就正式上线运行了！** 🎉
