# TreatBot 优化路线图 — 细化任务清单

> 基于 2026-04-16 代码审计。每项任务包含：目标、涉及文件、具体步骤、验收标准。
> 工时估算基于单人开发，不含 review 时间。

---

## Phase 1：质量护栏 & 数据补全（预计 2-3 周）

### Q1. 配置 ESLint + Prettier

**现状**：`eslint@8.55.0` 已安装但无配置文件，`npm run lint` 实际不检查任何规则。

**涉及文件**：
- `server/.eslintrc.js` — **新建**
- `server/.prettierrc` — **新建**
- `server/package.json` — 添加 `eslint-plugin-security`, `eslint-config-prettier` 到 devDependencies

**步骤**：
1. `cd server && npm i -D eslint-plugin-security eslint-config-prettier prettier`
2. 创建 `server/.eslintrc.js`：
   ```js
   module.exports = {
     env: { node: true, es2022: true, jest: true },
     extends: ['eslint:recommended', 'plugin:security/recommended-legacy', 'prettier'],
     parserOptions: { ecmaVersion: 2022 },
     rules: {
       'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
       'no-console': 'off', // 允许 console（用 logger 替代是 P2）
       'security/detect-object-injection': 'off', // 误报太多
     }
   };
   ```
3. 创建 `server/.prettierrc`：`{ "singleQuote": true, "semi": true, "trailingComma": "none" }`
4. 运行 `npm run lint` 修复所有 error 级别问题（warn 可留）
5. 运行 `npx prettier --write "**/*.js"` 格式化

**验收**：`npm run lint` 零 error 退出。

**工时**：2h

---

### Q2. 添加 husky + lint-staged

**现状**：无 `.husky/` 目录，无 pre-commit hooks。

**涉及文件**：
- `server/package.json` — 添加 husky, lint-staged
- `server/.husky/pre-commit` — **新建**

**步骤**：
1. `cd server && npm i -D husky lint-staged`
2. `npx husky init`
3. 编辑 `server/.husky/pre-commit`：`cd server && npx lint-staged`
4. 在 `server/package.json` 添加：
   ```json
   "lint-staged": {
     "*.js": ["eslint --fix", "prettier --write"]
   }
   ```

**验收**：`git commit` 时自动 lint 变更文件，lint 不通过则阻止提交。

**工时**：1h

---

### Q3. CI 去掉 `|| true`

**现状**：`.github/workflows/deploy.yml` 第 29 行 `npm run lint || true`，第 33 行 `npm test ... || true`，lint/test 失败不影响部署。

**涉及文件**：
- `.github/workflows/deploy.yml` — 修改第 29、33 行

**步骤**：
1. 第 29 行：`npm run lint || true` → `npm run lint`
2. 第 33 行：`npm test -- --runInBand --forceExit || true` → `npm test -- --runInBand --forceExit`
3. **注意**：必须在 Q1（ESLint 配置）和 Q5（测试补全）之后执行，否则 CI 会立刻红灯

**验收**：push 代码后 GitHub Actions test job 绿色通过；故意引入 lint 错误时 CI 失败。

**工时**：0.5h（但依赖 Q1+Q5 先完成）

---

### Q4. matchEngine 单元测试

**现状**：`server/services/matchEngine.js`（647 行）零测试。导出 13 个函数，核心是 `scoreRecordAgainstTrial`。

**涉及文件**：
- `server/tests/matchEngine.test.js` — **新建**

**需测试的函数**（按 `module.exports` 导出列表）：
| 函数 | 优先级 | 测试要点 |
|------|--------|---------|
| `normalizeText` | 高 | 空值、特殊字符、中英混合 |
| `getDiseaseProfile` | 高 | 13 种癌种别名识别、未知诊断返回 null |
| `matchDiseaseText` | 高 | 精确/模糊/泛实体瘤/不匹配 4 种场景 |
| `scoreRecordAgainstTrial` | **最高** | 见下方详细用例 |
| `buildCoarseFilter` | 中 | 有/无 disease_tags、有/无 city 的 WHERE 条件 |
| `extractDiseaseKeywords` | 中 | 从诊断文本提取搜索关键词 |
| `parseArrayField` | 低 | JSON 字符串、数组、null |

