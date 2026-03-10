# Treatbot 后端 API 接口规范

> 版本：v1.0.0  
> 日期：2026-02-25  
> 协议：HTTPS / JSON  
> 编码：UTF-8

---

## 通用规范

### 请求格式
- Content-Type: `application/json`
- 所有请求需携带 `Authorization: Bearer <access_token>`
- 写操作建议携带幂等键：`Idempotency-Key: <uuid>`
- `POST /api/applications` 强烈建议始终携带 `Idempotency-Key`，同用户 + 同接口 + 同 key 会返回首次成功响应，避免重复报名

### 联调环境约定
- 小程序联调/预发环境建议关闭本地兜底（`allowLocalFallback=false`），接口异常应直接透出后端错误
- 后端在本地存储模式下，非开发环境强制要求 `PUBLIC_BASE_URL` 为 HTTPS，避免下发 HTTP 资源链接

### 响应格式
```json
{
  "code": 0,
  "message": "success",
  "data": { }
}
```

### 错误码
| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权/Token 过期 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 409 | 冲突（如重复提交） |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 1. 认证相关

### 1.1 微信小程序登录
```
POST /api/auth/weapp-login
```

请求体：
```json
{
  "code": "wx_login_code_from_wx.login()"
}
```

响应：
```json
{
  "code": 0,
  "data": {
    "token": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "expiresIn": 1800,
    "userInfo": {
      "id": "user_xxx",
      "nickName": "微信昵称",
      "avatarUrl": "头像URL",
      "phone": "13800138000"
    }
  }
}
```

### 1.2 刷新 Token
```
POST /api/auth/refresh
```

请求体：
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

### 1.3 H5 登录（可选能力）
```
POST /api/auth/h5-login
```

请求体：
```json
{
  "phone": "13800138000",
  "code": "000000"
}
```

说明：
- 若服务端未开启 H5 登录，会返回 `501`（不再是 `404`）
- 联调环境可通过环境变量 `H5_LOGIN_ENABLED=true` 开启

### 1.4 绑定手机号（小程序）

请求体（兼容两种）：
```json
{
  "encryptedData": "xxx",
  "iv": "xxx"
}
```
或
```json
{
  "phoneNumber": "13800138000"
}
```

说明：
- 微信授权场景建议使用 `encryptedData + iv`，后端会基于最近一次 `weapp-login` 对应的 `session_key` 进行真实解密
- 如果 `session_key` 过期，请重新执行 `wx.login` 并换取新 token 后再调用绑定接口

响应：
```json
{
  "code": 0,
  "message": "绑定成功",
  "data": {
    "phone": "13800138000"
  }
}
```

### 1.5 获取个人信息（兼容路由）
```
GET /api/auth/profile
```

---

## 2. 用户相关

### 2.1 获取用户资料
```
GET /api/user/profile
```

响应：
```json
{
  "code": 0,
  "data": {
    "id": "user_xxx",
    "nickName": "用户名",
    "avatarUrl": "头像URL",
    "phone": "13800138000",
    "createdAt": "2026-01-15T08:30:00Z"
  }
}
```

### 2.2 获取用户统计
```
GET /api/user/stats
```

响应：
```json
{
  "code": 0,
  "data": {
    "records": 5,
    "matches": 12,
    "applications": 3
  }
}
```

### 2.3 更新用户资料
```
PUT /api/user/profile
```

请求体：
```json
{
  "nickName": "新昵称",
  "avatarUrl": "新头像URL"
}
```

---

## 3. 病历相关

### 3.1 上传病历文件
```
POST /api/medical/upload
Content-Type: multipart/form-data
```

表单字段：
- `file`: 文件 (jpg/png/pdf, max 10MB)
- `type`: 病历类型（出院小结/病理报告/影像报告/基因检测/诊断证明/其他）
- `remark`: 备注（可选，max 500字符）

响应：
```json
{
  "code": 0,
  "data": {
    "fileId": "file_xxx",
    "status": "pending",
    "uploadedAt": "2026-02-25T10:30:00Z"
  }
}
```

### 3.2 查询解析状态
```
GET /api/medical/parse-status?fileId=file_xxx
```

响应：
```json
{
  "code": 0,
  "data": {
    "fileId": "file_xxx",
    "status": "running",  // pending/running/completed/error
    "progress": 65,
    "result": {
      "diagnosis": "非小细胞肺癌",
      "stage": "IV期",
      "geneMutation": "EGFR 19del",
      "treatment": "化疗2周期",
      "confidence": 0.92
    },
    "createdAt": "2026-02-25T10:30:00Z",
    "updatedAt": "2026-02-25T10:31:30Z"
  }
}
```

