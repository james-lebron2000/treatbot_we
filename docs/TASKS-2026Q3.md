# Treatbot 2026 Q3 — 任务清单（后端·细化版）

> 与 [docs/PRD-2026Q3.md](PRD-2026Q3.md) 一一对应。
> 每条任务包含：**修改项 · 目的 · 产品视角 · 用户视角 · CRO 视角 · 完成后获益 · 实施步骤 · 验收标准 · 工时**。
> 状态：⬜ 未开始 / 🔄 进行中 / ✅ 已完成 / 🚫 阻塞
> 工时：S ≤ 1d / M = 2-3d / L ≥ 4d
> 依赖标记：`← 依赖 Tx-y`

---

## P0 — Sprint W1-W2（5/4 – 5/17）

### T0-1 · CRO 导出端点扩展（PRD P0-1）

**状态**：⬜ | **工时**：M（3d）| **负责模块**：cro / billing 链路起点

**修改项**
- `server/controllers/cro.js` — 扩 `exportCroApplications`，支持多 trial、多 status、双格式、unmask 二次校验。
- `server/routes/index.js` — query schema 校验。
- `server/scripts/migrations/20260504_cro_export_log.sql` — 新建 `cro_export_log` 表 + 索引。
- `server/models/CroExportLog.js` — 新建 model。
- `server/utils/croOwnership.js` — 新建 `assertTrialOwnership` 工具方法。
- `server/scripts/migrations/20260504_trial_apps_index.sql` — 加 `trial_applications(trial_id, status, created_at)` 复合索引。
- `server/tests/croExport.test.js` — 新建（覆盖 5+ 用例）。

**目的**
当前 `/api/cro/exports/applications` 只能导单试验、字段缺、无审计、字段权限粗糙。CRO 拿回去要二次手工补诊断信息，毫无效率提升，更不能作为 CPA 计费凭证。

**产品视角（PM）**
- 商业化 I1（CPA 计费）的物理前提——没结构化导出，CRO 没法验证"线索质量符合付费标准"。
- 字段集要兼容 CRO 现有 EDC 系统的最小输入字段，降低接入成本。
- 导出动作必须留痕，未来纠纷可自证。

**用户视角（患者 / 家属）**
- 间接受益：CRO 拿到结构化数据后回电更快（5d → 2d），减少"报名了没人理"差评。
- 默认手机号掩码 + unmask 留痕，是知情同意书承诺的兜底。

**CRO / 客户视角**
- 字段集（含基因 / PD-L1 / ECOG / treatment_line）可直接进入临床筛选漏斗。
- JSON 接 CRM / CSV 给运营，覆盖两类工作流。
- `cro_export_log` 让 CRO 自查合规也方便。

**完成后获益（量化）**
- ✅ 至少 1 家 CRO 用 JSON 接口直接对接 CRM。
- ✅ 患者首次联系 P50 时间 5d → 2d。
- ✅ 第一笔 CPA 收入凭证可生成。
- ✅ 100 条申请导出 P95 < 1.5s。

**实施步骤**
1. 写 `cro_export_log` migration：`(id, cro_id, trial_ids JSON, fields JSON, row_count, ip, ua, created_at)` + 索引 `(cro_id, created_at)`。
2. 接口 query schema：`trialIds: string[]`（最多 20）、`status?: string[]`、`from?: ISO`、`to?: ISO`、`format?: 'csv'|'json' default csv`、`unmask?: boolean default false`。
3. 抽 `assertTrialOwnership(croId, trialIds)`：任一 trial 不在 `croCompany.trial_ids` 返 403。
4. 字段集 CSV header 顺序固定：`申请ID, 状态, 申请时间, 患者昵称, 手机号, 年龄, 性别, 城市, 诊断, 分期, ECOG, treatment_line, 基因, PD-L1, 匹配分, 匹配理由(top3), record_ids`。
5. `unmask=true` 必须：(a) 写 `admin_audit_log action=cro_export_unmask`，(b) 写 `cro_export_log.fields` 含 `phone_full`，(c) 检查 RBAC role=`super`（依赖 T1-6，过渡期允许 cro_liaison）。
6. 加复合索引 migration。

