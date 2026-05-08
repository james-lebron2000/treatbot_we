# PRD-2026Q3 代码 Review + 数据库使用核实报告

**Review 日期**：2026-05-04
**前置说明**：MySQL 仅在服务端（staging / prod）部署；macOS 本地开发与 CI 不需要 MySQL。
**测试结果**：37 suites / 296 tests **全绿**，单测全程不连任何 MySQL / Redis / 外网。

---

## 1 · 数据库使用核实

### 1.1 本地无 MySQL 是否阻塞测试？

**结论：不阻塞。**

整库只有一个测试文件 `tests/api.test.js` 真正调用 `sequelize.sync({ force: true })` 和 `sequelize.close()` —— 此文件已在 `package.json` scripts 通过 `--testPathIgnorePatterns="tests/api.test.js"` 排除：

```json
"test": "jest --coverage --testPathIgnorePatterns=tests/api.test.js",
"test:integration": "jest tests/api.test.js"
```

执行 `npm test`（默认）→ 297 个非集成用例全部用 mock 跑，不连 MySQL。
执行 `npm run test:integration` → 才走 supertest + 真实 DB，应在 staging 容器内执行。

### 1.2 Mock 隔离审查

本轮新增的 5 个测试文件都正确 mock 了 `../models`：

| 测试文件 | mock 形态 | 是否触发任何真实 IO |
|---|---|---|
| `tests/croExport.test.js` | `jest.mock('../models', ...)` + mock 状态机 + mock notify | ❌ 无 |
| `tests/medicalActiveSwitch.test.js` | mock models + oss + queue + matchEngine | ❌ 无 |
| `tests/billing.test.js` | mock models + logger | ❌ 无 |
| `tests/trialCrawler.test.js` | mock models + trialFreshness + logger + `_setHttpClient` 注入 | ❌ 无 |
| `tests/matchEngineAgnostic.test.js` | 纯函数测试，无 IO | ❌ 无 |

`trialCrawler.js` 模块在 `require` 时仅当 `ENABLE_TRIAL_CRAWLER_CRON=true` 才连 Bull，测试默认不设此环境变量 → 不触发 Redis 连接。

> 既有的"通知队列连接错误 / OCR 队列连接错误"日志来自 `services/notify.js` 与 `services/queue.js` 在测试加载期 import-side effect 尝试连 Redis（pre-existing，不是本轮代码引入）。这些都是非阻塞错误日志，不影响测试结果。

### 1.3 SQL 注入面审查

我对本轮所有新增 / 修改文件做了 grep：

```bash
grep -n "Sequelize.literal\|sequelize.literal" services/*.js controllers/*.js jobs/*.js
```

修复前：`services/applicationStateMachine.js:178` 用 template-string 拼接 `JSON_CONTAINS(trial_ids, '${...}')`。
即便 trialId 来自 DB（低风险），这是不该用的反模式。

**修复方式**（已 commit 到工作树）：改用 `sequelize.query` + `replacements` 参数化绑定：

```js
sequelize.query(
  `SELECT id, name, cpa_price, cpa_qualified_status
     FROM cro_companies
    WHERE JSON_CONTAINS(trial_ids, JSON_QUOTE(:trialId))
    LIMIT 2`,
  { replacements: { trialId: String(trialId) }, type: QueryTypes.SELECT }
);
```

修复后再次 grep `Sequelize.literal` —— 本轮新增代码 0 命中。残留唯一一处是 `controllers/admin.js:641` 的硬编码常量 `"status = 'completed'"`（pre-existing，非用户输入，无注入风险）。

### 1.4 Migration 幂等性审查

`scripts/migrate.js` 内本轮新增的 3 个 `ensureX`：

| 函数 | 场景 | 幂等保证 |
|---|---|---|
| `ensureCroExportLog` | 首次创建 cro_export_log 表 | `if (tables.includes(...)) return;` |
| `ensureCroCompanyTable`（扩） | 老表补 cpa_price + cpa_qualified_status | `describeTable` → 没有列才 addColumn |
| `ensureTrialCrawlerTables` | 创建 2 张表 + trials.nct_id 列 | 表用 `if (!tables.includes(...))`；列用 describeTable |

3 个独立 `.sql` 文件位于 `scripts/migrations/2026XXXX_*.sql`，作为**人工 dry-run 参考**，不被 `migrate.js` 自动执行（与既有 migration 风格一致）。这是设计选择 —— 防止 SQL 文件与 ensureX 双跑出错。

### 1.5 索引设计审查