**`scoreRecordAgainstTrial` 关键测试用例**：
```
1. 年龄硬排除：record.age=15, trial.structured_inclusion.age_min=18 → excluded:true
2. ECOG 硬排除：record.ecog=3, trial.si.ecog_max=1 → excluded:true
3. A9 先验疗法排除：record.treatment="PD-1单抗治疗", trial.si.excluded_prior_therapies=["PD-1"] → excluded:true
4. 高分匹配：精确癌种+基因+分期+城市 → score >= 80
5. 中分匹配：癌种匹配但缺基因数据 → 50 <= score < 80
6. 低分/泛实体瘤：record.diagnosis="罕见肿瘤" → score < 50
7. 基因加分：EGFR L858R 匹配含 EGFR 的试验 → reasons 包含基因匹配
8. 治疗线数匹配：record.treatment_line=2, trial.treatment_lines=[2,3] → 加分
9. PD-L1 相关：record.pdl1="TPS 80%", 试验提及 PD-L1 → 加分
10. 空记录兜底：所有字段为空 → 返回基础分 10，不崩溃
```

**步骤**：
1. 创建 `server/tests/matchEngine.test.js`
2. 构造 mock trial 和 mock record 数据（不需要数据库）
3. 直接 `require('../services/matchEngine')` 测试纯函数
4. 目标：20+ 用例，覆盖硬排除、评分、边界条件

**验收**：`npm test` 通过；`npx jest --coverage` 显示 matchEngine.js 行覆盖率 > 60%。

**工时**：4-6h

---

### Q5. API 集成测试补全

**现状**：`server/tests/api.test.js`（139 行）存在 3 个问题：
- 第 88-91 行：Medical Records 测试标注"暂时跳过"
- 第 114-117 行：Applications 测试标注"暂时跳过"
- 第 130-137 行：Integration Tests 仅有注释无代码
- `beforeAll` 中 `authToken` 从未被赋值

**涉及文件**：
- `server/tests/api.test.js` — 修改

**步骤**：
1. 在 `beforeAll` 中添加 JWT token 生成：
   ```js
   const jwt = require('jsonwebtoken');
   // 创建测试用户后生成 token
   authToken = jwt.sign({ userId: user.id, openid: 'test_openid' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: 3600 });
   ```
2. 补全 Medical Records 测试（第 88-91 行）：上传文件 → 查询列表 → 查询详情
3. 补全 Applications 测试（第 114-117 行）：创建申请 → 查询列表 → 取消申请
4. 补全 Integration Tests（第 130-137 行）：完整流程 login → upload → match → apply

**验收**：`npm test` 全部用例通过，无跳过。

**工时**：3-4h

---

### Q6. 结构化入排全量生效（A8）

**现状**：496 条试验中仅 60 条已解析 `structured_inclusion`，存于 `server/data/structured_inclusion.json`（558KB）。

**涉及文件**：
- `server/scripts/parseInclusionLocal.py` — 运行
- `server/data/structured_inclusion.json` — 更新
- `server/scripts/loadStructuredInclusion.js` — 运行

**步骤**：
1. 准备 Kimi API Key（需要足够 quota）
2. 运行解析脚本（断点续跑）：
   ```bash
   KIMI_API_KEY=xxx PARSE_CONCURRENCY=5 python3 server/scripts/parseInclusionLocal.py
   ```
3. 解析完成后，将更新的 `structured_inclusion.json` 上传到服务器
4. 在服务器执行加载：
   ```bash
   docker exec treatbot-api node scripts/loadStructuredInclusion.js
   ```