**验收**
- 测试：跨试验导出、status 过滤、CSV/JSON 双格式、未授权 trial 403、unmask 写两条 log。
- `ab -n 100 -c 10 /api/cro/exports/applications?trialIds=...` P95 < 1.5s。

---

### T0-2 · 申请状态机（PRD P0-2）

**状态**：⬜ | **工时**：M（3d）| **负责模块**：application 全链路中枢

**修改项**
- `server/services/applicationStateMachine.js` — 新建。
- `server/controllers/application.js`、`server/controllers/cro.js`、`server/controllers/admin.js` — 替换所有直接 `UPDATE status` 路径，统一走 `transition()`。
- `server/scripts/migrations/20260505_application_status_event.sql` — 新建事件表。
- `server/models/ApplicationStatusEvent.js` — 新建。
- `server/services/notify.js` — 新建（先打日志桩，留接口）。
- `server/routes/index.js` — 注册 `POST /api/cro/applications/bulk-status`、`GET /api/applications/:id/timeline`。
- `server/tests/applicationStateMachine.test.js` — 新建。

**目的**
当前 `trial_applications.status` 只有字段没有协议——无合法迁移校验、无审计事件、无通知 hook。CRO 想批量推进 50 个状态只能逐条点击。患者侧完全看不到状态历史 → "申请之后石沉大海"是当前差评 top 1。

**产品视角（PM）**
- 状态机是整个商业化链路的数据中枢——CPA 计费、转化漏斗、SLA 时长全部依赖 `application_status_event`。
- 合法迁移校验避免 CRO 误操作（rejected → pending 重复计费）。
- bulk API 是 CRO 工作流的关键效率提升——单试验一周 100+ 申请很常见。
- timeline API 是患者侧"申请进度"页面后端依赖，是 F3 通知体系前置。

**用户视角**
- 第一次能在 H5 / 小程序看到自己申请走到哪一步——直接消除"提交了没人看"焦虑。
- 后续接通微信模板消息（P2-5）后状态变化可推到手机。
- 解决当前 NPS 主要拉低项。

**CRO / 客户视角**
- 批量推 100 个状态：30 分钟点击 → 1 个 API 调用。
- 迁移校验避免数据脏化。
- 每个状态变更含 `actor + reason`，CRO 内部审计 / 申办方季度审查直接出报告。

**完成后获益（量化）**
- ✅ CRO 状态流转操作时间 30min → < 1min（批量 100 条）。
- ✅ 患者"申请进度"可视化覆盖率 0% → 100%。
- ✅ 非法状态迁移拦截率 100%。
- ✅ CPA 计费唯一可信数据源就位。
- ✅ 客户"沉默率"（提交后 7d 无任何状态变更）从未知 → 可观测可改进。

**实施步骤**
1. 定义合法迁移：
   ```
   pending     → contacted | rejected | withdrawn
   contacted   → screened  | rejected | withdrawn
   screened    → enrolled  | rejected | withdrawn
   enrolled    → withdrawn
   rejected    → (terminal)
   withdrawn   → (terminal)
   ```
2. `transition(appId, to, { actor, reason })`：事务内 `SELECT … FOR UPDATE` → 校验 from→to 合法 → `UPDATE applications SET status` → `INSERT application_status_event`。非法抛 `InvalidTransitionError`（自定义，HTTP 422）。
3. 替换三处 controller 中现有 status 更新调用。
4. `POST /api/cro/applications/bulk-status`（body `{ ids[], to, reason }`，最多 100，逐条事务）。
5. `GET /api/applications/:id/timeline`（患者只能看自己的）。
6. `notify.js`：`enrolled / rejected` → `console.info('[notify]')`，预留接口签名给 P2-5。

**验收**
- 测试：合法 / 非法迁移、并发 20 条同状态变更只成立 1 条 event、timeline 倒序返回。
- AB 并发 20 条 contacted→screened，DB `status_event` 仅 1 行。

---

### T0-3 · Git 历史密钥清理 + 全量轮换（PRD P0-3）

