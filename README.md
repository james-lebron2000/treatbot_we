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

# 本地开发
npm install
npm run dev   # 默认读取 .env（仅本地用，下面有详细说明）

# CI 部署：直接 git push main，由 GitHub Actions 用 Secrets 注入容器
```

> **注意：** `server/.env` **不再用于生产**。生产密钥（`ARK_API_KEY` / `KIMI_API_KEY` / `COS_*` / `JWT_SECRET` / `WEAPP_*` 等）已统一迁移到 **GitHub Actions Secrets**，由 `.github/workflows/deploy.yml` 在 `docker run -e` 时注入容器。详见下方「配置与密钥来源」。

### 配置与密钥来源（**重要**）

本仓库**唯一**的生产配置入口是 **GitHub Actions Secrets**。设计动机：
- 单一来源，避免 `.env` 与 CI 互相漂移（历史 bug：prod `.env` 里 `OCR_PROVIDER=kimi` 残留，导致即便 CI 注入了 Doubao 凭证也走不到 Doubao 路径）。
- secrets 不落盘到服务器，只在 `docker run` 进程时注入；rotate key 只需要在 GitHub UI 改一个值。
- `.env.example` 仅作为本地开发模板，列举字段名 + 示例值，**生产不读取该文件**。

| 用途 | 来源 | 谁写 / 何时写 |
|---|---|---|
| 本地 `npm run dev` | `server/.env`（手动 cp `.env.example` → `.env`） | 开发者本机 |
| 本地测试 / `npm test` | 测试 fixture + 临时 `process.env`（jest setup） | CI runner |
| 生产容器 (`treatbot-api`) | GitHub Actions Secrets → `docker run -e ...` | 每次 `git push main` 触发 deploy workflow |

**所需 GitHub Secrets**（仓库 Settings → Secrets and variables → Actions）：

| Secret | 用途 |
|---|---|
| `SERVER_HOST` | 生产 SSH 主机（IP 或域名） |
| `SERVER_USER` | 生产 SSH 用户（`ubuntu`） |
| `SERVER_SSH_KEY` | 部署私钥 |
| `ARK_API_KEY` | 火山方舟（Doubao）密钥 — **OCR 主路径** |
| `KIMI_API_KEY` | Moonshot Kimi 密钥 — OCR fallback |
| `COS_SECRET_ID` / `COS_SECRET_KEY` | 腾讯云 COS（病历存储） |
| `WEAPP_APPID` / `WEAPP_SECRET` | 微信小程序登录凭证 |
| `JWT_SECRET` | JWT 签名密钥（≥32 字符强随机） |
| `DB_PASSWORD` / `MYSQL_ROOT_PASSWORD` | MySQL 凭证 |

**非敏感配置**（模型 ID / 端点 / 超时阈值）直接在 `deploy.yml` 字面量里维护，避免 secret 数量膨胀：

```yaml
# .github/workflows/deploy.yml（节选）
env:
  OCR_PROVIDER: 'auto'                                       # 主用 Doubao，按凭证可达性 fallback
  ARK_VISION_MODEL: 'doubao-seed-1-6-vision-250815'
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3'
  ARK_TIMEOUT_MS: '180000'
  KIMI_VISION_MODEL: 'moonshot-v1-128k-vision-preview'
  OCR_QUEUE_CONCURRENCY: '2'
