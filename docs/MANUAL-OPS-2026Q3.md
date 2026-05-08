# MANUAL-OPS-2026Q3

PRD-2026Q3 落地过程中需要**人工执行**的全部步骤，按"环境 / 任务"二维分类。每一项给出：
1. **何时做** — 触发时机
2. **谁做** — owner
3. **怎么做** — 命令 / SQL / 配置
4. **怎么验** — 验证查询或日志关键字
5. **回滚** — 出问题怎么撤

> 代码侧已经做完的内容（schema 模型、ensureX 函数、控制器、测试）这里只点到为止。本文档专注**人**要做的事。

---

## 0 · 阅读顺序

| 章节 | 触发场景 | 优先级 |
|---|---|---|
| §2 T0-2 状态机迁移上线 | 把 `application_status_event` 表 + status enum 扩展推到 staging / prod | **现在**（T0-2 已完成） |
| §3 T1-6 RBAC 三角色上线 | 创建 ops + cro_liaison 账号，把单角色环境换成多角色 | **现在**（T1-6 已完成） |
| §4 后续任务的人工 / 灰度步骤 | T0-1 / T0-3 / T1-1 ~ T1-6 上线后的运维动作 | 跟随实施进度 |

> 本机（macOS）不需要装 MySQL。`npm test` 默认排除 `tests/api.test.js`（真集成 suite），其它 32 个 suite 全 mock；集成测试由 GitHub Actions / 服务器侧 CI 用 service container 跑（`.github/workflows/deploy.yml:54`）。

---

## 1 · （已删除）本地 MySQL 环境

> 此小节原内容是开发者本机安装 MySQL 的指引，按"运维操作均在服务器/容器内"原则移除。本地不需要装 MySQL；想跑全套测试请直接 push，由 CI 用 service container 完成。

---

## 2 · T0-2 申请状态机迁移（staging / prod 上线）

### 2.1 已交付（无需人工）

- `server/scripts/migrations/20260505_application_status_event.sql` — 建表 + ALTER ENUM
- `server/scripts/migrate.js` 内 `ensureApplicationStatusEvent()` —— `npm run db:migrate` 自动幂等执行
- `server/models/index.js` 新增 `ApplicationStatusEvent` 模型 + `TrialApplication.status` ENUM 扩展
- `server/services/applicationStateMachine.js` + 三个控制器走状态机 + 14 个单测

### 2.2 staging 上线步骤（owner: 后端）

```bash
# 1. 部署最新镜像（沿用现有 deploy 流程，无需特殊处理）
git push origin main   # 触发 .github/workflows/deploy.yml

# 2. 等 deploy.yml migrate-check job 绿
#    （CI 内会 npm run db:migrate 两遍验证幂等）

# 3. SSH 到 staging 主机，进容器手动校验
ssh staging
docker exec -i treatbot-api npm run db:migrate
#   日志关键字：
#     "创建表: application_status_event"
#     "对齐枚举: trial_applications.status (+screened, +withdrawn)"
#   再跑一次：
#     "创建表" 不再出现（idempotent OK）

# 4. 直连 MySQL 验证
docker exec -it treatbot-api mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "
  DESC application_status_event;
  SHOW INDEX FROM application_status_event;
  SHOW COLUMNS FROM trial_applications LIKE 'status';
"
```

**期望输出**：
- `application_status_event` 表存在，9 列（id / application_id / from_status / to_status / actor_type / actor_id / reason / created_at）
- 索引 `idx_app_created` / `idx_to_status_created` / `idx_actor` 三个都在
- `trial_applications.status` 枚举包含 `screened` 与 `withdrawn`

### 2.3 prod 上线步骤

与 staging 相同，**额外做**：

1. **预先备份**（owner: 运维）
   ```bash
   # 在 prod 主机
   mysqldump -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME trial_applications \
     > ~/treatbot-deploy-backups/trial_applications_$(date +%Y%m%d_%H%M%S).sql
   ```
   理由：`MODIFY COLUMN` 会重写整列，量大表（百万行级）会阻塞。先备份是兜底。

