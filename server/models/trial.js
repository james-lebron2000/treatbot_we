const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Trial = sequelize.define('Trial', {
  id: {
    type: DataTypes.STRING(64),
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(256),
    allowNull: false
  },
  phase: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  indication: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  institution: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  inclusion_criteria: {
    type: DataTypes.JSON,
    allowNull: true
  },
  exclusion_criteria: {
    type: DataTypes.JSON,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('recruiting', 'closed', 'completed'),
    defaultValue: 'recruiting'
  },
  target_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  enrolled_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0
  },
  disease_tags: {
    type: DataTypes.JSON,
    allowNull: true
  },
  treatment_lines: {
    type: DataTypes.JSON,
    allowNull: true
  },
  study_cities: {
    type: DataTypes.JSON,
    allowNull: true
  },
  treatment_approach: {
    type: DataTypes.STRING(128),
    allowNull: true
  },
  brief_inclusion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  structured_inclusion: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'LLM解析的结构化入组条件: {age_min, age_max, ecog_max, survival_months, required_genes, ...}'
  },
  gene_requirement: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: '基因要求（来自源数据）'
  },
  sponsor: {
    type: DataTypes.STRING(128),
    allowNull: true,
    comment: '申办方简称'
  },
  hospitals: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '所有研究医院列表'
  },
  patient_subsidy: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '患者补助说明'
  },
  required_documents: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '报名所需资料'
  },
  // PRD-2026Q2 §2.4：试验新鲜度字段
  last_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '最后一次被抓取/人工确认仍在招募的时间'
  },
  freshness_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 100,
    comment: '新鲜度 0-100，低于 30 视为过期并自动关闭'
  },
  // PRD-2026Q3 T1-1：上游注册号（ClinicalTrials.gov），抓取作业回查依据
  // PRD-2026Q4 T0-7：NCT ID 格式强校验，避免脏数据流入下游匹配 / 上报
  nct_id: {
    type: DataTypes.STRING(32),
    allowNull: true,
    comment: 'ClinicalTrials.gov 注册号 NCTxxxxxxxx',
    validate: {
      isNctFormat(value) {
        if (value !== null && value !== undefined && !/^NCT\d{8}$/.test(value)) {
          throw new Error(`nct_id 格式不正确：${value}`);
        }
      }
    }
  }
}, {
  tableName: 'trials',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Trial;
