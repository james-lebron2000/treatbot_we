# CLAUDE.md — AI 协作入口指南

> 本文件优先级最高，AI 接手项目时**先读这一份**再去看 `README.md`。
> 内容聚焦：部署链路怎么走、配置/密钥从哪来、动手前必须知道的陷阱。

---

## TL;DR — 这个项目怎么"启动"

**生产部署唯一路径：`git push main` → GitHub Actions → 自动构建 + SSH 到生产 + `docker run`。**

不需要 SSH 上去手动改任何东西。**服务器上 `/opt/treatbot/server/.env` 不被 docker 容器读取**，只是历史残留参考文件，改它没有任何运行时效果（`docker exec treatbot-api env` 看到的才是真实生效的）。

具体路径：
- **服务端 / API 容器**：`git push` → `.github/workflows/deploy.yml` → 服务器 docker run
- **小程序前端**：本地微信开发者工具 → 上传体验版（手工，无 CI）
- **H5 (Vue)**：和服务端同一个 workflow，构建产物 rsync 到 `/var/www/treatbot-web/`
- **本地开发**：`server/.env.example` 拷为 `server/.env` 自己填，跑 `npm run dev`

---

## 配置与密钥的真实来源（**重要**）

生产容器的环境变量按这个顺序合并，**后者覆盖前者**：

| # | 来源 | 内容 | 谁维护 |
|---|---|---|---|
| 1 | 上一个容器的 `docker inspect` 备份（`~/treatbot-deploy-backups/treatbot-api.<ts>.env`） | 数据库连接、Redis、JWT_SECRET、COS、微信凭证等基础 env | 第一次手动建仓时落入，之后通过容器自身延续 |
| 2 | `.github/workflows/deploy.yml` 顶部 `env:` 字面量 | 模型 ID、端点 URL、超时、`OCR_PROVIDER` 等非敏感配置 | 直接编辑 workflow 文件，push 后下次 deploy 生效 |
| 3 | GitHub Actions Secrets（`-e` 注入，**最高优先级**） | API key 类敏感凭证：`ARK_API_KEY`、`KIMI_API_KEY`、`COS_SECRET_*`、`WEAPP_SECRET`、`JWT_SECRET`、`DB_PASSWORD` | GitHub 仓库 Settings → Secrets and variables → Actions |

`docker run` 的实际命令长这样（见 `.github/workflows/deploy.yml:416`）：

```bash
docker run -d --name treatbot-api \
  --env-file ~/treatbot-deploy-backups/treatbot-api.<ts>.env \
  -e OCR_PROVIDER=auto \
  -e ARK_API_KEY=<from-secret> \
  -e ARK_VISION_MODEL=doubao-seed-1-6-vision-250815 \
  -e ARK_BASE_URL=... \
  ... \
  treatbot-api:<sha>
```

`-e` 后置 → last-wins → 覆盖 env-file 里的同名 KEY。

**结论**：服务器磁盘上 `/opt/treatbot/server/.env` 这个文件 docker 完全不读。它只是给本地开发者参考用的，**永远不要 SSH 改它来"修复"生产配置**。

### 历史踩坑（已修复，但要记住）

服务器 `.env` 里曾经长期残留 `OCR_PROVIDER=kimi`，造成多次"为什么 CI 部署完了还是走 Kimi"的诊断弯路。根因：早期 deploy 脚本用 `--env-file /opt/treatbot/server/.env`，那个文件是 truth。现在已改为"上个容器 inspect 出来的备份 + workflow 注入 -e 覆盖"模式，磁盘 `.env` 不再有效。

---

## 「我想改 X」决策表

| 想改的东西 | 改哪里 | 生效路径 |
|---|---|---|
| **OCR provider 路由 / 模型 ID / 超时** | `.github/workflows/deploy.yml` 顶部 `env:` 块（约 215-230 行） | push main → CI deploy |
| **新增 / 替换 API key 类 secret** | GitHub 仓库 Settings → Secrets → Actions；同时在 deploy.yml `envs:` 列表加白名单 | 下次 push 触发 deploy 时生效 |
| **OCR / LLM 业务逻辑** | `server/services/ocr.js` / `server/services/llmClient.js` | push main → CI deploy |
| **匹配引擎打分** | `server/services/matchEngine.js` | push main → CI deploy |
| **小程序客户端** | `pages/**/*.{js,wxml,wxss}` + `utils/*.js` | 手工上传体验版（微信开发者工具） |
| **H5 前端** | `web/src/**` | push main → 同一 deploy workflow rsync 到 `/var/www/treatbot-web/` |
| **数据库表结构** | `server/scripts/migrate.js`（幂等 addColumn / createTable） | deploy 时自动执行 `docker exec treatbot-api node scripts/migrate.js` |

---

## 紧急 hot-fix 路径（CI 阻塞时）

详见 `server/DEPLOYMENT.md` 的「紧急 hot-fix 路径」章节。摘要：

```bash
# 1. SCP 文件到服务器
scp server/services/<file>.js ubuntu@<HOST>:/tmp/hotfix/
# 2. docker cp 进运行中容器
ssh ubuntu@<HOST> 'sudo docker cp /tmp/hotfix/<file>.js treatbot-api:/app/services/<file>.js'
# 3. 重启容器（注意：仅文件级修复，env 变更必须走 CI）
ssh ubuntu@<HOST> 'sudo docker restart treatbot-api'
```

