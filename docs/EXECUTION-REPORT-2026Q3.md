# PRD-2026Q3 工作执行报告

**周期**：2026Q3 红线 + P1 任务
**完成日**：2026-05-04
**测试结果**：37 suites / 296 tests **全绿**（不含 `tests/api.test.js`，需本地 MySQL）

---

## 1 · 完成任务清单

| 任务 | 优先级 | 状态 | 关键交付物 | 测试 |
|---|---|---|---|---|
| **T0-1** CRO 导出 v1（多 trial / 状态 / 日期窗 / unmask 审计） | P0 | ✅ | `controllers/cro.js` + `cro_export_log` + `utils/croOwnership.js` | `tests/croExport.test.js` 10/10 |
| **T1-3** 多病历 active 切换 | P1 | ✅ | `medical_records.is_active` + `activateRecord` API + match.js fallback | `tests/medicalActiveSwitch.test.js` 4/4 |
| **T1-2** 泛瘤种识别加固（多语词典） | P1 | ✅ | `services/cancerSignals.js`（简/繁/英 + bio-marker） | `tests/matchEngineAgnostic.test.js` 22/22 |
| **T1-4** CPA 计费埋点 + 月度对账 | P1 | ✅ | `services/billing.js` + `cro_companies.cpa_price` + `GET /admin/billing/summary` + `cro_qualified_lead_total` 计数器 | `tests/billing.test.js` 8/8 |
| **T1-1** 试验数据每日抓取 | P1 | ✅ | `services/clinicalTrialsClient.js` + `jobs/trialCrawler.js` + `trial_change_log` + `trial_crawl_failures` DLQ | `tests/trialCrawler.test.js` 12/12 |
| **T1-5** Node 20 LTS 升级 | P1 | ✅ | `Dockerfile` 两 stage + `.nvmrc` + `package.json engines` + 3 个 GH Actions workflow | （依赖现有套件） |
| **T0-3** 历史密钥清理 + 全量轮换 | P0 | 🟡 文档/模板就绪，等待操作窗口 | `docs/key-rotation-log.md` + `docs/git-secret-patterns.txt` + MANUAL-OPS §4.7 完整 SOP | — |

> T0-3 的 force-push + provider 控制台轮换属于不可逆人工操作，不能在自动化迭代中执行。已交付完整 SOP、`patterns.txt` 替换规则、`key-rotation-log.md` 待填模板。等运维 / 安全 leader 公告维护窗口后按文档执行。

---

## 2 · 数据库变更总览

新建表（5）：
- `cro_export_log`（T0-1）
- `application_status_event`（T0-2 已上 PR）
- `trial_change_log`（T1-1）
- `trial_crawl_failures`（T1-1）

新增列：
- `medical_records.is_active`（T1-3）
- `cro_companies.cpa_price` + `cpa_qualified_status`（T1-4）
- `trials.nct_id`（T1-1）
- `admin_audit_log.role`（T1-6）

新增索引：
- `idx_trial_status_created` on trial_applications
- `idx_user_active` on medical_records
- `idx_cro_created` on cro_export_log
- `idx_trial_created`, `idx_created` on trial_change_log
- `idx_resolved`, `idx_nct` on trial_crawl_failures
- `idx_nct_id` on trials

所有 migration 通过 `scripts/migrate.js` 内的 `ensureX` 函数 idempotent 上线，重复执行不会误删/重建。SQL 文件位于 `scripts/migrations/2026XXXX_*.sql`，作为人工 dry-run 参考。

---

## 3 · 新增 API 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| PUT | `/api/medical/records/:id/activate` | user | T1-3 切换 active 病历 |
| GET | `/api/admin/billing/summary?month=YYYY-MM&format=csv\|json` | super 角色 | T1-4 CPA 月度对账 |

CRO 导出 v1（T0-1）复用现有 `GET /api/cro/exports/applications` 路径，扩展为多 trial / 多状态 / 时间窗 / unmask 模式，向后兼容旧 `?trialId=t1`。

`GET /api/admin/trials/health` 行为扩展：返回值新增 `recentChanges[]` 字段（最近 30 条 trial_change_log）。

---

## 4 · 新增 Prometheus 指标

| 指标 | 类型 | 标签 | 用途 |
|---|---|---|---|
| `cro_qualified_lead_total` | Counter | `cro_id`, `trial_id` | T1-4 实时观测合格线索流；对账以 DB 为准 |

