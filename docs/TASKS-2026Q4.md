# Treatbot 2026 Q4 — 任务清单（产品质量修复·细化版）

> 与 [docs/PRD-2026Q4.md](PRD-2026Q4.md) 一一对应。
> 每条任务包含：**修改项 · 实施步骤 · 验收标准 · 测试矩阵 · 监控埋点 · 工时 · 依赖**。
> 状态：⬜ 未开始 / 🔄 进行中 / ✅ 已完成 / 🚫 阻塞
> 工时：S ≤ 1d / M = 2-3d / L = 4-5d / XL ≥ 6d
> 共识来源：PM / 医学 / QA 三方独立审阅 + 两轮辩论收敛

---

## 0. 任务索引

| 编号 | 任务 | 工时 | 依赖 | Sprint |
|---|---|---|---|---|
| Q4-T0-1 | trialCrawler null 覆盖防护 | M (3d) | — | W1 |
| Q4-T0-2 | CRO–trial–site 归属重建 | XL (10d) | — | W2-W9 灰度 |
| Q4-T0-3 | CPA 计费版本快照 | L (5d) | T0-2 部分 | W3 |
| Q4-T0-4 | 状态机 transition / touchpoint 拆分 + ICF | L (5d) | — | W2 |
| Q4-T0-5 | 申请去重（30 天 + 并发安全） | M (2d) | — | W2 |
| Q4-T0-6 | trial 状态变化匹配缓存失效 + 复活重匹配 | L (5d) | — | W3 |
| Q4-T0-7 | NCT/手机/身份证强校验 + 归一化 | M (3d) | — | W1 |
| Q4-T0-8 | OCR 双置信度阈值 + biomarker 强制人工 | XL (8d) | — | W3-W4 |
| Q4-T0-9 | 用户端申请时间线 | M (4d) | T0-4 | W4 |
| Q4-T0-10 | 转化漏斗埋点基础设施 | L (5d) | — | W1 |
| Q4-T0-11 | 集成 CI 必跑 + 心跳自检 + schema diff | M (3d) | — | W1 |

---

## 1. P0 — Sprint W1（5/5 – 5/11）：测试基础设施 + 漏斗埋点 + 快速防御

### Q4-T0-11 · 集成 CI 必跑 + 心跳自检 + schema diff

**状态**：⬜ | **工时**：M (3d) | **优先级**：P0 前置（其它任务的回归保护前提）

**修改项**
- `.github/workflows/deploy.yml` —— 拆分 fast / slow 两条 job
- `.github/workflows/nightly-routine.yml` —— 增加 full e2e
- `server/tests/api.test.js` —— 改为 CI 必跑（移除 `--testPathIgnorePatterns`）
- `server/scripts/test/setup-isolated-schema.js` —— 每 PR 独立 schema 工具
- `server/middleware/metrics.js` —— 新增 heartbeat counter
- `server/jobs/metricsHeartbeat.js` —— 每分钟自增
- 新增 `.github/workflows/schema-diff.yml`
- 新增 `server/scripts/db/schema-dump.sh`

**实施步骤**
1. CI workflow 改造：
   ```yaml
   jobs:
     fast:    # 必须 blocking
       steps: [lint, jest --testPathIgnorePatterns=tests/api.test.js, ~3s]
     slow:    # required-but-non-blocking
       services: [mysql, redis]
       steps: [migrate + jest tests/api.test.js, ~3min]
       on-failure: open-issue + slack-oncall + auto-revert-after-30min
   ```
2. 每 PR 独立 schema：`treatbot_test_${PR_NUM}_${SHA}`，结束 drop
3. fixture 用 `truncate ... restart identity cascade`，不要 drop/create
4. jest 配置：
   - `--testRetries=2`
   - `jest.useFakeTimers()` 强制时间相关用例
   - nock 强制 + `nock.disableNetConnect()`
5. heartbeat counter：
   ```js
   const metricsHeartbeat = new client.Counter({
     name: 'metrics_self_check_heartbeat_total',
     help: 'metric pipeline 心跳，absent >2min 触发告警'
   });
   setInterval(() => metricsHeartbeat.inc(), 60 * 1000);
   ```
6. Alertmanager 规则：`absent(metrics_self_check_heartbeat_total[5m]) → P1`
7. schema diff job：
   - 拉 prod replica → `pg_dump --schema-only > prod.sql`（或 `mysqldump --no-data`）
   - 跑 migrations → dump test schema
   - `migra prod.sql test.sql --unsafe` 或 `mysqldiff`
   - 输出 drift → CI fail
8. squawk lint 危险迁移：无 `IF NOT EXISTS`、加锁列、长事务

**验收标准**
- ✅ 任何 PR 必须 fast + slow 两条都绿才能合
- ✅ fast 平均 < 5s
- ✅ slow 平均 < 5min
- ✅ Grafana 上 heartbeat 永远不断（断 → 2min 内 alert）
- ✅ schema diff 单日 cron 100% 跑过
- ✅ 故意挂掉 prom-client → alert 在 2min 内触发（演练）
- ✅ 同一用例连续 flaky 3 次 → 自动 `@flaky` + 发 issue

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 集成 | api.test.js 跑过 + 1 条故意失败的 PR 看 slow 流水线 fail |
| 监控 | 杀 metrics 进程 → 验证 alert 触发时间 ≤ 2min |
| schema diff | 故意写一条与 prod 不一致的 migration → CI fail |
| flakiness | 注入随机 flaky 用例 → 验证 @flaky 标签自动加 |

**监控埋点**
- `metrics_self_check_heartbeat_total`（counter）
- `ci_pipeline_duration_seconds{stage=fast|slow}`
- `schema_drift_detected_total`

**成本估算**
- 月预算 < 100 USD（GitHub Actions 0.008 USD/min × 180 min/天 ≈ 43 USD/月 + nightly 7 USD）

---

### Q4-T0-10 · 转化漏斗埋点基础设施

**状态**：⬜ | **工时**：L (5d) | **优先级**：P0 前置（量化所有后续修复效果）

**修改项**
- 新建 migration `20260512_funnel_event.sql`
- 新建 `server/models/FunnelEvent.js`
- 新建 `server/services/funnelTracker.js` —— 异步队列 + dedupe key
- [server/services/applicationStateMachine.js](../server/services/applicationStateMachine.js) —— 状态变更后写 funnel_event
- [server/jobs/trialCrawler.js](../server/jobs/trialCrawler.js)、`controllers/medical.js` —— 各业务点埋点
- Bull 队列 `funnel_event_queue` + DLQ
- 新增 Metabase 看板（外部配置，不在仓库）

