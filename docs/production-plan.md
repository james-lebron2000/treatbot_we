# Treatbot 微信小程序生产级落地方案（2026-02-25）

## 0. 执行摘要
当前项目已具备可演示的前端流程，但距离生产可用仍有明显差距：

- 前端存在「原型代码 + 生产代码」混合状态（模拟数据、硬编码、重复请求层并存）。
- 医疗数据场景下的合规、安全、审计链路尚未闭环。
- 后端生产架构（鉴权、异步任务、文件存储、监控告警）需要系统化建设。

本方案给出：

1. 逐页代码质量/安全/性能诊断。
2. 可直接采购服务器并部署的生产架构蓝图。
3. 小程序端优化与微信生态集成设计。
4. AI/OCR 服务选型与异步队列落地。
5. 三阶段实施路线图与预算模型。
6. 本次已完成的可执行代码改进（已落库）。

---

## 1. 当前代码问题诊断

## 1.1 页面级检查结论（全量）
| 页面 | 代码质量 | 安全 | 性能 | 规范 | 结论 |
|---|---|---|---|---|---|
| `pages/index/index` | 结构清晰，但数据模型映射逻辑散落页面层 | 最近匹配缓存可能包含敏感病种信息 | 已做缓存，但缺分页策略 | 命名统一度中等 | 可上线，建议下沉 ViewModel 和脱敏缓存 |
| `pages/upload/upload` | 已改为真实上传；流程与后端能力一致（单文件） | 文件类型/大小校验已加，仍需服务端二次校验 | 交互流畅，避免了模拟解析 UI 的无效渲染 | 仍有可复用代码可抽离 | 可上线，需补服务端病毒扫描/哈希去重 |
| `pages/upload/status/status` | 轮询逻辑较完整 | 已加超时、重试、防并发轮询 | 轮询间隔合理，但可进一步改为 SSE/WebSocket | 状态机可继续抽象 | 可上线，建议后续改事件驱动 |
| `pages/records/records` | 列表逻辑简单 | 本地缓存已移除，降低敏感数据落地风险 | 缺分页与懒加载 | 结构一致 | 可上线，需补分页 |
| `pages/records/detail/detail` | 详情展示清晰 | 预览图 URL 可信度依赖后端 | 图片多时无懒加载 | 规范良好 | 可上线，建议增加水印/访问签名 |
| `pages/matches/matches` | 已改为真实报名接口，避免假成功 | 有幂等 Key（API 层），仍需服务端去重 | 缺分页、筛选条件未落地 | 逻辑清晰 | 可上线，需补筛选+分页 |
| `pages/matches/detail/detail` | 详情完整 | 联系方式直出，需防抓取与频控 | 内容较多，首屏可裁剪 | 代码可读性好 | 可上线，建议加防滥用策略 |
| `pages/profile/profile` | 多处静态假数据 | 个人信息显示策略需合规审计 | 性能无明显问题 | 需接真实用户中心 API | 上线前必须去硬编码 |
| `pages/profile/applications/applications` | 已增加防重复加载 | 仅展示列表，风险低 | 缺分页 | 规范较好 | 可上线，需补分页 |
| `pages/profile/about/about` | 文本页，风险低 | 无明显风险 | 无明显瓶颈 | 规范良好 | 可上线 |
| `pages/profile/privacy/privacy` | 文本页，风险低 | 文案需与真实合规策略一致 | 无明显瓶颈 | 规范良好 | 上线前需法务审定文案 |

## 1.2 全局代码问题（P0/P1/P2）

### P0（上线阻断）
1. 用户中心仍有硬编码展示（`pages/profile/profile.js`）。
2. 医疗数据合规链路未闭环（缺数据分级、审计、留痕、删除闭环）。
3. 尚未看到后端生产环境的权限模型、限流、防刷、防重放的服务端实现。

### P1（1-2个迭代内完成）
1. 列表类页面缺分页/游标，数据量上来后会抖动。
2. 组件虽完整，但页面大量直接写结构，复用不足。
3. 缺统一埋点与错误上报（用户路径、失败率、OCR耗时无量化）。
4. `project.config.json` 的 `urlCheck=false` 适合开发，不适合生产验收配置。