**状态**：⬜ | **工时**：M（2d）| **风险**：高（force-push）

**修改项**
- 离线 mirror clone 上跑 `git filter-repo`。
- force-push main + 全员 reset。
- 5 类 key 全量轮换：Kimi / ARK / Tencent COS / Tencent SMS / Sentry。
- GitHub Actions Secrets 全部更新。
- 删除本地 `.env.production`。
- `docs/key-rotation-log.md` — 新建。

**目的**
CI 已阻挡新泄露但旧 commit 里 key 还在——任何人 clone 后 `git log -p | grep sk-` 就能拿到旧 Kimi key。Kimi key 没轮换 = 现在还能调用我们账号烧钱。这是悬而未决的"已泄露"事件，不是潜在风险。

**产品视角（PM）**
- 没清干净 = 任何医院 / 药企法务尽职调查直接 fail。
- 商务团队近期跟某 CRO 谈合作，对方法务部门要"过去 12 个月密钥泄露事件清单 + 处置证据"。
- `key-rotation-log.md` 是商务对外可出示的证据。
- 也是 ICP 备案 / 等保测评（I4）前置——没有密钥管理流程过不了等保二级。

**用户视角**
- 间接保护：泄露的 Kimi key 一旦被滥用 / 被 Kimi 平台封号，会导致全平台 OCR 失效。

**CRO / 客户视角**
- 法务部门要"密钥管理流程文档 + 最近一次轮换证据"，是签约前必查项。
- 客户合作合同"信息安全条款"现在可加"key 每 90 天轮换一次"。

**完成后获益（量化）**
- ✅ `git log --all -p | grep -E "sk-[a-zA-Z0-9]{20,}|AKID[0-9A-Z]{16}"` **0 命中**。
- ✅ 5 个 provider × 1 次以上轮换全部入账。
- ✅ 商务获得"密钥事件已闭环"证据文件。
- ✅ 后续每 90 天可按相同流程例行轮换（SOP 化）。

**实施步骤**
1. 公告窗口：通知所有 collaborator 暂停 push 2h。
2. `git clone --mirror git@github.com:james-lebron2000/treatbot_we.git tb-mirror.git`，离线打 tarball 备份到 COS。
3. 写 `patterns.txt`：含 `sk-`、`AKID`、`SecretKey` 等正则 → `***REMOVED***`。
4. `git filter-repo --replace-text patterns.txt --force`。
5. `git push --mirror --force`（main 分支保护临时关闭一次）。
6. 全员 `git fetch && git reset --hard origin/main`。
7. provider 控制台逐个生成新 key，更新 GitHub Actions Secrets，旧 key 立即吊销。
8. 写 `docs/key-rotation-log.md`：每个 provider 一行 `provider | rotated_at | actor | new_key_fingerprint(前6后4) | old_key_revoked_at`。
9. 触发一次 deploy 验证新 key。

**验收**
- `git log --all -p | grep -E "sk-[a-zA-Z0-9]{20,}|AKID[0-9A-Z]{16}"` 无命中。
- `docker exec treatbot-api env | grep -E "KEY|SECRET"` 仅 var 名，值是新 key。
- key-rotation-log.md 5 行齐。

---

### T0-4 · migrations 收口 + CI 守护（PRD P0-4）

**状态**：⬜ | **工时**：M（2d）| **优先**：尽早做（其他 migration 都要堆在它上面）

**修改项**
- `server/scripts/migrations/20260506_baseline_drift_fix.sql` — 补齐遗漏列（`geneRequired_cache`、`status_live` 等）。
- `server/app.js` — 启动期生产强制 `SEQUELIZE_SYNC_DISABLED=true`。
- `.github/workflows/deploy.yml` — 加 `migration-check` job。
- GitHub Actions Secrets 加 `SEQUELIZE_SYNC_DISABLED=true`。

**目的**
最近几次新增字段只动 model 没补 migration。生产能跑是因为 `sequelize.sync({ alter:true })` 偷偷帮忙——但这个机制不能在生产用：会偷改表、可能丢数据、无法审计。一旦关掉 sync 或换台机器，整个数据库结构对不上代码 → 崩盘。