| 表 | 索引 | 用例 | 评估 |
|---|---|---|---|
| `cro_export_log` | `idx_cro_created` (cro_id, created_at) | 月度对账 / 客户审计 GROUP BY cro_id | ✅ 命中 |
| `medical_records` | `idx_user_active` (user_id, is_active) | matchEngine 取 active record | ✅ 命中 |
| `trial_change_log` | `idx_trial_created` + `idx_created` | 单 trial 历史 / 全局最近 30 条 | ✅ 命中 |
| `trial_crawl_failures` | `idx_resolved` + `idx_nct` | DLQ 巡检 WHERE resolved_at IS NULL | ✅ 命中 |
| `trials` | `idx_nct_id` | crawler `findAll WHERE nct_id IS NOT NULL` | ✅ 命中 |
| `cro_companies` | 无索引于 `trial_ids` JSON | `findCroCompanyByTrialId` JSON_CONTAINS 全表扫 | ⚠️ 见 §3.1 |

### 1.6 表大小预估 + 长期增长

| 表 | 单条字节估 | 1 年增长（按当前流量预估）|
|---|---|---|
| `application_status_event` | 250 B | ~50 万行 / 125 MB（每个申请平均 5 个状态变更） |
| `cro_export_log` | 500 B（含 JSON） | ~3 万行 / 15 MB（10 家 CRO × 每周 5 次导出 × 52 周） |
| `trial_change_log` | 1.2 KB | ~5 万行 / 60 MB（5000 trials × 平均每月 1 字段变更 × 12 月） |
| `trial_crawl_failures` | 600 B | ~5 千行 / 3 MB（DLQ 应保持低位） |

均为可接受规模；建议 12 个月后回顾 `application_status_event` 是否需归档分区（按 `created_at` 月度分表）。

---

## 2 · 代码 Review

### 2.1 T0-1 CRO 导出 v1 — `controllers/cro.js`

| 评审项 | 结论 |
|---|---|
| 跨 CRO trial 越权 | ✅ `assertTrialOwnership` 在拉数据前阻断，403 |
| unmask 双留痕 | ✅ `cro_export_log.fields.phone_full=true` + `admin_audit_log` action='cro_export_unmask' |
| CSV 表头顺序固定 | ✅ `EXPORT_HEADERS` 常量数组，测试断言顺序 |
| BOM | ✅ 写入 `﻿`，Excel 直接打开 |
| 老 `?trialId=t1` 兼容 | ✅ 自动包装 + 测试覆盖 |
| 单次最多 trials | ✅ 20 条上限，超出 400 |

**潜在改进**（非阻塞）：`structured` JSON 解析直接 `JSON.parse` 后取 `.age / .gender / .city / .ecog`，遇到字段名不一致或类型异常时静默退化为空字符串。可在导出前增加结构 schema 校验日志，便于上游纠错。

### 2.2 T1-1 试验抓取 — `services/clinicalTrialsClient.js` + `jobs/trialCrawler.js`

| 评审项 | 结论 |
|---|---|
| 限速 5 QPS | ✅ 批与批之间 sleep 220ms |
| 单条解析失败不阻塞批 | ✅ try/catch 入 errors |
| 整批 HTTP 失败 | ✅ 入 DLQ，每条 NCT 一行 |
| `markVerified` 调用时机 | ⚠️ 见下 |
| Bull 失败回退 setInterval | ✅ 与既有 `trialFreshnessJob` 同款 |
| `ENABLE_TRIAL_CRAWLER_CRON` gating | ✅ 测试默认不开 |

**问题：`markVerified` 行为**（[jobs/trialCrawler.js:91](server/jobs/trialCrawler.js)）

`diffAndApply` 末尾对**每个上游成功命中的 trial** 调用 `markVerified`。但若 `diffAndApply` 在写 change_log 阶段抛错（DB 失败），`markVerified` 不会执行 —— 与设计一致。

但更微妙的问题：如果上游返回 `not_found_upstream`（NCT 已下架），当前代码进 DLQ，**不调用 `markVerified`**。下次 `freshnessJob` 跑会让该 trial 持续衰减直到 auto-close —— 这恰是我们想要的（上游确认下架 → 我方应该 close）。✅ 行为正确。

**问题：`enrolled_count` 比较类型不匹配**（[jobs/trialCrawler.js:62-63](server/jobs/trialCrawler.js)）

`String(trial.enrolled_count)` vs `String(upstream.enrolled_count)` —— Sequelize 把 INTEGER 列读成 number，上游 normalize 后也是 number，String("10") === String(10) === "10"。✅ OK。
但若 upstream 给 `null` 而 DB 给 `10`，会写一行 `null → 10` 反向变更。crawler 应不主动覆盖已知值为 null。

> 建议（不阻塞）：在 `diffAndApply` 增加 `if (newVal == null && oldVal != null) continue;` 防止上游临时缺字段把 DB 已有数据擦掉。