5. 验证覆盖率：
   ```sql
   SELECT COUNT(*) total, COUNT(structured_inclusion) has_structured FROM trials;
   ```

**验收**：`has_structured = 496`（全量覆盖）。

**工时**：2h 人工 + Kimi API 运行时间（约 30-60 分钟）

---

### Q7. 移除 JWT 硬编码 fallback

**现状**：4 个文件包含 `process.env.JWT_SECRET || 'your-secret-key'`：

| 文件 | 行号 |
|------|------|
| `server/middleware/auth.js` | 4 |
| `server/middleware/croAuth.js` | 4 |
| `server/controllers/auth.js` | 11 |
| `server/controllers/cro.js` | 9 |

**步骤**：
1. 创建 `server/config/jwt.js`（集中管理）：
   ```js
   const JWT_SECRET = process.env.JWT_SECRET;
   if (!JWT_SECRET) {
     console.error('FATAL: JWT_SECRET 环境变量未设置');
     process.exit(1);
   }
   module.exports = { JWT_SECRET };
   ```
2. 四个文件改为 `const { JWT_SECRET } = require('../config/jwt');`
3. 同时更新 `server/.env.example`，在 `JWT_SECRET` 注释中标明"必填"
4. 更新 `server/tests/api.test.js` 的 `beforeAll` 设置 `process.env.JWT_SECRET = 'test-secret'`

**验收**：不设 `JWT_SECRET` 时服务启动立即报错退出；设置后正常运行。

**工时**：1h

---

## Phase 2：商业化基础设施（预计 3-4 周）

### B1. 管理后台框架（H1）

**现状**：后端 API 已完整（`server/controllers/admin.js` 有 13 个端点），但前端 `AdminView.vue` 是单页面，无独立后台 SPA。

**涉及文件**：
- `web/src/pages/AdminView.vue` — 重构为完整后台框架
- `web/src/pages/admin/` — **新建目录**，拆分子页面

**步骤**：
1. 创建 `web/src/pages/admin/AdminLayout.vue`（左侧导航 + 主内容区）
2. 创建子页面：
   - `admin/DashboardView.vue` — 数据概览（调 `/api/admin/dashboard`）
   - `admin/UsersView.vue` — 用户列表（调 `/api/admin/users`）
   - `admin/RecordsView.vue` — 病历列表（调 `/api/admin/records`）
   - `admin/ApplicationsView.vue` — 申请管理（调 `/api/admin/applications`）
   - `admin/TrialsView.vue` — 试验管理（调 `/api/admin/trials`）
3. 注册嵌套路由：`/admin` → Layout → children: dashboard/users/records/applications/trials
4. 管理员鉴权：复用现有 `ADMIN_PHONES` 检查逻辑

**验收**：管理员登录后可在左侧导航切换 5 个子页面，数据正常加载。

**工时**：8-12h

---

### B2. 申请管理后台（H3）

**现状**：后端已有 `GET /api/admin/applications`（分页+筛选+分组）和 `PUT /api/admin/applications/:id/status`（状态变更）。

**涉及文件**：
- `web/src/pages/admin/ApplicationsView.vue` — B1 中创建

**步骤**：
1. 申请列表：表格展示（申请ID、患者、试验名、诊断、状态、时间）
2. 状态筛选：下拉选择 pending/contacted/enrolled/rejected/cancelled
3. 试验筛选：按试验 ID 过滤
4. 状态变更：点击状态列弹出下拉，调 `PUT /api/admin/applications/:id/status`
5. 备注功能：调 `POST /api/admin/applications/:id/notes`
6. 分页：复用已有分页组件模式

**验收**：管理员可查看全部申请、按状态/试验筛选、变更状态、添加备注。

**工时**：6-8h

---

### B3. CRO 结构化线索导出（H4）

**现状**：后端已有 `GET /api/cro/exports/applications?trialId=xxx`，返回 CSV（申请ID/患者/手机号/诊断/分期/基因/治疗线/PD-L1/状态/时间/备注）。