**产品视角（PM）**
- DR 能力的隐性缺口——出事时备份还原后启动不了 = 实际不可恢复。
- 新员工 onboarding 障碍——本地起服务，model 和 DB 对不上，第一天卡住。
- CD 快速回滚前提是任意 commit 的 schema 都明确——现在做不到。

**用户视角**
- 万一 DR 失败，用户面临的是 App 完全打不开——产品最差结果。

**CRO / 客户视角**
- SLA 99.5% 承诺背后的 DR 能力依赖。
- 法务"灾难恢复预案 + 演练记录"前置。

**完成后获益（量化）**
- ✅ 干净 MySQL → `db:migrate` → `npm test` 全绿。
- ✅ `git grep -nE "sync\(\{.*alter"` 仅 dev/test。
- ✅ 新员工 onboarding 启动 4h → 30min。
- ✅ DR 演练首次走通（具体演练 P2-3）。
- ✅ CI 多一道闸门，未来 model 变更必须配 migration 才能合 main。

**实施步骤**
1. 起干净 MySQL 容器 → `npm run db:migrate`，再 `sequelize.sync({ alter:true, dryRun:true })` 输出 diff。
2. diff 转成 migration `20260506_baseline_drift_fix.sql`。
3. `app.js` 启动期：
   ```js
   if (process.env.NODE_ENV === 'production' && process.env.SEQUELIZE_SYNC_DISABLED !== 'true') {
     throw new Error('生产必须 SEQUELIZE_SYNC_DISABLED=true');
   }
   ```
4. CI 加 job `migration-check`：clean MySQL → migrate → test → 失败阻 deploy。
5. GitHub Actions Secrets 加 `SEQUELIZE_SYNC_DISABLED=true`，注入容器。

**验收**
- 干净 MySQL → migrate → test 全绿。
- `git grep` 无生产 sync alter。
- CI `migration-check` job 至少跑过 1 次绿。

---

## P1 — Sprint W3-W4（5/18 – 5/31）

### T1-1 · 试验数据每日抓取（PRD P1-1）

**状态**：⬜ | **工时**：M（3d）

**修改项**
- `server/jobs/trialCrawler.js` — 新建。
- `server/services/clinicalTrialsClient.js` — 新建（封装 v2 API）。
- `server/scripts/migrations/20260518_trial_change_log.sql`。
- `server/scripts/migrations/20260518_trial_crawl_failures.sql` — DLQ 表。
- `server/controllers/admin.js` — 加 `GET /api/admin/trials/health`。
- `server/app.js` — 注册 `node-cron` 定时任务。

**目的**
当前 `trialFreshnessJob` 能给陈旧试验降权——但**没有任何作业拉新数据**。`last_verified_at` 永远停在导入日。已停招试验仍出现在匹配结果 → 用户报名 → CRO "早关了" → 体验崩盘。

**产品视角（PM）**
- 试验数据是 Treatbot 第一性资产——数据陈旧 = 平台失效。
- Q2 freshness 标记只是降权，没解决"数据从哪来"。
- Admin "试验健康度"页是运营日常工具——每天扫哪些长时间没刷新。

**用户视角**
- "我报名的这个试验早关了！" 是当前负面反馈 top 2，每周 1-2 起。
- 完成后用户搜到 / 匹配到 / 报名的试验都是最近 7 天验证仍在招募的。

**CRO / 客户视角**
- CRO 自己的试验状态变更（暂停 / 关闭）能 24h 内同步，减少"我们关了你还在导线索"对账纠纷。
- 平台自动跟踪上游更新，CRO 不用每周手工通知"这条改了那条加了"。

**完成后获益（量化）**
- ✅ `last_verified_at` 中位数 ≤ 7 天。
- ✅ "报名后才发现已停招"投诉率 1-2/周 → 0。
- ✅ Admin 试验健康度页 + 一键下架，运营效率提升。
- ✅ ≥1 条 closed 试验自动 `recruiting → deprecated`。