```

**常见误区**：
- ❌ 直接 SSH 改 `/opt/treatbot/server/.env` 来切换 provider 或滚动密钥 —— 下次 deploy 会被 `-e` 覆盖回去（且 `--env-file` 用的是上一容器的 env dump，不是磁盘 `.env`）。
- ✅ 在 GitHub Settings 改 secret，然后随便 push 一次（或手动 re-run 最新 workflow）即可 hot-rotate。
- 紧急 hotfix 想跳过 CI，可由维护者临时 SSH 上去 `docker run -e VAR=newvalue ...` 重启容器；但下次正常 deploy 会按 GHA secrets 还原 —— 真正的 fix 必须落到 secret。

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

### 微信小程序

仓库根目录就是小程序工程（`app.json` + `pages/` + `utils/`）。

```bash
# 1. 用「微信开发者工具」打开仓库根目录（不要打开 web/，那是 H5）
# 2. AppID 已在 project.config.json 里固定；如不是你的账号请改回自己的测试号
# 3. 服务器域名：开发模式可勾「不校验合法域名」，
#    线上需要在「微信公众平台 → 开发设置 → 服务器域名」加 https://inseq.top
```

**首次跑 CLI（`cli preview` / `cli auto`）必做的一次性开关：**

> 微信开发者工具 → 设置 → 安全设置 → **服务端口 ✅ 开启**

不开启时 CLI 会卡在 `Enable IDE Service (y/N)` 等输入而 IDE 端 GUI 没人点确认，
`.ide` 端口文件不会被写出（只会写出 `.cli`），CLI 端最终 timeout。
开过一次后 `~/Library/Application Support/微信开发者工具/.../Default/.ide` 长期存在，
后续 CLI 直接连。

```bash
# 开启 Service Port 之后才有效
cli preview --project $(pwd) --qr-output qr.txt
cli auto --project $(pwd)        # 自动化测试入口
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
| 容器化 | Docker + alpine 镜像（多阶段构建）|
| H5 前端 | Vue 3 + Vite + TypeScript |
| 小程序 | 微信原生 WXML/WXSS |

---

## 项目全景

> **最后更新：2026-04-29**。Q3-红线 patient-friendly + observability + 合规自助一次性落地（commit `3f8709f → e8bd042 → afcf7f0`，已生产）。读完这一页就知道"现在在哪，接下来去哪"。

### 当前状态速览

| 维度 | 现状 |
|---|---|
| 在招试验数据 | **496 条**，`decomposed_criteria` **2659 条** 已解析 |
| 生产部署 | `https://inseq.top` · Caddy 反代 + Docker 多阶段构建 |
| 服务端测试 | **28 suites / 212 tests 全绿**（jest，跳过 api.test.js 的 MySQL 依赖） |
| H5 e2e | **16/16 chromium-desktop 全绿**（Playwright：demo 富信息 + 患者友好 + admin） |
| Lint 基线 | ✅ **0 errors / 0 warnings**（2026-04-29 清零，从 38 warnings 起） |
| CI 质量门 | ✅ Deploy + Secret Scan + e2e 三 workflow 强制通过；pre-commit detect-secrets + gitleaks |
| 安全基线 | ✅ JWT 启动强校验 · CSP 生产无 unsafe-inline 脚本 · HSTS · captcha · SMS 限频 · LLM 入参 PII scrub |
| 可观测性 | ✅ Sentry SDK + scrubber · Prometheus `/metrics` · http 耗时直方图 · 试验新鲜度 daily job · admin audit log |
| 合规自助（§A.2） | ✅ 同意管理 / 数据导出 / 注销账号 / 改密 — H5 + 小程序两端就绪 |
| 隐私页面 | ✅ `/privacy`（落地静态版）+ `/treatbot/privacy`（SPA 8 节患者友好版） |
| 漏斗埋点（§B.2） | ✅ 6 事件白名单：landing_view / upload_start / upload_success / match_view / trial_apply / application_submitted |
| Demo 数据质量 | ✅ 灯塔报告 12 节富信息病例 · `matchEngine.isCancerTypeMismatch` 硬排除跨癌种（修复肝癌→HER2 子宫内膜癌事故） |
| 未起 staging | ⚠️ 仅生产，所有变更直接上线（今日 76 文件直进 prod 是例证） |
| 无每日备份 | ⚠️ MySQL 灾备未起 |
| ICP / 互联网医疗信息服务资质 | ⚠️ 审批未启动（外部依赖，3-6 个月） |

### 最近一次发布 — Q3-红线全量（2026-04-29）

三个 commit 串成一次发布，覆盖 Phase 1+2+3 三块工作：