**涉及文件**：
- `web/src/pages/CroBoardView.vue` — 添加导出按钮

**步骤**：
1. 在 CRO 看板的试验列表中，每行添加"导出线索"按钮
2. 点击后调用 `api.exportCroApplications(trialId)`，触发浏览器下载 CSV
3. 添加确认弹窗：显示将导出的记录数量
4. 可选：增加日期范围筛选

**验收**：CRO 用户点击"导出"后浏览器自动下载 CSV，内容包含患者诊断信息。

**工时**：2-3h

---

### B4-B5. CPA 计费 & ICP 备案（I1 / I4）

**说明**：这两项主要是商务和法务工作，非纯技术任务。

**B4 技术支撑**：
- 在 `trial_applications` 表增加 `billing_status` 字段（unbilled/billed/paid）
- 新建 `server/controllers/billing.js`：按试验统计合格线索数 × 单价
- 后台新增"账单管理"页面

**B5 准备清单**：
- 域名 ICP 备案（需企业资质）
- 医疗信息服务备案（部分省份要求）
- 隐私政策页面（`web/src/pages/PrivacyView.vue`）
- 用户协议页面

**工时**：B4 技术部分 4-6h；B5 为行政流程

---

### B6. 申请状态跟踪（C8）

**现状**：`ApplicationsView.vue` 已有进度条 UI（Phase 1 Sprint 中实现），但后端状态变更通知未联通前端。

**涉及文件**：
- `web/src/pages/ApplicationsView.vue` — 增强实时状态
- `server/controllers/application.js` — 添加状态变更通知

**步骤**：
1. 前端：列表页定时刷新（30s 轮询或页面可见时刷新）
2. 前端：状态变更时显示变更时间和操作备注
3. 后端：`updateApplicationStatus` 时记录变更日志到 `notes` JSON 字段
4. 可选：WebSocket 推送状态变更（需 socket.io）

**验收**：管理员变更申请状态后，患者端 30s 内看到更新。

**工时**：3-4h

---

### B7. 用户列表 + 试验 CRUD（H2 / H5）

**现状**：后端已有 `GET /api/admin/users`（分页+筛选）和 `GET /api/admin/trials`（含申请统计）。试验 CRUD 后端未实现。

**涉及文件**：
- `web/src/pages/admin/UsersView.vue` — B1 中创建
- `web/src/pages/admin/TrialsView.vue` — B1 中创建
- `server/controllers/admin.js` — 新增 `updateTrial`, `createTrial`
- `server/routes/index.js` — 新增 `PUT /api/admin/trials/:id`, `POST /api/admin/trials`

**验收**：管理员可查看用户列表（含诊断分布）；可编辑试验状态（recruiting/closed）和基本信息。

**工时**：6-8h

---

## Phase 3：性能 & 可观测性（预计 2-3 周）

### P1. 数据库索引补全

**现状**：`migrate.js` 已创建 7 个索引，但以下关键查询字段缺少索引。

**涉及文件**：
- `server/scripts/migrate.js` — `ensureIndexes()` 函数中添加

**新增索引**：
```sql
-- 复合索引：CRO 看板按试验+状态查申请
CREATE INDEX idx_app_trial_status ON trial_applications(trial_id, status);

-- 复合索引：用户病历查询
CREATE INDEX idx_record_user_status ON medical_records(user_id, status);

-- CRO 登录查询
CREATE INDEX idx_cro_email ON cro_companies(email);

-- 试验适应症文本搜索（全文索引）
ALTER TABLE trials ADD FULLTEXT INDEX ft_indication (indication);
```

**验收**：`SHOW INDEX FROM trial_applications` 显示新索引；CRO 看板查询 < 100ms。

**工时**：1-2h

---

### P2. `normalizeText` 结果缓存