**实施步骤**
1. 实现 `clinicalTrialsClient.fetchByNctIds(nctIds[])`：分批 100 条，限速 5 QPS。
2. `trialCrawler.run()`：拉所有 `nct_id` → 逐批 fetch → diff `status / phase / locations` → INSERT `trial_change_log` → 更新 `trials.last_verified_at` + `status`。
3. 失败入 `trial_crawl_failures` DLQ。
4. `app.js` 启动 `node-cron('0 3 * * *', ...)` 北京时间。
5. `GET /api/admin/trials/health` 返 ≥14d 未刷新 + 最近 30 条变更。

**验收**
- 连续 7 天 cron 全绿（`trial_change_log` 行数验证）。
- ≥1 条 closed 试验自动从 `recruiting` → `deprecated`。

---

### T1-2 · 泛瘤种识别加固（PRD P1-2）

**状态**：⬜ | **工时**：S（2d）

**修改项**
- `server/services/cancerSignals.js` — 新建（从 matchEngine 拆出）。
- `server/services/matchEngine.js` — 改为调用 `cancerSignals`。
- `docs/trial-vocabulary.md` — 扩英 / 繁词典。
- `server/tests/matchEngineAgnostic.test.js` — 扩 ≥10 用例。

**目的**
Q2 已做 `GENE_AGNOSTIC_HINTS` 词典——但只覆盖中文简体。线上有英文（"advanced solid tumor"）和繁体（"晚期實體瘤"）的试验，对"肺癌无基因"患者本应命中却被漏判 = 商业线索流失。

**产品视角（PM）**
- 匹配召回率核心拼图——精确率 80+ 但召回率有盲点。
- 影响最大的是"基层 / 没做过基因检测"患者——Treatbot 差异化定位的目标人群。
- 词典走文档化路径，临床顾问可直接编辑不需要碰代码。

**用户视角**
- "我是肺癌但没做基因检测，能匹配的试验从 3 → 8 条"——直接增加行动选项。
- 减少"你这病没法匹配"挫败体验。

**CRO / 客户视角**
- 泛瘤种 / 篮子试验的 CRO 能拿到更多潜在线索，平台对这类客户价值显著上升。
- 国际多中心试验（英文描述）首次能被中文患者发现。

**完成后获益**
- ✅ 5 试验 × 3 患者矩阵 15/15 全命中。
- ✅ 平均匹配试验数（无基因患者）+30~50%。
- ✅ 词典由产品 / 临床顾问直接维护，工程不参与。

**实施步骤**
1. 把 `matchEngine.js` 的 `hasGenericCancerSignal` / `GENE_AGNOSTIC_HINTS` 抽到 `cancerSignals.js`。
2. 多源聚合：`raw_text + structured_inclusion.disease_tags + trial_tags` 任一命中。
3. 词典扩：`advanced solid tumor`, `metastatic solid tumor`, `pan-tumor`, `晚期實體瘤`, `轉移性實體瘤`。
4. Snapshot：5 试验 × 3 患者（肺癌无基因 / 罕见瘤 / 儿童）矩阵 15 条断言。

**验收**：`npx jest matchEngineAgnostic` 用例数 +10 全绿。

---

### T1-3 · 多病历 active 切换（PRD P1-3）

**状态**：⬜ | **工时**：S（1.5d）

**修改项**
- `server/scripts/migrations/20260520_medical_records_active.sql`。
- `server/controllers/medical.js` — 新增 `activateRecord`。
- `server/controllers/match.js` — 默认走 active。
- `server/routes/index.js` — 注册 `PUT /api/medical/records/:id/activate`。
- `server/tests/medicalActiveSwitch.test.js` — 新建。

**目的**
当前 `patientStore` 只保 1 条结构化记录——上传第二份病历会覆盖第一份。后果：用户不敢上传新病历怕丢数据 → 平台无法跟踪病情进展。

**产品视角（PM）**
- 多病历是长期用户留存的基础设施——Treatbot 不是一次性工具，应跟着治疗历程持续更新。
- active 机制让用户对"当前用哪份做匹配"有控制权。
- 为后续"病历时间线"产品功能（已有 timelineService 雏形）打底。