**实施步骤**
1. PM 文档明确 8 个事件 + 必填字段：
   ```
   medical_uploaded { user_id, record_id, ocr_started_at }
   match_shown      { user_id, trial_ids[], score_distribution }
   application_submitted { user_id, application_id, trial_id, site_id_suggested }
   cro_contacted    { user_id, application_id, cro_id, contact_channel, attempt_no }
   screened         { user_id, application_id, passed }
   enrolled         { user_id, application_id, randomization_id }
   rejected         { user_id, application_id, reason_code, reason_layer=internal|external }
   withdrawn        { user_id, application_id, withdrawn_by, reason_code }
   ```
2. funnel_event 表：
   ```sql
   CREATE TABLE funnel_event (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     event_name VARCHAR(64) NOT NULL,
     user_id VARCHAR(64),
     entity_id VARCHAR(64),  -- application_id 或 record_id
     payload JSON,
     occurred_at DATETIME(6) NOT NULL,
     dedupe_key VARCHAR(128) UNIQUE,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_event_occurred (event_name, occurred_at),
     INDEX idx_user_event (user_id, event_name)
   );
   ```
3. Bull 队列异步写入，dedupe key = `${event_name}:${user_id}:${entity_id}:${minute_truncated}`
4. funnelTracker.track() 接口：所有业务点统一调用
5. 失败回退：DLQ + 每日巡检
6. Metabase 预置 SQL：
   - 漏斗 1：上传 → 匹配 → 提交 → 联系 → 筛选 → 入组（每步留存率）
   - 漏斗 2：CRO ROI（按 cro_id 聚合）
   - 漏斗 3：适应症转化（按 trial.disease_area 聚合）

**验收标准**
- ✅ 8 个事件全部有数据流入（手工跑一遍流程，funnel_event 出现 8 行）
- ✅ Metabase 看板能算出"上传→提交"和"联系→入组"两条漏斗
- ✅ `funnel_event_lag_seconds` p95 < 30s
- ✅ dedupe 重复率 < 0.1%
- ✅ DLQ 每日待处理 < 10 条

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | 每个 track() 调用断言 dedupe_key 正确 |
| 集成 | 重放 100 条 event → 100 条入库（无重复） |
| 数据 | 抽样 1000 条比对 application_status_event vs funnel_event 一致性 |

**监控埋点**
- `funnel_event_lag_seconds`（histogram）
- `funnel_event_drop_total{reason=dedupe|dlq|error}`
- `funnel_event_total{event_name}`

---

### Q4-T0-7 · NCT / 手机 / 身份证强校验 + 归一化

**状态**：⬜ | **工时**：M (3d) | **优先级**：P0（指标失真根因）

**修改项**
- [server/models/trial.js](../server/models/trial.js) —— `nct_id` 加 validate `/^NCT\d{8}$/`
- 新建 migration `20260513_nct_id_check.sql` —— `ALTER TABLE trials ADD CONSTRAINT chk_nct_format CHECK (nct_id REGEXP '^NCT[0-9]{8}$')`
- 新建 `server/utils/normalize.js`：normalizePhone / normalizeIdCard
- 新建 middleware `server/middleware/normalizePii.js` —— user 表 INSERT/UPDATE 前置
- 新建脚本 `server/scripts/oneoff/scan-duplicate-users.js` —— 历史扫描
- 新建表 `user_dedup_candidates(user_a_id, user_b_id, similarity_score, fields_match)` —— 待运营人工合并
- 新增 admin endpoint `POST /api/admin/users/merge`
- 新增 metrics

**实施步骤**
1. `normalizePhone(s)`：
   - 去全角空格 / 半角空格 / 连字符 / 括号
   - 去 `+86` / `0086` / `86`（仅当后续是 11 位）
   - 校验 `^1[3-9]\d{9}$`，失败抛 ValidationError
2. `normalizeIdCard(s)`：
   - 去空格 / 字母统一大写
   - 校验位算法（GB 11643-1999）
   - 失败抛 ValidationError
3. 中间件：
   ```js
   if (req.body.phone) req.body.phone = normalizePhone(req.body.phone);
   if (req.body.id_card) req.body.id_card = normalizeIdCard(req.body.id_card);
   ```
4. Property-based 单测（fast-check）：
   ```js
   fc.assert(fc.property(fc.string(), s => {
     const noisy = inject(s, [' ', '　', '-', '+86']);
     expect(normalizePhone(noisy)).toBe(normalizePhone(s));
   }));
   ```
5. 历史扫描脚本：
   - SELECT 所有 user，按 normalize 后 phone / id_card 分组
   - 同一归一化值 ≥2 条 → 写 user_dedup_candidates
   - 输出 CSV 供运营初审
6. NCT ID DB CHECK：
   - migration 增加 CHECK 约束
   - 同步加 application 层 validate
7. 错误信息：用户友好化（"手机号格式不正确，请重新输入"），不暴露正则

**验收标准**
- ✅ 形如 `+86 138 0013 8000` / `13800138000` / `138-0013-8000` 入库后等于同一字符串
- ✅ 形如 `nct00000001`、`NCT 00000001`、`NCT00000001\n` 全部被拒绝（HTTP 422）
- ✅ 历史扫描产出 user_dedup_candidates 表，运营手工合并 N 条（具体数字看历史数据）
- ✅ Property-based 测试 1000 条随机噪声归一化收敛
- ✅ 灰度后 `pii_normalize_fix_total` 趋零

**测试矩阵**
| 类型 | 用例 |
|---|---|
| Property-based 单测 | 1000 条随机噪声手机号归一化收敛 |
| 单测 | id_card 校验位算法（含闰年/非闰年/X 校验位） |
| 集成 | 同号 3 种格式 INSERT → unique 约束触发 |
| 数据迁移 | dry-run + 历史 100 万行扫描耗时 < 10 min |

**监控埋点**
- `pii_normalize_fix_total{field=phone|id_card}` —— 灰度后归零
- `nct_id_invalid_total{source=user|crawler|migration}`
- `user_dedup_merge_total`（运营操作埋点）

---

### Q4-T0-1 · trialCrawler null 覆盖防护

**状态**：⬜ | **工时**：M (3d) | **优先级**：P0（Grade 4 患者安全）

**修改项**
- [server/jobs/trialCrawler.js](../server/jobs/trialCrawler.js) `diffAndApply()` —— null 守门 + suspect 标记
- [server/services/clinicalTrialsClient.js](../server/services/clinicalTrialsClient.js) —— 区分上游显式 null vs 字段缺失
- 新建 migration `20260512_trial_field_change_review.sql`
- 新建 `server/models/TrialFieldChangeReview.js`
- 新建 admin endpoint `GET /api/admin/trials/field-review` —— 待复核队列
- 新增 metric `crawler_field_null_total{field}`

**实施步骤**
1. ClinicalTrialsClient 改造：
   - 解析时区分 `field === null`（上游显式空）vs `field === undefined`（字段缺失）
   - 输出标记 `null_source: 'explicit' | 'missing'`
