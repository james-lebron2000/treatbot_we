-- PRD-2026Q3 T0-1：CRO 导出审计日志
-- 每次 /api/cro/exports/applications 命中（含 unmask）都写一行；
-- 与 admin_audit_log 互补：admin_audit_log 记 admin 维度，本表记 cro 维度。
-- 商务对账时按 (cro_id, month) 即可拉出"导过几次、覆盖哪些试验、是否解码"。

CREATE TABLE IF NOT EXISTS cro_export_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cro_id VARCHAR(64) NOT NULL,
  trial_ids JSON NOT NULL COMMENT '本次导出涉及的 trial_id 列表',
  fields JSON NOT NULL COMMENT '本次导出包含的字段名 + 是否含 phone_full（unmask）',
  format VARCHAR(8) NOT NULL DEFAULT 'csv' COMMENT 'csv | json',
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  unmask TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=含明文手机号',
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cro_created (cro_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='CRO 导出审计日志，CPA 计费 + 合规追溯';