**用户视角**
- 放心一次次上传新报告，平台看到病情进展（基线 → 治疗中 → 治疗后）。
- 切换 active 让用户能用旧病历回溯——临床决策辅助。

**CRO / 客户视角**
- CRO 拿到的患者档案是完整时间序列而非单点快照——能判断"这个患者最近 ECOG 是 1，比 6 个月前改善"。
- 入组评估临床价值显著提升。

**完成后获益**
- ✅ 用户平均上传病历数 1.0 → ≥ 2.0。
- ✅ 全局 active 唯一性测试通过（并发 20 次）。
- ✅ 解锁 timeline 产品功能后端依赖。

**实施步骤**
1. Migration：`ALTER TABLE medical_records ADD COLUMN is_active TINYINT(1) DEFAULT 0`，回填每个 user 最新一条为 1。MySQL 用 generated column 模拟"部分唯一索引"。
2. `PUT /api/medical/records/:id/activate`：事务内 `UPDATE medical_records SET is_active=0 WHERE user_id=? AND is_active=1` → `UPDATE … SET is_active=1 WHERE id=?`。
3. `match.js` 默认 `WHERE is_active=1`，`?recordId=` 显式覆盖。

**验收**：测试全绿；`/api/matches`（无 recordId）返回的是 active 记录。

---

### T1-4 · CPA 计费埋点 + 月度对账（PRD P1-4）← 依赖 T0-2

**状态**：⬜ | **工时**：M（3d）

**修改项**
- `server/scripts/migrations/20260522_cpa_pricing.sql` — `cro_companies` 加 `cpa_price` + `cpa_qualified_status`。
- `server/services/applicationStateMachine.js` — `transition()` 中 emit metric。
- `server/services/billing.js` — 新建。
- `server/controllers/admin.js` — 加 `GET /api/admin/billing/summary`。
- `server/tests/billing.test.js` — 新建。

**目的**
状态机（T0-2）打通后，**真正把"合格线索"变成钱**的是这一步。否则 CRO 开始付费但平台对账靠人工 SQL，月底容易出差错。

**产品视角（PM）**
- 收入闭环最后一公里——商业模式 I1 跑通的标志就是"按月给 CRO 出账单 → 收款"。
- 不同 CRO 单价不一样（取决于试验难度、患者稀缺度），用 `cro_companies.cpa_price` 灵活定义。
- "qualified_status" 可配置（screened 还是 enrolled 才计费）支持不同合作模式。

**用户视角**
- 感知不到。但商业化跑通后平台才有钱投入产品改进——长期与用户利益正相关。

**CRO / 客户视角**
- 月底对账单逐条可追溯——这条线索 status_event 在哪天、谁操作、从哪个 status → screened。
- 杜绝平台多算 / 客户少认扯皮。
- 客户能要 CSV 拿去内部财务审计，3 分钟出账单。

**完成后获益**
- ✅ 第一笔可正式开票的 CPA 收入产生。
- ✅ 对账时 SQL 手算 vs API summary 数字 100% 一致。
- ✅ 客户对账时间数小时 → < 5 分钟。

**实施步骤**
1. Migration：`cro_companies` 加 `cpa_price DECIMAL(10,2) DEFAULT 0` + `cpa_qualified_status enum('screened','enrolled') DEFAULT 'screened'`。
2. T0-2 `transition()` 内：若 `to === company.cpa_qualified_status`，递增 `prom-client` counter `cro_qualified_lead_total{cro_id, trial_id}`。
3. `billing.computeMonthly(month)`：从 `application_status_event` 聚合 `(cro_id, trial_id, count) × cpa_price` → 行集。
4. `GET /api/admin/billing/summary?month=YYYY-MM&format=csv|json`：仅 super 角色（依赖 T1-6）。

**验收**：mock 100 条 status_event，summary 数字与 SQL 手算一致。

---

### T1-5 · Node 20 LTS 升级（PRD P1-5）

**状态**：⬜ | **工时**：S（1d）

