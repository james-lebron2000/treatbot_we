# Migrations

## 当前机制

`server/scripts/migrate.js` 是本项目唯一的 schema 变更入口：

1. **基础表创建** — `sequelize.sync()`
   - `dev`：`sync({ alter: true })`，对齐 model 与 DB。
   - 其它环境：`sync()`，仅创建缺失表，不修改任何已有列。
   - `MIGRATE_SKIP_SYNC=true`（CI / 灰度）：完全跳过 sync，仅执行显式步骤。

2. **列 / 索引增量** — `ensureX` 函数（migrate.js 内）
   - `ensureTrialMatchingColumns` / `ensureTrialApplicationColumns` / `ensureIndexes` / `ensureCroCompanyTable`
   - 每条用 `describeTable + addColumn` 判存并插入，天然幂等。
   - 执行顺序就是在 `runMigrations()` 里按源码书写的顺序。

3. **纯 SQL 迁移** — 本目录的 `*.sql` 文件
   - 命名 `YYYYMMDD_description.sql`。
   - 运行：`mysql ... < 20260227_add_trial_application_snapshot.sql`（未来并入 migrate.js 的自动执行序列）。

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