| Commit | 范围 | 关键内容 |
|---|---|---|
| `3f8709f` `feat(q3-redline)` | 76 文件 / +5549 -928 | §U1-U6 患者友好（HelpFab/Onboarding/FieldExplainer/ConsentModal/MatchesView「✓ 为什么适合」/PrivacyPromiseCard）· §A.1 双 token single-flight refresh · §A.2 自助接口 · §A.3 Sentry+/metrics+httpMetrics · §3.5 多病历软删除 · §B.2 漏斗埋点 · §B.3 LLM 安全（promptRegistry/zod schema/piiScrubber/captcha/SMS 限频）· demo 灯塔报告 12 节 · cancer-type 硬排除 · /privacy 页 · 同理心改写「不是骗局/不保证治好」为正面承诺 |
| `e8bd042` `fix(ci)` | 3 文件 / +6 -9 | piiScrubber 字面 NBSP → ` ` · llmClient useless try/catch 移除 · secret-scan 重复 `--fail` 拆掉 |
| `afcf7f0` `chore(server) lint cleanup` | 21 文件 / +31 -42 | 38 条 `no-unused-vars` 全部清零（dead require 删除 / 保留为后用的常量加 `_` 前缀） |

**生产探针**（2026-04-29 验证）：
- `/health` → `status: ok`
- `/api/demo/samples` 3 个样例正确
- `sample-1-hcc` 5 条匹配 → **0 跨癌种**（HER2 / 胃癌 / 子宫内膜 / 乳腺 / 头颈 / 胰腺 全无）
- 帮助 FAB bundle grep：`不是骗局` / `不保证治好` 各 0 次；`全程免费` ×3、`您的数据您说了算` ×3、`公立三甲` ×1

### 现存关键问题（更新于 2026-04-29）

**🔴 P0 —— 继续上线前必须解决**
1. **ICP 备案 / 互联网医疗信息服务资质**：审批 3-6 个月，必须立即启动
2. **MySQL 每日备份**：异地副本未起；一次误删 = 全部用户数据消失

**🟠 P1 —— 规模化前必须补齐**
3. **Staging 环境**：所有变更直接上生产（今日 76 文件直进 prod 暴露了风险）
4. **管理后台 + CRO 自助导出**（B1/B2/B3）：商业闭环未打通
5. **api.test.js 仍需要真实 MySQL**：jest 用 `--testPathIgnorePatterns` 跳过；CI 端需开 MySQL service container

**🟡 P2 —— 体验 & 工程化**
6. CSP `styleSrc` 仍含 `unsafe-inline`（Element Plus 依赖，待 nonce 方案）
7. 前端只有 e2e，无 Vitest 单元覆盖
8. `shared/schemas/` 只迁了 `upload.js` 一份（曾用 `.cjs`，因 WeApp `require()` 不识 .cjs 已改名）；后续做 codegen 把 H5 zod schema dump 成 CJS 常量，结束双份漂移

### 下一步方案（建议优先级）

**本周（P0 启动 + P1 收尾）**
- [ ] **启动 ICP 备案 + 互联网医疗信息服务资质** — 外部依赖，先把流程跑起来
- [ ] MySQL 每日备份脚本上线（cron `mysqldump` + 异地 rsync 到 COS / 阿里云）
- [ ] api.test.js 的 MySQL fixture：GitHub Actions service container 接入 MySQL 8

**下两周（B 系列商业化基础）**
- [ ] **B1 管理后台框架**（auth + 权限 + 导航）—— 所有商业化功能的前置依赖
- [ ] **B2 申请管理后台**（pending → contacted → enrolled 状态流转）
- [ ] **B3 CRO 结构化线索导出**（按 trialId 出 CSV，核心商业价值）

**下月（增长闭环 — 用今日就绪的基建）**
- [ ] **G1 可分享匹配报告页**（带二维码，公开可访问，用户自传播载体）
- [ ] **G3 ClinicalTrials.gov 月度同步**（试验数据保鲜，trialFreshness daily job 已就位等接入）
- [ ] **G6 漏斗转化看板**（funnel events 已埋好，接入 Grafana / Metabase 即可可视化）