**修改项**
- `server/Dockerfile` — `node:18-bookworm-slim` → `node:20-bookworm-slim`（两处 stage）。
- `.nvmrc` — 同步。
- `package.json` — 加 `"engines": { "node": ">=20.0.0" }`。

**目的**
Node 18 EOL 是 2025-04（已过去一年）。继续用 = 没安全补丁、没性能改进、未来某天 npm 包陆续 drop 支持。

**产品视角（PM）**
- 技术债清理——不做出不了事，做了不增加用户可见价值，但拖久变成"想升级时一堆依赖不兼容"大坑。
- 顺便享受 Node 20 性能（V8 11，async hooks 更快），P95 几个 ms 免费优化。

**用户视角**：几乎无感，OCR 队列处理略快几个百分点。

**CRO / 客户视角**
- 客户法务在年度安全评估看 runtime 版本——支持中的 LTS 是基本要求，EOL 版本会被打"不合规"。

**完成后获益**
- ✅ 容器内 `node -v` v20.x。
- ✅ 67+ 测试全绿，无回归。
- ✅ 解锁 Node 20+ only 的依赖。
- ✅ 法务安全评估 runtime 项过关。

**实施步骤**
1. Dockerfile 两处 stage 升 node 20。
2. `.nvmrc` 写 `20.18.0`（或当前 LTS）。
3. `package.json` 加 engines。
4. 本地 `nvm use 20 && npm ci && npm test` 验证 `pdf-parse` / `bull` / `tencentcloud-sdk-nodejs` 兼容。
5. CI build `:node20-staging` tag → staging 跑 48h。
6. 合 main 走标准 deploy；保留 rollback 镜像。

**验收**：`docker exec treatbot-api node -v` v20.x；67+ 测试绿；线上 P95 < 400ms 持续 14d。

---

### T1-6 · Admin RBAC 三角色（PRD P1-6）

**状态**：⬜ | **工时**：S（2d）| **建议提前到 W2**

**修改项**
- `server/scripts/migrations/20260525_admin_role.sql` — `admin_users.role ENUM('super','ops','cro_liaison')`。
- `server/middleware/adminAuth.js` — 加 `requireRole`。
- `server/controllers/admin.js` — 敏感接口加角色门。
- `server/middleware/auditLog.js` — 写入加 role 字段。
- `server/tests/adminRbac.test.js` — 新建。

**目的**
当前 admin token 单一角色——任何 admin 都能看 PII + 导出。运营 / 商务 / 工程混用一个角色，意味着实习生能看用户身份证号。

**产品视角（PM）**
- 最小权限原则的基础设施——和 P0-3 密钥清理一起构成"内部访问治理"完整画面。
- 对内合规、对外法务尽调都需要。
- 三角色对齐组织实际：super = 工程 leader、ops = 运营、cro_liaison = 客户关系。

**用户视角**：间接保护。运营人员不再能批量看身份证号 → 减少内部数据泄露面。

**CRO / 客户视角**
- 客户法务关心的"谁能看到我们的患者数据"现在有清晰矩阵图可出示。
- 显著加强当前"所有 admin 都能看"现状。

**完成后获益**
- ✅ 三角色 × 4 接口矩阵单测全绿。
- ✅ 创建 1 个 ops + 1 个 cro_liaison 账号上线验证。
- ✅ 能看 PII 的账号数从 N → 1-2 个 super。

**实施步骤**
1. Migration：`admin_users` 加 `role`，回填现有账号为 `super`。
2. `requireRole(['super','ops'])` 中间件，从 JWT payload 读 role。
3. PII unmask（T0-1）+ billing summary（T1-4）只允许 super。
4. CRO 维护接口允许 ops + super；查看类全部允许。
5. `admin_audit_log` 写入加 role 字段（migration 加列）。
6. 三角色 × 4 关键接口矩阵单测。

**验收**：测试全绿；线上至少 1 个 ops + 1 个 cro_liaison 账号验证。

---

## P2 — 季尾（6 月起）

