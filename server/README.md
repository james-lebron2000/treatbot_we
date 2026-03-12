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

#### 匹配评分设计

当前推荐按“粗召回 + 结构化评分 + 解释输出”三层实现：

1. 粗召回
- 只扫描 `recruiting`
- 优先按病种标签召回，如 `肝癌 / HCC / 原发性肝癌`
- 再叠加城市和状态过滤

2. 结构化评分
- 疾病方向：主权重
- 基因/分子分型：高权重
- 分期：中高权重
- ECOG、RECIST、治疗线数：中权重
- 实验室/感染/妊娠/禁忌：用于排除风险与补证据提示

3. 解释输出
- `reasons`：为什么命中
- `inclusionHits`：入组命中点
- `exclusionRisks`：潜在排除风险
- `missingEvidence`：缺失证据

#### 分数等级建议

| 分数段 | 等级 | 含义 |
|:---|:---|:---|
| 90-99 | 高优先 | 建议优先人工联系 |
| 80-89 | 高匹配 | 核心条件大多命中 |
| 60-79 | 中匹配 | 方向正确，但仍需人工核对 |
| 40-59 | 低匹配 | 可预筛，但证据不足或部分条件存疑 |
| 0-39 | 不推荐 | 默认不展示 |

#### 性能策略
- 控制候选扫描上限，避免全库重算
- 预先标准化试验文本与病种别名
- 解析完成后预热 `recordId` 级别匹配缓存
- 列表页优先读缓存，再异步刷新
- 匹配解释在排序后生成，避免对低相关试验做过多计算

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

## 管理员导出

### 权限模型
- 管理员接口统一走 `Bearer Token + 管理员白名单`
- 通过以下环境变量声明管理员身份：
  - `ADMIN_USER_IDS=user_xxx,user_yyy`
  - `ADMIN_OPENIDS=oAbc123,oDef456`
  - `ADMIN_PHONES=13800138000,13900139000`
- 三组选项任意命中一组即可访问 `/api/admin/*`

### 管理接口
- `GET /api/admin/records`
  - 用途：后台分页查看病历原件、结构化病历、手机号、匹配结果、报名情况
  - 支持参数：`page/pageSize/status/date/startDate/endDate/keyword`
- `GET /api/admin/exports/records`
  - 用途：导出病历级明细
  - 支持参数：`format=json|csv`、`date=YYYY-MM-DD` 或 `startDate/endDate`
- `GET /api/admin/exports/users`
  - 用途：导出用户级汇总
  - 支持参数：`format=json|csv`、`date=YYYY-MM-DD` 或 `startDate/endDate`

### 导出字段
- 用户信息：`userId`、`nickname`、`phone`
- 病历原件：`fileKey`、`fileUrl`、`fileType`、`fileSize`
- 结构化病历：`diagnosis`、`stage`、`geneMutation`、`treatment`、`structured`
- 最终匹配：`matches`（Top 5，含分数、机构、地区、入排标准）
- 报名结果：`applications`

### 服务器导出脚本
```bash
cd server

# 导出当天病历数据
ADMIN_TOKEN=你的管理员token npm run admin:export -- records day

# 导出全量用户汇总
ADMIN_TOKEN=你的管理员token npm run admin:export -- users all

# 指定格式和输出目录
ADMIN_TOKEN=你的管理员token EXPORT_FORMAT=csv OUTPUT_DIR=./exports npm run admin:export -- records day
```

### 使用建议
- 运营回访：优先用 `records day` 导出，字段最完整
- 每日审计：固定导出 `records day` 和 `users day`
- 月度分析：导出 `users all` 做用户规模与转化统计

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