### P2（持续优化）
1. 缺子包拆分与首屏瘦身策略。
2. 缺自动化质量门禁（ESLint/单测/E2E）。
3. 视觉层存在大量 emoji 图标，不利于医疗产品品牌一致性与可访问性。

## 1.3 本次已落地的可执行代码改进
已在仓库完成如下改造：

1. 上传流程改为真实后端调用，不再前端“模拟上传/模拟解析”。
2. 上传状态轮询增加生产兜底：超时、连续失败阈值、防并发轮询、页面隐藏暂停。
3. 匹配列表页“立即报名”改为真实 API 提交，含提交中状态保护。
4. 首页/匹配/病历/报名记录加入防重复加载与刷新间隔控制，减少无效请求。
5. 病历列表移除本地持久缓存，降低敏感信息落盘风险。
6. `app.js` 的请求入口收敛至 `utils/api.js`，避免双请求栈漂移。
7. `utils/api.js` 增加业务状态码校验（`code!=0` 直接失败），避免“HTTP 成功但业务失败”漏拦截。

涉及文件：

- `app.js`
- `utils/api.js`
- `pages/upload/upload.js`
- `pages/upload/upload.wxml`
- `pages/upload/status/status.js`
- `pages/index/index.js`
- `pages/matches/matches.js`
- `pages/records/records.js`
- `pages/profile/applications/applications.js`

---

## 2. 生产级后端架构设计

## 2.1 总体架构（推荐）

```text
微信小程序
   |
   v
Nginx/API Gateway (TLS, WAF, 限流, 黑白名单)
   |
   +--> Node.js API (PM2 Cluster)
   |       |- Auth Service (微信登录/JWT)
   |       |- Record Service (病历元数据)
   |       |- Match Service (规则/模型匹配)
   |       |- Notification Service (订阅消息)
   |
   +--> Worker Service (OCR/NLP异步任务)
           |- Queue Consumer
           |- OCR Adapter (腾讯/阿里/百度)
           |- NLP Structuring

Data Layer:
- MySQL 8.0 (主库 + 只读副本)
- Redis (缓存、幂等、nonce、防重放、队列状态)
- OSS/COS/BOS (原始文件、结果文件，私有桶)
- 对象存储回调 + 病毒扫描 + 生命周期策略

Observability:
- Prometheus + Grafana (指标)
- Loki/ELK (日志)
- OpenTelemetry + Jaeger (链路)
- Sentry (前端/后端异常)
```

## 2.2 服务器配置建议（按阶段）

### 第一阶段（MVP，DAU < 3,000）
- 应用服务器：`2 台 * 4C8G`（主备/滚动发布）
- MySQL：托管版 `2C4G` 起步（100GB SSD）
- Redis：托管版 `1GB-2GB`
- 带宽：`5~10 Mbps`（静态资源走 CDN）
- 对象存储：100GB 起步，开启生命周期自动转低频

### 第二阶段（DAU 3,000~20,000）
- 应用服务器：`3 台 * 8C16G`
- Worker：`2 台 * 8C16G`（OCR/NLP 异步）
- MySQL：`4C8G` 主库 + 只读实例
- Redis：`4GB+`，AOF 持久化
- 带宽：`20~50 Mbps`

### 第三阶段（DAU > 20,000）
- Kubernetes/容器编排，服务拆分（API、匹配、OCR编排、通知）
- MySQL 分库分表或引入 TiDB；历史归档库分离
- OCR/匹配计算节点弹性扩缩容

## 2.3 数据库选型（MongoDB vs MySQL）

### 结论
- 主库选 **MySQL**（强事务、一致性、审计友好，适合报名/支付/权限）。
- 可选 **MongoDB** 作为“非结构化 OCR 中间结果仓”扩展，不作为核心交易库。