**现状**：`matchEngine.js` 第 12 行 `normalizeText` 在评分循环中被大量重复调用（每个 trial × 每个 record × 多次字段处理）。

**涉及文件**：
- `server/services/matchEngine.js` — 第 11-12 行附近

**步骤**：
1. 在模块顶部创建 LRU 缓存（或简单 Map + 大小限制）：
   ```js
   const _normCache = new Map();
   const normalizeText = (value) => {
     const key = typeof value === 'string' ? value : '';
     if (_normCache.has(key)) return _normCache.get(key);
     const result = safeLower(key).replace(/[\s\-_/\\.,，。；;:：()（）[\]【】]/g, '');
     if (_normCache.size > 10000) _normCache.clear(); // 防内存泄漏
     _normCache.set(key, result);
     return result;
   };
   ```
2. 在 `matchRecordsToTrials` 结束前调用 `_normCache.clear()` 释放内存

**验收**：匹配 100 条试验的请求耗时降低 > 20%（通过 console.time 测量）。

**工时**：1h

---

### P3-P4. Prometheus 指标端点（J8）

**现状**：`server/monitoring/prometheus.yml` 配置抓取 `api:3000/metrics`，但未安装 `prom-client`。

**涉及文件**：
- `server/package.json` — 添加 `prom-client`
- `server/middleware/metrics.js` — **新建**
- `server/routes/index.js` — 注册 `/metrics`
- `server/app.js` — 使用 metrics 中间件

**步骤**：
1. `npm i prom-client`
2. 创建 `server/middleware/metrics.js`：
   ```js
   const { collectDefaultMetrics, Registry, Histogram, Counter } = require('prom-client');
   const register = new Registry();
   collectDefaultMetrics({ register });

   const httpDuration = new Histogram({
     name: 'http_request_duration_seconds',
     help: 'HTTP request duration',
     labelNames: ['method', 'route', 'status'],
     registers: [register]
   });

   const httpErrors = new Counter({
     name: 'http_errors_total',
     help: 'HTTP error count',
     labelNames: ['method', 'route', 'status'],
     registers: [register]
   });

   const middleware = (req, res, next) => { /* 计时逻辑 */ };
   const metricsHandler = async (req, res) => {
     res.set('Content-Type', register.contentType);
     res.end(await register.metrics());
   };

   module.exports = { middleware, metricsHandler };
   ```
3. 在 `app.js` 中 `app.use(metricsMiddleware)`
4. 在 `routes/index.js` 中 `router.get('/metrics', metricsHandler)`

**验收**：`curl localhost:3000/metrics` 返回 Prometheus 格式指标数据。

**工时**：2-3h

---

### P5. Vite 路由懒加载 + 代码分割

**现状**：`web/src/router/index.ts` 第 1-9 行全部使用静态 import（9 个页面）。

**涉及文件**：
- `web/src/router/index.ts` — 修改 import 方式
- `web/vite.config.ts` — 添加 build 配置

**步骤**：
1. 将 `router/index.ts` 中的静态 import 改为动态：
   ```ts
   // Before
   import UploadView from '../pages/UploadView.vue'
   // After
   const UploadView = () => import('../pages/UploadView.vue')
   ```
   保留 `LoginView` 静态 import（首屏需要）
2. 在 `vite.config.ts` 添加 build 优化：
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'vendor': ['vue', 'vue-router', 'pinia', 'axios']
         }
       }
     }
   }
   ```
3. 运行 `npm run build` 对比前后产物大小

**验收**：`dist/assets/` 中出现按路由分割的 chunk 文件；vendor chunk 独立。

**工时**：1-2h

---

### P6. Docker 多阶段构建

**现状**：`server/Dockerfile` 最终镜像包含 `python3`/`pip`/`make`/`g++` 构建工具。

**涉及文件**：
- `server/Dockerfile` — 重构

**目标 Dockerfile**：
```dockerfile
# ---- Build Stage ----
FROM node:18-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 py3-pip make g++
RUN pip3 install --no-cache-dir --break-system-packages markitdown
COPY package*.json ./
RUN npm ci --only=production