Grafana 推荐查询：`sum by (cro_id) (rate(cro_qualified_lead_total[1h]))` 看每家 CRO 当前小时新增合格线索速率。

---

## 5 · 测试覆盖明细

```
PASS tests/croExport.test.js              10/10 — T0-1 CRO 导出（含 unmask 双留痕、403 边界、CSV 格式）
PASS tests/medicalActiveSwitch.test.js     4/4 — T1-3 SELECT FOR UPDATE 串行 + 跨用户隔离
PASS tests/matchEngineAgnostic.test.js    22/22 — T1-2 多语词典 + matchEngine 回归（8 baseline + 14 新）
PASS tests/billing.test.js                 8/8 — T1-4（含验收用例：100 status_event 手算 vs API 100% 一致）
PASS tests/trialCrawler.test.js           12/12 — T1-1（client.fetchByNctIds + diffAndApply + run + DLQ）
PASS （其他 32 个 suites）                  240+/240+ — 既有功能无回归
---
Test Suites: 37 passed, 37 total
Tests:       296 passed, 296 total
Time:        3.764 s
```

`tests/api.test.js`（端到端 supertest，依赖本地 MySQL）按 CI 配置已被 `--testPathIgnorePatterns` 排除，需本地起 MySQL 后单独跑。

---

## 6 · 代码 Review 自检要点

### 安全 / 防滥用
- T0-1 unmask 双留痕：`cro_export_log.fields.phone_full=true` + `admin_audit_log` 一条 `cro_export_unmask` 记录。
- T0-1 跨 CRO 数据访问：`assertTrialOwnership` 在 controller 层拒绝任何 trial 不在 `req.croCompany.trial_ids` 的请求 → 403。
- T1-3 跨用户隔离：`MedicalRecord.findOne({ where: { id, user_id: req.userId, deleted_at: null } })` 任何他人 record → 404（不暴露存在性）。
- T1-3 race：SELECT FOR UPDATE + UPDATE WHERE is_active=1 在事务内，避免 MySQL 无 partial unique index 时的并发双 active。
- T1-4 RBAC：`/admin/billing/summary` 强制 `requireRole('super')`，含金额属于敏感数据。
- T1-4 防重计：同一 application 反复在 qualified_status 来回切，仅第一次入账（去重 key = `application_id|qualified_status`）。

### 韧性 / 容错
- T1-1 crawler：单条解析失败入 DLQ 不阻塞批；整批 HTTP 失败也只把当批的 NCT 入 DLQ，不影响后续批。
- T1-1 cron：Bull repeatable + setInterval 兜底，与 `trialFreshnessJob` 同套调度模式。
- T1-4 metric：transition() 内的 prom-client inc 全程 try/catch，永远不能因为埋点失败影响业务。
- 所有 idempotent migration（`ensureX`）：DESC 表前先检查列存在，重复执行无副作用。

### 兼容性
- T0-1 旧 `?trialId=t1` 仍可工作（自动包装成 `trialIds: ['t1']`）。
- T1-3 `match.js` 在没有 active record 的旧用户场景下 fallback 到全量 completed records，避免空匹配。
- T1-1 `trials.nct_id` 为可空，老数据没填不会被抓取，回填进度自身是渐进式的。

### 文档
- `docs/MANUAL-OPS-2026Q3.md` §4 6 个子节，每个已交付任务都标 owner / 命令 / 回滚要点。
- `docs/key-rotation-log.md` + `docs/git-secret-patterns.txt` 为 T0-3 提供模板与替换规则。

---

## 7 · 仍待处理 / 后续

| 项 | 类型 | 备注 |
|---|---|---|
| T0-3 force-push + 5 类 key 轮换 | 不可逆人工操作 | SOP 完整，需安全 leader 公告窗口；MANUAL-OPS §4.7 |
| T1-1 trial.nct_id 存量回填 | 一次性 SQL | 运营从注册库导 (trial_id, nct_id) 对照；MANUAL-OPS §4.5 step 2 |
| T1-3 is_active 存量回填 | 一次性 SQL | prod 上线时跑；MANUAL-OPS §4.2 step 1 |
| T1-4 CRO cpa_price 录入 | 商务 / 财务录入 | 每家 CRO 一条 UPDATE；MANUAL-OPS §4.4 step 1 |
| T1-5 staging 48h 灰度 | 部署 | 保留 `:node18-rollback` 镜像；MANUAL-OPS §4.6 step 4 |
| T1-1 DLQ 巡检 SOP | 每日运营 | MANUAL-OPS §4.5 step 3 |
| T1-2 词典维护流程 | 临床顾问 + 产品 | 走 PR review，每条新增必须配测试用例；MANUAL-OPS §4.3 |