### 3.3 获取病历列表
```
GET /api/medical/records?page=1&pageSize=20
```

响应：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "record_xxx",
        "type": "出院小结",
        "diagnosis": "非小细胞肺癌 IV期",
        "status": "parsed",  // pending/parsed/error
        "statusText": "已解析",
        "uploadTime": "2026-02-24",
        "matchCount": 3,
        "imageUrl": "https://oss.example.com/xxx.jpg?signature=xxx"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 5,
      "hasMore": false
    }
  }
}
```

### 3.4 获取病历详情
```
GET /api/medical/records/:id
```

响应：
```json
{
  "code": 0,
  "data": {
    "id": "record_xxx",
    "type": "出院小结",
    "diagnosis": "非小细胞肺癌",
    "stage": "IV期",
    "geneMutation": "EGFR 19del",
    "treatment": "化疗2周期",
    "status": "parsed",
    "uploadTime": "2026-02-24T08:30:00Z",
    "images": [
      "https://oss.example.com/xxx.jpg?signature=xxx"
    ],
    "structured": {
      "diagnosis": { "value": "非小细胞肺癌", "confidence": 0.95 },
      "stage": { "value": "IV期", "confidence": 0.92 },
      "geneMutation": { "value": "EGFR 19del", "confidence": 0.88 }
    }
  }
}
```

### 3.5 删除病历
```
DELETE /api/medical/records/:id
```

### 3.6 病历补全
```
PATCH /api/medical/records/:id/enrich
```

请求体（可按需传任意子集）：
```json
{
  "diagnosis": "非小细胞肺癌",
  "stage": "IV期",
  "geneMutation": "EGFR 19del",
  "treatment": "化疗+靶向",
  "entities": {
    "ecog": "1"
  }
}
```

响应：
```json
{
  "code": 0,
  "data": {
    "id": "rec_xxx",
    "updatedAt": "2026-02-27T10:30:00Z",
    "structured": {
      "entities": {}
    }
  }
}
```

---

## 4. 试验匹配相关

### 4.1 匹配列表（前端主路径）
```
GET /api/matches?page=1&pageSize=20&recordId=rec_xxx&filters={"disease":"肺癌","stage":"IV期","city":"上海","gene_mutation":"EGFR"}
```

查询参数：
- `recordId`：可选，指定后端优先按该病历计算匹配
- `filters`：可选 JSON 字符串，支持 `disease/diagnosis`、`stage`、`city/location`、`gene_mutation/geneMutation`
- `page/pageSize`：分页参数

说明：
- 切换不同 `recordId` 会导致匹配分和列表变化
- `filters.city` 会参与试验地点筛选，其余字段参与匹配计算和结果过滤

### 4.2 条件匹配（兼容小程序）
```
POST /api/trials/matches/find
```

请求体（`recordId` 优先）：
```json
{
  "recordId": "rec_xxx",
  "disease": "非小细胞肺癌",
  "stage": "IV期",
  "city": "上海",
  "gene_mutation": "EGFR 19del"
}
```

响应：
```json
{
  "code": 0,
  "data": [
    {
      "id": "trial_xxx",
      "name": "PD-1抑制剂治疗晚期肺癌II期临床试验",
      "score": 92,
      "phase": "II期",
      "location": "上海",
      "type": "干预性研究",
      "indication": "非小细胞肺癌（EGFR突变阳性）",
      "institution": "复旦大学附属肿瘤医院",
      "reasons": ["诊断信息与试验适应症高度相关"],
      "inclusion": ["年龄18-75岁"],
      "exclusion": ["脑转移"],
      "contact": {
        "name": "研究中心",
        "phone": "021-12345678",
        "email": ""
      },
      "updatedAt": "2026-02-27T10:30:00Z"
    }
  ]
}
```

### 4.3 获取试验列表（兼容前端）
```
GET /api/trials?keyword=肺癌&page=1&pageSize=20
```

查询参数：
- `page`: 页码，默认 1
- `pageSize`: 每页数量，默认 20
- `filters`: JSON 字符串，可选筛选条件

响应：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "match_xxx",
        "trialId": "trial_xxx",
        "name": "PD-1抑制剂治疗晚期肺癌II期临床试验",
        "score": 92,
        "phase": "II期",
        "location": "上海",
        "type": "干预性研究",
        "indication": "非小细胞肺癌（EGFR突变阳性）",
        "institution": "复旦大学附属肿瘤医院",
        "status": "recruiting",
        "reasons": [
          "诊断为非小细胞肺癌，符合入组条件",
          "EGFR 19del突变阳性，符合分子标志物要求"
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 12,
      "hasMore": true
    }
  }
}
```