**长尾（不阻断主线）**
- [ ] Staging 环境（K8s / 简版 docker-compose 双环境）
- [ ] CSP nonce 方案，彻底移除 `styleSrc` 的 `unsafe-inline`
- [ ] `shared/schemas/` codegen：H5 zod → CJS 常量自动 dump，小程序 require 同源
- [ ] Sentry sourcemap 上传，生产报错栈可读
- [ ] Vitest 单元覆盖核心组件（HelpFab / FieldExplainer / RecordSummaryCard）

### 任务完成度（截至 2026-04-29）

| 阶段 | 已完成 | 进行中 | 未开始 | 进度 |
|---|:-:|:-:|:-:|:-:|
| Phase 1 质量护栏 & 数据补全 | 5 | 1 | 1 | **71%** |
| Phase 2 商业化基础设施 | 0 | 0 | 7 | 0% |
| Phase 3 性能 & 可观测性 | 6 | 1 | 1 | **75%** |
| Phase 4 增长闭环 | 3 | 0 | 4 | **43%** |
| Phase 5 规模化准备 | 0 | 0 | 7 | 0% |
| **匹配引擎专项**（路线图外） | 6 | 0 | 0 | **100%** |
| **Q3-红线 §A/§B/§U 专项**（横跨 Phase 1/3/4） | 12 | 0 | 0 | **100%** |
| **总计**（Phase 1-5 + 匹配引擎，去除 Q3 重叠） | **20** | **2** | **20** | **48%** |

### 匹配引擎专项（已全部交付，不在下方路线图内）

| # | 项目 | 状态 | 验证 |
|---|---|:-:|---|
| ME1 | 多基因独立状态解析（`geneParser.js`） | ✅ | `geneParser.test.js` 20 用例 |
| ME2 | PD-L1 TPS/CPS/IC/IHC 体系区分（`pdl1Parser.js`） | ✅ | `pdl1Parser.test.js` 19 用例 |
| ME3 | Trial 预处理 WeakMap 缓存（Hit 率 83.7%） | ✅ | `matchEngineCache.test.js` 6 用例 |
| ME4 | `/health/detailed` 暴露 decomposed_criteria 加载状态 | ✅ | 同上 |
| ME5 | 稳定排序（score → updatedAt → id） | ✅ | `controllers/match.js` 两处 |
| ME6 | Criterion Matcher 集成基因 & PD-L1 解析器 | ✅ | `matchEngine.integration.test.js` 4 用例 |

### 任务状态图例

- ✅ **Done**：已实现并验证（测试通过 / 部署生效）
- 🔄 **WIP**：部分完成或卡在外部依赖
- ⏸ **Todo**：尚未开始

---

## 优化路线图

> 基于代码审计（2026-04-16）与 [DASHBOARD.md](./DASHBOARD.md) 任务梳理。
> 面向 2 人团队的渐进式计划，每阶段 2–4 周，前一阶段完成后再启动下一阶段。

### Phase 1：质量护栏 & 数据补全

> 目标：CI 绿色 = 可部署；核心逻辑有测试覆盖；496 条试验全部结构化。

| # | 状态 | 项目 | 关联任务 | 说明 |
|---|:-:|------|---------|------|
| Q1 | ✅ | 配置 ESLint + 0/0 lint baseline | 新增 | `.eslintrc` 就位；2026-04-29 清掉 38 条 warnings；CI 入闸 hard error 阻断 |
| Q2 | ✅ | pre-commit 钩子（detect-secrets + gitleaks） | 新增 | `.pre-commit-config.yaml` 入库；commit 时阻挡明文密钥 |
| Q3 | ✅ | CI 去掉 `\|\| true` | J9 | `deploy.yml` lint/test 失败现在会阻断部署；**额外加了 JWT 生产冒烟 step** |
| Q4 | ✅ | matchEngine + 全栈单元/集成测试 | 新增 | jest 28 suites / 212 tests 全绿（含 cancerTypeConsistency / piiScrubber / authRefresh / userLifecycle / promptEval / metrics） |
| Q5 | 🔄 | API 集成测试补全 | 新增 | `api.test.js` 仍需要真实 MySQL；CI 端接入 service container 是下一步 |
| Q6 | ⏸ | **结构化入排全量生效** | A8 🔴 | 运行 `parseInclusionLocal.py` 完成 436 条剩余试验解析（已解析 60/496） |
| Q7 | ✅ | 移除 JWT 硬编码 fallback | 新增 | `utils/jwtSecret.js` 统一入口；生产未设置/弱值/短值 → 启动抛错；非生产 → 自动生成临时秘钥 |