2. diffAndApply 守门：
   ```js
   for (const field of CRAWLED_FIELDS) {
     const newVal = upstream[field];
     const oldVal = trial[field];
     if (newVal == null && oldVal != null) {
       // 不覆盖，写 suspect 队列
       await TrialFieldChangeReview.create({
         trial_id, field, old_value: oldVal,
         new_value: null, null_source: upstream.null_source[field],
         change_kind: 'suspect_null_from_upstream',
         status: 'pending'
       });
       continue;
     }
     if (newVal !== oldVal) {
       changes[field] = { from: oldVal, to: newVal };
     }
   }
   ```
3. 表结构：
   ```sql
   CREATE TABLE trial_field_change_review (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     trial_id VARCHAR(64) NOT NULL,
     field VARCHAR(64) NOT NULL,
     old_value JSON,
     new_value JSON,
     null_source ENUM('explicit', 'missing'),
     change_kind VARCHAR(32),
     status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
     reviewer_id VARCHAR(64),
     reviewed_at DATETIME,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_status_created (status, created_at)
   );
   ```
4. admin 工作台：列表 + 单条审批（approved → 写入 trial 表 + 关闭 review；rejected → 仅关闭 review）

**验收标准**
- ✅ 任何 `enrolled_count / phase / overall_status / locations` 字段从有值变 null 不进 trials 表
- ✅ trial_field_change_review 出现 `change_kind='suspect_null_from_upstream'` 行
- ✅ admin 工作台可处理待复核
- ✅ `crawler_field_null_total` 单字段 null 率 < 5%

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | mock 上游返回 null（explicit + missing 两种），断言 trials 表字段未变 + suspect log 写入 |
| 集成 | 真录像回放 ClinicalTrials.gov fixture（QA 录 100 条 NCT），跑一轮 → null 率统计 |
| e2e | admin 工作台审批 1 条 → trial 表更新；驳回 1 条 → trial 不变 |

**监控埋点**
- `crawler_field_null_total{field, null_source}` —— alert 单字段 null 率 >10% / 1h
- `trial_field_review_pending_total` —— alert > 30
- `trial_field_review_resolution_time_seconds` histogram

---

## 2. P0 — Sprint W2-W3（5/12 – 5/25）：核心建模 + 状态机

### Q4-T0-2 · CRO–trial–site 归属重建（XL，跨 9 周灰度）

**状态**：⬜ | **工时**：XL (10d 开发 + 9 周灰度) | **优先级**：P0（商务事故防御）

**修改项**
- 新建 migration `20260513_cro_trial_ownership.sql` + `20260513_trial_sites.sql`
- 新建 `server/models/CroTrialOwnership.js` + `TrialSite.js`
- 新建 `server/services/croOwnershipResolver.js`
- 新建 `server/scripts/migrations/20260513_migrate_trial_ids_json_to_ownership.js`（dry-run + 三态校验 + down 脚本）
- [server/services/applicationStateMachine.js](../server/services/applicationStateMachine.js) —— 替换 `findCroCompanyByTrialId`
- [server/services/billing.js](../server/services/billing.js) —— 按 site 维度归属
- 新增 status `pending_geo_review`
- 新增 admin endpoint `POST /api/admin/cro-ownership/claim`（带乐观锁版本号）
- 新增 metric `application_owner_assign_total{strategy}` + `cro_ownership_shadow_diff_total`

**实施步骤**
1. Schema：
   ```sql
   CREATE TABLE trial_sites (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     trial_id VARCHAR(64) NOT NULL,
     site_name VARCHAR(255) NOT NULL,
     city VARCHAR(64),
     province VARCHAR(64),
     address VARCHAR(512),
     lat DECIMAL(10,7),
     lng DECIMAL(10,7),
     is_active BOOLEAN DEFAULT TRUE,
     INDEX idx_trial_active (trial_id, is_active),
     SPATIAL INDEX idx_geo (POINT(lng, lat))
   );

   CREATE TABLE cro_trial_ownership (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     cro_id VARCHAR(64) NOT NULL,
     trial_id VARCHAR(64) NOT NULL,
     site_id BIGINT NOT NULL,
     effective_from DATETIME NOT NULL,
     effective_to DATETIME,
     version INT NOT NULL DEFAULT 1,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_site_effective (site_id, effective_from),
     INDEX idx_active (trial_id, site_id, effective_to)
   );
   ```
2. resolveCroForApplication() 三步路由：
   ```js
   async function resolve(userCity, trialId, submittedAt) {
     const sites = await getActiveSites(trialId, submittedAt);
     if (sites.length === 0) return { error: 'NO_ACTIVE_SITE' };
     const nearestSite = pickNearestByCity(sites, userCity);
     if (!nearestSite || nearestSite.distance_km > 500) {
       return { status: 'pending_geo_review', site_candidates: sites.slice(0, 3) };
     }
     const owner = await getOwnerAt(nearestSite.id, submittedAt);
     return { site_id: nearestSite.id, cro_id: owner.cro_id };
   }
   ```
3. 9 周灰度（QA 设计）：
   - W1-2 双写：旧 JSON + 新表
   - W3 影子读：新表读出后与 JSON 比对，diff 落 metric
   - W4 10% 流量切新表
   - W5 50% / W6 100%
   - W7-8 JSON 字段保留只读
   - W9 删字段
4. 迁移脚本必须支持：
   - dry-run 模式（输出 migrated/skipped/dlq 三计数，不实际写）
   - 三态校验（before count / migrated count / orphan count）
   - down 脚本（回滚到 JSON）
   - 重跑幂等（已迁移条目 skip）
5. 迁移测试矩阵 10 种状态（见验收）
6. 乐观锁实现：
   ```js
   const result = await CroTrialOwnership.update(
     { effective_to: new Date() },
     { where: { id, version: prevVersion } }
   );
   if (result[0] === 0) throw new ConcurrentClaimError();
   await CroTrialOwnership.create({ ...newOwnership, version: prevVersion + 1 });
   ```

**验收标准**
- ✅ 同 NCT 不同 site 可归不同 CRO 不冲突
- ✅ 同 site 同时刻仅一家 CRO（unique 约束）
- ✅ 历史 trial_ids JSON 100% 迁移完成（dlq=0）
- ✅ `application_owner_assign_total` sticky 命中率 > 99%
- ✅ 9 周灰度无业务中断
- ✅ 跨城市无 site 用户进 `pending_geo_review`，CRO 48h 内决策
- ✅ icf_signed 时 site_id_confirmed 必须非空（DB trigger 校验）

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 迁移单测 | 10 种历史状态：单 CRO 单 trial / 单 CRO 多 trial / 多 CRO 同 NCT 不同 site / 多 CRO 同 site / 孤儿 trial / share≠100 / CRO 软删 / JSON 三种空态 / NCT 大小写 / application 链断 |
| 并发集成 | `Promise.all([CRO_A.claim, CRO_B.claim])` × 50 轮，每轮恰好 1 成功 1 失败（乐观锁验证） |
| 灰度 | W3 影子读 diff < 0.1% / 7 天 |
| 业务回归 | computeMonthly 跨期对账金额漂移 = 0 |
| e2e | 用户在北京申请北京-上海双 site 试验 → 自动归北京 site 的 CRO |

