# Treatbot 性能优化指南

## 一、前端优化（微信小程序）

### 1. 启动性能优化

#### 分包加载
```javascript
// app.json
{
  "subpackages": [
    {
      "root": "package-match",
      "pages": [
        "pages/matches/detail/detail"
      ]
    },
    {
      "root": "package-profile",
      "pages": [
        "pages/profile/about/about",
        "pages/profile/privacy/privacy"
      ]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["package-match"]
    }
  }
}
```

#### 首屏优化
- 使用骨架屏展示加载状态
- 优先加载首屏数据
- 延迟加载非关键资源

### 2. 渲染性能优化

#### 减少 setData 次数
```javascript
// 不推荐：多次 setData
this.setData({ loading: true });
this.setData({ list: data });
this.setData({ loading: false });

// 推荐：合并 setData
this.setData({
  loading: false,
  list: data
});
```

#### 图片优化
- 使用 `webp` 格式
- 控制图片尺寸（宽度不超过 750px）
- 使用懒加载 `<image lazy-load>`
- 压缩上传前的图片

```javascript
// 图片压缩示例
compressImage(filePath) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 80,
      success: (res) => resolve(res.tempFilePath)
    });
  });
}
```

### 3. 网络请求优化

#### 请求合并
- 使用 GraphQL 或自定义批量接口
- 减少 HTTP 请求次数

#### 数据缓存
```javascript
// 使用本地缓存
const cacheData = wx.getStorageSync('matches_cache');
if (cacheData && Date.now() - cacheData.timestamp < 5 * 60 * 1000) {
  // 使用缓存数据
  this.setData({ matches: cacheData.data });
} else {
  // 请求新数据
  this.loadMatches();
}
```

#### 请求去重
```javascript
// 避免重复请求
if (this.loadingPromise) {
  return this.loadingPromise;
}
this.loadingPromise = api.getMatches().finally(() => {
  this.loadingPromise = null;
});
```

---

## 二、后端优化（Node.js）

### 1. 数据库优化

#### 索引优化
```sql
-- 病历表索引
CREATE INDEX idx_user_created ON medical_records(user_id, created_at DESC);
CREATE INDEX idx_status ON medical_records(status);
CREATE INDEX idx_file_hash ON medical_records(file_hash);

-- 报名表索引
CREATE INDEX idx_user_trial ON trial_applications(user_id, trial_id);
CREATE INDEX idx_status ON trial_applications(status);
```

#### 查询优化
```javascript
// 使用关联查询代替多次查询
const records = await MedicalRecord.findAll({
  where: { user_id: userId },
  include: [{
    model: User,
    attributes: ['nickname', 'avatar_url']
  }],
  order: [['created_at', 'DESC']],
  limit: 20
});
```

#### 连接池调优
```javascript
const sequelize = new Sequelize({
  // ...
  pool: {
    max: 20,        // 最大连接数
    min: 5,         // 最小连接数
    acquire: 30000, // 获取连接超时
    idle: 10000     // 空闲连接超时
  }
});
```

### 2. Redis 缓存策略

#### 热点数据缓存
```javascript
// 用户统计缓存
const cacheKey = `user:stats:${userId}`;
let stats = await redis.get(cacheKey);

if (!stats) {
  stats = await calculateUserStats(userId);
  await redis.setex(cacheKey, 300, JSON.stringify(stats)); // 5分钟缓存
}
```

#### 缓存穿透防护
```javascript
// 空值缓存
const cacheKey = `record:${id}`;
let record = await redis.get(cacheKey);

if (record === null) {
  // 数据库查询
  record = await MedicalRecord.findByPk(id);
  
  // 缓存空值（防止穿透）
  await redis.setex(cacheKey, 60, record ? JSON.stringify(record) : 'null');
}
```

### 3. 异步处理优化