**里程碑**：CI 全绿才允许合并；matchEngine 测试覆盖率 > 60%；496 条试验全量结构化。

---

### Phase 2：商业化基础设施

> 目标：CRO 客户可登录、查看线索、导出数据，实现首单收入。

| # | 状态 | 项目 | 关联任务 | 说明 |
|---|:-:|------|---------|------|
| B1 | ⏸ | **管理后台框架**（登录 / 权限 / 导航） | H1 🔴 | 所有商业化功能的前置依赖 |
| B2 | ⏸ | **申请管理后台**（状态流转 + 筛选） | H3 🔴 | CRO 日常操作入口 |
| B3 | ⏸ | **CRO 结构化线索导出** | H4 🔴 | 核心商业价值：按试验 ID 导出申请人 + 诊断信息 |
| B4 | ⏸ | **CPA 计费模型** | I1 🔴 | 按合格线索收费，依赖 B2/B3 |
| B5 | ⏸ | **ICP 备案 / 医疗信息服务资质** | I4 🔴 | 商业合作前置合规，**审批周期 3–6 个月需立即启动** |
| B6 | ⏸ | 申请状态跟踪（前端完整状态流） | C8 🟠 | pending → contacted → enrolled 全链路 |
| B7 | ⏸ | 用户列表 + 试验 CRUD | H2/H5 🟠 | 运营人员数据维护入口 |

**里程碑**：CRO 可登录 → 筛选线索 → 导出 CSV → 按 CPA 结算。

---

### Phase 3：性能 & 可观测性

> 目标：匹配 P95 < 500ms；线上问题 5 分钟内定位。

| # | 状态 | 项目 | 关联任务 | 说明 |
|---|:-:|------|---------|------|
| P1 | ⏸ | 数据库索引补全 | 新增 | `trials` 表缺 `indication` 索引；`disease_tags` JSON 字段需 generated column + 索引 |
| P2 | ✅ | Trial 预处理结果缓存 | 新增 | 改为 WeakMap per-trial 缓存（比单纯 normalizeText Map 更彻底），命中率 83.7% |
| P3 | ✅ | Prometheus `/metrics` 端点 | J8 🟠 | `prom-client` 接入；`/metrics` 内网白名单（10/8 + 172.16/12 + 192.168/16）；含 OCR 队列指标 |
| P4 | ✅ | 请求耗时 + 错误率指标 | J8 🟠 | `httpMetricsMiddleware` 记录 `http_request_duration_seconds` 直方图（按 route + status） |
| P5 | ✅ | Vite 路由懒加载 + 代码分割 | 新增 | `router/index.ts` 全部 14 个页面动态 import；首屏只装 LoginView + Vue 运行时 |
| P6 | ✅ | Docker 多阶段构建 | 新增 | 拆分 `deps` / `runtime` 两阶段；最终镜像不再含 make/g++；改为非 root 用户启动 |
| P7 | 🔄 | CSP 移除 `unsafe-inline` | 新增 | 生产 `scriptSrc` 已移除 `unsafe-inline`（并加 HSTS / baseUri / formAction）；`styleSrc` 仍保留，待 nonce 方案 |
| P8 | ✅ | Sentry + 集中可观测性 | J7 🟡 | Sentry SDK + scrubber + adminAuditLog + trialFreshness daily job + LLM observability；Loki 接入仍待办 |

**里程碑**：Grafana 大盘可观测延迟/错误率/QPS；Docker 镜像体积减半；首屏 < 2s。

---

### Phase 4：增长闭环

> 目标：患者自传播 + 数据自更新 = 增长飞轮。