**监控埋点**
- `application_owner_assign_total{strategy=auto|manual|geo_review}`
- `cro_ownership_shadow_diff_total{field}` —— W3 阶段
- `cro_ownership_migration_dlq_total` —— 迁移期 alert >0
- `pending_geo_review_total` —— alert >5% 总申请量

---

### Q4-T0-4 · 状态机 transition / touchpoint 拆分 + ICF 节点

**状态**：⬜ | **工时**：L (5d) | **优先级**：P0（GCP 强制）

**修改项**
- 新建 migration `20260513_application_action_event.sql`
- 新建 `server/models/ApplicationActionEvent.js`
- [server/services/applicationStateMachine.js](../server/services/applicationStateMachine.js) —— 新增 `recordAction`
- 新建 `server/services/actionStateMachine.js` —— canEmit 校验
- 新增 status `screening`（migration `ALTER TABLE trial_applications MODIFY COLUMN status ENUM(...)`）
- DB 层 trigger：enrolled INSERT 前校验 icf_signed
- ajv JSON Schema 契约 + controller 层 + DB 写入前校验
- 新增 metric

**实施步骤**
1. action_event 表：
   ```sql
   CREATE TABLE application_action_event (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     event_id VARCHAR(64) UNIQUE NOT NULL,  -- UUID, idempotency
     application_id VARCHAR(64) NOT NULL,
     action ENUM(
       'contact_attempted','contact_succeeded','contact_failed_3x',
       'icf_version_presented','icf_signed','icf_declined',
       'screening_visit_scheduled','screening_visit_completed',
       'screening_passed','screening_failed',
       'enrolled','first_dose_administered',
       'ae_reported','sae_reported',
       'withdrawn_by_subject','withdrawn_by_site',
       'note_added'
     ) NOT NULL,
     actor_role ENUM('patient','cro','medical_admin','system') NOT NULL,
     actor_id VARCHAR(64),
     occurred_at DATETIME(6) NOT NULL,
     payload JSON,
     source_doc_id VARCHAR(64),
     schema_version INT DEFAULT 1,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_app_occurred (application_id, occurred_at),
     INDEX idx_action_occurred (action, occurred_at)
   );
   ```
2. status 链改造：
   - `MODIFY COLUMN status ENUM('pending','contacted','screening','enrolled','screen_failed','rejected','withdrawn','pending_geo_review','cancelled')`
   - cancelled 保留过渡期，P1 移除
3. canEmit 校验：
   ```js
   const ACTION_DEPS = {
     screening_visit_scheduled: ['contact_succeeded'],
     screening_passed: ['screening_visit_completed'],
     enrolled: ['icf_signed', 'screening_passed'],
     first_dose_administered: ['enrolled'],
   };
   function canEmit(historyActions, newAction) {
     const deps = ACTION_DEPS[newAction] || [];
     return deps.every(d => historyActions.some(h => h.action === d));
   }
   ```
4. DB trigger（enrolled 硬阻断）：
   ```sql
   CREATE TRIGGER tr_enrolled_requires_icf
   BEFORE UPDATE ON trial_applications
   FOR EACH ROW
   BEGIN
     IF NEW.status = 'enrolled' AND OLD.status != 'enrolled' THEN
       IF NOT EXISTS (
         SELECT 1 FROM application_action_event
         WHERE application_id = NEW.id
           AND action = 'icf_signed'
           AND occurred_at < NOW()
       ) THEN
         SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ICF_REQUIRED_BEFORE_ENROLLED';
       END IF;
     END IF;
   END;
   ```
5. ajv 契约校验在 controller 入口和 DB 写入前各跑一次
6. controller 在所有 PUT 操作时同时调 `recordAction`，无论是否真 transition

**验收标准**
- ✅ "今天 contacted、3 天后再 contacted" 留两条 action_event，status_event 不变
- ✅ enrolled 没有前置 icf_signed → DB trigger 阻断
- ✅ 17 项 action 全部覆盖
- ✅ canEmit 顺序约束 100% 应用层 + DB 层双重校验
- ✅ ajv 契约校验未通过 → 422 + 明确字段错误
- ✅ `icf_audit_violation_total` = 0
- ✅ CRO 时间线展示 17 个 action 完整

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | from===to 调用，断言 status_event 不变 + action_event +1 |
| 单测 | canEmit 17 个 action 全枚举 + 顺序约束 |
| 集成 | enrolled 无 icf_signed → DB trigger 抛错 |
| 集成 | ajv 契约校验：缺必填 → 422 |
| Property-based | fast-check 生成随机 action 序列，断言 canEmit 不变量 |
| e2e | CRO 重复触达 5 次，时间线返回 5 条 touchpoint |

**监控埋点**
- `application_touchpoint_total{action}`
- `icf_audit_violation_total` —— alert >0
- `state_machine_noop_total{from,to}`
- `action_canemit_failure_total{action,reason}`

---

### Q4-T0-5 · 申请去重（30 天 + 并发安全）

**状态**：⬜ | **工时**：M (2d) | **优先级**：P0

**修改项**
- 新建 migration `20260514_trial_apps_dedup_constraint.sql`
- [server/controllers/application.js](../server/controllers/application.js) —— 应用层校验
- 前端拦截（小程序 + APP）
- 新增 error code

**实施步骤**
1. 辅助列 + unique 索引：
   ```sql
   ALTER TABLE trial_applications
     ADD COLUMN active_window_id BIGINT GENERATED ALWAYS AS (
       FLOOR(UNIX_TIMESTAMP(created_at) / 2592000)
     ) STORED;

   CREATE UNIQUE INDEX uk_user_trial_window
     ON trial_applications(user_id, trial_id, active_window_id)
     WHERE status NOT IN ('rejected', 'withdrawn');
   -- MySQL 8 不支持 partial unique，用 trigger 模拟或全表 unique 然后过期清理
   ```
   *备选方案*：触发器实现 partial unique，或应用层 + DB 全表 unique
2. 应用层 POST 校验：
   ```js
   const existing = await TrialApplication.findOne({
     where: {
       user_id, trial_id,
       status: { [Op.notIn]: ['rejected', 'withdrawn'] },
       created_at: { [Op.gte]: subDays(new Date(), 30) }
     }
   });
   if (existing) {
     throw new BusinessError(409, 'application_duplicate_within_30d',
       `您已申请该试验，预计 ${expectedReplyDays} 天内回复`);
   }
   ```
3. 前端拦截：用户点击"申请"前先查 `GET /api/applications/check?trial_id=X`，命中则展示提示