**hot-fix 不替代 CI**——hot 完仍要 commit + push 让正常 CI 部署接管，否则下次 deploy 会被覆盖。

---

## 项目骨架（按 AI 最常找的入口排序）

```
treatbot_we/
├── CLAUDE.md                       # ← 你正在读这个
├── README.md                       # 产品定位 / 完整规划 / 工程总览
│
├── .github/workflows/
│   ├── deploy.yml                  # ★ 生产部署唯一入口
│   ├── e2e.yml                     # E2E 测试
│   └── nightly-routine.yml         # 巡检 / 数据 freshness
│
├── server/                         # Node.js 后端 (Express)
│   ├── DEPLOYMENT.md               # ★ 部署细节 + hot-fix 路径
│   ├── controllers/
│   │   ├── medical.js              # 病历上传、解析状态
│   │   ├── match.js                # 匹配查询
│   │   └── admin.js                # 管理后台
│   ├── services/
│   │   ├── ocr.js                  # ★ OCR 主链路（Doubao 优先 + Kimi/Tencent fallback）
│   │   ├── llmClient.js            # ★ 多 provider 抽象（Doubao / Kimi / OpenAI）
│   │   ├── queue.js                # ★ Bull 队列（OCR worker + DLQ）
│   │   ├── matchEngine.js          # 两阶段匹配引擎
│   │   └── markitdown.js           # PDF 文本层 fallback
│   ├── scripts/
│   │   ├── migrate.js              # 幂等迁移（CI deploy 自动跑）
│   │   ├── benchVisionLlm.js       # OCR provider benchmark CLI
│   │   └── importTrials.js         # 试验数据导入
│   └── tests/                      # Jest（CI 必跑）
│
├── pages/                          # 微信小程序
│   ├── upload/                     # ★ 上传 + 解析进度（注意：客户端不再设硬超时，见 Track D）
│   ├── records/
│   └── matches/
│
├── utils/                          # 小程序共享工具
│   ├── api.js                      # wx.request 包装 + 重试 / token 刷新
│   ├── parse-task.js               # 解析任务状态机（前端侧）
│   └── schema.js                   # 字段 schema（与 H5 共享）
│
├── web/                            # H5 前端 (Vue 3 + Vite + TS)
│   └── src/pages/UploadView.vue    # 上传主流程
│
└── docs/
    └── deploy-state-server-dump.md # ★ CI 自动回写的服务器最新状态（不要手编）
```

---

## 已知陷阱 / 不要做的事

1. **不要 SSH 改 `/opt/treatbot/server/.env`**：它不被容器读取。改了没用，反而会让下个排查的人走弯路。
2. **不要在客户端加 OCR 任务超时**：服务端 Doubao 视觉模型典型 ~88s，PDF 多页 130-150s。客户端 90s 硬超时和服务端实际耗时只差 2 秒，几乎所有上传都会被客户端误判为失败弹「我们没能自动看懂」。修复：删超时，让服务端 `status='error'` 成为唯一失败信号（Track D，PR #6）。
3. **不要直接 push main**：仓库本地有 Claude Code 工具权限规则拦截直接 push。开 PR、合并、再让 CI 跑。
4. **不要在 GitHub issue/comments 里贴 API key**：所有敏感凭证经 GitHub Secrets 注入，不进任何文档。
5. **不要 amend/force-push 到 main**：CI deploy 会回写 `docs/deploy-state-server-dump.md` 到 main，强 push 会丢这些自动回写。
6. **不要假设 docker-compose 在生产**：生产是直接 `docker run`，没有 `/opt/treatbot/docker-compose.yml`。要重启容器用 `sudo docker restart treatbot-api`，不是 `docker compose restart`。
7. **不要在 small fixes 里碰 `OCR_PROVIDER` 之外的 OCR 配置**：模型 ID 和端点是 deploy.yml 字面量，改一处会触发完整 deploy + 风险。

---

## 常用诊断速查

```bash
# 看生产容器实际 env（truth source）
ssh ubuntu@<HOST> 'sudo docker exec treatbot-api node -e "console.log(JSON.stringify({OCR_PROVIDER:process.env.OCR_PROVIDER, ARK_API_KEY:process.env.ARK_API_KEY?\"set\":\"unset\", ARK_VISION_MODEL:process.env.ARK_VISION_MODEL}, null, 2))"'

# 看最近 30 行容器日志
ssh ubuntu@<HOST> 'sudo docker logs treatbot-api --tail 30'

# 看 CI 最近 5 次跑
gh run list --limit 5 --json databaseId,status,conclusion,name,headBranch,createdAt

# 看某次 deploy 的服务端 dump（CI 自动回写到 main）
git show HEAD:docs/deploy-state-server-dump.md | head -100

# 健康检查
curl -sS https://inseq.top/api/health
```

---

## 进一步阅读

- `README.md` — 产品定位、匹配引擎评分、技术栈、Phase 1-5 规划
- `server/DEPLOYMENT.md` — 部署细节、密钥矩阵、hot-fix 完整模板
- `docs/deploy-state-server-dump.md` — 最新一次 deploy 时的服务器全量状态快照（CI 自动维护）
