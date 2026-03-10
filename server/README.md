# Treatbot 临床试验匹配平台

基于微信小程序 + Node.js + MySQL + Redis 的临床试验智能匹配平台。

## 项目架构

### 技术栈
- **前端**: 微信小程序 (WXML/WXSS/JavaScript)
- **后端**: Node.js + Express.js
- **数据库**: MySQL 8.0 + Redis
- **文件存储**: 腾讯云 COS / 阿里云 OSS
- **OCR**: 腾讯云 OCR / 阿里云 OCR
- **队列**: Bull (基于 Redis)
- **部署**: Docker + Docker Compose + Nginx

### 系统架构
```
微信小程序
    ↓
Nginx (负载均衡 + HTTPS)
    ↓
Node.js API (Express)
    ↓
MySQL (业务数据) + Redis (缓存/队列)
    ↓
文件存储 (COS/OSS) + OCR 服务
```

## 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/your-repo/treatbot.git
cd treatbot
```

### 2. 前端开发
```bash
cd treatbot-weapp
# 使用微信开发者工具打开项目
# 配置开发环境
```

### 3. 后端部署
```bash
cd server

# 一键检查环境
./check-env.sh

# 一键启动（开发环境）
./start.sh development

# 或一键部署（生产环境）
./deploy.sh production
```

## 项目结构

```
treatbot/
├── treatbot-weapp/          # 微信小程序前端
│   ├── pages/              # 页面
│   ├── components/         # 组件
│   ├── utils/              # 工具函数
│   ├── docs/               # 文档
│   └── server/             # 后端代码
├── server/                 # Node.js 后端
│   ├── controllers/        # 控制器
│   ├── models/            # 数据模型
│   ├── middleware/        # 中间件
│   ├── services/          # 业务服务
│   ├── routes/            # 路由
│   ├── docker-compose.yml # Docker 配置
│   └── deployment/        # 部署脚本
└── docs/                  # 项目文档
```

## 核心功能

### 1. 病历上传与识别
- 支持拍照或相册选择
- 自动 OCR 文字识别
- 医疗实体抽取（诊断、分期、基因突变等）
- 文件去重（基于 MD5 哈希）

### 2. 智能匹配
- 基于病历信息的临床试验匹配
- 匹配度评分（0-100 分）
- 匹配原因解释
- 支持筛选和排序

### 3. 试验报名
- 在线提交报名申请
- 报名状态跟踪
- 机构联系信息
- 报名记录管理

### 4. 用户中心
- 个人信息管理
- 病历记录查看
- 匹配记录查看
- 报名记录查看

## 部署指南

### 部署方式选择

| 方式 | 适合场景 | 复杂度 | 推荐度 |
|------|----------|--------|--------|
| Docker Compose | 生产环境 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| PM2 + 原生 | 传统部署 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 开发环境 | 本地开发 | ⭐ | ⭐⭐⭐ |

### 推荐部署方式：Docker Compose

#### 前提条件
- Linux 服务器（推荐 Ubuntu 20.04+）
- Docker 和 Docker Compose
- 云数据库 MySQL
- 云 Redis

#### 一键部署
```bash
cd server
./check-env.sh     # 检查环境
./start.sh production  # 启动生产环境
```

详细部署指南请参考 [DEPLOYMENT.md](server/DEPLOYMENT.md)

## 环境配置

### 必需服务
- MySQL 8.0+（云数据库推荐）
- Redis 6.0+（云数据库推荐）
- Node.js 18.0+

### 可选服务
- 腾讯云 COS / 阿里云 OSS（文件存储）
- 腾讯云 OCR / 阿里云 OCR（文字识别）
- Sentry（错误追踪）
- Prometheus + Grafana（监控）

### 成本估算（月度）

| 服务 | MVP 阶段 | 扩展期 | 规模化 |
|------|----------|--------|--------|
| 云服务器 | ¥800-2,500 | ¥3,000-8,000 | ¥10,000+ |
| MySQL | ¥600-1,500 | ¥1,500-4,000 | ¥8,000+ |
| Redis | ¥200-600 | ¥600-2,000 | ¥4,000+ |
| OSS + CDN | ¥200-800 | ¥800-3,000 | ¥8,000+ |
| OCR 调用 | ¥1,000-6,000 | ¥6,000-30,000 | ¥50,000+ |
| **总计** | **¥3,600-14,900** | **¥15,400-60,000** | **¥110,000+** |

## 安全特性

### 1. 认证与授权
- JWT 令牌认证
- 微信小程序登录
- 权限控制

### 2. 数据安全
- 传输加密（HTTPS）
- 存储加密
- 敏感信息脱敏

### 3. 接口安全
- 防重放攻击（幂等性）
- 限流保护
- IP 黑名单

### 4. 合规性
- 医疗数据分类分级
- 审计日志
- 隐私保护

## 监控与运维

### 监控指标
- API 响应时间
- 错误率
- 数据库性能
- 队列积压情况
- 文件上传成功率

### 日志管理
- 结构化日志（JSON格式）
- 自动日志轮转
- 日志脱敏

### 告警规则
- 5xx 错误率 > 1%
- 响应时间 > 2s
- 队列积压 > 100
- 数据库连接失败

## 开发指南

### 前端开发
- 使用微信开发者工具
- 遵循微信小程序开发规范
- 组件化开发
- 性能优化（分包、懒加载）

### 后端开发
- RESTful API 设计
- 中间件模式
- 错误处理统一
- 数据库事务

### 代码规范
- ESLint 代码检查
- Prettier 代码格式化
- Jest 单元测试
- API 文档自动生成

## 下一步计划

### 近期（1-2周）
- [ ] HTTPS 证书配置
- [ ] 生产环境部署
- [ ] 监控告警配置

### 中期（1-2月）
- [ ] OCR 多供应商接入
- [ ] 匹配算法优化
- [ ] 订阅消息功能

### 长期（3-6月）
- [ ] 等保测评
- [ ] 服务拆分
- [ ] 国际化支持

## 技术支持

- 📧 邮箱: support@treatbot.example.com
- 💬 微信: treatbot_support
- 📖 文档: [项目Wiki](https://github.com/your-repo/treatbot/wiki)
- 🐛 问题: [GitHub Issues](https://github.com/your-repo/treatbot/issues)

## 许可证

[MIT License](LICENSE)

---

**🎯 目标：让临床试验匹配更简单、更智能、更安全！**