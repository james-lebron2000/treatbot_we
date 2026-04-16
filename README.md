# Treatbot — AI 临床试验速配平台

为肿瘤患者自动解析病历、匹配最适合的在招临床试验。

---

## 产品定位

患者或家属上传一份病历图片或 PDF，平台完成：

1. **病历结构化** — OCR + AI 抽取诊断、分期、基因突变、治疗史、ECOG、PD-L1 等关键字段
2. **两阶段精准匹配** — SQL 级粗筛（病种/城市）→ 内存多维评分（基因/分期/治疗线/PD-L1）
3. **可解释排序** — 每条结果附带评分理由，帮助患者和医生快速判断

目前覆盖 **496 条** 在招临床试验，涵盖 30+ 癌种。

---

## 平台形态

| 端 | 入口 | 状态 |
|---|---|---|
| H5 患者端 | `https://your-domain/treatbot/` | 已部署 |
| 微信小程序 | 微信扫码 | 已部署 |
| 管理后台 | `/api/admin/*` | API 可用 |

---

## 核心技术

### OCR 识别链路

支持图片（JPG/PNG/WEBP）和 PDF（包括扫描件）：

```
PDF 扫描件  →  Kimi File API（上传 → 视觉识别 → 结构化）
PDF 文本层  →  pdf-parse 提取文本  →  Kimi 文本模式结构化
图片        →  Kimi Vision / 腾讯云 OCR → 规则兜底
```

提取字段：`diagnosis` / `stage` / `geneMutation` / `pdl1` / `treatment` / `treatmentLine` / `ecog`

### 两阶段匹配引擎

**Stage 1 — SQL 粗筛**

基于试验 `disease_tags`（JSON 数组）和 `study_cities` 做数据库级过滤，将 496 条压缩到 100–150 条候选集，避免全表比对。

```sql
WHERE JSON_SEARCH(disease_tags, 'one', '%胰腺癌%') IS NOT NULL
   OR JSON_SEARCH(disease_tags, 'one', '%全部实体瘤%') IS NOT NULL
```

**Stage 2 — 内存精排**

对候选集做多维加权评分（满分 99）：

| 维度 | 分值 | 说明 |
|---|---|---|
| 疾病精确匹配（disease_tags） | +34 / +26 | 精确命中 vs 方向匹配 |
| 基因突变匹配 | +20 | 每个命中基因最多累加 |
| 分期匹配 | +10 | AJCC 期别 / 晚期描述 |
| 治疗线数匹配 | +10 | treatment_lines 数组命中 |
| ECOG 评分符合 | +6 | 入组体能要求 |
| PD-L1 相关 | +6 | 有表达值且试验提及 |
| 疾病标签精确加分 | +5 | disease_tags 直接命中 |
| 城市匹配 | +3 | study_cities 命中 |
| 基础分 | 10 | 所有候选试验起步分 |

### 试验数据结构

每条试验记录包含以下结构化字段（导入时从原始数据解析）：

| 字段 | 类型 | 用途 |
|---|---|---|
| `disease_tags` | JSON 数组 | 粗筛 + 精排疾病加分 |
| `treatment_lines` | JSON 整数数组 | 治疗线数匹配 |
| `study_cities` | JSON 字符串数组 | 城市粗筛 + 加分 |
| `brief_inclusion` | TEXT | 增强评分文本 |
| `treatment_approach` | STRING | 展示用 |

---

## 项目结构

```
treatbot_we/
├── server/                    # Node.js 后端 (Express)
│   ├── controllers/
│   │   ├── medical.js         # 病历上传、解析状态
│   │   └── match.js           # 匹配查询、试验详情
│   ├── services/
│   │   ├── ocr.js             # OCR 核心（Kimi / 腾讯云 / 规则）
│   │   ├── matchEngine.js     # 两阶段匹配引擎
│   │   └── queue.js           # Bull 队列处理器
│   ├── models/
│   │   ├── index.js           # MedicalRecord 模型
│   │   └── trial.js           # Trial 模型
│   ├── scripts/
│   │   ├── migrate.js         # 数据库迁移
│   │   └── importTrials.js    # 试验数据导入 (496 条)
│   ├── utils/
│   │   └── text.js            # safeText / sanitizeTrial / 编码修复
│   └── config/
│       └── database.js        # Sequelize 连接配置
│
├── web/                       # H5 前端 (Vue 3 + Vite + TypeScript)
│   └── src/
│       ├── pages/
│       │   └── UploadView.vue # 上传 + 解析 + 匹配主流程
│       └── utils/
│           └── schema.ts      # 字段 schema / normalizeRecord
│
└── pages/                     # 微信小程序页面
    ├── upload/
    ├── records/
    └── matches/
```

---

## 快速开始

### 后端

```bash
cd server
cp .env.example .env          # 填写 KIMI_API_KEY / DB_* / COS_* 等

# 本地开发
npm install
npm run dev

# Docker 生产
docker build -t treatbot-api .
docker run -d --env-file .env -p 3000:3000 treatbot-api
```

