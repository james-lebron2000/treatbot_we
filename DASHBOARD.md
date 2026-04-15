# TreatBot 迭代进度 Dashboard

> 最后更新: 2026-04-01
> 当前版本: v14（已部署） | 下一目标: v15（结构化匹配全量生效）

---

## 图例

- ✅ 已完成
- 🔄 进行中
- ⬜ 待启动
- 🔴 P0 阻断 | 🟠 P1 重要 | 🟡 P2 优化 | 🟢 P3 增强

---

## 一、临床准确性（Clinical Accuracy）

> 目标：匹配结果对真实患者有临床参考价值，减少"误匹配"和"漏匹配"

### A. 匹配引擎

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| A1 | 两阶段匹配：SQL 粗筛（disease_tags + study_cities） | 🔴 P0 | ✅ | 已部署，从全量扫描改为按病种 SQL 过滤 |
| A2 | 试验数据补全：disease_tags / treatment_lines / study_cities | 🔴 P0 | ✅ | importTrials.js 全量导入 496 条 |
| A3 | 结构化入排标准解析（LLM batch parse） | 🔴 P0 | 🔄 | 已解析 60/496，其余待本地 Python 脚本补全 |
| A4 | 硬排除逻辑：年龄/ECOG 超出范围直接过滤 | 🔴 P0 | ✅ | matchEngine.js 中 `excluded: true` 逻辑已上线 |
| A5 | 治疗线数匹配（prior_lines_min/max vs 患者 treatment_line） | 🟠 P1 | ✅ | 已实现评分加分 |
| A6 | PD-L1 阈值匹配（CPS/TPS 数值对比） | 🟠 P1 | ✅ | 正则提取 + 阈值对比 |
| A7 | 基因突变上下文匹配（阳性/野生型/待检） | 🟠 P1 | ✅ | gene_context 正向/负向评分 |
| A8 | 结构化入排全量生效（436 条剩余试验解析完成） | 🔴 P0 | ⬜ | 运行 `parseInclusionLocal.py` 后执行 loadStructuredInclusion |
| A9 | 先验疗法硬排除（excluded_prior_therapies 匹配） | 🟠 P1 | ⬜ | 患者用过 PD-1 则排除"排除既往 PD-1"的试验 |
| A10 | 癌种语义扩展（"胃癌"包含"胃腺癌"/"幽门癌"等子类型） | 🟡 P2 | ⬜ | 需要疾病本体词典或 LLM 同义词扩展 |
| A11 | 多病历综合匹配（多份检查报告合并患者 profile） | 🟡 P2 | ✅ | mergeRecords 前端已实现 |
| A12 | 试验状态实时同步（定期爬虫更新 status 字段） | 🟡 P2 | ⬜ | 当前依赖手动 import |

### B. OCR & 信息抽取

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| B1 | Kimi Vision 主路 + 腾讯 OCR 降级 | 🔴 P0 | ✅ | 已部署 |
| B2 | treatmentLine 字段抽取（"一线治疗失败"→2） | 🟠 P1 | ✅ | extractMedicalEntities 正则 + Kimi prompt |
| B3 | pdl1 字段抽取（数值+类型）存 MedicalRecord | 🟠 P1 | ✅ | queue.js 已写入 |
| B4 | ECOG 评分抽取 | 🟠 P1 | ✅ | structured.entities.ecog |
| B5 | 年龄抽取（生日→年龄换算） | 🟠 P1 | ✅ | getPatientAge() |
| B6 | 结构化病历展示（前端诊断摘要卡片） | 🟡 P2 | ⬜ | 目前仅展示原始字段，缺病历摘要 UI |
| B7 | 手动补录字段（ECOG/治疗线数输入框） | 🟡 P2 | ⬜ | schema.ts 已定义，UI 待实现 |

---

## 二、产品完整性（Product Closure）

> 目标：患者和家属能独立完成"上传→匹配→报名"完整闭环，无需人工干预