### 核心表建议（MySQL）
1. `users`：用户主档（openid/unionid 关联）
2. `user_sessions`：JWT 刷新会话、设备指纹
3. `medical_records`：病历主记录（状态机）
4. `medical_record_files`：病历图片/文件元数据（对象存储 key、hash）
5. `ocr_tasks`：异步任务主表（pending/running/success/failed）
6. `ocr_task_events`：任务事件流水（审计）
7. `structured_entities`：结构化字段（诊断、分期、基因等）
8. `trial_catalog`：临床试验基础数据
9. `trial_matches`：匹配结果（score、reasons、version）
10. `trial_applications`：报名申请（幂等键、状态流）
11. `payment_orders`：支付订单（如启用付费服务）
12. `audit_logs`：审计日志（谁在何时访问了什么）

关键索引：
- `medical_records(user_id, created_at desc)`
- `ocr_tasks(record_id, status, updated_at)`
- `trial_matches(record_id, score desc)`
- `trial_applications(user_id, trial_id, created_at)`
- `audit_logs(user_id, action, created_at)`

## 2.4 API 安全设计（JWT / HTTPS / 防重放）

### JWT 方案
- Access Token：15~30 分钟。
- Refresh Token：7~30 天，服务端存储并支持吊销。
- Token 绑定设备指纹（`client_id` + `device_id` + `jti`）。

### HTTPS
- 全站强制 HTTPS（TLS1.2+）。
- HSTS、TLS 现代套件、禁明文回落。

### 防重放（关键）
客户端请求头：
- `Authorization: Bearer <access_token>`
- `X-Timestamp`
- `X-Nonce`
- `X-Request-Id`
- `Idempotency-Key`（写接口）

服务端校验：
1. 时间窗口（如 ±300 秒）。
2. Redis 去重：`nonce:user_id:nonce`（TTL 5 分钟，已存在即拒绝）。
3. 写请求必须有幂等键，重复提交返回同结果。
4. 高频接口增加令牌桶限流 + 风险画像（IP/设备/账号）。

## 2.5 文件存储方案（OSS vs 本地）

### 结论
- **生产必须对象存储（OSS/COS/BOS）+ 私有桶 + 短时签名 URL**。
- 本地磁盘仅用于开发，不可用于生产医疗数据。

### 推荐策略
1. 客户端仅拿临时上传凭证（STS），不暴露长期密钥。
2. 上传后回调业务服务登记元数据（hash、size、mime、uploader）。
3. 入库前做病毒扫描/图片内容安全检测。
4. 生命周期：原图 90~180 天转低频，长期留存走合规归档。

## 2.6 部署架构（Docker + Nginx + PM2）

### 推荐落地
- Docker Compose（MVP）或 Kubernetes（扩展期）。
- Nginx：TLS、反向代理、限流、静态缓存、灰度路由。
- Node API/Worker：容器内 PM2 `cluster` 模式（按 CPU 核数扩进程）。

### 最小可运行服务集
- `nginx`
- `api`
- `worker`
- `redis`
- `mysql`（建议托管，容器仅开发）

## 2.7 监控与日志方案

### 指标（Prometheus）
- 接口：QPS、P95/P99、错误率
- 业务：上传成功率、OCR成功率、匹配完成率、报名转化率
- 基础：CPU/内存/磁盘/连接池/队列堆积

### 日志（Loki/ELK）
- 结构化 JSON 日志（含 `trace_id`, `user_id`, `record_id`, `request_id`）
- 医疗敏感字段脱敏后落日志

### 告警（Grafana Alertmanager）
- 5xx 连续 5 分钟 > 1%
- OCR 队列积压 > 阈值
- MySQL 主从延迟超阈
- 登录失败突增（疑似攻击）

---

## 3. 小程序端优化

## 3.1 性能优化
1. 页面分包：`upload`、`matches/detail`、`profile/*` 进入子包。
2. 列表分页 + 下拉增量加载，避免一次拉全量。
3. 图片上传前本地压缩（宽高/质量）并限制并发上传数。
4. 减少大对象 `setData`，只增量更新必要字段。
5. 为关键列表加骨架屏，弱网下保持可感知进度。

## 3.2 用户体验改进
1. 上传失败给出可执行原因（网络、格式、大小、服务繁忙）。
2. 状态页提供“后台处理完成后消息通知”入口。
3. 病历详情增加字段置信度与“人工修正”入口。
4. 匹配结果增加筛选（地区/分期/是否招募中）。