### 数据库迁移 + 试验导入

```bash
node scripts/migrate.js        # 建表 / 补列（幂等）
node scripts/importTrials.js   # 导入 496 条试验
```

### H5 前端

```bash
cd web
npm install
npm run dev          # 开发
npm run build        # 构建到 dist/，部署到 nginx /treatbot/
```

---

## 环境变量

| 变量 | 必须 | 说明 |
|---|---|---|
| `KIMI_API_KEY` | 是 | Kimi (Moonshot) API Key |
| `KIMI_MODEL` | 否 | 默认 `kimi-k2.5` |
| `DB_HOST / DB_USER / DB_PASSWORD / DB_NAME` | 是 | MySQL 连接 |
| `REDIS_HOST / REDIS_PORT` | 是 | Bull 队列 |
| `COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET` | 否 | 腾讯云 COS 文件存储 |
| `OCR_SECRET_ID / OCR_SECRET_KEY` | 否 | 腾讯云 OCR 备用 |
| `H5_LOGIN_ENABLED` | 否 | `true` 开启 H5 手机号登录 |
| `ADMIN_PHONES` | 否 | 逗号分隔的管理员手机号 |

---

## 主要 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/h5-login` | H5 手机号登录（验证码 000000）|
| POST | `/api/auth/weapp-login` | 微信小程序登录 |
| POST | `/api/medical/upload` | 上传病历（图片/PDF，最大 30MB）|
| GET | `/api/medical/records` | 病历列表 |
| GET | `/api/medical/records/:id` | 病历详情 + 结构化字段 |
| GET | `/api/matches` | 匹配试验列表（支持 `recordId` / `filters`）|
| GET | `/api/matches/trials/:id` | 试验详情 |
| GET | `/api/admin/records` | 管理员查看所有病历（需管理员权限）|
| GET | `/api/admin/exports/records` | 导出病历数据（JSON/CSV）|

---

## 匹配评分说明

| 分数段 | 含义 |
|---|---|
| 90–99 | 病种精确命中 + 多维度高度吻合，建议优先联系 |
| 80–89 | 病种方向正确，主要条件基本命中 |
| 60–79 | 方向接近，部分条件待核实 |
| 40–59 | 可作预筛候选，缺少关键证据 |
| < 40 | 方向偏差较大，默认不展示 |

---

## 管理员导出

