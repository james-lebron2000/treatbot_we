# Treatbot 后端部署指南

## TL;DR — 生产部署只有一条路径

**`git push main` → GitHub Actions → 自动构建镜像 → SSH 到生产 → `docker run` 注入 Secrets。**

下面所有 `cp .env.example .env`、`./start.sh production`、`pm2 start` 步骤都仅适用于**本地开发或一次性手工搭建**。**生产环境的密钥来源是 GitHub Actions Secrets，不是磁盘上的 `.env`**。

详见仓库根 `README.md` 的「配置与密钥来源」章节。下面这一节快速复述要点：

### 生产密钥来源：GitHub Actions Secrets

| Secret | 用途 |
|---|---|
| `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY` | 部署目标 |
| `ARK_API_KEY` | 火山方舟（Doubao）密钥 — OCR 主路径 |
| `KIMI_API_KEY` | Moonshot Kimi 密钥 — OCR fallback |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 腾讯云 COS（病历存储） |
| `WEAPP_APPID` / `WEAPP_SECRET` | 微信小程序登录凭证 |
| `JWT_SECRET` | JWT 签名密钥 |
| `DB_PASSWORD` / `MYSQL_ROOT_PASSWORD` | MySQL 凭证 |

非敏感配置（模型 ID、端点、超时）直接在 `.github/workflows/deploy.yml` 顶部 `env:` 字面量里维护，单一来源、一眼可读。

**部署流程**：每次 `git push` 到 `main` → workflow 跑 lint/test → 服务器侧 docker build → 替换 `treatbot-api` 容器（自动备份 + 健康检查 + 失败回滚）。**不需要、也不应该 SSH 改 `.env`**。

> 历史踩坑：早期 `/opt/treatbot/server/.env` 里 `OCR_PROVIDER=kimi` 长期残留，即便 CI 已经注入了 Doubao 凭证，每次 `--env-file` 把这条旧 KEY 带进容器，导致生产一直走 Kimi，慢且贵。修复方案：deploy 脚本改用 `-e OCR_PROVIDER=auto` 覆盖（参考 deploy.yml `OCR_ENV_FLAGS` 块）。

---

## 部署方式概览（仅供本地或离线）

> 以下章节是本地开发或一次性手工搭建的参考，**生产请走 GitHub Actions**。

### 🚀 推荐方式：Docker + Docker Compose（本地或自建生产环境）
适合：本地全栈联调、需要离线运行的私部场景

### 📦 方式二：PM2 + 原生 Node.js（传统部署）
适合：已有 Node.js 环境、需要灵活配置

### 🧪 方式三：开发环境（本地开发）
适合：本地开发、快速测试

---

## 方式一：Docker + Docker Compose（推荐）

### 前提条件
- Linux 服务器（推荐 Ubuntu 20.04+）
- Docker 和 Docker Compose 已安装
- 云数据库 MySQL（推荐）或本地 MySQL
- 云 Redis（推荐）或本地 Redis

### 快速部署步骤

#### 1. 克隆代码并进入目录
```bash
git clone https://github.com/your-repo/treatbot.git
cd treatbot/server
```

#### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填写所有必要配置
```

#### 3. 运行一键部署
```bash
# 检查环境
./check-env.sh

# 启动服务
./start.sh production
```

#### 4. 验证部署
```bash
# 检查服务状态
pm2 list

# 查看日志
pm2 logs treatbot-api

# 测试 API
curl http://localhost:3000/health
```

### Docker Compose 手动部署

#### 1. 使用 Docker Compose 启动所有服务
```bash
docker-compose up -d
```

#### 2. 查看日志
```bash
docker-compose logs -f api
```

#### 3. 停止服务
```bash
docker-compose down
```

### 生产发布验收与回滚（推荐）

#### 1. 生成发布快照（回滚点）
```bash
./scripts/release-rollback.sh snapshot
```

#### 2. 发布前后自动验收（健康/登录/上传/解析/匹配）
```bash
# 最小验收（仅健康 + 鉴权）
BASE_URL=https://inseq.top TOKEN=your_jwt ./scripts/smoke.sh

# 含文件链路验收（推荐）
BASE_URL=https://inseq.top \
TOKEN=your_jwt \
FILE_PATH=/absolute/path/to/test.jpg \
./scripts/smoke.sh
```

#### 3. 一键发布（失败自动回滚）
```bash
BASE_URL=https://inseq.top \
TOKEN=your_jwt \
FILE_PATH=/absolute/path/to/test.jpg \
./scripts/release-deploy.sh
```

#### 4. 手动回滚
```bash
# 查看可回滚版本
./scripts/release-rollback.sh list