2. **错峰执行**（owner: 运维 + 后端）：低峰窗口（建议 03:00–06:00）。`MODIFY COLUMN` 在 InnoDB online DDL 下通常不阻塞读，但仍建议错峰。

3. **观察 24h**：监控 `application_status_event` 写入量，应该与 `PUT /api/cro/applications/:id/status` + `PUT /api/admin/applications/:id/status` + `PUT /api/applications/:id/cancel` 调用次数一致（允许 noop 短路）。

### 2.4 验证查询（business 视角，运营也可跑）

```sql
-- 7 天内每个 to_status 的事件数
SELECT to_status, COUNT(*) AS n
  FROM application_status_event
  WHERE created_at >= NOW() - INTERVAL 7 DAY
  GROUP BY to_status
  ORDER BY n DESC;

-- 同申请的状态变更轨迹（用于 admin 复核）
SELECT from_status, to_status, actor_type, actor_id, reason, created_at
  FROM application_status_event
  WHERE application_id = '<your_app_id>'
  ORDER BY created_at ASC;

-- T1-4 CPA 计费雏形（按 CRO + 月聚合 contacted/screened/enrolled）
SELECT actor_id AS cro_id,
       DATE_FORMAT(created_at, '%Y-%m') AS month,
       SUM(to_status='contacted') AS contacted,
       SUM(to_status='screened')  AS screened,
       SUM(to_status='enrolled')  AS enrolled
  FROM application_status_event
  WHERE actor_type = 'cro'
  GROUP BY actor_id, month
  ORDER BY month DESC, cro_id;
```

### 2.5 回滚

**仅在 transition() 写入异常爆雷时考虑**。代码侧已经经过单测，状态机本身回滚极少需要。

```sql
-- 退回 ENUM（不删表，保留事件流）
ALTER TABLE trial_applications
  MODIFY COLUMN status ENUM('pending','contacted','enrolled','rejected','cancelled')
  NOT NULL DEFAULT 'pending';

-- ⚠ 注意：回滚前必须确认没有 status='screened' / 'withdrawn' 的存量行，
-- 否则 MODIFY 会拒绝执行。先：
SELECT status, COUNT(*) FROM trial_applications GROUP BY status;
-- 必要时把 screened → contacted、withdrawn → cancelled
UPDATE trial_applications SET status='contacted' WHERE status='screened';
UPDATE trial_applications SET status='cancelled' WHERE status='withdrawn';
```

`application_status_event` 表**不必删**——保留作为审计证据，下次重新启用零成本。

---

## 3 · T1-6 RBAC 三角色上线

### 3.1 已交付（无需人工）

- `server/utils/adminCredential.js` 支持 `ADMIN_ACCOUNTS_JSON` 多账号 + role
- `server/middleware/adminAuth.js` 新增 `requireRole(...)` 中间件
- `server/middleware/auditLog.js` 写 `role` 字段
- `server/scripts/migrations/20260525_admin_audit_log_role.sql` + `ensureAdminAuditLogRole()`
- 路由层：`reveal_field` / `export_users` / `export_records` 仅 super；`create_cro` / `update_cro` 限 super + cro_liaison
- 14 个 RBAC 单测全绿

### 3.2 角色矩阵（贴在 wiki / 内部 README）

| 接口 | super | ops | cro_liaison |
|---|---|---|---|
| view_admin_session / dashboard / users（脱敏） | ✓ | ✓ | ✓ |
| view_records / view_logs / view_user_matches | ✓ | ✓ | ✓ |
| view_applications / update_application_status | ✓ | ✓ | ✓ |
| view_application_timeline / add_application_note | ✓ | ✓ | ✓ |
| view_trials / view_trials_health | ✓ | ✓ | ✓ |
| view_cro / view_ocr_failures / retry_ocr_failure | ✓ | ✓ | ✓ |
| export_applications（脱敏） | ✓ | ✓ | ✓ |
| **export_users（含 PII）** | ✓ | × | × |
| **export_records（含 PII）** | ✓ | × | × |
| **create_cro / update_cro** | ✓ | × | ✓ |
| **reveal_field（PII unmask）** | ✓ | × | × |

