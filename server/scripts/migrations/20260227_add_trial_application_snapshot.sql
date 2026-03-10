ALTER TABLE trial_applications
  ADD COLUMN contact_name VARCHAR(64) NULL COMMENT '报名联系人姓名',
  ADD COLUMN contact_phone VARCHAR(32) NULL COMMENT '报名联系人电话',
  ADD COLUMN disease_snapshot VARCHAR(256) NULL COMMENT '报名时疾病快照',
  ADD COLUMN client_source VARCHAR(32) NULL COMMENT '客户端来源';
