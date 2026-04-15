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