**验收标准**
- ✅ 同人同 trial 第二次申请被拒（HTTP 409）
- ✅ 100 个并发 POST 同 user × trial → 仅 1 条入库
- ✅ 30 天后允许重新申请
- ✅ rejected / withdrawn 状态不计入"已申请"

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | 同人同 trial 30 天内 second POST → 409 |
| 并发集成 | 100 个并发 POST → 仅 1 条入库 |
| 边界 | 第 29 天提交：拒绝；第 31 天提交：通过 |
| 状态 | 第一次 rejected，第 2 天再申请：通过（不计入 active） |

**监控埋点**
- `application_duplicate_blocked_total{layer=app|db|frontend}`
- MySQL `Duplicate entry` 错误日志计数
- `application_duplicate_blocked_within_30d`（业务 KPI）

---

## 3. P0 — Sprint W3-W4（5/26 – 6/8）：业务正确性 + 患者安全

### Q4-T0-3 · CPA 计费版本快照

**状态**：⬜ | **工时**：L (5d) | **优先级**：P0 | **依赖**：T0-2 部分（site 维度可独立先实现）

**修改项**
- 新建 migration `20260526_cro_pricing_history.sql` + `20260526_billing_snapshot.sql`
- 新建 `server/models/CroPricingHistory.js` + `BillingSnapshot.js`
- [server/services/billing.js](../server/services/billing.js) `computeMonthly` 改造
- 新建 cron job `server/jobs/billingSnapshotFreezer.js`（每月 1 号 02:00）
- [server/controllers/admin.js](../server/controllers/admin.js) —— CPA 阈值变更走二次确认
- 新增 metric

**实施步骤**
1. cro_pricing_history 表：
   ```sql
   CREATE TABLE cro_pricing_history (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     cro_id VARCHAR(64) NOT NULL,
     cpa_qualified_status VARCHAR(32) NOT NULL,
     cpa_price DECIMAL(10,2) NOT NULL,
     effective_from DATETIME NOT NULL,
     effective_to DATETIME,
     changed_by VARCHAR(64) NOT NULL,
     changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     change_reason VARCHAR(512),
     INDEX idx_cro_effective (cro_id, effective_from)
   );
   ```
2. billing_snapshot 表：
   ```sql
   CREATE TABLE billing_snapshot (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     year_month CHAR(7) NOT NULL,  -- 'YYYY-MM'
     cro_id VARCHAR(64) NOT NULL,
     trial_id VARCHAR(64) NOT NULL,
     site_id BIGINT,
     qualified_status VARCHAR(32),
     unit_price DECIMAL(10,2),
     qualified_count INT,
     amount DECIMAL(12,2),
     frozen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uk_month_cro_trial (year_month, cro_id, trial_id, site_id)
   );
   ```
3. cro_companies UPDATE 时同步 INSERT history（trigger 或应用层）
4. computeMonthly 反查 history：
   ```js
   const findThresholdAt = async (cro_id, time) => {
     return CroPricingHistory.findOne({
       where: {
         cro_id,
         effective_from: { [Op.lte]: time },
         [Op.or]: [
           { effective_to: { [Op.gt]: time } },
           { effective_to: null }
         ]
       }
     });
   };
   ```
5. 月初冻结 cron：
   - 每月 1 号 02:00（北京）跑
   - 计算上月，写 billing_snapshot
   - 写完发送对账邮件给财务
6. 阈值变更二次确认：
   - admin UI 弹窗"仅对未来线索生效，不影响历史账单"
   - 写入时 reason 必填

**验收标准**
- ✅ 跨月场景：5/15 改阈值 screened→enrolled，5 月账单不变
- ✅ `billing_snapshot` 与实时 `computeMonthly` 跨月对比金额漂移 = 0
- ✅ `cpa_recompute_drift_amount` p99 < 0.01 元
- ✅ 月初 1 号 02:00 - 03:00 完成 snapshot 冻结
- ✅ 第一笔 CRO 月度账单复核 100% 通过

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | 跨月场景：构造 5/15 改阈值 + 5 月内事件 → 5/1-14 用旧、5/15-31 用新 |
| 集成 | 插入 1000 条 status_event + 跨月改阈值 → 对账金额漂移 = 0 |
| 数据 | 真实历史数据回放：月初 cron 完成时间 + 准确性 |

**监控埋点**
- `cpa_pricing_version_in_use{cro_id}` gauge
- `cpa_recompute_drift_amount` histogram —— alert p99 > 0.01
- `billing_snapshot_freeze_duration_seconds`
- `billing_snapshot_freeze_failed_total` —— alert >0

---

### Q4-T0-8 · OCR 双置信度阈值 + biomarker 强制人工

**状态**：⬜ | **工时**：XL (8d 工程 + 团队搭建) | **优先级**：P0（Grade 4 患者安全）

**修改项**
- [server/services/ocr.js](../server/services/ocr.js) —— 输出每字段 confidence
- 新建 migration `20260527_medical_record_review_queue.sql`
- 新建 `server/models/MedicalRecordReviewQueue.js`
- 新建 `server/services/biomarkerWhitelist.js` —— 12 项白名单
- 新建 admin endpoint `GET/POST /api/admin/medical/review` —— 工作台
- [server/controllers/application.js](../server/controllers/application.js) —— "申请"按钮 gate
- 移动端展示"待医学审核"占位
- 4 周后用真实 confidence 直方图回灌调整阈值
- 新增 metric

**实施步骤**
1. biomarker 12 项白名单（医学专家给定）：
   ```js
   const BIOMARKER_WHITELIST = [
     'EGFR_mutation_status',     // 含位点 19del/L858R/T790M
     'ALK_fusion',
     'ROS1_fusion',
     'KRAS_G12C_status',
     'HER2_expression',          // IHC 0/1+/2+/3+ + FISH
     'PD_L1_TPS_CPS',            // 数值
     'MSI_status',               // MSI-H / MSS / dMMR
     'BRCA_mutation',            // 1/2 + 胚系/体系
     'pathology_TNM_stage',      // T/N/M 分别
     'pathology_type_polarity',  // 腺癌/鳞癌/小细胞
     'prior_PD1_PDL1_use',       // 既往用药
     'pregnancy_status',
   ];
   ```
2. 双阈值 v0：
   ```js
   if (confidence < 0.75) → discard, mark unreadable, ask user re-upload
   if (BIOMARKER_WHITELIST.includes(field)) → enqueue review (无视 confidence)
   if (confidence >= 0.95) → accept directly
   if (0.75 <= confidence < 0.95) → enqueue review
   ```