## 3.3 微信生态集成（登录/支付/订阅）
1. 登录：`wx.login -> 后端 code2Session -> 签发 JWT`。
2. 支付：如后续引入增值服务，接 `wx.requestPayment` + 订单签名校验。
3. 订阅消息：在 OCR 完成、报名状态变化时触发一次性通知。
4. 客服与服务通知统一在用户中心沉淀。

## 3.4 离线缓存策略（医疗场景）
- 可缓存：非敏感字典、UI 配置、试验静态标签。
- 谨慎缓存：病历摘要（建议不落盘或短 TTL 且脱敏）。
- 不缓存：病历原文、身份证号、联系方式等敏感字段。
- 清理策略：退出登录、token 失效、版本升级时主动清空敏感缓存。

---

## 4. AI/OCR 服务集成

## 4.1 病历解析服务架构

```text
上传文件 -> 任务入队 -> OCR -> 医疗NLP抽取 -> 结构化归一 -> 质量校验 -> 匹配引擎
                             |                              |
                             +-- 低置信度回退人工校对 ------+
```

关键点：
1. 每个文件生成 `task_id`，全链路可追踪。
2. 任务状态机：`pending -> running -> success/failed`。
3. 幂等：按 `file_hash + user_id` 去重，重复上传直接复用结果。
4. 质量门槛：低置信度字段标记人工确认，避免错误医疗建议。

## 4.2 第三方 OCR 选型（腾讯云/阿里云/百度）

### 结论（推荐）
- 默认主引擎：**腾讯云 OCR**（医疗/行业文档能力与微信生态协同更强）。
- 成本优化与兜底：接入 **阿里云或百度 OCR** 作为降级路由。

### 选型维度
1. 医疗文档识别准确率（首要）
2. API 稳定性与 SLA
3. 价格与梯度包
4. 私有化/专有网络接入能力
5. 合规支持（日志、审计、数据处理协议）

### 价格参考（需按采购时实时复核）
- 腾讯云 OCR 文档：通用印刷体资源包可见 `1万次=800元`（不同能力价格不同）。
- 阿里云 OCR 文档：通用文字识别资源包可见 `1万次=550元`。
- 百度 OCR 价格页：通用标准版可见 `1万次=50元`（不同版本/精度价差大）。

> 说明：三家的“能力档位”并不等价，不能只按单价比较，必须做同数据集 A/B 精度评测。

## 4.3 异步处理队列设计

### 推荐组件
- MVP：Redis + BullMQ
- 进阶：Kafka / RabbitMQ（多消费者组、可回放）

### 队列设计
1. `ocr_queue`：OCR 识别任务
2. `nlp_queue`：实体抽取/结构化
3. `match_queue`：匹配计算
4. `notify_queue`：订阅消息/短信

### 可靠性策略
- 重试策略：指数退避，最大重试次数（3~5）
- 死信队列：超过重试阈值入 DLQ
- 幂等消费：按 `task_id` + `step` 去重
- 任务可观测：记录排队时长、执行时长、失败原因

## 4.4 医疗数据合规（HIPAA / 等保）

### 中国区最低基线（建议）
1. 按《网络安全法》《数据安全法》《个人信息保护法》执行。
2. 做等保 2.0（建议至少二级，医疗数据场景通常向三级靠齐）。
3. 敏感数据分类分级、最小权限访问、全量审计留痕。

### 涉及美国 PHI（若有）
1. 与云厂商和服务商签署 BAA（业务伙伴协议）。
2. 开展 HIPAA Administrative/Physical/Technical Safeguards 对照。

### 技术控制清单
- 传输加密（TLS）
- 存储加密（KMS 管理密钥）
- 审计日志不可篡改（WORM/归档）
- 定期渗透测试与漏洞扫描
- 数据删除与导出流程可追踪

---

## 5. 具体实施路线图

## 第一阶段（MVP上线，4~6周）
目标：完成可稳定运营的最小闭环。

