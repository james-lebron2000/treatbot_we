-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS treatbot 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE treatbot;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url VARCHAR(512),
  phone VARCHAR(16),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_openid (openid),
  INDEX idx_unionid (unionid),
  INDEX idx_phone (phone),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 病历表
CREATE TABLE IF NOT EXISTS medical_records (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL COMMENT '病历类型',
  file_key VARCHAR(256) NOT NULL COMMENT '文件存储 key',
  file_hash VARCHAR(64) NOT NULL COMMENT '文件哈希（用于去重）',
  file_size INT UNSIGNED COMMENT '文件大小（字节）',
  status ENUM('pending', 'running', 'completed', 'error') DEFAULT 'pending' COMMENT '解析状态',
  diagnosis VARCHAR(256) COMMENT '诊断',
  stage VARCHAR(32) COMMENT '分期',
  gene_mutation VARCHAR(256) COMMENT '基因突变',
  treatment TEXT COMMENT '治疗方案',
  structured JSON COMMENT '结构化数据',
  remark TEXT COMMENT '备注',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_status (status),
  INDEX idx_file_hash (file_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 临床试验表
CREATE TABLE IF NOT EXISTS trials (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(256) NOT NULL COMMENT '试验名称',
  phase VARCHAR(32) COMMENT '试验阶段',
  type VARCHAR(64) COMMENT '试验类型',
  indication VARCHAR(256) COMMENT '适应症',
  institution VARCHAR(256) COMMENT '研究机构',
  location VARCHAR(256) COMMENT '所在地区',
  contact_phone VARCHAR(32) COMMENT '联系电话',
  description TEXT COMMENT '试验描述',
  inclusion_criteria JSON COMMENT '入组标准',
  exclusion_criteria JSON COMMENT '排除标准',
  status ENUM('recruiting', 'closed', 'completed') DEFAULT 'recruiting' COMMENT '招募状态',
  target_count INT UNSIGNED COMMENT '目标入组人数',
  enrolled_count INT UNSIGNED DEFAULT 0 COMMENT '已入组人数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_phase (phase),
  INDEX idx_location (location),
  FULLTEXT INDEX idx_name (name, indication)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报名表
CREATE TABLE IF NOT EXISTS trial_applications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  trial_id VARCHAR(64) NOT NULL,
  record_ids JSON NOT NULL COMMENT '关联病历ID列表',
  status ENUM('pending', 'contacted', 'enrolled', 'rejected', 'cancelled') DEFAULT 'pending' COMMENT '报名状态',
  remark TEXT COMMENT '备注',
  contact_name VARCHAR(64) COMMENT '报名联系人姓名',
  contact_phone VARCHAR(32) COMMENT '报名联系人电话',
  disease_snapshot VARCHAR(256) COMMENT '报名时疾病快照',
  client_source VARCHAR(32) COMMENT '客户端来源',
  idempotency_key VARCHAR(64) UNIQUE COMMENT '幂等键',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_trial (trial_id),
  INDEX idx_status (status),
  INDEX idx_idempotency (idempotency_key),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64),
  action VARCHAR(64) NOT NULL COMMENT '操作类型',
  resource_type VARCHAR(64) COMMENT '资源类型',
  resource_id VARCHAR(64) COMMENT '资源ID',
  details JSON COMMENT '操作详情',
  ip_address VARCHAR(45) COMMENT 'IP地址',
  user_agent VARCHAR(512) COMMENT 'User Agent',
  request_id VARCHAR(64) COMMENT '请求ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_action (user_id, action),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入示例试验数据
INSERT INTO trials (id, name, phase, type, indication, institution, location, contact_phone, description, inclusion_criteria, exclusion_criteria, status, target_count) VALUES
('trial_001', 'PD-1抑制剂治疗晚期非小细胞肺癌II期临床试验', 'II期', '干预性研究', '非小细胞肺癌（EGFR突变阳性）', '复旦大学附属肿瘤医院', '上海市徐汇区', '021-12345678', '评估PD-1抑制剂在晚期非小细胞肺癌患者中的疗效和安全性', '["年龄18-75岁", "确诊晚期NSCLC", "EGFR突变阳性", "至少一个可测量病灶"]', '["脑转移", "严重肝肾功能不全", "既往接受过免疫治疗"]', 'recruiting', 100),
('trial_002', '第三代EGFR-TKI治疗耐药后肺癌III期临床试验', 'III期', '干预性研究', 'EGFR T790M突变阳性肺癌', '中国医学科学院肿瘤医院', '北京市朝阳区', '010-87654321', '比较第三代EGFR-TKI与化疗在T790M突变阳性患者中的疗效', '["年龄18-75岁", "EGFR T790M突变阳性", "既往EGFR-TKI治疗进展"]', '["未控制的脑转移", "严重心血管疾病"]', 'recruiting', 200),
('trial_003', '抗血管生成药物联合免疫治疗肺癌Ib期临床试验', 'Ib期', '干预性研究', '晚期非小细胞肺癌', '中山大学肿瘤防治中心', '广州市天河区', '020-98765432', '探索抗血管生成药物联合PD-1抑制剂的安全性和初步疗效', '["年龄18-75岁", "晚期非小细胞肺癌", "未接受过系统治疗"]', '["出血倾向", "未控制的高血压", "活动性自身免疫疾病"]', 'recruiting', 50);