#### OCR 任务队列
```javascript
// 使用 Bull 队列
const ocrQueue = new Bull('ocr', {
  redis: { port: 6379, host: '127.0.0.1' },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// 限制并发数
ocrQueue.process(5, async (job) => {
  // 处理 OCR 任务
});
```

### 4. 文件上传优化

#### 流式处理
```javascript
// 使用流式上传，避免内存溢出
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  }
});
```

#### 分片上传（大文件）
```javascript
// 前端分片
const chunkSize = 1024 * 1024; // 1MB
const chunks = Math.ceil(file.size / chunkSize);

for (let i = 0; i < chunks; i++) {
  const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);
  await uploadChunk(chunk, i, chunks);
}
```

---

## 三、数据库优化（MySQL）

### 1. 表结构优化

#### 分区表（大数据量）
```sql
-- 按时间分区
CREATE TABLE medical_records (
  -- ...
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (YEAR(created_at)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

### 2. 慢查询优化

#### 启用慢查询日志
```ini
[mysqld]
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = 1
```

#### 分析和优化
```sql
-- 查看慢查询
SELECT * FROM mysql.slow_log 
ORDER BY start_time DESC 
LIMIT 10;

-- 分析查询
EXPLAIN SELECT * FROM medical_records 
WHERE user_id = 'xxx' AND status = 'completed';
```

---

## 四、监控和告警

### 1. 关键指标监控

#### 应用指标
- API 响应时间 (P50/P95/P99)
- 错误率
- 吞吐量 (QPS)
- 并发连接数

#### 数据库指标
- 连接池使用率
- 慢查询数量
- 锁等待时间
- 主从延迟

### 2. 性能测试

#### 负载测试
```bash
# 使用 Apache Bench
ab -n 10000 -c 100 http://localhost:3000/health

# 使用自定义脚本
node tests/load-test.js
```

#### 压力测试
```bash
# 使用 Artillery
npm install -g artillery
artillery quick --count 50 --num 20 http://localhost:3000/api/matches
```

---

## 五、扩容策略

### 1. 垂直扩容
- 升级服务器配置（CPU/内存）
- 升级数据库配置
- 增加 Redis 内存

### 2. 水平扩容

#### 应用层扩容
```yaml
# docker-compose.yml
services:
  api:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

#### 数据库读写分离
```javascript
const sequelize = new Sequelize({
  replication: {
    read: [
      { host: 'read-replica-1', ... },
      { host: 'read-replica-2', ... }
    ],
    write: { host: 'master', ... }
  }
});
```

---

## 六、性能基准

### 目标指标

| 指标 | 目标值 | 警告值 | 严重值 |
|------|--------|--------|--------|
| API 响应时间 (P95) | < 200ms | > 500ms | > 1s |
| 数据库查询时间 | < 50ms | > 100ms | > 500ms |
| 页面加载时间 | < 2s | > 3s | > 5s |
| 错误率 | < 0.1% | > 1% | > 5% |
| CPU 使用率 | < 50% | > 70% | > 90% |
| 内存使用率 | < 70% | > 80% | > 95% |

---

## 七、优化检查清单

### 部署前检查
- [ ] 数据库索引已创建
- [ ] 慢查询已优化
- [ ] Redis 缓存策略已配置
- [ ] 连接池参数已调优
- [ ] 错误处理已完善
- [ ] 日志级别已设置

### 上线后检查
- [ ] 监控已配置
- [ ] 告警规则已设置
- [ ] 性能基线已建立
- [ ] 扩容方案已准备

---

## 八、工具推荐

### 性能分析工具
- **Node.js**: clinic.js, 0x
- **数据库**: MySQL Workbench, pt-query-digest
- **前端**: 微信小程序性能面板, Lighthouse

### 监控工具
- **APM**: New Relic, Datadog
- **日志**: ELK Stack, Loki
- **指标**: Prometheus + Grafana

---

**持续优化，让 Treatbot 更快、更稳定！**