1. 后端基础：登录、上传、OCR任务、匹配、报名接口。
2. 部署：Docker + Nginx + PM2 + 托管 MySQL/Redis。
3. 小程序：真实上传/状态轮询/报名闭环。
4. 监控：基础指标 + 错误告警。
5. 合规：隐私政策、用户授权、日志脱敏。

验收指标：
- 上传成功率 > 98%
- OCR 完成率 > 95%
- P95 API 延迟 < 500ms（非 OCR 接口）

## 第二阶段（功能完善，6~10周）
目标：提升可用性、准确率和运营能力。

1. 接入 OCR 多供应商路由与 A/B 评测。
2. 匹配策略版本化 + 人工复核后台。
3. 列表分页、筛选、搜索。
4. 微信订阅消息、客服闭环。
5. 安全加固：风控限流、防刷、防重放服务端落地。

## 第三阶段（规模化，3~6个月）
目标：高可用、可审计、可扩展。

1. 服务拆分与容器编排（K8s）。
2. 数据分层（在线库/分析库/归档库）。
3. 全链路观测与容量预测。
4. 等保测评与常态化安全运营。

---

## 6. 成本估算（人民币，月度）

## 6.1 估算前提
- 地域：中国大陆
- DAU：MVP 1k~3k，第二阶段 3k~20k
- OCR：MVP 按 1~3 万次/月估算
- 采用托管数据库，减少运维事故风险

## 6.2 月成本区间
| 成本项 | MVP | 功能完善期 | 规模化 |
|---|---:|---:|---:|
| 应用服务器 | 800 ~ 2,500 | 3,000 ~ 8,000 | 10,000+ |
| MySQL（托管） | 600 ~ 1,500 | 1,500 ~ 4,000 | 8,000+ |
| Redis（托管） | 200 ~ 600 | 600 ~ 2,000 | 4,000+ |
| 对象存储 + CDN | 200 ~ 800 | 800 ~ 3,000 | 8,000+ |
| OCR 调用 | 1,000 ~ 6,000 | 6,000 ~ 30,000 | 50,000+ |
| 监控/日志/告警 | 300 ~ 1,500 | 1,500 ~ 5,000 | 10,000+ |
| 安全（WAF/漏洞扫描） | 500 ~ 2,000 | 2,000 ~ 8,000 | 20,000+ |
| 合计（估算） | **3,600 ~ 14,900** | **15,400 ~ 60,000** | **110,000+** |

## 6.3 运维人力成本
- MVP：0.2~0.5 人月（开发兼运维）
- 完善期：0.5~1 人月（建议专职 SRE/DevOps）
- 规模化：1~3 人月（含安全与数据治理）

## 6.4 一次性成本（可选）
- 等保测评与整改：约 8 万 ~ 30 万+
- 安全加固/渗透测试：约 3 万 ~ 15 万+

---

## 7. 建议的立即执行清单（下周可落地）
1. 后端补齐服务端防重放与幂等校验（Redis nonce + idempotency key）。
2. `profile` 页改真实用户数据源，清理硬编码。
3. 列表接口统一改分页（`cursor`/`pageSize`）。
4. 接入错误上报（Sentry）和 API 指标看板（Prometheus + Grafana）。
5. OCR 双供应商 A/B 测试，拿真实病历样本做精度与成本对比。

---

## 附录：参考资料（2026-02-25 检索）
1. 腾讯云 OCR 计费概述（官方）  
   https://cloud.tencent.com/document/product/866/17619
2. 腾讯云 行业文档识别（官方）  
   https://cloud.tencent.com/product/documentocr
3. 阿里云 OCR 资源包价格与抵扣规则（官方）  
   https://help.aliyun.com/zh/ocr/product-overview/resource-plans
4. 阿里云 OCR 产品计费说明（官方）  
   https://help.aliyun.com/zh/ocr/product-overview/product-billing/
5. 百度智能云 OCR 价格详情（官方）  
   https://cloud.baidu.com/product-price/ocr.html
6. OWASP API Security Project（官方）  
   https://owasp.org/www-project-api-security/
7. OWASP API Security Top 10（官方）  
   https://owasp.org/API-Security/
8. OWASP JWT Cheat Sheet（官方）  
   https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html