3. medical_record_review_queue 表：
   ```sql
   CREATE TABLE medical_record_review_queue (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     record_id VARCHAR(64) NOT NULL,
     field VARCHAR(64) NOT NULL,
     ai_value JSON,
     ai_confidence DECIMAL(5,4),
     status ENUM('pending','approved','modified','rejected') DEFAULT 'pending',
     reviewer_id VARCHAR(64),
     reviewed_at DATETIME,
     final_value JSON,
     review_duration_seconds INT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_status_created (status, created_at)
   );
   ```
4. 申请按钮 gate：
   ```js
   POST /api/applications:
     if (record.review_pending_count > 0) {
       throw new BusinessError(422, 'pending_medical_review',
         '医学审核中，请稍候');
     }
   ```
5. 移动端展示：
   - AI 初筛 ≤30s 出，每条带"AI 初筛 / 医学审核中"徽章
   - biomarker 字段不参与初筛排序权重（仅用 cancer type + stage + 既往治疗线数）
6. 人工审核 SLA：
   - 工作日 12h / 周末 24h / 最长 36h
   - 超 SLA → 自动给 C 端用户发"审核高峰，预计 X 小时"
7. 审核完成通知：
   - downgrade（命中→不命中）：仅 in-app 通知，**不发 push**（避免事故）
   - upgrade（不命中→命中）：push + 站内信
8. 4 周后回灌：
   - 收集真实 confidence 直方图
   - 抽样 200 张人工标注金标，计算 ROC 曲线 Youden's J 最大点
   - 调整 0.75 / 0.95 阈值
9. 审核团队：
   - 冷启动期日均 ≤200 份，2 人医学顾问外包
   - 规模化后日均 1000 份，单份 4 分钟，需 8 人并行

**验收标准**
- ✅ biomarker 12 项任一字段未审核 100% 不进 matchEngine
- ✅ 申请按钮在审核 pending 期间 422
- ✅ 人工复核 SLA breach 率 < 5%
- ✅ AI 误放过率（downgrade）< 8%
- ✅ AI 误拦截率（upgrade）< 5%
- ✅ Grade 4 患者错配事件 = 0
- ✅ confidence < 0.75 字段不入数据库结构化字段
- ✅ 4 周后阈值有数据支撑调整

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 单测 | confidence=0.4 → discard / 0.7 + biomarker → review / 0.97 + biomarker → review / 0.97 + non-biomarker → accept |
| 集成 | 上传含 EGFR 的病历 → matchEngine 在审核前不参考 |
| 集成 | 申请按钮 pending review 期间 → 422 + reason `pending_medical_review` |
| TC-OCR-INC-01 | AI 命中 → 显示"医学复核中" → 24h 内人工 downgrade → 试验从列表移除 + in-app 通知，**无 push** |
| TC-OCR-INC-02 | AI 不命中 → 人工 upgrade → push + 站内信 |
| TC-OCR-INC-03 | 复核期间用户点申请 → 422，落埋点 |
| TC-OCR-INC-04 | 复核 SLA 超 24h → 降级"无法识别"提示用户重传 |
| 影子模式 | 阶段 1 收集 4 周 confidence 直方图，阈值仅记录不动作 |

**监控埋点**
- `ocr_confidence_bucket{bucket=0.0_0.5|0.5_0.75|0.75_0.95|0.95_1.0}`
- `ocr_human_override_total{direction=upgrade|downgrade}`
- `ocr_review_sla_breach_total`
- `biomarker_field_missing_rate`
- `application_blocked_pending_review_total`
- `match_score_revised_after_review_total`

**审核团队搭建**（运营+HR）
- W3 启动外包招聘（2 人医学顾问，背景：肿瘤科主治 / 病理科）
- W4 培训 + 工作台联调
- W5 上线
- 月度评估，超量则扩容

---

### Q4-T0-6 · trial 状态变化匹配缓存失效 + 复活重匹配

**状态**：⬜ | **工时**：L (5d) | **优先级**：P0

**修改项**
- [server/jobs/trialCrawler.js](../server/jobs/trialCrawler.js) `diffAndApply` 后置 hook
- 新建 migration `20260530_user_match_invalidation.sql`
- 新建 `server/models/UserMatchInvalidation.js`
- [server/controllers/match.js](../server/controllers/match.js) —— 拉匹配前查 invalidation
- 新建 `server/jobs/trialReviveRematch.js` —— closed→recruiting 重跑入排
- 新增 push 通知模板
- 新增 metric

**实施步骤**
1. user_match_invalidation 表：
   ```sql
   CREATE TABLE user_match_invalidation (
     id BIGINT AUTO_INCREMENT PRIMARY KEY,
     user_id VARCHAR(64) NOT NULL,
     trial_id VARCHAR(64) NOT NULL,
     reason ENUM('trial_closed','trial_revived','trial_suspended','protocol_amended') NOT NULL,
     invalidated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     INDEX idx_user_invalidated (user_id, invalidated_at)
   );
   ```
2. trialCrawler hook：
   ```js
   if (oldStatus === 'recruiting' && newStatus !== 'recruiting') {
     const affectedUsers = await UserMatchHistory.findAll({
       where: { trial_id, matched_at: { [Op.gte]: subDays(new Date(), 30) } }
     });
     for (const u of affectedUsers) {
       await UserMatchInvalidation.create({ user_id: u.user_id, trial_id, reason: 'trial_closed' });
     }
   }
   ```
3. closed → recruiting 复活：
   - 强制 trialReviveRematch 重跑入排匹配
   - dedupe key：`trial_id + user_id + revived_at`，单 user 单 trial 复活后最多通知 1 次
   - 仅合格者收到 push
4. 移动端拉匹配：
   ```js
   GET /api/match/results:
     const invalidated = await UserMatchInvalidation.find({ user_id });
     const results = await getMatch(user_id);
     return results.filter(r => !invalidated.includes(r.trial_id));
   ```
5. 用户文案：
   - 试验关闭：站内信"试验已招满，已为您寻找替代"
   - 试验复活：push"我们重新审核了试验入排，您仍然合格"

**验收标准**
- ✅ trial.update closed 后 5s 内用户端不再展示 recruiting
- ✅ closed → recruiting 复活后，**仅合格用户**收到通知
- ✅ 复活通知重复率 < 1%
- ✅ `trial_cache_invalidation_lag_seconds` p95 < 5s

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 集成 | trial.update closed → 5s 后用户端 GET /match → 试验消失 |
| e2e | 模拟 closed → recruiting 复活 → 旧用户中不合格的 0 通知，合格的 1 通知 |
| 重复触发 | 同一 trial 24h 内 closed → recruiting → closed → recruiting → 仅 1 条通知 |
| Bull dedupe | dedupe key 验证：重复投递 trial_revive_notification 仅消费 1 次 |

**监控埋点**
- `trial_cache_invalidation_lag_seconds` histogram —— alert p95 >5s
- `trial_revive_notification_dedup_total{result=sent|deduped}`
- `trial_revive_rematch_total{passed|failed}`

---

## 4. P0 — Sprint W4（6/2 – 6/8）：用户体验补完