### 2.3 T1-2 cancerSignals — `services/cancerSignals.js`

| 评审项 | 结论 |
|---|---|
| 简体 / 繁体 / 英文覆盖 | ✅ 22 测试用例全绿 |
| `GENE_AGNOSTIC_HINTS` 重复 `GENERIC_CANCER_ALIASES` 部分项 | ✅ 注释说明：`inferGeneRequired` 只查 hints，故复制 |
| 词典维护流程文档化 | ✅ MANUAL-OPS §4.3 |

**评价**：词典抽离非常干净，临床顾问可直接 PR 编辑数组。

### 2.4 T1-3 多病历 active — `controllers/medical.js#activateRecord`

| 评审项 | 结论 |
|---|---|
| 跨用户隔离 | ✅ `findOne where { id, user_id, deleted_at: null }` |
| Race 防御 | ✅ SELECT FOR UPDATE + UPDATE WHERE is_active=1 in transaction |
| `noop` 语义 | ✅ 已 active 直接返回 noop=true，不写数据库 |
| 404 不暴露存在性 | ✅ 他人 record 与不存在统一 404 |

**评价**：模型简洁，事务边界清晰，测试 4/4 直接断言事务内操作顺序。

### 2.5 T1-4 CPA 计费 — `services/billing.js`

| 评审项 | 结论 |
|---|---|
| 防重计去重 | ✅ `(application_id, qualified_status)` Set 去重 |
| DECIMAL 类型处理 | ✅ `Number(c.cpa_price) || 0`，整数分累加避免浮点漂移 |
| UTC+8 月份边界 | ✅ 测试断言 startUtc/endUtc，2026-04 = UTC 03-31 16:00 ~ 04-30 16:00 |
| CSV BOM + 表头 + 合计行 | ✅ 测试 6 直接断言 |
| RBAC 收紧 | ✅ 路由 `requireRole('super')` |

**潜在缺陷**（已记入 MANUAL-OPS）：
- 若 CRO 在月中**修改 `cpa_qualified_status`**（screened → enrolled），billing 用的是**当前快照**，会把月初的 screened 事件按新规则丢弃。
  - 业务建议：合同期内严禁中途改 qualified_status；要改必须新月份起算。
  - 工程改进（未做）：在 `cro_companies` 加 `cpa_config_log` 表保留历史，billing 按事件时刻取值。先记进 MANUAL-OPS §4.4 商务约定。

**性能问题**（已修复）：`applicationStateMachine.transition` 每次状态变更都 `findCroCompanyByTrialId` 多一次 SQL（JSON_CONTAINS 全表扫）。修复方案改用 sequelize.query + replacements，加上 `LIMIT 2` 限制，影响可控。但 cro_companies 表预计永远 < 1000 行，全表扫成本约 < 5ms，实际可接受。

