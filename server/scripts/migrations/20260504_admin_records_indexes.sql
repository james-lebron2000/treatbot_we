-- Admin H5 后台上传数据筛选索引
-- 幂等说明：如已通过 migrate.js 创建同名索引，请跳过本脚本。

CREATE INDEX idx_record_user_deleted_created
  ON medical_records (user_id, deleted_at, created_at);

CREATE INDEX idx_record_status_deleted_created
  ON medical_records (status, deleted_at, created_at);
