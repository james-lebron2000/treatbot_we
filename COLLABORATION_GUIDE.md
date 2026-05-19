# TreatBot 协作开发手册

> 写给加入项目的协作者。读完这份文档后你可以搭好本地环境、理解代码结构、知道从哪里开始写代码。

---

## 目录

1. [项目愿景与商业模式](#1-项目愿景与商业模式)
2. [技术栈与架构](#2-技术栈与架构)
3. [代码地图](#3-代码地图)
4. [本地开发环境搭建](#4-本地开发环境搭建)
5. [添加新功能指南](#5-添加新功能指南)
6. [临床试验领域知识速查](#6-临床试验领域知识速查)
7. [Git 工作流](#7-git-工作流)
8. [项目现状与可接手任务](#8-项目现状与可接手任务)
9. [协作与沟通](#9-协作与沟通)

---

## 1. 项目愿景与商业模式

**TreatBot** 是一个 AI 临床试验匹配平台。癌症患者（或家属）上传病历报告，系统自动识别诊断、分期、基因突变等关键信息，然后与数据库中 496 条正在招募的临床试验进行智能匹配，按匹配度排序推荐。

**三类用户：**

| 角色 | 使用方式 | 认证方式 |
|------|----------|----------|
| 患者/家属 | 微信小程序或 Treatbot Web上传病历、查看匹配、申请入组 | 手机号 + 验证码（开发环境固定码 `000000`） |
| CRO 公司 | 看板管理患者线索，更新筛查状态，导出数据 | 邮箱 + 密码（管理员在后台创建账号） |
| 平台管理员 | 数据总览、用户管理、CRO 账号管理、数据导出 | 患者 token + 手机号白名单 |

**商业模式：** 患者免费使用。向 CRO/药企按合格线索收费（CPA 模式）——当患者申请某试验后，CRO 在看板上查看并跟进，平台按此计费。

**线上地址：** `https://inseq.top/treatbot/`

---

## 2. 技术栈与架构

### 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js 18 / Express 4 / Sequelize ORM / Bull (Redis 队列) |
| 前端 (Treatbot Web) | Vue 3 / Vite 6 / TypeScript / Pinia / axios |
| 小程序 | 原生微信小程序 (WXML/WXSS/JS) |
| AI/OCR | Kimi (Moonshot) Vision + File API / markitdown / 腾讯云 OCR |
| 存储 | 腾讯云 COS（可降级为本地 `uploads/` 目录） |
| 数据库 | MySQL 8 + Redis 7 |
| 部署 | Docker + Caddy (HTTPS 反向代理) / 腾讯云服务器 |

### 架构图

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 微信小程序   │  │ Treatbot Web Vue SPA  │  │ CRO 看板     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │ HTTPS
                ┌───────▼───────┐
                │  Caddy (:443) │
                └───────┬───────┘
                        │
                ┌───────▼───────┐     ┌──────────────┐
                │ Express API   │────→│ Kimi API     │
                │  (:3000)      │     │ (OCR + 抽取)  │
                └──┬─────────┬──┘     └──────────────┘
                   │         │
            ┌──────▼──┐  ┌──▼───────┐
            │ MySQL 8 │  │ Redis 7  │
            │ (数据)   │  │ (队列+缓存)│
            └─────────┘  └──────────┘
```

### 核心数据流

```
患者上传文件 (PDF/PNG/JPG)
  → multer 接收 → 存入 COS/本地
  → Bull 队列异步处理
  → markitdown 转 Markdown (文本型 PDF)
  → Kimi LLM 结构化抽取 (诊断/分期/基因突变/ECOG/PD-L1/治疗线)
  → 降级路径: Kimi File API → 腾讯 OCR → 规则正则
  → 写入 medical_records 表
  
患者查看匹配
  → 两阶段匹配引擎:
    第一阶段: SQL 粗筛 (按病种 disease_tags + 城市 study_cities)
    第二阶段: 内存多维评分 (满分 99 分)
      - 病种匹配 +34 | 基因 +20 | 分期 +10 | 治疗线 +10
      - ECOG +6 | PD-L1 +6 | 城市 +3 | 基础分 +10
  → 按分数排序返回
```

---

## 3. 代码地图

```
treatbot_we/
├── server/                          # 后端 (Node.js + Express)
│   ├── app.js                       # 入口：中间件挂载、路由注册
│   ├── routes/index.js              # 所有 API 路由（单文件，85 行）
│   ├── controllers/                 # 请求处理层
│   │   ├── auth.js        (12KB)    #   认证：微信登录/Treatbot Web手机号登录/刷新token
│   │   ├── medical.js     (14KB)    #   病历：上传/解析状态/列表/补全/删除
│   │   ├── match.js       (15KB)    #   匹配：查询/搜索/筛选/试验详情
│   │   ├── application.js  (7KB)    #   申请：提交/列表/取消
│   │   ├── admin.js       (31KB)    #   管理后台：统计/用户/导出/CRO管理
│   │   ├── cro.js         (10KB)    #   CRO端：看板/状态/备注/导出
│   │   ├── health.js       (4KB)    #   健康检查
│   │   └── user.js         (2KB)    #   用户资料
│   ├── services/                    # 业务逻辑层
│   │   ├── ocr.js         (30KB)    #   OCR 核心（最复杂：markitdown→Kimi→腾讯→规则）
│   │   ├── matchEngine.js (22KB)    #   匹配引擎（SQL粗筛 + 多维评分）
│   │   ├── queue.js        (4KB)    #   Bull 队列处理器
│   │   ├── oss.js          (7KB)    #   文件存储（COS / 本地）
│   │   ├── markitdown.js   (4KB)    #   文档转 Markdown (调用 Python CLI)
│   │   └── sms.js          (2KB)    #   短信验证码（Redis 存储）
│   ├── models/                      # Sequelize 数据模型
│   │   ├── index.js                 #   MedicalRecord, TrialApplication, CroCompany
│   │   ├── trial.js                 #   Trial（496条临床试验）
│   │   └── user.js                  #   User（患者/管理员）
│   ├── middleware/                   # 中间件
│   │   ├── auth.js                  #   患者 JWT 认证
│   │   ├── croAuth.js               #   CRO JWT 认证
│   │   ├── adminAuth.js             #   管理员权限（检查 ADMIN_PHONES）
│   │   ├── errorHandler.js          #   统一错误处理
│   │   ├── rateLimit.js             #   限流
│   │   └── idempotency.js           #   幂等性（防重复提交）
│   ├── scripts/                     # 运维/数据脚本
│   │   ├── migrate.js               #   数据库迁移（幂等，可重复运行）
│   │   ├── importTrials.js          #   导入 496 条试验数据
│   │   ├── seed.js                  #   种子数据（演示用户和病历）
│   │   ├── backup.sh                #   数据库备份
│   │   └── deploy.sh                #   生产部署
│   ├── config/database.js           # 数据库连接配置
│   ├── utils/                       # 工具函数
│   │   ├── logger.js                #   Winston 日志
│   │   ├── response.js              #   统一响应格式 {code, message, data}
│   │   └── text.js                  #   文本清洗、SQL 转义
│   ├── .env.example                 # 环境变量模板（30+ 变量）
│   ├── Dockerfile                   # Docker 镜像定义
│   └── docker-compose.yml           # 一键启动 MySQL+Redis+API
│
├── web/                             # Treatbot Web (Vue 3 + TypeScript)
│   ├── src/
│   │   ├── main.ts                  #   Vue 入口
│   │   ├── App.vue                  #   根组件（底部 Tab 栏）
│   │   ├── router/index.ts          #   路由（10 个页面）
│   │   ├── services/api.ts (10KB)   #   所有后端 API 调用封装
│   │   ├── stores/
│   │   │   ├── auth.ts              #   认证状态（Pinia）
│   │   │   └── patient.ts           #   患者病历状态
│   │   ├── utils/schema.ts          #   字段定义 + 友好标签
│   │   └── pages/                   #   页面组件
│   │       ├── UploadView.vue       #     上传病历 + OCR 解析 + 字段展示
│   │       ├── MatchesView.vue      #     匹配结果列表
│   │       ├── MatchDetailView.vue  #     试验详情
│   │       ├── ApplicationsView.vue #     我的申请
│   │       ├── LoginView.vue        #     患者登录
│   │       ├── ProfileView.vue      #     个人中心
│   │       ├── AdminView.vue        #     管理后台
│   │       ├── CroBoardView.vue     #     CRO 看板
│   │       └── CroLoginView.vue     #     CRO 登录
│   └── vite.config.ts               # base: '/treatbot/', port: 5173
│
├── pages/ + components/ + utils/    # 微信小程序端（原生）
├── docs/                            # 技术文档（13+ 文件，含 Postman 集合和 OpenAPI）
├── DASHBOARD.md                     # 迭代进度看板（60+ 任务）
├── README.md                        # 项目概览
└── USER_MANUAL.md                   # 用户使用手册
```

### 5 个数据库模型

| 模型 | 表名 | 核心字段 |
|------|------|---------|
| User | users | id, openid, phone, nickname, avatar_url |
| Trial | trials | name, disease_tags(JSON), treatment_lines(JSON), study_cities(JSON), structured_inclusion(JSON), status |
| MedicalRecord | medical_records | user_id, file_key, diagnosis, stage, gene_mutation, treatment, treatment_line, pdl1, structured(JSON), status |
| TrialApplication | trial_applications | user_id, trial_id, status(pending/contacted/enrolled/rejected/cancelled), notes(JSON) |
| CroCompany | cro_companies | name, email, password_hash, trial_ids(JSON), status(active/disabled) |

---

## 4. 本地开发环境搭建

### 前置依赖

```bash
# macOS（推荐 Homebrew 安装）
brew install node@18 mysql@8.0 redis git

# 启动 MySQL 和 Redis
brew services start mysql
brew services start redis

# 可选：安装 markitdown（PDF/文档转 Markdown，不装也能跑）
pip3 install markitdown
```

### 后端配置

```bash
cd server
cp .env.example .env
```

编辑 `.env`，按以下优先级配置：

| 变量 | 是否必填 | 说明 |
|------|---------|------|
| `DB_HOST=localhost` | 必填 | 本地 MySQL |
| `DB_USER=root` | 必填 | MySQL 用户名 |
| `DB_PASSWORD=` | 必填 | MySQL 密码（本地可为空） |
| `DB_NAME=treatbot` | 必填 | 数据库名 |
| `REDIS_HOST=localhost` | 必填 | 本地 Redis |
| `JWT_SECRET=dev-secret-123` | 必填 | 任意随机字符串 |
| `TREATBOT_LOGIN_ENABLED=true` | 必填 | 开启 Treatbot Web 登录 |
| `TREATBOT_LOGIN_FIXED_CODE=000000` | 推荐 | 固定验证码（无需真实短信） |
| `KIMI_API_KEY=xxx` | 推荐 | 负责人会提供，OCR 核心依赖 |
| `ADMIN_PHONES=你的手机号` | 推荐 | 测试管理后台权限 |
| `COS_*` | 可选 | 不配则自动用本地 `uploads/` 目录 |
| `WEAPP_*` | 可选 | 仅小程序开发需要 |

### 数据库初始化

```bash
# 创建数据库
mysql -u root -e "CREATE DATABASE IF NOT EXISTS treatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 安装依赖 + 建表 + 导入 496 条试验数据
npm install
node scripts/migrate.js
node scripts/importTrials.js

# 可选：导入演示数据（2 个测试用户 + 病历 + 申请）
npm run db:seed
```

### 启动后端

```bash
npm run dev    # nodemon 热重载，改代码自动重启

# 验证
curl http://localhost:3000/health
# 应返回: {"code":0,"message":"ok","data":{"status":"healthy",...}}
```

### 前端配置与启动

```bash
cd web
npm install

# 创建本地开发环境变量（让 API 指向本地后端）
echo "VITE_API_BASE_URL=http://localhost:3000" > .env.development

npm run dev
# 浏览器打开 http://localhost:5173/treatbot/
```

**登录方式：** 输入任意 11 位手机号 + 验证码 `000000`

### Docker 替代方案

如果不想单独装 MySQL/Redis：

```bash
cd server
docker-compose up -d    # 启动 MySQL + Redis + API
# API 跑在 http://localhost:3000
```

---

## 5. 添加新功能指南

### 后端：添加一个新 API 端点

以"获取试验统计"为例：

```
1. server/routes/index.js     → 添加路由
   router.get('/trials/stats', authMiddleware, matchController.getTrialStats);

2. server/controllers/match.js → 写控制器方法
   const getTrialStats = async (req, res, next) => {
     try {
       const count = await Trial.count({ where: { status: 'recruiting' } });
       res.json(success({ totalRecruiting: count }));
     } catch (err) { next(err); }
   };

3. 如需新模型字段 → server/models/ 加字段 + scripts/migrate.js 写迁移
4. 运行 node scripts/migrate.js 应用变更
```

### 前端：添加一个新页面

```
1. web/src/pages/NewView.vue      → 写 Vue 组件
2. web/src/router/index.ts        → 注册路由
   { path: '/new', component: NewView, meta: { requiresAuth: true } }
3. web/src/services/api.ts        → 添加 API 调用
   getTrialStats: () => http.get('/api/trials/stats').then(r => unwrap(r.data))
```

### 命名约定

| 位置 | 风格 | 例子 |
|------|------|------|
| 数据库字段 | snake_case | `gene_mutation`, `treatment_line` |
| JS/TS 变量 | camelCase | `geneMutation`, `treatmentLine` |
| Vue 组件 | PascalCase | `MatchDetailView.vue` |
| API 路径 | kebab-case | `/api/medical/parse-status` |
| 控制器方法 | camelCase | `getParseStatus`, `findMatches` |

### API 响应格式

所有接口返回统一信封：

```json
{
  "code": 0,
  "message": "ok",
  "data": { ... }
}
```

错误时 `code` 为 HTTP 状态码（400/401/404/500），前端通过 `res.data.data` 取业务数据。

---

## 6. 临床试验领域知识速查

开发中会反复遇到以下概念，花 5 分钟了解：

**临床试验分期 (Phase)**
- I 期：少量患者，验证安全性和剂量
- II 期：几十到几百人，初步验证疗效
- III 期：大规模对照试验，与标准治疗比较
- IV 期：上市后监测

**ECOG 体能评分**
- 0 = 正常活动，完全不受限
- 1 = 轻度受限，能做轻体力工作
- 2 = 能自理，但不能工作，白天 < 50% 时间卧床
- 3 = 自理能力有限，白天 > 50% 时间卧床
- 4 = 完全卧床

**肿瘤分期 (Stage)**
- I 期：肿瘤较小，未扩散
- II-III 期：局部进展
- IV 期：远处转移（晚期）
- "局部晚期"和"转移性"是常见描述

**PD-L1 表达**
- 免疫治疗的预测标记物
- TPS（肿瘤比例分数）：如 `TPS 80%`
- CPS（综合阳性评分）：如 `CPS 15`
- 数值越高，免疫治疗可能越有效

**基因突变**
- 常见驱动基因：EGFR、ALK、KRAS、HER2、BRAF、ROS1
- 影响靶向药选择，如 EGFR 19del 阳性可用奥希替尼
- 代码中的 `geneMutation` 字段存储格式如 `"EGFR 19del阳性；ALK阴性"`

**治疗线数 (Treatment Line)**
- 一线：首次治疗方案
- 二线：一线失败后换药
- 三线及以上：更后线治疗
- 代码中 `treatmentLine=2` 表示患者需要二线治疗

**串联举例：** 一位 IV 期非小细胞肺癌(NSCLC)患者，EGFR 19del 阳性，ECOG 1 分，一线化疗进展 → 系统提取出 `{diagnosis: "非小细胞肺癌", stage: "IV期", geneMutation: "EGFR 19del", ecog: 1, treatmentLine: 2}`，匹配引擎会优先推荐招募 NSCLC+EGFR 突变+二线的试验。

---

## 7. Git 工作流

**分支策略：**
- `main` — 生产分支，直接对应线上部署
- `feat/xxx` — 新功能分支（如 `feat/application-page`）
- `fix/xxx` — 修复分支（如 `fix/ocr-timeout`）

**提交规范（Conventional Commits）：**
```
feat: 添加申请管理页面
fix: 修复 OCR 超时未重试的问题
docs: 更新 API 文档
refactor: 重构匹配引擎评分逻辑
```

**工作流程：**
1. 从 `main` 拉新分支：`git checkout -b feat/my-feature`
2. 本地开发并提交
3. 推送并创建 PR：`git push -u origin feat/my-feature`
4. 互相 Review 后合并到 `main`
5. 部署参考 `DASHBOARD.md` 底部的命令

**注意：** 不要在 `main` 上直接提交，两个人走 PR 是为了互相了解对方改了什么。

---

## 8. 项目现状与可接手任务

完整任务清单见 **`DASHBOARD.md`**（60+ 项任务，按类别和优先级排列）。

以下精选了适合新人上手的任务，按难度分级：

### 入门级（纯前端，改一个页面即可）

| 任务 | 说明 | 难度 |
|------|------|------|
| **C6** 报名资料清单 | 在试验详情页展示 `required_documents` 字段（数据已有，加 UI） | 半天 |
| **C7** 患者补助展示 | 在试验详情页展示 `patient_subsidy` 字段 | 半天 |
| **B6** 病历摘要卡片 | 把解析结果做成一个好看的诊断摘要卡片 | 1 天 |

### 进阶（前端为主 + 少量后端联调）

| 任务 | 说明 | 难度 |
|------|------|------|
| **C5** 申请管理页 | 前端 `/applications` 页面（API `GET /api/applications` 已有） | 1-2 天 |
| **F1** 新用户引导 | 首次打开的 onboarding 流程，降低使用门槛 | 1-2 天 |
| **E1** 分享匹配报告 | 生成可分享的匹配结果页面/卡片 | 2-3 天 |

### 高级（后端核心逻辑）

| 任务 | 说明 | 难度 |
|------|------|------|
| **A8** 结构化入排全量解析 | 运行 Python 脚本解析剩余 436 条试验的入排标准 | 1 天 |
| **A9** 先验疗法排除 | matchEngine.js 添加"用过 PD-1 则排除相关试验"逻辑 | 2 天 |
| **J6** 数据库每日备份 | 配置 crontab + mysqldump + 上传 COS | 半天 |

**建议：** 先从入门级任务开始，熟悉前后端代码流和部署流程，再挑战进阶任务。

---

## 9. 协作与沟通

| 用途 | 工具 |
|------|------|
| 日常沟通 | 微信 |
| 任务跟踪 | `DASHBOARD.md` + GitHub Issues |
| API 测试 | `docs/Treatbot-API.postman_collection.json`（导入 Postman 即可用） |
| API 规范 | `docs/api-spec.md`（请求/响应示例） |
| 部署文档 | `docs/QUICKSTART.md`（服务器部署） |
| 架构深入 | `docs/production-plan.md` |
| 常见问题 | `docs/FAQ.md` |

**提问建议：** 遇到问题时，附上相关文件路径和行号会大大加速沟通效率。例如："`server/services/ocr.js` 第 800 行的 markitdown 降级逻辑，这里为什么 50 字符就判定为空？"

---

## 附录：Quick Cheatsheet

```bash
# 启动后端（热重载）
cd server && npm run dev

# 启动前端
cd web && npm run dev

# 数据库迁移
cd server && node scripts/migrate.js

# 导入试验数据
cd server && node scripts/importTrials.js

# 健康检查
curl http://localhost:3000/health

# 查看所有 API 路由
cat server/routes/index.js

# 构建前端生产包
cd web && npm run build

# Docker 一键启动
cd server && docker-compose up -d
```