### Q4-T0-9 · 用户端申请时间线

**状态**：⬜ | **工时**：M (4d) | **优先级**：P0 | **依赖**：T0-4

**修改项**
- 新增 `GET /api/users/me/applications/:id/timeline`
- 新建 `server/services/applicationTimelineMapper.js` —— 内部 17 项 → 外部 4 里程碑
- 新建 `server/services/rejectReasonMapper.js` —— 17 项内部 → 4 项外部
- 移动端新页面 + push 联动
- 新增 metric

**实施步骤**
1. 4 里程碑映射规则：
   ```js
   function toMilestones(actions, status) {
     const milestones = [
       { key: 'submitted', label: '已提交申请',
         desc: '我们正在为你联系研究团队',
         occurred_at: actions[0].occurred_at },
     ];
     if (actions.find(a => a.action === 'contact_succeeded')) {
       milestones.push({ key: 'contacted', label: '研究团队已联系',
         desc: '请留意来电（标注：${city}）',
         icf_pending: !actions.find(a => a.action === 'icf_signed') });
     }
     if (actions.find(a => a.action === 'screening_passed')) {
       milestones.push({ key: 'pre_screened', label: '资料初步符合',
         desc: '进入正式筛查环节' });
     }
     if (actions.find(a => a.action === 'screening_visit_scheduled')) {
       milestones.push({ key: 'visit_scheduled', label: '筛查访视已安排',
         desc: '请按时前往医院' });
     }
     return milestones;
   }
   ```
2. reject reason 17→4 映射：
   ```js
   const EXTERNAL_REASONS = {
     'criteria_not_met': '条件暂不匹配',
     'patient_unreachable': '暂未联系上',
     'withdrawn_by_subject': '您已撤回',
     'site_full': '试验已满'
   };
   const INTERNAL_TO_EXTERNAL = {
     'inclusion_age': 'criteria_not_met',
     'inclusion_biomarker': 'criteria_not_met',
     'exclusion_brain_meta': 'criteria_not_met',
     'phone_unreachable_3x': 'patient_unreachable',
     'subject_initiated': 'withdrawn_by_subject',
     'site_full': 'site_full',
     // ... 17 项映射
   };
   ```
3. 接口返回：
   ```json
   GET /api/users/me/applications/:id/timeline
   {
     "trial": { "id", "name", "city" },
     "current_status": "screening",
     "milestones": [
       { "key": "submitted", "label": "已提交申请", "occurred_at": "..." },
       { "key": "contacted", "label": "研究团队已联系",
         "desc": "请留意来电（北京）",
         "tasks": [{ "type": "sign_icf", "url": "..." }] },
       { "key": "pre_screened", "pending": true }
     ],
     "next_step": "等待筛查访视安排，预计 3 天内"
   }
   ```
4. 推送：状态变更时 push 提醒，文案走 EXTERNAL_REASONS

**验收标准**
- ✅ 用户能看到 4 个里程碑
- ✅ 不暴露 actor_id、内部 reason
- ✅ 用户端申请提交后 7 日留存 +15pp（A/B 实验）
- ✅ 客服"申请进度查询"工单减少 60%

**测试矩阵**
| 类型 | 用例 |
|---|---|
| 集成 | 构造 4 阶段 status_event + touchpoint，断言用户端只看 4 行 |
| 单测 | 17 项内部 reason 全部映射到 4 项外部 |
| e2e | 移动端拉接口 → 渲染 → push 跳转 |
| 隐私 | 响应不含 actor_id / 内部 reason 字段 |

**监控埋点**
- `application_timeline_query_total` —— 业务 KPI
- `application_timeline_query_dau`

---

## 5. 排期甘特

```
Week 1 (5/5–5/11)
  Mon-Tue   T0-11 CI 基础设施 ▓▓▓
  Wed-Thu   T0-10 漏斗埋点    ▓▓▓
  Fri       T0-10 联调 + Metabase 看板
  并行       T0-1 null 防护    ▓▓▓
  并行       T0-7 PII 校验     ▓▓▓

Week 2 (5/12–5/18)
  Mon-Wed   T0-2 归属重建 schema + 迁移脚本 ▓▓▓
  Thu-Fri   T0-2 双写 W1 上线
  并行       T0-4 状态机 + ICF ▓▓▓
  并行       T0-5 申请去重    ▓▓

Week 3 (5/19–5/25)
  Mon-Fri   T0-3 CPA 快照     ▓▓▓▓▓ (依赖 T0-2 site 维度)
  并行       T0-8 OCR 阈值     ▓▓▓▓▓ (含审核团队搭建启动)
  并行       T0-6 缓存失效    ▓▓▓▓▓
  T0-2       影子读 W3 上线

Week 4 (5/26–6/1)
  Mon-Wed   T0-9 用户时间线   ▓▓▓▓ (依赖 T0-4)
  Thu-Fri   T0-2 切流 10% W4
  并行       T0-8 审核团队上线
  集成回归  + 灰度观察

Week 5-6 (6/2–6/15)
  T0-2       切流 50% / 100% W5-6
  T0-8       4 周阈值数据回灌 + 调优
  P0         全部上线观察 14 天

Week 7-8 (6/16–6/29)
  T0-2       JSON 只读 / 删字段 W7-9
  T0-2       彻底退役旧 schema
  P1         启动准备 (TASKS-2027Q1.md 草拟)
```

---

## 6. 决策门 / 里程碑

| 时点 | 决策门 | 通过指标 | 不通过 |
|---|---|---|---|
| W1 末 | T0-10 + T0-11 上线 | 漏斗 8 事件有数据 + slow CI 必跑 + heartbeat 不断 | 推迟所有其它 P0 |
| W2 末 | T0-2 双写 14 天 | 影子 diff < 0.1% / 7 天 | 重新设计 schema |
| W3 末 | T0-1 / T0-3 / T0-4 / T0-5 / T0-7 上线 | 所有任务 AC 全绿 | 调整范围，砍 T0-9 降级 |
| W4 末 | T0-8 审核团队上线 + T0-9 用户时间线上线 | 审核 SLA breach < 5%，时间线 DAU > 50% | T0-8 降级（仅启用 biomarker 强人工，阈值推迟） |
| W6 末 | T0-2 切流 100% | computeMonthly 跨期对账金额漂移 = 0 | 回滚 T0-2，T0-3 推迟 |
| W8 末 | 所有 P0 验收 | 14 天观察期无重大事件 | P1 启动延期 |

---

## 7. 三方共识矩阵（决策依据）