# 回滚到最近一次快照
./scripts/release-rollback.sh rollback latest

# 或指定版本
./scripts/release-rollback.sh rollback 20260310_173000
```

---

## 方式二：PM2 + 原生 Node.js

### 前提条件
- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0
- PM2 已安装

### 部署步骤

#### 1. 安装依赖
```bash
npm install
```

#### 2. 配置数据库
```sql
-- 创建数据库
CREATE DATABASE treatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 导入初始化脚本
mysql -u your_user -p treatbot < scripts/init.sql
```

#### 3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件
```

#### 4. 使用 PM2 启动
```bash
# 启动应用
pm2 start ecosystem.config.js --env production

# 保存配置
pm2 save

# 设置开机启动
pm2 startup
```

---

## 方式三：开发环境

### 快速启动
```bash
# 一键启动开发环境
./start.sh development
```

### 手动启动
```bash
npm install
npm run dev
```

---

## 环境配置详解

### 必需环境变量

```env
# 基础配置
PORT=3000
NODE_ENV=production

# 数据库
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=treatbot
DB_PASSWORD=your-password
DB_NAME=treatbot

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# JWT（必须为 ≥32 字符的强随机秘钥，禁止示例值）
# 生成：node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=<在服务器上用上面命令生成后粘贴>


# 微信小程序
WEAPP_APPID=your-app-id
WEAPP_SECRET=your-app-secret

# 腾讯云 COS
COS_SECRET_ID=your-cos-secret-id
COS_SECRET_KEY=your-cos-secret-key
COS_BUCKET=your-bucket
COS_REGION=ap-shanghai

# 腾讯云 OCR
OCR_SECRET_ID=your-ocr-secret-id
OCR_SECRET_KEY=your-ocr-secret-key
```

### 安全建议

#### 1. HTTPS 配置
- 使用 Let's Encrypt 免费证书
- 强制 HTTPS 重定向
- 配置 HSTS

#### 2. 数据库安全
- 使用强密码
- 只开放必要端口
- 定期备份
- 启用 SSL 连接

#### 3. 应用安全
- 定期更新依赖
- 使用 WAF（Web应用防火墙）
- 配置 CORS 白名单
- 启用限流和防刷

---

## 云服务推荐

### 腾讯云（推荐）
- **CVM**: 2核4G 轻量服务器（约 ¥800/月）
- **MySQL**: 基础版 2C4G（约 ¥600/月）
- **Redis**: 标准版 1GB（约 ¥200/月）
- **COS**: 对象存储 + CDN（约 ¥200/月）
- **SSL证书**: 免费 DV 证书

### 阿里云
- **ECS**: 2核4G 实例（约 ¥800/月）
- **RDS**: MySQL 基础版（约 ¥600/月）
- **Redis**: 标准版 1GB（约 ¥200/月）
- **OSS**: 对象存储 + CDN（约 ¥200/月）

---

## 监控和运维

### 日志监控
- 应用日志: `./logs/`
- 系统日志: `/var/log/nginx/`
- PM2 日志: `pm2 logs`

### 性能监控
- 使用 PM2 监控 CPU/内存
- 配置 Prometheus + Grafana（可选）
- 设置告警规则

### 健康检查
- API 健康端点: `GET /health`
- 数据库连接检查
- 外部服务可用性检查

---

## 故障排查

### 常见问题

#### 1. 数据库连接失败
```bash
# 检查 MySQL 状态
systemctl status mysql

# 检查连接配置
./check-env.sh
```

#### 2. Redis 连接失败
```bash
# 检查 Redis 状态
redis-cli ping
```

#### 3. 端口被占用
```bash
# 检查端口使用情况
netstat -tulnp | grep :3000
```

#### 4. PM2 无法启动
```bash
# 查看 PM2 日志
pm2 logs

# 重置 PM2
pm2 kill
pm2 start ecosystem.config.js
```

---

## 下一步建议

1. **配置 HTTPS 证书**
2. **设置监控告警**
3. **配置日志收集**
4. **添加备份策略**
5. **进行安全扫描**
6. **设置 CI/CD 流程**

---

如需技术支持，请联系开发团队或参考项目文档。