> 当前只有 PII / CRO 维护两类做了硬门，其它接口不挂 `requireRole` —— 等 T0-1 unmask + T1-4 billing 落地时再追加。

### 3.3 生成多账号 keyHash（owner: 后端 leader）

每个新增账号都要生成 key 与 hash。明文 key 通过**带外渠道**（1Password / 安全 IM 私聊）发给当事人，**禁止落仓库**。

> **执行环境**：在跳板机或一次性 docker 容器内运行（`docker run --rm node:20-alpine ...`），不要在开发者本机执行；执行完即销毁容器，避免明文 key 进入 shell history。

```bash
# 在跳板机（或一次性容器）跑：docker run --rm node:20-alpine sh -c '<以下脚本>'
for u in alice bob carol; do
  node -e "
    const c=require('crypto');
    const k=c.randomBytes(32).toString('base64url');
    const h='sha256:'+c.createHash('sha256').update(k).digest('hex');
    console.log(JSON.stringify({username:'$u', plaintextKey:k, keyHash:h}));
  "
done
```

输出示例：
```
{"username":"alice","plaintextKey":"x9...Q","keyHash":"sha256:a1b2..."}
{"username":"bob","plaintextKey":"k3...P","keyHash":"sha256:c3d4..."}
```

### 3.4 配置 GitHub Secret + deploy.yml

1. **加新 Secret**（owner: 仓库 admin）
   - 在 `Settings → Secrets and variables → Actions` 加：
     ```
     ADMIN_ACCOUNTS_JSON
     ```
   - 值（**单行 JSON，转义 quote**）：
     ```json
     [{"username":"alice","keyHash":"sha256:...","role":"super","canReveal":true},{"username":"bob","keyHash":"sha256:...","role":"ops"},{"username":"carol","keyHash":"sha256:...","role":"cro_liaison"}]
     ```

2. **deploy.yml 透传**（owner: 后端，**这一步要在仓库改代码**）

   编辑 `.github/workflows/deploy.yml`：

   ```diff
       env:
         ADMIN_LOGIN_USERNAME: 'treatbot_admin'
         ADMIN_LOGIN_KEY_HASH: 'sha256:0740e0062f9186d1...'
         ADMIN_LOGIN_TOKEN_TTL: '3600'
         ADMIN_LOGIN_CAN_REVEAL: 'true'
   +     ADMIN_ACCOUNTS_JSON: ${{ secrets.ADMIN_ACCOUNTS_JSON }}
       
       envs: SHA,GHCR_IMAGE,...,ADMIN_LOGIN_USERNAME,ADMIN_LOGIN_KEY_HASH,ADMIN_LOGIN_TOKEN_TTL,
   -    ADMIN_LOGIN_CAN_REVEAL
   +    ADMIN_LOGIN_CAN_REVEAL,ADMIN_ACCOUNTS_JSON
   ```

   并在 `OCR_ENV_FLAGS+=(...)` 段加：

   ```bash
   if [ -n "$ADMIN_ACCOUNTS_JSON" ]; then
     OCR_ENV_FLAGS+=(-e "ADMIN_ACCOUNTS_JSON=$ADMIN_ACCOUNTS_JSON")
     echo "    ✓ ADMIN_ACCOUNTS_JSON configured (multi-account RBAC)"
   fi
   ```