### C. 核心流程

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| C1 | 文件上传（图片/PDF）→ OCR → 匹配结果展示 | 🔴 P0 | ✅ | 完整流程已上线 |
| C2 | 多文件合并（多张检查单合并一份病历） | 🟠 P1 | ✅ | mergeRecords 已实现 |
| C3 | 试验详情页（入排标准/医院/联系方式） | 🟠 P1 | ✅ | TrialDetailView 已实现 |
| C4 | 试验申请按钮 → 申请记录保存 | 🟠 P1 | ✅ | POST /api/applications 已实现 |
| C5 | **申请管理页**（查看/取消我的申请） | 🟠 P1 | ⬜ | API 已有，前端页面 `/applications` 未实现 |
| C6 | **报名资料清单**（试验详情页展示所需文件） | 🟠 P1 | ⬜ | required_documents 字段已存，UI 未展示 |
| C7 | **患者补助展示**（详情页展示 patient_subsidy） | 🟡 P2 | ⬜ | 数据已有，UI 未展示 |
| C8 | **申请状态跟踪**（pending→contacted→screened→enrolled） | 🟠 P1 | ⬜ | 数据模型已有，前端状态流程未实现 |
| C9 | 申请超时提醒（>3天未跟进自动提醒） | 🟡 P2 | ⬜ | 需 cron job + 通知（微信/短信） |
| C10 | 收藏/对比试验 | 🟡 P2 | ⬜ | 用户高频需求，收藏列表 + 两两对比 |
| C11 | 搜索页过滤器（癌种/城市/阶段/基因要求）| 🟡 P2 | 🔄 | 基础 filters 已实现，需 UI 优化 |

### D. 微信小程序端

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| D1 | 小程序端上传+OCR | 🔴 P0 | ✅ | 已上线 |
| D2 | 小程序端匹配结果展示 | 🔴 P0 | ✅ | 已上线 |
| D3 | 小程序端试验详情 | 🟠 P1 | ✅ | 已上线 |
| D4 | 小程序端申请管理 | 🟠 P1 | ⬜ | 同 C5 |
| D5 | 小程序客服消息（申请状态变更推送） | 🟡 P2 | ⬜ | 微信模板消息 |

---

## 三、增长与运营（Growth & Operations）

> 目标：提高用户到达率、激活率、留存率，为商业化做准备

### E. 用户获取

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| E1 | H5 可分享匹配报告（带二维码/链接） | 🟠 P1 | ⬜ | POST /api/matches/share 端点 + 公开页面 |
| E2 | 试验分享卡片（单条试验生成图片/卡片） | 🟡 P2 | ⬜ | canvas 生成或 HTML2Canvas |
| E3 | 公众号/小程序关联（引流入口） | 🟡 P2 | ⬜ | 需申请微信服务号 |
| E4 | SEO 落地页（癌种专项页：胃癌临床试验/肺癌临床试验） | 🟢 P3 | ⬜ | SSR/静态生成 + 百度 sitemap |

### F. 激活与留存

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| F1 | 新用户引导（首次上传提示 + 样本病历演示） | 🟠 P1 | ⬜ | 降低首次使用门槛 |
| F2 | 新试验提醒（用户诊断有新匹配试验时通知） | 🟡 P2 | ⬜ | 每日定时对比 + 微信推送 |
| F3 | 申请进展通知（CRO 更新状态 → 患者收到提醒）| 🟡 P2 | ⬜ | 依赖 C8 |
| F4 | 用户行为埋点（Mixpanel/自建）| 🟡 P2 | ⬜ | 了解转化漏斗 |

### G. 内容运营

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| G1 | 试验数据定期更新（月更或接 ClinicalTrials.gov API）| 🟠 P1 | ⬜ | 当前数据截至 2025-09 |
| G2 | 疾病科普内容（癌种介绍 + 入组常见问题）| 🟢 P3 | ⬜ | 提升 SEO + 用户信任 |

---

## 四、商业化（Commercialization）

> 目标：建立可持续收入来源，主要面向医药公司/CRO 而非患者收费

### H. 管理后台（Admin）

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| H1 | **管理后台框架**（登录/权限/导航） | 🔴 P0 | ⬜ | 商业化前置依赖 |
| H2 | 用户列表（患者诊断分布/活跃度）| 🟠 P1 | ⬜ | 向申办方展示平台价值 |
| H3 | 申请管理（所有试验的申请列表/状态流转）| 🔴 P0 | ⬜ | CRO 日常操作入口 |
| H4 | **CRO 结构化线索导出**（按试验 ID 导出申请人+诊断信息）| 🔴 P0 | ⬜ | 核心商业价值：替代 CRO 人工筛查 |
| H5 | 试验数据管理（CRUD + 状态更新）| 🟠 P1 | ⬜ | 让运营人员维护数据 |
| H6 | 数据大盘（DAU/申请量/转化率）| 🟡 P2 | ⬜ | 内部运营看板 |

