-- PRD-2026Q2 §3.2：Bull OCR 队列 DLQ 表
-- 记录 attempts 耗尽后仍然失败的任务，供 admin 审查与手动重试
CREATE TABLE `ocr_job_failures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` VARCHAR(64) NOT NULL COMMENT '原 Bull job id',
  `record_id` VARCHAR(64) NOT NULL COMMENT '关联的病历 id',
  `error_type` VARCHAR(64) NULL COMMENT '错误分类：timeout/ocr_empty/network/...',
  `error_message` TEXT NULL COMMENT '最后一次失败的 err.message',
  `payload` JSON NULL COMMENT '原 job.data 快照，便于重新入队',
  `retried` INT NOT NULL DEFAULT 0 COMMENT '手动重试次数',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_retried_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_record` (`record_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OCR 任务 DLQ - PRD-2026Q2 §3.2';