| 任务 | PM 同意度 | 医学同意度 | QA 同意度 | 共识强度 | 主要驱动 |
|---|---|---|---|---|---|
| T0-1 | ★★★ | ★★★（Grade 4） | ★★★ | ★★★ | 患者安全 |
| T0-2 | ★★★（让步：接受 site 维度） | ★★★（让步：接受 A+C 路径） | ★★★ | ★★★ | 商务+合规 |
| T0-3 | ★★★ | ★★★ | ★★★ | ★★★ | 收入 |
| T0-4 | ★★★（让步：用户端 4 里程碑） | ★★★（让步：ICF 用 action） | ★★★（站队 action） | ★★★ | GCP |
| T0-5 | ★★★ | ★★ | ★★★ | ★★★ | 数据质量 |
| T0-6 | ★★★ | ★★★（强制重匹配） | ★★★ | ★★★ | 体验+安全 |
| T0-7 | ★★★ | ★★ | ★★★ | ★★★ | 指标失真 |
| T0-8 | ★★（让步：接受人工 gate） | ★★★（Grade 4） | ★★★ | ★★★ | 患者安全 |
| T0-9 | ★★★ | ★★ | ★★ | ★★★ | 留存 |
| T0-10 | ★★★ | — | ★★ | ★★★ | 可观测前置 |
| T0-11 | ★★ | — | ★★★ | ★★★ | 测试基础设施 |

---

## 8. 附录 A · action_event 完整枚举与 payload

| action | actor_role | 必填 payload | 触发场景 |
|---|---|---|---|
| contact_attempted | cro | channel, attempted_at, attempt_no | 每次拨号 |
| contact_succeeded | cro | reached_at | 接通且能沟通 |
| contact_failed_3x | system | last_attempt_at | 3 次拨号未通自动转 dead_lead |
| icf_version_presented | cro | icf_version | 展示 ICF 给患者 |
| icf_signed | patient/cro | signed_at, signed_location, icf_version, is_remote_e_sign, source_doc_id | 患者签署 ICF（**enrolled 强制前置**） |
| icf_declined | patient | declined_at, reason_code | 患者拒绝签署 |
| screening_visit_scheduled | cro | scheduled_at, site_id | 安排访视 |
| screening_visit_completed | cro | completed_at, site_id | 访视完成 |
| screening_visit_no_show | cro | scheduled_at, site_id | 患者未到 |
| screening_passed | medical_admin | passed_at | 入排通过 |
| screening_failed | medical_admin | failed_at, reason_code (ICH-E3) | 入排失败 |
| enrolled | cro | enrolled_at, randomization_id | 正式入组（**触发 ICF 校验 trigger**） |
| first_dose_administered | cro | dose_at, dose_amount, dose_unit | 首次给药 |
| ae_reported | cro/patient | reported_at, ctcae_grade, sae_flag, description | 不良事件 |
| sae_reported | cro | reported_at, ctcae_grade, reported_to_irb_within_24h | 严重不良事件（24h 强制） |
| withdrawn_by_subject | patient | withdrawn_at, reason_code | 患者主动撤回 |
| withdrawn_by_site | cro | withdrawn_at, reason_code (AE/无效/方案违背) | CRO 主动撤回 |
| note_added | cro/medical_admin | note_text | 备注 |

---

## 9. 附录 B · OCR biomarker 强制人工审核白名单（12 项）

| # | 字段 | 说明 | 错配后果 |
|---|---|---|---|
| 1 | EGFR_mutation_status | 含位点 19del/L858R/T790M | 阴性患者用 EGFR-TKI 增加进展风险 |
| 2 | ALK_fusion | 阴/阳 | ALK- 患者用 ALK 抑制剂无效 + 副作用 |
| 3 | ROS1_fusion | 阴/阳 | 同上 |
| 4 | KRAS_G12C_status | 阴/阳/其它 KRAS 突变 | 错配 sotorasib 类靶向药 |
| 5 | HER2_expression | IHC 0/1+/2+/3+ + FISH | HER2- 用曲妥珠无效 |
| 6 | PD_L1_TPS_CPS | 数值（TPS/CPS/IC 三套） | 阈值错配致免疫治疗指征错误 |
| 7 | MSI_status | MSI-H / MSS / dMMR | 错配 PD-1 单药入组 |
| 8 | BRCA_mutation | 1/2 + 胚系/体系 | PARP 抑制剂适应症错配 |
| 9 | pathology_TNM_stage | T/N/M 分别 | 早期 vs 晚期试验入组错位 |
| 10 | pathology_type_polarity | 腺癌/鳞癌/小细胞 | 病理类型错配致治疗方向错误 |
| 11 | prior_PD1_PDL1_use | 既往用药 | 二线试验入排关键 |
| 12 | pregnancy_status | 妊娠/育龄期 | 胚胎毒性药物入组禁忌 |

---

## 10. 附录 C · 词典质量阈值（Q4 不交付内容，但基础设施在 T0-10 监控）

> Q4 仅交付**框架与监控**。内容填充 Q1 2027。

| 方向 | 召回率（一般字段） | 准确率 | 禁忌症召回率 | 禁忌症 FN | 上线门槛 |
|---|---|---|---|---|---|
| T2DM | ≥0.90 | ≥0.92 | ≥0.98 | <0.02 | 200 条 ground truth 通过 |
| 慢乙肝 | ≥0.90 | ≥0.92 | ≥0.98 | <0.02 | 200 条 ground truth 通过 |
| RA（类风湿） | ≥0.90 | ≥0.92 | ≥0.98 | <0.02 | 200 条 ground truth 通过 |

**禁忌症字段（day 1 必备，缺一不可上线）**：

- **T2DM**：1 型糖尿病排除 / 糖尿病酮症酸中毒史 / eGFR<30 / 妊娠 / 严重心衰 NYHA III/IV
- **慢乙肝**：合并 HCV/HIV/HDV / 肝细胞癌史 / 失代偿期肝硬化 Child-Pugh C / 妊娠
- **RA**：活动性结核 / 活动性乙肝/丙肝 / 严重感染史 3 月内 / 恶性肿瘤史 5 年内 / 妊娠

**FP 可接受率**：糖尿病 ≤5% / 自免 ≤2% / 禁忌症涉及字段 0%（发现一例熔断）

---

## 11. 关联文档

- PRD：[docs/PRD-2026Q4.md](PRD-2026Q4.md)
- 三方审阅原始材料：[docs/REVIEW-REPORT-2026Q3.md](REVIEW-REPORT-2026Q3.md)
- Q3 PRD（前置）：[docs/PRD-2026Q3.md](PRD-2026Q3.md)
- Q3 任务清单：[docs/TASKS-2026Q3.md](TASKS-2026Q3.md)
- 运维手册：[docs/MANUAL-OPS-2026Q3.md](MANUAL-OPS-2026Q3.md)（Q4 完成后追加 §5）
- 状态机：[server/services/applicationStateMachine.js](../server/services/applicationStateMachine.js)
- 计费：[server/services/billing.js](../server/services/billing.js)
- 试验抓取：[server/jobs/trialCrawler.js](../server/jobs/trialCrawler.js)