3. **触发部署 + 验证**

   ```bash
   git push origin main   # 走 deploy.yml

   # SSH staging
   docker inspect treatbot-api -f '{{range .Config.Env}}{{println .}}{{end}}' \
     | grep ADMIN_ACCOUNTS_JSON
   # 期望：能看到 var 名字（值会脱敏）

   # 三个账号分别登录验证
   curl -X POST https://staging.inseq.top/api/admin/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"alice","key":"<plaintext from 3.3>"}'
   # 拿到 token 后：
   curl https://staging.inseq.top/api/admin/session -H "Authorization: Bearer <token>"
   # 期望响应里 admin.role === "super"

   # 用 ops 账号登录后访问 reveal → 期望 403
   curl -i https://staging.inseq.top/api/admin/users/<id>/reveal?field=phone \
     -H "Authorization: Bearer <ops-token>"
   # 期望：HTTP/1.1 403   {"code":403,"message":"角色权限不足",...}
   ```

### 3.5 admin_audit_log.role 列上线（owner: 运维）

```bash
# 容器内
docker exec -i treatbot-api npm run db:migrate
# 日志关键字：
#   "新增列: admin_audit_log.role"
#   "索引已创建: admin_audit_log(role,created_at)"

# 手动校验
docker exec -i treatbot-api mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "
  SHOW COLUMNS FROM admin_audit_log LIKE 'role';
  SHOW INDEX FROM admin_audit_log WHERE Key_name='idx_role_created';
"
```

存量历史日志的 `role` 列为 `NULL` —— **不要回填**。新写入由 `auditLog.js` 自动填，正常 24h 后 ops 角色应已出现。

```sql
-- 24h 后跑一遍
SELECT role, COUNT(*) FROM admin_audit_log
  WHERE created_at >= NOW() - INTERVAL 24 HOUR
  GROUP BY role;
-- 期望：super / ops / cro_liaison 都有数据，NULL 只对应回 deploy 之前的旧请求
```

### 3.6 撤单 / 离职流程

| 场景 | 操作 |
|---|---|
| 新人入职某角色 | 3.3 生成 key + hash → 追加到 `ADMIN_ACCOUNTS_JSON` Secret → push（无代码改动）→ 重新部署 |
| 离职 / 临时停权 | 从 `ADMIN_ACCOUNTS_JSON` 删除该账号 → 重新部署。已签发 token 在 `ADMIN_LOGIN_TOKEN_TTL=3600` 内仍有效，紧急场景同时**轮换 JWT_SECRET**（参考 `docs/secrets-playbook.md`） |
| 角色调整 | 改 `role` 字段 → 重新部署。当事人下次登录拿到的新 token 即生效 |

### 3.7 回滚

把 `ADMIN_ACCOUNTS_JSON` 从 Secret 删掉 + 部署即可——单账号 ENV 路径自动接管，等价于 RBAC 上线前。`admin_audit_log.role` 列保留（不影响业务）。

---

## 4 · 已交付任务的人工 / 灰度步骤

按 PRD-2026Q3 已落地任务记录"代码合并后"剩余的人工操作。每节都标 owner、命令、回滚要点。

### 4.1 T0-1 · CRO 导出 v1（已交付）

**已交付**：`/api/cro/exports/applications`（多 trial / 状态 / 时间窗 / unmask 审计）+ `cro_export_log` 表 + admin_audit_log 双留痕。

**人工步骤**（owner: 商务 + 后端）
1. 灰度名单：先开 1 家 CRO 测试 unmask；其余客户保持 unmask=false 默认。
   - 通过 `croAuthMiddleware` 没有额外字段需要改，先在文档跟客户约定 `unmask=true` 仅财务对账日开。
2. 运营培训："导出 = 全量审计"，每次 unmask 都会同时落 `cro_export_log` + `admin_audit_log`。
3. 月底巡检（财务）：
   ```sql
   SELECT cro_id, COUNT(*) AS export_cnt, SUM(unmask) AS unmask_cnt
   FROM cro_export_log
   WHERE created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
   GROUP BY cro_id;
   ```
4. 回滚：路由层注释 `router.get('/cro/exports/applications', ...)` 即可关停；表保留以备审计。