| 编号 | 任务 | 修改项 | 目的 / 三方价值 | 完成后获益 | 工时 |
|---|---|---|---|---|---|
| T2-1 | SLO 文档 | 新建 `docs/sre-objectives.md` | **PM**：决策有 baseline；**CRO**：商务合同 SLA 技术依据 | 告警有阈值，决策有据 | S |
| T2-2 | Grafana 4 面板 | API / OCR / Bull / DB | **PM**：周会数据支撑；**用户**：故障 MTTR 下降；**CRO**：可截图给客户做月报 | MTTR 显著下降 | M |
| T2-3 | 跨区 DB 备份 | `backupDb.js` 加二级 region | **PM**：DR 最后一块拼图；**用户**：极端故障数据不丢；**CRO**：法务尽调过关 | 演练 RTO < 30min、RPO < 1h | M |
| T2-4 | 同意版本管理 | `user_consent.version` | **合规**：满足《个保法》14 条；**用户**：明确知道同意了哪个版本 | 100% 用户在 v2 文案上线后强制重签 | S |
| T2-5 | 微信模板消息 | 接 T0-2 `notify.js` → `subscribeMessage.send` | **PM**：F3 通知体系；**用户**：进展即时收到——最期待功能；**CRO**：响应率提升 | 状态变更触达率 0% → 60%+ | M |
| T2-6 | 试验对比 API | `POST /api/trials/compare`（≤4 个） | **PM**：从"列出"到"帮你选"；**用户**：并排对比；**CRO**：报名后撤回率下降 | 撤回率显著下降 | M |
| T2-7 | 试验收藏 API | `POST/DELETE/GET /api/trials/:id/favorite` | **PM**：积累用户偏好；**用户**：高频需求；**CRO**：收藏数是 trial 受欢迎度信号 | 用户回访率提升；匹配排序更个性化 | S |

---

## 依赖图

```
T0-1 (CRO 导出) ──┐
                  │
T0-2 (状态机)  ──┴── T1-4 (CPA 计费) ── 受 T1-6 RBAC 保护
T0-3 (密钥)    ── 独立
T0-4 (migration)── 独立（应早做，否则后续 migration 冲突）

T1-1 (crawler) ── 独立
T1-2 (泛瘤种) ── 独立
T1-3 (active)  ── 独立
T1-5 (Node20)  ── 独立（W1 即可做）
T1-6 (RBAC)    ── 被 T0-1 unmask + T1-4 billing 隐式依赖（应 ≤ T0-1 / T1-4 完成时间）

T2-* 全部依赖前面 P0/P1 闭环
T2-5 微信通知 显式依赖 T0-2 状态机的 notify.js 桩
```

---

## 三方视角速查

| 任务 | PM 痛点 | 用户痛点 | CRO 痛点 | 度量指标 |
|---|---|---|---|---|
| T0-1 CRO 导出 | I1 商业化阻塞 | 申请响应慢 | 数据残缺 | 首次联系 P50 5d→2d |
| T0-2 状态机 | 数据中枢缺失 | 申请石沉大海 | 操作低效 | 操作 30min→1min |
| T0-3 密钥 | 合规阻塞 | 间接（封号风险） | 法务尽调 | 0 命中、5 provider 轮换 |
| T0-4 migration | DR 缺口 | 故障启动失败 | SLA 兑现依赖 | onboarding 4h→30min |
| T1-1 crawler | 数据失效 | 白报名 | 同步纠纷 | 投诉 1-2/周 → 0 |
| T1-2 泛瘤种 | 召回率盲点 | 无基因没结果 | 篮子试验少线索 | 匹配数 +30~50% |
| T1-3 多病历 | 留存基础 | 数据被覆盖 | 单点快照 | 平均上传 1→2+ |
| T1-4 CPA | 收入闭环 | 间接 | 对账透明 | 第一笔开票收入 |
| T1-5 Node 20 | 技术债 | 无感 | 法务评估 | runtime 项过关 |
| T1-6 RBAC | 内部治理 | 隐私保护 | 数据访问透明 | 能看 PII 账号 N→1-2 |

---

## 进度追踪

每周五更新本文件状态列；冲刺 retro 写到 `docs/PRD-2026Q3.md` 第 5 节"退出条件"之前。