---

## 8 · 文件清单

### 新增
```
server/services/cancerSignals.js
server/services/billing.js
server/services/clinicalTrialsClient.js
server/services/applicationStateMachine.js   (T0-2 已上 PR)
server/services/notify.js                    (T0-2 配套)
server/jobs/trialCrawler.js
server/utils/croOwnership.js
server/middleware/auditLog.js                (T1-6 配套)
server/scripts/migrations/20260504_cro_export_log.sql
server/scripts/migrations/20260504_trial_apps_index.sql
server/scripts/migrations/20260505_application_status_event.sql
server/scripts/migrations/20260518_trial_change_log.sql
server/scripts/migrations/20260518_trial_crawl_failures.sql
server/scripts/migrations/20260520_medical_records_active.sql
server/scripts/migrations/20260522_cpa_pricing.sql
server/scripts/migrations/20260525_admin_audit_log_role.sql
server/.nvmrc
server/tests/croExport.test.js
server/tests/medicalActiveSwitch.test.js
server/tests/billing.test.js
server/tests/trialCrawler.test.js
server/tests/applicationStateMachine.test.js (T0-2)
server/tests/adminRbac.test.js               (T1-6)
docs/MANUAL-OPS-2026Q3.md                    (§4 全章重写)
docs/key-rotation-log.md
docs/git-secret-patterns.txt
docs/EXECUTION-REPORT-2026Q3.md              (本文档)
```

### 修改
```
server/Dockerfile                  (node:18 → 20，两 stage)
server/package.json                (engines >= 20.0.0)
server/app.js                      (注册 trialCrawler cron)
server/controllers/cro.js          (T0-1 export v1)
server/controllers/admin.js        (T1-4 getBillingSummary)
server/controllers/medical.js      (T1-3 activateRecord)
server/controllers/match.js        (按 is_active 查询)
server/middleware/metrics.js       (cro_qualified_lead_total)
server/middleware/adminAuth.js     (T1-6 requireRole)
server/models/index.js             (CroExportLog/TrialChangeLog/Failure + cpa 字段)
server/models/trial.js             (nct_id)
server/routes/index.js             (新路由)
server/scripts/migrate.js          (4 个 ensureX 函数)
server/services/matchEngine.js     (改用 cancerSignals)
server/services/trialFreshness.js  (recentChanges)
.github/workflows/deploy.yml       (node 20)
.github/workflows/nightly-routine.yml (node 20)
```

---

## 9 · 验收 checklist 对照

| PRD 项 | 验收口径 | 结果 |
|---|---|---|
| T0-1 | unmask 必产生 admin_audit_log 一行 + cro_export_log 一行（fields.phone_full=true） | ✅ 测试 6 直接断言 |
| T1-3 | 同用户多 record 任意时刻最多一条 is_active=1 | ✅ 测试 3（事务串行 + UPDATE WHERE is_active=1） |
| T1-2 | 5 试验 × 3 患者矩阵 15/15 全命中（多语种） | ✅ 测试 22/22，含繁体 / 英文 / bio-marker |
| T1-4 | mock 100 status_event，summary 数字与 SQL 手算一致 | ✅ 测试 5 直接验收 |
| T1-1 | ≥1 条 closed 试验自动 recruiting → closed | ✅ 测试 "正常一轮：closed 试验自动..." |
| T1-1 | DLQ 入表 | ✅ 测试 "整批 HTTP 失败" + "上游缺失 NCT" |
| T1-5 | Dockerfile 两 stage 改 node:20 | ✅ |

---

**结论**：T0-1 / T1-1 / T1-2 / T1-3 / T1-4 / T1-5 共 6 项已落地代码 + 测试 + 文档；T0-3 输出完整 SOP 与模板，等待运维窗口执行。所有自动化测试 296/296 全绿。