```bash
# 导出当天病历（含结构化字段 + 匹配 Top5 + 报名记录）
ADMIN_TOKEN=xxx ./scripts/export-admin-data.sh records day

# 导出全量用户汇总
ADMIN_TOKEN=xxx ./scripts/export-admin-data.sh users all csv
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | Node.js 18 + Express 4 |
| ORM | Sequelize 6 + MySQL 8 |
| 队列 | Bull 4 + Redis 7 |
| AI / OCR | Kimi (Moonshot) Vision + File API |
| 文件存储 | 腾讯云 COS（可降级为本地 uploads/）|
| 容器化 | Docker + alpine 镜像 |
| H5 前端 | Vue 3 + Vite + TypeScript |
| 小程序 | 微信原生 WXML/WXSS |

---

## 优化路线图

> 基于代码审计（2026-04-16）与 [DASHBOARD.md](./DASHBOARD.md) 任务梳理。
> 面向 2 人团队的渐进式计划，每阶段 2–4 周，前一阶段完成后再启动下一阶段。

### Phase 1：质量护栏 & 数据补全

> 目标：CI 绿色 = 可部署；核心逻辑有测试覆盖；496 条试验全部结构化。

| # | 项目 | 关联任务 | 说明 |
|---|------|---------|------|
| Q1 | 配置 ESLint + Prettier | 新增 | 已安装 eslint 但无 `.eslintrc`，新增配置 + `eslint-plugin-security` |
| Q2 | 添加 husky + lint-staged | 新增 | commit 时自动 lint，防止低质量代码入库 |
| Q3 | CI 去掉 `\|\| true` | J9 | `deploy.yml` 中 lint/test 失败必须阻断部署 |
| Q4 | matchEngine 单元测试 | 新增 | 647 行评分逻辑零测试；覆盖 `scoreRecordAgainstTrial` / `buildCoarseFilter` |
| Q5 | API 集成测试补全 | 新增 | 现有 `api.test.js` 多个用例为空函数体，补全认证 + 匹配流程 |
| Q6 | **结构化入排全量生效** | A8 🔴 | 运行 `parseInclusionLocal.py` 完成 436 条剩余试验解析 |
| Q7 | 移除 JWT 硬编码 fallback | 新增 | `auth.js` / `croAuth.js` / `cro.js` / `auth controller` 共 4 处 `\|\| 'your-secret-key'`，改为启动校验 |

**里程碑**：CI 全绿才允许合并；matchEngine 测试覆盖率 > 60%；496 条试验全量结构化。

---

### Phase 2：商业化基础设施

> 目标：CRO 客户可登录、查看线索、导出数据，实现首单收入。

| # | 项目 | 关联任务 | 说明 |
|---|------|---------|------|
| B1 | **管理后台框架**（登录 / 权限 / 导航） | H1 🔴 | 所有商业化功能的前置依赖 |
| B2 | **申请管理后台**（状态流转 + 筛选） | H3 🔴 | CRO 日常操作入口 |
| B3 | **CRO 结构化线索导出** | H4 🔴 | 核心商业价值：按试验 ID 导出申请人 + 诊断信息 |
| B4 | **CPA 计费模型** | I1 🔴 | 按合格线索收费，依赖 B2/B3 |
| B5 | **ICP 备案 / 医疗信息服务资质** | I4 🔴 | 商业合作前置合规 |
| B6 | 申请状态跟踪（前端完整状态流） | C8 🟠 | pending → contacted → enrolled 全链路 |
| B7 | 用户列表 + 试验 CRUD | H2/H5 🟠 | 运营人员数据维护入口 |

**里程碑**：CRO 可登录 → 筛选线索 → 导出 CSV → 按 CPA 结算。

---

### Phase 3：性能 & 可观测性

> 目标：匹配 P95 < 500ms；线上问题 5 分钟内定位。

| # | 项目 | 关联任务 | 说明 |
|---|------|---------|------|
| P1 | 数据库索引补全 | 新增 | `trials` 表缺 `indication` 索引；`disease_tags` JSON 字段需 generated column + 索引 |
| P2 | `normalizeText` 结果缓存 | 新增 | 评分循环中同一文本被反复归一化，加 Map 缓存 |
| P3 | Prometheus `/metrics` 端点 | J8 🟠 | `prometheus.yml` 已配置但应用无端点；接入 `prom-client` |
| P4 | 请求耗时 + 错误率指标 | J8 🟠 | Express 中间件记录 `http_request_duration_seconds` |
| P5 | Vite 路由懒加载 + 代码分割 | 新增 | `router/index.ts` 9 个页面全部静态 import，改为动态 `() => import()` |
| P6 | Docker 多阶段构建 | 新增 | 当前 Dockerfile 最终镜像包含 python3/make/g++，拆分 build stage |
| P7 | CSP 移除 `unsafe-inline` | 新增 | `app.js` 中 `scriptSrc` 含 `'unsafe-inline'`，改用 nonce |
| P8 | 日志聚合（Loki / CloudWatch） | J7 🟡 | Winston JSON 日志已就绪，接入集中式日志平台 |

**里程碑**：Grafana 大盘可观测延迟/错误率/QPS；Docker 镜像体积减半；首屏 < 2s。

---

### Phase 4：增长闭环

> 目标：患者自传播 + 数据自更新 = 增长飞轮。

| # | 项目 | 关联任务 | 说明 |
|---|------|---------|------|
| G1 | 可分享匹配报告 | E1 🟠 | 带二维码的公开报告页，核心传播载体 |
| G2 | 新用户引导 + 样本病历 | F1 🟠 | 降低首次使用门槛，提升激活率 |
| G3 | 试验数据定期更新 | G1 🟠 | 接入 ClinicalTrials.gov API，当前数据截至 2025-09 |
| G4 | 小程序申请管理 | D4 🟠 | 微信端申请查看/取消，与 H5 对齐 |
| G5 | 癌种语义扩展 | A10 🟡 | 疾病本体词典："胃癌" 自动包含 "胃腺癌" 等子类型 |
| G6 | 用户行为埋点 | F4 🟡 | 上传 → 匹配 → 报名转化漏斗 |
| G7 | 手动补录字段 | B7 🟡 | ECOG / 治疗线数输入框，`schema.ts` 已定义 |

**里程碑**：分享报告带来 > 10% 新用户；试验数据月度自动更新；转化漏斗可量化。

---

### Phase 5：规模化准备

> 目标：支撑 10x 用户量 + 多人团队协作。

| # | 项目 | 关联任务 | 说明 |
|---|------|---------|------|
| S1 | Staging 环境搭建 | J10 🟡 | 当前只有 production，新功能直接上线 |
| S2 | CI/CD 全自动部署 | J9 🟡 | 手动 rsync → push 触发自动 build + deploy |
| S3 | 数据库迁移工具正规化 | 新增 | `migrate.js` 只能 addColumn 无法 rollback，迁移到 sequelize-cli |
| S4 | 前端测试覆盖 | 新增 | 接入 Vitest + Vue Test Utils，覆盖核心组件 |
| S5 | 新试验提醒推送 | F2 🟡 | 诊断匹配新试验时微信消息通知 |
| S6 | 运营数据大盘 | H6 🟡 | DAU / 申请量 / 转化率看板 |
| S7 | 收藏 / 对比试验 | C10 🟡 | 收藏列表 + 两两对比 |

**里程碑**：staging 与 production 隔离；PR 合并自动部署；迁移支持 up/down。