### I. 商业模式

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| I1 | **按线索收费（CPA）**：向申办方/CRO 收取合格患者线索费 | 🔴 P0 | ⬜ | 核心商业模型，依赖 H3/H4 |
| I2 | SaaS 订阅（试验管理工具 for CRO）| 🟡 P2 | ⬜ | 中期模型，需要功能深度 |
| I3 | 数据洞察报告（患者群体分析 for 申办方）| 🟢 P3 | ⬜ | 高价值但需数据积累 |
| I4 | 合规文件（ICP 备案/医疗信息服务资质）| 🔴 P0 | ⬜ | 商业合作前置合规要求 |
| I5 | 合同模板（CRO 合作/数据授权/患者知情同意）| 🟠 P1 | ⬜ | 法律层面商业化准备 |

---

## 五、技术基础设施（Infrastructure）

| # | 任务 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| J1 | HTTPS / SSL 证书 | 🔴 P0 | ✅ | Nginx 已配置 |
| J2 | JWT_SECRET 生产化（随机 256-bit） | 🔴 P0 | ✅ | 已替换 |
| J3 | 旧试验数据清理（496 条干净数据导入）| 🔴 P0 | ✅ | 已完成 |
| J4 | 上传文件大小限制（Nginx 50MB）| 🟠 P1 | ✅ | 已配置 |
| J5 | OCR 超时/重试 UI 反馈 | 🟠 P1 | ✅ | 前端 retry 按钮已实现 |
| J6 | 数据库备份（每日 mysqldump + COS 存储）| 🔴 P0 | ⬜ | 生产必须 |
| J7 | 日志聚合（ELK 或 CloudWatch）| 🟡 P2 | ⬜ | 排障依赖 |
| J8 | 监控告警（服务宕机 + 错误率告警）| 🟠 P1 | ⬜ | 需 uptime 监控 |
| J9 | CI/CD pipeline（push → build → deploy）| 🟡 P2 | ⬜ | 目前手动 rsync+docker build |
| J10 | 环境隔离（staging + production 分离）| 🟡 P2 | ⬜ | 当前只有 production |

---

## 当前冲刺（Sprint: v15 目标）

优先完成以下 5 项，实现"可向首批 CRO 演示"的里程碑：

| 优先级 | 任务 | 文件/说明 |
|--------|------|-----------|
| 1️⃣ | **A8** 结构化入排全量生效 | `python3 scripts/parseInclusionLocal.py` → loadStructuredInclusion |
| 2️⃣ | **C5/D4** 申请管理页面 | 前端 `/applications` 路由 + 状态展示 |
| 3️⃣ | **H1/H3/H4** 管理后台（申请列表 + 导出） | admin 路由 + CRO export API |
| 4️⃣ | **C6** 报名资料清单展示 | TrialDetailView 新增 required_documents 展示 |
| 5️⃣ | **J6** 数据库每日备份 | cron + mysqldump → COS |

---

## 快速命令参考

```bash
# 本地解析 Excel（断点续跑）
KIMI_API_KEY=xxx PARSE_CONCURRENCY=5 python3 server/scripts/parseInclusionLocal.py

# 将解析结果写入 DB
ssh <USER>@<SERVER_IP> 'docker exec treatbot-api node scripts/loadStructuredInclusion.js'

# 验证结构化数据覆盖率
ssh <USER>@<SERVER_IP> 'docker exec treatbot-mysql mysql -u treatbot -p"$DB_PASSWORD" treatbot -e \
  "SELECT COUNT(*) total, COUNT(structured_inclusion) has_structured FROM trials;"'

# 部署新版本
cd /path/to/treatbot_we
rsync -av --exclude node_modules server/ <USER>@<SERVER_IP>:/opt/treatbot/server/
ssh <USER>@<SERVER_IP> 'cd /opt/treatbot && docker build -t server-api:v15 -f server/Dockerfile server && \
  docker stop treatbot-api && docker rm treatbot-api && \
  docker run -d --name treatbot-api --network treatbot-net \
    --env-file /opt/treatbot/server/.env \
    -p 3000:3000 server-api:v15'

# 注意：<USER>、<SERVER_IP>、$DB_PASSWORD 请从团队内部文档获取，不要提交到公开仓库
```