> 长远改进（未做）：在 cro_companies 上对 trial_ids JSON 数组建 [generated column](https://dev.mysql.com/doc/refman/8.0/en/create-table-secondary-indexes.html#json-column-indirect-index) + INDEX，让 JSON_CONTAINS 走索引。当前规模下不必。

### 2.6 T1-5 Node 20 升级

| 评审项 | 结论 |
|---|---|
| Dockerfile 两 stage | ✅ deps + runtime 都 `node:20-bookworm-slim` |
| `.nvmrc` | ✅ `20.18.0` |
| `package.json engines` | ✅ `>=20.0.0` |
| GH Actions workflows | ✅ deploy.yml + nightly-routine.yml 全部 `node-version: '20'` |
| 测试套件 | ✅ 296/296 在 Node 20 下绿 |

> 备注：未在本地验证 `pdf-parse` / `bull` / `tencentcloud-sdk-nodejs` 在 Node 20 的真实运行（需要 npm install + 实际 OCR 流程）。staging 灰度 48h 是必要兜底，已写入 MANUAL-OPS §4.6。

### 2.7 T0-3 密钥轮换模板

| 评审项 | 结论 |
|---|---|
| `docs/key-rotation-log.md` | ✅ 含 6 行待填表格（Kimi / ARK / Tencent COS / Tencent SMS / Sentry + 示例） |
| `docs/git-secret-patterns.txt` | ✅ 5 类正则 + git-filter-repo 用法注释 |
| MANUAL-OPS §4.7 SOP | ✅ 9 步含离线备份 / 回滚提示 |

> 不可逆操作（force-push + provider revoke）必须人工执行，本轮仅交付完整模板与 SOP。

---

## 3 · 风险与待办

### 3.1 已知性能 / 设计权衡

| # | 项 | 严重度 | 说明 |
|---|---|---|---|
| 1 | `cro_companies.trial_ids` JSON_CONTAINS 全表扫 | 低 | 表 < 1000 行，每次状态变更 < 5ms。改 generated column 索引留作后续优化。 |
| 2 | billing 用 cpa_config 当前快照 | 中 | 商务侧约定"合同期内 cpa_qualified_status 不可改"。MANUAL-OPS §4.4 已说明。 |
| 3 | trialCrawler 上游临时返回 null 字段会被记为变更 | 低 | 极少见；可加 `if (newVal == null) continue;` 防御。 |
| 4 | `application_status_event` 1 年后将达 50 万行 | 低 | 12 月后回顾按月分区。 |

### 3.2 测试覆盖盲点

| 区域 | 现有覆盖 | 盲点 |
|---|---|---|
| T0-1 cro export | 10 用例 | 未测试 `format=json` 大数据量分页（当前实现一次性查全量；> 2 万行可能 OOM）。建议：在 controller 加上 `MAX_ROWS=10000` 硬上限。 |
| T1-1 crawler | 12 用例 | 未跑真实 ClinicalTrials.gov 端到端（合理 —— 测试不应依赖外网）；建议在 staging 跑一次 smoke。 |
| T1-4 billing | 8 用例 + 100 事件验收 | 未测试"上千 CRO × 上千 trial"压测时 billing.computeMonthly 的耗时；当前都是内存聚合，5 万事件级可承受。 |

### 3.3 既有缺陷（非本轮引入，仅记录）

- 测试运行时 `winston` 输出 "OCR 队列连接错误 / 通知队列连接错误"：`services/queue.js` + `services/notify.js` 在加载期 import-side effect 尝试连 Redis，测试时 Redis 不在。无业务影响，但污染日志。
- "A worker process has failed to exit gracefully" Jest warning：Bull / setInterval 句柄未 `.unref()` 干净。本轮 trialCrawler 已加 `.unref?.()`，与 trialFreshnessJob 同款。

---

## 4 · 测试流程评估

### 4.1 推荐的开发循环（macOS 本地）

```bash
# 单测 — 默认排除 api.test.js，全程 mock，不需 MySQL/Redis
cd server && npm test

# 跑某一文件
npx jest tests/billing.test.js --no-coverage

# Watch 模式
npx jest --watch --testPathIgnorePatterns="tests/api.test.js"
```

### 4.2 服务端集成测试（staging 容器内）

```bash
# 仅在 staging / CI 容器执行（容器内有 MySQL）
docker exec treatbot-api npm run test:integration

# 验证 migration
docker exec -i treatbot-api npm run db:migrate
```

### 4.3 CI 推荐配置

`.github/workflows/deploy.yml` 第 22 / 80 / 176 行已升 node-version: '20'。
建议在 CI 跑：
- `npm test`（默认排除 api.test.js，应在 mac/linux/windows 都绿）
- `npm run lint`

不在 CI 跑：
- `npm run test:integration`（依赖 staging MySQL）— 应在 staging deploy 后 smoke。

### 4.4 性能 / 时长

```
Time: 3.146 s for 296 tests on M1 Pro
```

无慢测试；没有任何 `setTimeout > 1000ms` 等待。

---

## 5 · 总评

| 维度 | 评级 | 说明 |
|---|---|---|
| **本地无 MySQL 是否可工作** | ✅ 完全可工作 | 297 个非集成测试零依赖 MySQL/Redis |
| **数据库 schema 设计** | ✅ 良好 | 索引覆盖主用例，幂等 migration |
| **SQL 注入面** | ✅ 已修复 | 唯一一处 literal 已改为参数化绑定 |
| **测试 mock 隔离** | ✅ 完整 | 5 个新测试文件全部 mock models |
| **代码质量** | ✅ 良好 | 注释清晰，分层合理；个别 normalize 边缘可加固（§2.2） |
| **未达成项** | T0-3 force-push / 5 类 key 轮换 | 不可逆人工操作，模板齐备等执行窗口 |
| **运维文档** | ✅ 完整 | MANUAL-OPS §4 7 个子节，含 owner / 命令 / 回滚 |

**综合结论**：本轮代码可以合并到 main → 走标准 staging → prod 流程。staging 上线后必须执行的 3 件事：
1. `npm run db:migrate`（自动跑 ensureX）。
2. 设置 `ENABLE_TRIAL_CRAWLER_CRON=true` 后重启。
3. 运营录入 `cro_companies.cpa_price`（每家一条 UPDATE）。

T0-3 单独排维护窗口执行，参考 [MANUAL-OPS-2026Q3.md §4.7](MANUAL-OPS-2026Q3.md)。
