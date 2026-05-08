# Migrations

## 当前机制

`server/scripts/migrate.js` 是本项目唯一的 schema 变更入口：

1. **基础表创建** — `sequelize.sync()`
   - `dev`：`sync({ alter: true })`，对齐 model 与 DB。
   - 其它环境：`sync()`，仅创建缺失表，不修改任何已有列。
   - `MIGRATE_SKIP_SYNC=true`（CI / 灰度）：完全跳过 sync，仅执行显式步骤。

2. **列 / 索引增量** — `ensureX` 函数（migrate.js 内）
   - `ensureTrialMatchingColumns` / `ensureTrialApplicationColumns` / `ensureUserComplianceColumns` /
     `ensureFunnelEventTable` / `ensureIndexes` / `ensureCroCompanyTable` /
     `ensureCroExportLog` / `ensureApplicationStatusEvent` / `ensureAdminAuditLogRole` /
     `ensureTrialCrawlerTables` / `ensureTrialFieldChangeReview` /
     `ensureNctIdConstraint`（PRD-2026Q4 T0-7）/ `ensureUserDedupCandidates`（PRD-2026Q4 T0-7）
   - 每条用 `describeTable + addColumn` 判存并插入，天然幂等。
   - 一次性数据回填（如 `medical_records.is_active` 的 backfill UPDATE）也写在
     `ensureX` 里，前置一个状态检测（"还没有任何 is_active=1 行"）保证幂等。
   - 执行顺序就是在 `runMigrations()` 里按源码书写的顺序。

3. **纯 SQL 迁移** — 本目录的 `*.sql` 文件
   - 命名 `YYYYMMDD_description.sql`。
   - **当前不会被 migrate.js 自动执行**——所有上线必经路径（CI deploy 的
     `docker exec treatbot-api node scripts/migrate.js`）只跑 `ensureX`。
   - 因此「写一份 .sql 但没在 ensureX 里 wire 上」=「这条迁移在生产永远不会落地」。
     这里历史踩坑：`20260513_nct_id_check.sql`、`20260513_user_dedup_candidates.sql`、
     `20260520_medical_records_active.sql`（is_active 回填）三条都曾是死信，
     2026-05 才补 wire 进 `ensureX`。新增 .sql 的同时**必须同步加 ensureX**。
   - .sql 文件保留作 SQL 形式的迁移备份，方便人工审阅 schema 变更轨迹。

### 已 wire 的 .sql ↔ ensureX 对照（2026-05 状态）

| .sql 文件 | 由谁 wire | 备注 |
|---|---|---|
| 20260227_add_trial_application_snapshot | `ensureTrialApplicationColumns` | |
| 20260420_admin_audit_log | `ensureAdminAuditLogRole` | |
| 20260421_trial_freshness | `ensureTrialMatchingColumns` | last_verified_at + freshness_score |
| 20260422_ocr_job_failures | `ensureTrialMatchingColumns` (medical_records 那段) | |
| 20260423_medical_record_soft_delete | `ensureMrCol('deleted_at')` | + `ensureIndexes` 建 idx_user_deleted |
| 20260501_user_consent | `ensureUserComplianceColumns` | |
| 20260502_user_action_log | `ensureUserComplianceColumns` | |
| 20260503_user_funnel_event | `ensureFunnelEventTable` | |
| 20260504_admin_records_indexes | `ensureIndexes` | |
| 20260504_cro_export_log | `ensureCroExportLog` | |
| 20260504_trial_apps_index | `ensureIndexes` | |
| 20260505_application_status_event | `ensureApplicationStatusEvent` | |
| 20260512_funnel_event | `sequelize.sync()` via models/funnelEvent.js | |
| 20260512_trial_field_change_review | `ensureTrialFieldChangeReview` | |
| 20260513_nct_id_check | `ensureNctIdConstraint` | wired 2026-05；MySQL <8.0.16 不强制 |
| 20260513_user_dedup_candidates | `ensureUserDedupCandidates` | wired 2026-05；scan-duplicate-users 落地表 |
| 20260518_trial_change_log | `ensureTrialCrawlerTables` | |
| 20260518_trial_crawl_failures | `ensureTrialCrawlerTables` | |
| 20260520_medical_records_active | `ensureMrCol('is_active')` + 同段内回填 | wired 2026-05；首跑回填，后续幂等 |
| 20260522_cpa_pricing | `ensureCroCompanyTable`（else 分支补列）| |
| 20260525_admin_audit_log_role | `ensureAdminAuditLogRole` | |

## §3.8 未完成事项（待 W4 完成）

- [ ] 用 `sequelize-auto` 从 staging DB dump 一份基线 schema，逐一翻译 `ensureX` 为幂等 SQL 文件（时间戳命名）。
- [ ] `migrate.js` 增加 `applySqlMigrations()`：读 `scripts/migrations/*.sql` 按时间戳顺序执行，用 `schema_migrations` 表记录已执行文件。
- [ ] CI 新增 `migrate-dry-run` job：起干净 MySQL → 跑 migrations → 跑单测。

以上步骤需要访问 staging 数据库。在 staging 读写权限到位前，保持现状（idempotent ensureX）是安全的。

## 生产变更流程

1. 在 `server/models/*.js` 或 `migrate.js` 的 `ensureX` 里加列 → PR → review。
2. 新增 `scripts/migrations/YYYYMMDD_xxx.sql` 留一份 SQL 备份（即使 `ensureX` 已覆盖）。
3. 部署：`npm run db:migrate`（容器内），观察日志 `migrate: sequelize.sync({alter: false})` + `新增字段: xxx`。
4. 回滚：删除 `ensureX` 里的那一行 + 另写一条 `ALTER TABLE ... DROP COLUMN` SQL。MySQL 的 DROP 是破坏性操作，务必先备份。