| # | 状态 | 项目 | 关联任务 | 说明 |
|---|:-:|------|---------|------|
| G1 | ⏸ | 可分享匹配报告 | E1 🟠 | 带二维码的公开报告页，核心传播载体 |
| G2 | ✅ | 新用户引导 + 样本病历 | F1 🟠 | OnboardingView 30 秒期望管理 + Demo 3 个灯塔报告样例（hcc/nsclc/sba），`/treatbot/demo` 公开可达 |
| G3 | ⏸ | 试验数据定期更新 | G1 🟠 | trialFreshness daily job 已就位；ClinicalTrials.gov 同步管线待接入 |
| G4 | ⏸ | 小程序申请管理 | D4 🟠 | 微信端申请查看/取消，与 H5 对齐 |
| G5 | ⏸ | 癌种语义扩展 | A10 🟡 | 疾病本体词典："胃癌" 自动包含 "胃腺癌" 等子类型 |
| G6 | ✅ | 用户行为埋点 | F4 🟡 | 6 事件白名单（landing_view / upload_start / upload_success / match_view / trial_apply / application_submitted），H5 sendBeacon + 小程序 wx.request 双端就绪 |
| G7 | ✅ | 手动补录字段 | B7 🟡 | `pages/manualEntry/`（小程序）+ `web/src/pages/UploadView.vue` FieldExplainer 字段说明已上线 |

**里程碑**：分享报告带来 > 10% 新用户；试验数据月度自动更新；转化漏斗可量化。

---

### Phase 5：规模化准备

> 目标：支撑 10x 用户量 + 多人团队协作。

| # | 状态 | 项目 | 关联任务 | 说明 |
|---|:-:|------|---------|------|
| S1 | ⏸ | Staging 环境搭建 | J10 🟡 | 当前只有 production，新功能直接上线 |
| S2 | ⏸ | CI/CD 全自动部署 | J9 🟡 | 手动 rsync → push 触发自动 build + deploy |
| S3 | ⏸ | 数据库迁移工具正规化 | 新增 | `migrate.js` 只能 addColumn 无法 rollback，迁移到 sequelize-cli |
| S4 | ⏸ | 前端测试覆盖 | 新增 | 接入 Vitest + Vue Test Utils，覆盖核心组件 |
| S5 | ⏸ | 新试验提醒推送 | F2 🟡 | 诊断匹配新试验时微信消息通知 |
| S6 | ⏸ | 运营数据大盘 | H6 🟡 | DAU / 申请量 / 转化率看板 |
| S7 | ⏸ | 收藏 / 对比试验 | C10 🟡 | 收藏列表 + 两两对比 |

**里程碑**：staging 与 production 隔离；PR 合并自动部署；迁移支持 up/down。

---

## 部署前操作清单（生产 checklist）

每次版本升级 / 环境迁移前在目标服务器执行：

```bash
# 1. 生成强 JWT 秘钥（48 字节 = 96 hex 字符，远超 32 字符底线）
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# 粘贴到 /opt/treatbot/.env 的 JWT_SECRET=

# 2. 验证启动时会真的做校验（用空值启动应当立即 crash）
docker run --rm -e NODE_ENV=production treatbot-api:latest node -e "require('./utils/jwtSecret')"
# 期望输出：[FATAL] JWT_SECRET 未设置...

# 3. 发布（换 JWT 秘钥会使所有已登录 token 失效，选低峰期，发布公告）
docker-compose up -d
curl https://inseq.top/health/detailed | jq .
```

关键环境变量清单：

| 变量 | 必须 | 备注 |
|---|:-:|---|
| `NODE_ENV` | ✅ | 生产必须 `production`，否则 JWT 校验不会触发 fail-fast |
| `JWT_SECRET` | ✅ | ≥32 字符强随机值；命中弱值黑名单会直接拒启 |
| `DB_HOST / DB_USER / DB_PASSWORD / DB_NAME` | ✅ | MySQL |
| `REDIS_HOST / REDIS_PORT` | ✅ | Bull 队列 |
| `KIMI_API_KEY` | ✅ | OCR 核心 |
| `PUBLIC_BASE_URL` | ✅ | 非 development 必须 HTTPS |
| `ALLOWED_ORIGINS` | ✅ | 生产至少包含 `https://inseq.top` |