# ---- Runtime Stage ----
FROM node:18-alpine
WORKDIR /app
# 只拷贝 Python runtime（不含 pip/make/g++）
RUN apk add --no-cache python3
COPY --from=builder /usr/lib/python3.*/site-packages /usr/lib/python3.*/site-packages
COPY --from=builder /usr/bin/markitdown /usr/bin/markitdown
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p logs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "app.js"]
```

**验收**：`docker images` 显示新镜像比旧镜像小 > 30%；`docker exec` 运行 `markitdown --help` 正常。

**工时**：2h

---

### P7. CSP 移除 `unsafe-inline`

**现状**：`server/app.js` 第 22 行 `scriptSrc: ["'self'", "'unsafe-inline'"]`。

**涉及文件**：
- `server/app.js` — 修改 helmet CSP 配置
- `server/middleware/cspNonce.js` — **新建**（如使用 nonce 方案）

**方案选择**：
- **方案 A（推荐）**：因为 TreatBot 后端是纯 API 服务器（不直接返回 HTML），CSP 实际上主要影响前端。如果前端由 Nginx/Caddy 独立托管，可将 CSP 改为最严格配置：
  ```js
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"]
  ```
- **方案 B**：如后端也 serve 前端资源，使用 nonce：在每个响应中生成随机 nonce 注入 CSP header

**验收**：响应头 `Content-Security-Policy` 不含 `unsafe-inline`。

**工时**：1h（方案 A）/ 3h（方案 B）

---

### P8. 日志聚合

**现状**：Winston 已配置 JSON 格式 + 每日轮换（`server/utils/logger.js`，60 行）。日志写入 `server/logs/`。

**涉及文件**：
- `server/docker-compose.yml` — 添加 Loki/Promtail 或对接 CloudWatch

**方案**（二选一）：
- **Loki + Promtail**：Docker 部署，Promtail 采集 `logs/*.log` → Loki → Grafana 查询
- **CloudWatch**：`npm i winston-cloudwatch`，直接推送到 AWS

**验收**：Grafana 中可搜索 `level:error` 的日志条目。

**工时**：3-4h

---

## Phase 4：增长闭环（预计 3-4 周）

### G1. 可分享匹配报告（E1）

**现状**：无 share 相关路由或控制器。

**涉及文件**：
- `server/controllers/share.js` — **新建**
- `server/routes/index.js` — 新增路由
- `web/src/pages/ShareReportView.vue` — **新建**（公开页面，无需登录）
- `web/src/router/index.ts` — 注册 `/share/:id` 路由

**步骤**：
1. 后端 `POST /api/matches/share`：生成分享 token → 返回 URL
2. 后端 `GET /api/share/:token`：公开接口，返回脱敏匹配报告（隐藏手机号等）
3. 前端 `ShareReportView.vue`：展示匹配结果 + 底部 CTA 引导注册
4. 生成简易二维码（可用 `qrcode` npm 包或前端 canvas）

**验收**：用户点击"分享报告"→ 生成链接 → 新用户打开可看到匹配结果（脱敏）→ 底部引导注册。

**工时**：6-8h

---

### G2. 新用户引导（F1）

**现状**：`UploadView.vue` 已有内联引导（第 4-34 行），但无持久化状态；小程序有 `has_seen_guide` 标记。

**涉及文件**：
- `web/src/pages/UploadView.vue` — 增强引导
- `web/src/components/OnboardingModal.vue` — **新建**

**步骤**：
1. 新建模态引导组件（3-4 步滑动引导）：
   - Step 1：拍照上传病历
   - Step 2：AI 自动识别
   - Step 3：匹配适合的试验
   - Step 4：一键报名
2. 首次访问时展示（`localStorage.getItem('onboarding_done')`）
3. 添加"体验样本病历"按钮：预填一份模拟诊断数据，直接跳到匹配结果展示

**验收**：新用户首次进入 UploadView 时弹出引导；点击"跳过"后不再弹出；"体验样本"可直接看到匹配效果。

**工时**：4-6h

---

### G3. 试验数据定期更新（G1）

**现状**：`importTrials.js` 从本地 `trials_data.json`（87MB）导入，无自动更新。

**涉及文件**：
- `server/scripts/syncTrials.js` — **新建**
- `server/scripts/` — 可能需要爬虫脚本

**方案**：
- **方案 A**：ClinicalTrials.gov API（`https://clinicaltrials.gov/api/v2/studies`），按 `condition` 筛选癌症试验
- **方案 B**：定期从中国临床试验注册中心（ChiCTR）爬取
- **方案 C**：合作方定期提供 Excel → `importTrials.js` 重新导入

**工时**：方案 A/B 需 8-12h；方案 C 需 2h

---

### G4-G7. 其余增长任务

| 任务 | 涉及文件 | 核心工作 | 工时 |
|------|---------|---------|------|
| G4 小程序申请管理 | `pages/profile/applications/` | 对齐 H5 ApplicationsView 的功能 | 4-6h |
| G5 癌种语义扩展 | `server/services/matchEngine.js` DISEASE_PROFILES | 扩展 13→30+ 癌种别名；添加子类型映射 | 3-4h |
| G6 用户行为埋点 | `web/src/utils/analytics.ts` **新建** | 封装埋点函数，关键页面调用 | 4-6h |
| G7 手动补录字段 | `web/src/pages/UploadView.vue` | 在 gap-filling 区域增加 ECOG/治疗线数输入框（schema.ts 已定义） | 2-3h |

---

## Phase 5：规模化准备（预计 3-4 周）

### S1-S7 概要

| 任务 | 核心工作 | 涉及文件 | 工时 |
|------|---------|---------|------|
| S1 Staging 环境 | 复制 docker-compose + .env.staging；域名 staging.inseq.top | `server/docker-compose.staging.yml` **新建** | 4-6h |
| S2 CI/CD 全自动 | deploy.yml 添加 staging→production 两阶段；tag 触发 production deploy | `.github/workflows/deploy.yml` | 4-6h |
| S3 迁移工具 | `npm i sequelize-cli`；将现有 ensureColumn 逻辑迁移为 up/down 格式 | `server/.sequelizerc` **新建**；`server/migrations/` 目录 | 4-6h |
| S4 前端测试 | `npm i -D vitest @vue/test-utils`；覆盖 RecordSummaryCard / ApplicationsView | `web/vitest.config.ts` **新建**；`web/src/__tests__/` | 6-8h |
| S5 新试验提醒 | Bull 定时任务：每日凌晨扫描新增试验 × 用户诊断 → 匹配 → 微信模板消息 | `server/services/queue.js` 扩展 | 6-8h |
| S6 运营数据大盘 | 后台新增 DashboardView（复用 `/api/admin/dashboard`）+ 图表库 | `web/src/pages/admin/DashboardView.vue` | 4-6h |
| S7 收藏/对比 | 新增 `user_favorites` 表；前端收藏按钮 + 对比页面 | `server/models/index.js`；`web/src/pages/FavoritesView.vue` **新建** | 6-8h |

---

## 总工时估算

| 阶段 | 预计工时 | 优先级 |
|------|---------|--------|
| Phase 1 | 14-20h | 最高——质量基线 |
| Phase 2 | 30-40h | 高——商业化前提 |
| Phase 3 | 14-18h | 中——性能与监控 |
| Phase 4 | 24-36h | 中——用户增长 |
| Phase 5 | 35-48h | 低——规模化 |
| **总计** | **117-162h** | — |

> 2 人团队、每人每天 4h 有效编码 → Phase 1-2 约 6-8 周完成。