### 4.2 T1-3 · medical_records.is_active（已交付）

**已交付**：`is_active` 列（`models/index.js` + migration）+ `PUT /api/medical/records/:id/activate`（事务 + SELECT FOR UPDATE 防 race）+ match.js 默认按 active 取 record。

**人工步骤**（owner: 后端运维）
1. **存量回填**（一次性，prod 上线时跑）：
   ```sql
   -- 每个用户取最新一条已完成 record 设为 active
   UPDATE medical_records mr
   JOIN (
     SELECT user_id, MAX(created_at) AS latest
     FROM medical_records
     WHERE deleted_at IS NULL AND status = 'completed'
     GROUP BY user_id
   ) t ON mr.user_id = t.user_id AND mr.created_at = t.latest
   SET mr.is_active = 1
   WHERE mr.deleted_at IS NULL AND mr.status = 'completed';
   ```
2. 验证：`SELECT user_id, COUNT(*) FROM medical_records WHERE is_active=1 GROUP BY user_id HAVING COUNT(*)>1;` 应为空。
3. 回滚：`UPDATE medical_records SET is_active=0;` + 后端继续工作（match.js fallback 兜底）。

### 4.3 T1-2 · cancerSignals 多语词典（已交付）

**已交付**：`server/services/cancerSignals.js`（简体 + 繁体 + 英文 + bio-marker）+ matchEngine 改用单一词典源 + 测试 22/22。

**人工步骤**（owner: 医学顾问 + 产品）
1. 词典维护流程（写入 `server/services/cancerSignals.js`）：
   - 新增 alias / hint → PR；reviewer：医学顾问 + 后端 leader。
   - PR 必须附正向 + 负向各 ≥1 用例，加在 `server/tests/matchEngineAgnostic.test.js`。
2. 季度回顾：抽样 50 条命中 / 50 条未命中匹配，让医学顾问标注 FP/FN，更新词典。
3. 回滚：恢复词典文件至 git 上一版本即可，无需迁移。

### 4.4 T1-4 · CPA 计费汇总（已交付）

**已交付**：`cro_companies.cpa_price` + `cpa_qualified_status` + `services/billing.js` + `GET /api/admin/billing/summary?month=YYYY-MM&format=csv|json`（仅 super 角色）+ prom-client `cro_qualified_lead_total`。

**人工步骤**（owner: 财务 + 商务）
1. 运营在 `cro_companies` 表录入合同价（必须由 super 账号执行）：
   ```sql
   UPDATE cro_companies SET cpa_price = 200.00, cpa_qualified_status = 'screened'
   WHERE id = 'cro_xxx';
   ```
2. 月度对账（每月 1 号）：
   ```bash
   curl -s "https://prod.inseq.top/api/admin/billing/summary?month=2026-04&format=csv" \
     -H "Authorization: Bearer <super-token>" -o billing-2026-04.csv
   ```
3. 财务复核：与下面 SQL 手算结果对比（必须 100% 一致）：
   ```sql
   -- 同期 = computeMonthly 的 SQL 等价物
   SELECT c.id AS cro_id, ta.trial_id, COUNT(DISTINCT ase.application_id) * c.cpa_price AS amount
   FROM application_status_event ase
   JOIN trial_applications ta ON ta.id = ase.application_id
   JOIN cro_companies c ON JSON_CONTAINS(c.trial_ids, JSON_QUOTE(ta.trial_id))
   WHERE ase.to_status = c.cpa_qualified_status
     AND ase.created_at >= '2026-04-01' AND ase.created_at < '2026-05-01'
   GROUP BY c.id, ta.trial_id;
   ```
4. Grafana 实时看：`sum by (cro_id) (rate(cro_qualified_lead_total[1h]))`。
5. 回滚：admin/billing/summary 路由临时关闭即可；表数据不动。

### 4.5 T1-1 · 试验数据每日抓取（已交付）

