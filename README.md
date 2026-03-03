# Treatbot 临床试验匹配平台 🏥

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/express-4.x-blue?style=flat-square&logo=express" alt="Express">
  <img src="https://img.shields.io/badge/mysql-8.0-orange?style=flat-square&logo=mysql" alt="MySQL">
  <img src="https://img.shields.io/badge/redis-6.0-red?style=flat-square&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  基于微信小程序 + Node.js + AI 的临床试验智能匹配平台
</p>

<p align="center">
  <a href="docs/QUICKSTART.md">🚀 快速开始</a> •
  <a href="docs/api-spec.md">📖 API 文档</a> •
  <a href="docs/FAQ.md">❓ 常见问题</a> •
  <a href="CONTRIBUTING.md">🤝 参与贡献</a>
</p>

---

## 🎯 核心功能

### 患者端（微信小程序）
- 📸 **病历上传** - 拍照或相册选择，支持多张图片
- 🤖 **AI 智能解析** - OCR 识别 + 医疗实体抽取
- 🎯 **智能匹配** - 基于病历信息匹配临床试验
- 📝 **在线报名** - 一键提交报名申请
- 👤 **个人中心** - 病历/匹配/报名记录管理

### 医生端（规划中）
- 病历审核
- 试验管理
- 患者沟通

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     微信小程序前端                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   首页   │  │  上传页  │  │  匹配页  │  │  我的   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                      Nginx (负载均衡)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Node.js API (Express)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  认证    │  │  病历    │  │  匹配    │  │  报名    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌────────▼────────┐  ┌─────▼──────┐
│   MySQL      │  │     Redis       │  │  腾讯云    │
│  (业务数据)   │  │ (缓存/队列/会话) │  │ COS/OCR   │
└──────────────┘  └─────────────────┘  └────────────┘
```

---

## 🚀 快速开始

### 方式一：Makefile 一键部署（最简单）

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/treatbot.git
cd treatbot

# 2. 生成环境配置
make generate-env
# 按提示填写配置

# 3. 一键部署
make deploy

# 4. 查看状态
make status
```

### 方式二：Docker 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/treatbot.git
cd treatbot/server

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写你的配置

# 3. 一键启动
./start.sh production
```

### 方式二：开发环境

```bash
cd treatbot-weapp/server
npm install
npm run dev
```

详细部署指南 → [QUICKSTART.md](docs/QUICKSTART.md)

---

## 📁 项目结构

```
treatbot/
├── treatbot-weapp/              # 微信小程序前端
│   ├── pages/                   # 页面
│   ├── components/              # 组件
│   ├── utils/                   # 工具函数
│   └── docs/                    # 文档
│       ├── production-plan.md   # 生产级方案
│       ├── api-spec.md          # API 规范
│       ├── tencent-cloud-setup.md  # 云服务购买指南
│       └── QUICKSTART.md        # 快速开始
│
├── server/                      # Node.js 后端
│   ├── app.js                   # Express 入口
│   ├── docker-compose.yml       # Docker 配置
│   ├── controllers/             # 控制器
│   ├── middleware/              # 中间件（认证/限流/幂等）
│   ├── models/                  # 数据模型
│   ├── services/                # 业务服务
│   ├── routes/                  # 路由
│   └── monitoring/              # 监控配置
│
└── .github/workflows/           # CI/CD 配置
    └── deploy.yml               # 自动部署
```

---

## 🛡️ 安全特性

- ✅ **JWT 认证** - 微信小程序登录 + Token 刷新
- ✅ **HTTPS 强制** - TLS 1.2+ 加密传输
- ✅ **限流保护** - 多层限流防止恶意请求
- ✅ **幂等性** - 防重复提交（Redis 实现）
- ✅ **数据脱敏** - 敏感信息加密存储
- ✅ **CORS 白名单** - 只允许小程序域名访问
- ✅ **防重放攻击** - Nonce + 时间戳验证

---

## 📊 监控与运维

### 监控指标
- API 响应时间 (P50/P95/P99)
- 错误率统计
- 数据库连接池状态
- Redis 内存使用
- OCR 队列积压

### 告警规则
- 5xx 错误率 > 1%
- 响应时间 > 2s
- 队列积压 > 100
- 内存使用率 > 85%
- 磁盘空间 < 10%

---

## 💰 成本估算

### MVP 阶段（月度）

| 服务 | 配置 | 费用 |
|------|------|------|
| 云服务器 CVM | 2台 × 4C8G | ¥1,600 |
| 云数据库 MySQL | 2C4G | ¥800 |
| 云数据库 Redis | 1GB | ¥250 |
| 对象存储 COS | 100GB | ¥100 |
| 文字识别 OCR | 1万次 | ¥800 |
| **总计** | | **¥3,750/月** |

---

## 📖 文档目录

### 快速开始
- **[QUICKSTART.md](docs/QUICKSTART.md)** - 30分钟快速部署
- **[docs/README.md](docs/README.md)** - 文档索引和导航

### 部署相关
- **[deployment-checklist.md](docs/deployment-checklist.md)** - 部署检查清单
- **[tencent-cloud-setup.md](docs/tencent-cloud-setup.md)** - 云服务购买指南
- **[server/DEPLOYMENT.md](server/DEPLOYMENT.md)** - 详细部署指南
- **[weapp-setup.md](docs/weapp-setup.md)** - 微信小程序配置

### 架构设计
- **[production-plan.md](docs/production-plan.md)** - 生产级架构方案
- **[api-spec.md](docs/api-spec.md)** - API 接口规范
- **[performance-optimization.md](docs/performance-optimization.md)** - 性能优化指南

### 运维安全
- **[security-checklist.md](docs/security-checklist.md)** - 安全加固清单
- **[performance-optimization.md](docs/performance-optimization.md)** - 性能优化

---

## 🛠️ 技术栈

### 前端
- 微信小程序原生框架
- ES6+ JavaScript
- WXSS + Flex 布局

### 后端
- Node.js 18+
- Express.js 4.x
- Sequelize ORM
- JWT 认证
- Bull 任务队列

### 数据库
- MySQL 8.0
- Redis 6.0+

### 基础设施
- Docker + Docker Compose
- Nginx 反向代理
- PM2 进程管理
- Prometheus + Grafana 监控
- GitHub Actions CI/CD

## 🎮 常用命令（Makefile）

```bash
# 开发
make install      # 安装依赖
make dev          # 启动开发环境
make test         # 运行测试
make lint         # 代码检查

# 部署
make build        # 构建 Docker 镜像
make deploy       # 部署生产环境
make status       # 查看服务状态

# 运维
make backup       # 备份数据库
make logs         # 查看日志
make cleanup      # 清理日志和缓存

# 数据库
make db-migrate   # 数据库迁移
make db-seed      # 导入种子数据
```

---

## 📱 小程序体验

（此处可以放小程序二维码）

---

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 📄 许可证

[MIT License](LICENSE)

---

## 💬 联系我们

- 📧 邮箱: support@treatbot.example.com
- 💬 微信: treatbot_support
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/treatbot/issues)

---

**🎯 让临床试验匹配更简单、更智能、更安全！**

**[⬆ 立即开始部署 →](docs/QUICKSTART.md)**
