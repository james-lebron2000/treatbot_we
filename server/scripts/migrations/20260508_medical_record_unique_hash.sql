-- Plan §Phase 2.2：(user_id, file_hash, deleted_at) 唯一索引
--
-- 目的：批量上传 / 直传 finalize 改成 Promise.allSettled 并发执行后，
-- 同一用户同 hash 的两份请求可能同时跑到 MedicalRecord.create，
-- 用唯一索引兜底，由控制器捕获 SequelizeUniqueConstraintError 走 dedup 分支。
--
-- 幂等说明：如已通过 server/scripts/migrate.js 创建同名索引，请跳过本脚本。
--
-- MySQL 对 NULL 不做唯一约束 —— 软删除后 deleted_at IS NULL 解除，允许同 hash 再次上传新行。
-- 软删过的旧行（deleted_at 有值）也不阻碍新插入。

CREATE UNIQUE INDEX uniq_user_hash_deleted
  ON medical_records (user_id, file_hash, deleted_at);