### 4.4 获取试验详情
```
GET /api/trials/:id
```

响应：
```json
{
  "code": 0,
  "data": {
    "id": "trial_xxx",
    "name": "PD-1抑制剂治疗晚期肺癌II期临床试验",
    "phase": "II期",
    "type": "干预性研究",
    "indication": "非小细胞肺癌（EGFR突变阳性）",
    "institution": "复旦大学附属肿瘤医院",
    "location": "上海市徐汇区",
    "contactPhone": "021-12345678",
    "description": "试验简介...",
    "inclusionCriteria": ["年龄18-75岁", "确诊晚期NSCLC"],
    "exclusionCriteria": ["脑转移", "严重肝肾功能不全"],
    "status": "recruiting",
    "targetCount": 100,
    "enrolledCount": 45
  }
}
```

---

## 5. 报名相关

### 5.1 提交报名
```
POST /api/applications
Idempotency-Key: <uuid>
```

幂等说明：
- 推荐前端每次“报名动作”生成并携带固定 `Idempotency-Key`
- 同用户 + 同接口 + 同 key 在 24 小时内重复提交，将返回首次成功响应，不重复创建报名记录

请求体：
```json
{
  "trialId": "trial_xxx",
  "recordIds": ["record_xxx"],
  "name": "张三",
  "disease": "非小细胞肺癌",
  "phone": "13800138000",
  "trialName": "PD-1抑制剂治疗晚期肺癌II期临床试验",
  "location": "上海",
  "source": "weapp",
  "remark": "患者希望尽快入组"
}
```

响应：
```json
{
  "code": 0,
  "data": {
    "applicationId": "app_xxx",
    "status": "pending",
    "message": "报名成功，研究机构将在3个工作日内与您联系",
    "createdAt": "2026-02-25T10:30:00Z"
  }
}
```

### 5.2 获取报名记录列表
```
GET /api/applications?page=1&pageSize=20
```

响应：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "app_xxx",
        "trialId": "trial_xxx",
        "trialName": "PD-1抑制剂治疗晚期肺癌II期临床试验",
        "institution": "复旦大学附属肿瘤医院",
        "status": "pending",  // pending/contacted/enrolled/rejected/cancelled
        "statusText": "待联系",
        "applyTime": "2026-02-24 14:30",
        "contactPhone": "021-12345678"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 3,
      "hasMore": false
    }
  }
}
```

### 5.3 取消报名
```
PUT /api/applications/:id/cancel
```

请求体：
```json
{
  "reason": "患者改变主意"
}
```

---

## 6. 健康检查

### 6.1 服务健康检查
```
GET /health
```

响应：
```json
{
  "status": "ok",
  "timestamp": "2026-02-25T10:30:00Z",
  "version": "1.0.0"
}
```

---

## 数据库表设计（参考）

### users 表
```sql
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  openid VARCHAR(128) UNIQUE NOT NULL,
  unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url VARCHAR(512),
  phone VARCHAR(16),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_unionid (unionid)
);
```

### medical_records 表
```sql
CREATE TABLE medical_records (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  file_key VARCHAR(256) NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  file_size INT UNSIGNED,
  status ENUM('pending','running','completed','error') DEFAULT 'pending',
  diagnosis VARCHAR(256),
  stage VARCHAR(32),
  gene_mutation VARCHAR(256),
  treatment TEXT,
  structured JSON,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_status (status),
  INDEX idx_file_hash (file_hash)
);
```

### trial_applications 表
```sql
CREATE TABLE trial_applications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  trial_id VARCHAR(64) NOT NULL,
  record_ids JSON NOT NULL,
  status ENUM('pending','contacted','enrolled','rejected','cancelled') DEFAULT 'pending',
  remark TEXT,
  contact_name VARCHAR(64),
  contact_phone VARCHAR(32),
  disease_snapshot VARCHAR(256),
  client_source VARCHAR(32),
  idempotency_key VARCHAR(64) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_trial (trial_id),
  INDEX idx_idempotency (idempotency_key)
);
```

---

## 部署检查清单

- [ ] 配置 HTTPS 和 TLS 1.2+
- [ ] 配置 CORS，只允许小程序域名
- [ ] 配置限流（Rate Limiting）
- [ ] 配置 JWT 密钥和过期时间
- [ ] 配置 Redis（用于 nonce 去重、幂等、缓存）
- [ ] 配置对象存储（OSS/COS）
- [ ] 配置 OCR 服务密钥
- [ ] 配置日志收集和监控告警
- [ ] 配置数据库备份策略