**已交付**：`services/clinicalTrialsClient.js`（NCT v2 API）+ `jobs/trialCrawler.js`（限速 5 QPS、批 100、DLQ）+ `trial_change_log` + `trial_crawl_failures` 表 + admin/trials/health 加 `recentChanges`。

**人工步骤**（owner: 运维）
1. **打开 cron**：staging 与 prod 的环境变量加 `ENABLE_TRIAL_CRAWLER_CRON=true`，重启后凌晨 03:00 北京时间自动跑。
2. **回填 nct_id**（一次性）：旧数据没有 `nct_id` 不会被抓取。运营从源数据 / 临床试验注册库导出 `(trial_id, nct_id)` 对照 CSV 后：
   ```sql
   UPDATE trials SET nct_id = 'NCT00000001' WHERE id = 't_xxx';
   ```
3. **DLQ 巡检 SOP**（每日上午 10:00 by 运营）：
   ```sql
   SELECT nct_id, reason, attempt_count, last_attempt_at
   FROM trial_crawl_failures
   WHERE resolved_at IS NULL
   ORDER BY last_attempt_at DESC LIMIT 50;
   ```
   - `not_found_upstream` 多于 5 条 → 上游已下架，确认后人工 `UPDATE trials SET status='closed' WHERE id=...` 并 `UPDATE trial_crawl_failures SET resolved_at=NOW() WHERE nct_id IN (...)`。
   - `batch:` 类异常 > 10 条 → 上游 5xx / 限速被掐，重试或调慢 `TRIAL_CRAWLER_CRON`。
4. **健康度面板**：admin 后台 `GET /api/admin/trials/health` 返回 `lastRun + recentChanges[]`，`lastRun` > 36h 即报警。
5. **回滚**：`ENABLE_TRIAL_CRAWLER_CRON=false` 重启即可；不会动既有 trial 字段。

### 4.6 T1-5 · Node 20 LTS 升级（已交付）

**已交付**：`server/Dockerfile` 两 stage 改 `node:20-bookworm-slim` + `.nvmrc=20.18.0` + `package.json engines` + GitHub Actions `setup-node@v4 node-version: '20'`。

**人工步骤**（owner: 运维）
1. CI 验证：合 main 前 PR 在 GitHub Actions 跑全套测试（含 service-container MySQL），重点关注 `pdf-parse` / `bull` / `tencentcloud-sdk-nodejs` 的 deprecation warning。
2. **staging 灰度 48h**：
   ```bash
   ssh staging
   docker exec treatbot-api node -v          # v20.18.0
   curl -s https://staging.inseq.top/api/health | jq .
   ```
3. **prod 上线**：保留上一镜像 tag `:node18-rollback`，发布 `:node20-prod`。性能监控 Grafana 看 P95 应平或下降。
4. **回滚**：`docker pull treatbot-api:node18-rollback && docker tag ... :latest && docker compose up -d`。

### 4.7 T0-3 · Git 历史密钥清理 + 全量轮换（待执行）

**已交付**：模板文件
- `docs/key-rotation-log.md`（轮换证据登记表）
- `docs/git-secret-patterns.txt`（git filter-repo 替换规则）

**人工步骤**（owner: 安全 leader + 后端 + 运维，约 2h 窗口）

> 不可逆操作，必须在公告 collaborator 暂停 push 后执行。
> **执行环境**：使用一台**运维跳板机 / 一次性安全主机**（Linux 容器、CI runner、专用堡垒机均可），不要在开发者本机操作；操作完成后销毁该环境。

1. 公告暂停 push 2h（飞书 / Slack 全员）。
2. 在运维跳板机做离线备份（**必做**，下面所有步骤前置）：
   ```bash
   git clone --mirror git@github.com:james-lebron2000/treatbot_we.git tb-mirror.git
   tar -czf tb-mirror-$(date +%Y%m%d).tar.gz tb-mirror.git
   coscmd upload tb-mirror-*.tar.gz treatbot-backups/
   ```
3. 在跳板机的 tb-mirror.git 内跑（不要在 main repo / 个人开发机）：
   ```bash
   pip install git-filter-repo
   cd tb-mirror.git
   git filter-repo --replace-text /path/to/git-secret-patterns.txt --force
   git log --all -p | grep -E "sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{16,}" || echo "0 hits OK"
   ```
   `git-secret-patterns.txt` 内容见仓库 [docs/git-secret-patterns.txt](git-secret-patterns.txt)，可由 owner 临时 `scp` 到跳板机。
4. 临时关 main 分支保护 → 在跳板机 `git push --mirror --force` → 立刻恢复保护。
5. 通知全员各自 `git fetch && git reset --hard origin/main`（这是开发者本地动作，由当事人自行执行，不在本运维清单范围内）。
6. **5 类 key 逐一轮换**（在各 provider 的 web console + GitHub repo Settings，无需任何本机命令）：
   1. Kimi / Moonshot：control panel → revoke 旧 → 生成新 → GitHub Actions secret `KIMI_API_KEY` 更新
   2. ARK / 火山方舟：同上 → secret `ARK_API_KEY`
   3. 腾讯云 COS：CAM 子账号 access key 重置 → secrets `TENCENT_SECRET_ID/KEY`
   4. 腾讯云 SMS：SMS console → 应用 key 重置 → secret `SMS_APP_KEY`
   5. Sentry：project settings → Client Keys → revoke + new → secret `SENTRY_DSN`
7. 触发一次 staging deploy 跑 smoke（在 staging 容器内或通过外网 curl）：`curl -X POST https://staging.inseq.top/api/auth/send-code` 验证短信、`curl https://staging.inseq.top/api/health` 验证 Sentry 没接错。
8. 由 owner 在仓库 PR 中更新 `docs/key-rotation-log.md` 5 行（每个 provider 一行）并合并。
9. 验收（在跳板机或 prod 容器内）：
   - 跳板机：`git log --all -p | grep -E "sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{16,}"` 0 命中。
   - prod 容器：`ssh prod && docker exec treatbot-api env | grep -E "KEY|SECRET" | awk '{print $1}'` 仅看到变量名。
   - `docs/key-rotation-log.md` 5 行齐。

**回滚**：force-push 不可逆；旧镜像保留即可服务恢复。新 key 轮换可单独回退（用控制台再生成一组，更新 secret 重启）。

---

## 附录 A · 一行命令速查表（均在服务器 / 容器 / CI 内执行）

```bash
# 触发 staging/prod 迁移（SSH 到目标主机后）
ssh staging && docker exec -i treatbot-api npm run db:migrate

# 在跳板机生成单个 admin 账号 keyHash（明文 key 通过带外渠道发给当事人）
docker run --rm node:20-alpine node -e \
  "const c=require('crypto');const k=c.randomBytes(32).toString('base64url');console.log({key:k,hash:'sha256:'+c.createHash('sha256').update(k).digest('hex')})"

# 验证当前 admin role 配置（从任意能访问 staging 的网段）
curl -s https://staging.inseq.top/api/admin/session \
  -H "Authorization: Bearer <token>" | jq .data.admin.role

# 触发 CI 跑全套测试（含集成 suite + service-container MySQL）
git push origin <branch>   # 走 .github/workflows/deploy.yml
```

> 不再列本机 MySQL / 本机 jest 命令。开发者本机只用作编辑代码 + push；测试与运维一律走 CI / 服务器。

## 附录 B · 文档链接

- PRD：[docs/PRD-2026Q3.md](PRD-2026Q3.md)
- 任务拆解：[docs/TASKS-2026Q3.md](TASKS-2026Q3.md)
- Migration 机制：[server/scripts/migrations/README.md](../server/scripts/migrations/README.md)
- 密钥操作：[docs/secrets-playbook.md](secrets-playbook.md)
- 部署清单：[docs/deployment-checklist.md](deployment-checklist.md)
