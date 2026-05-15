# Treatbot — AI 须知（Claude / Codex / 其他 agent 入口）

> 本文是 AI agent 进入仓库的第一站。当前覆盖**生产端部署**所需的全部信息；其他主题（OCR pipeline / 小程序构建 / 业务规则）由各自的 docs 维护，本文只做指针。

---

## 一、生产端核心事实（不要凭记忆，照抄即可）

| 项 | 值 | 来源 |
| --- | --- | --- |
| **Prod URL** | https://inseq.top | `docs/deploy-state.md:10` |
| **唯一部署分支** | `main`（push 即触发 CI 自动部署） | `.github/workflows/deploy.yml:3-9` |
| **API 容器** | `treatbot-api`（Docker），监听 `:3000` | `docs/deploy-state.md:11` |
| **Web 静态** | `/var/www/treatbot-web`（Vue SPA，`base=/treatbot/`） | `docs/deploy-state.md:12` |
| **反向代理** | **Caddy** on `:443`（nginx 已于 2026-04-18 归档下线，**不要再启用**） | `docs/deploy-state.md:13` |
| **备份目录（服务器）** | `~/treatbot-deploy-backups/` | `docs/deploy-state.md:15` |
| **数据库** | MySQL（容器外 / 云数据库） + Redis | `docs/deployment-checklist.md` |
| **OCR 主路径** | 火山方舟 Doubao（`ARK_API_KEY`） | `server/DEPLOYMENT.md:13-21` |
| **OCR fallback** | Moonshot Kimi（`KIMI_API_KEY`） | `server/DEPLOYMENT.md:13-21` |
| **对象存储** | 腾讯云 COS | `server/DEPLOYMENT.md:13-21` |

---

## 二、部署流程（**单一路径**：CI 触发，不要绕道）

```
git push origin main
   ↓
.github/workflows/deploy.yml
   ↓ jobs: test → build-api → deploy
   ├─ test:        npm ci + npm run lint + npm test + JWT_SECRET guard
   ├─ build-api:   docker buildx → 推 GHCR
   └─ deploy:      ssh 到 SERVER_HOST → 拉镜像 → 替换 treatbot-api 容器（自动备份 + 健康检查 + 失败回滚）
```

关键点：

1. **生产密钥来源是 GitHub Actions Secrets，不是磁盘上的 `.env`**。详见 `server/DEPLOYMENT.md:11-27`、`docs/secrets-playbook.md`。  
   早期生产机 `/opt/treatbot/server/.env` 里残留 `OCR_PROVIDER=kimi` 让 `--env-file` 一直把旧值带进容器，导致生产长期跑 Kimi 慢且贵 —— 修法是 deploy 脚本用 `-e OCR_PROVIDER=auto` 覆盖（`server/DEPLOYMENT.md:27` 脚注）。
2. **`paths-ignore`** 已配置：bot 回写 `docs/deploy-state-server-dump.md` / `docs/deploy-state.md` 不会再触发 deploy 循环（`.github/workflows/deploy.yml:6-8`）。
3. **`concurrency`** 已配置：push to main 按 ref 串行（不 cancel-in-progress），避免 2026-05-10 那次 5 PR 并发 deploy 把彼此 `/tmp/treatbot-upload` 端掉的事故重演（`.github/workflows/deploy.yml:13-25`）。
4. **CI 必经检查**：`npm run lint` + `npm test` + JWT_SECRET 三重 guard（production 缺 / 弱 / 短 都 throw）。**不要 `--no-verify` 或绕过 lint**。

---

## 三、必读的源-of-truth 文档（agent 接 deploy 任务时按需打开）

| 主题 | 文件 |
| --- | --- |
| 当前线上状态、Phase 日志、Cycle log、Rollback cheatsheet | `docs/deploy-state.md` |
| 服务器端 dump（容器、端口、Caddyfile —— 由 CI 自动回写，**只读**） | `docs/deploy-state-server-dump.md` |
| 后端部署详细指南 / 紧急 hot-fix 步骤模板 | `server/DEPLOYMENT.md` |
| 首次上线 checklist（域名、备案、云服务、小程序） | `docs/deployment-checklist.md` |
| 密钥清单、轮换流程、泄露响应 | `docs/secrets-playbook.md` |
| Caddyfile（含 `/api/demo/*` 修复历史） | `deploy/Caddyfile` |
| GitHub Actions workflow | `.github/workflows/deploy.yml` |
| 小程序上线配置 | `docs/weapp-setup.md` |
| 腾讯云 COS / OCR / SMS 配置 | `docs/tencent-cloud-setup.md` |

---

## 四、Agent 行为红线（**做错代价高**）

### 不要做

- ❌ **不要 SSH 上去手改 `.env`**。生产密钥是 GitHub Actions Secrets；写到磁盘上的 `.env` 会被 `--env-file` 在下次部署里读回来污染（已踩过 OCR_PROVIDER 那个坑）。
- ❌ **不要重启 nginx**。nginx 已 archive + stop + disable 于 2026-04-18，反向代理是 Caddy。误启会和 Caddy 抢 :80/:443。
- ❌ **不要 `git push --force` 到 main**。Master 部署分支，force-push 会让 CI 跑过期 commit。修历史前先发 PR 审。
- ❌ **不要在生产容器里 `docker exec` 改文件**（除非走 `server/DEPLOYMENT.md:31-130` 的 hot-fix 模板，并先 `docker commit treatbot-api treatbot-api:rollback-$TS`）。
- ❌ **不要把密钥写进任何文件**（哪怕 `.env.example` / docs / 测试夹具）。`.github/workflows/secret-scan.yml` 跑 TruffleHog，CI 红屏。本地 `pre-commit run --all-files` 也拦。
- ❌ **不要修 `docs/deploy-state-server-dump.md`**。它由 deploy workflow 在服务器侧 `tee /tmp/treatbot-discovery.txt` 后回写，是只读 ground truth。

### 该做

- ✅ **改完 → push → 看 GitHub Actions**。`mcp__github__pull_request_read` 拿 `get_check_runs`，红了再看 logs。
- ✅ **改 deploy 行为先在 PR 上验证**。`pull_request` 触发的 workflow 会跑 test + build 但**不跑 deploy job**（`if: github.ref == 'refs/heads/main'`），所以 PR 阶段就能验 lint/test/build 不破。
- ✅ **生产配置改动走「`.github/workflows/deploy.yml` 顶部 `env:` 字面量」**。非敏感配置（模型 ID、端点、超时）单一来源、一眼可读。敏感配置走 Secrets。
- ✅ **不确定的部署相关问题，先读 `docs/deploy-state.md` 的 `## Needs human` / `## Stuck` / `## Minor follow-ups` 三个段**。人类留给 agent 的最新指令都在那里。

---

## 五、Rollback 速查

详见 `docs/deploy-state.md:135-150`。三种场景：

```bash
# 1) 后端容器回滚（在服务器上跑）
docker stop treatbot-api && docker rm treatbot-api
docker rename treatbot-api-prev-<TS> treatbot-api
docker start treatbot-api

# 2) Caddyfile 回滚
sudo cp ~/treatbot-deploy-backups/Caddyfile.before-swap.<TS> /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 3) nginx 恢复（**仅在 Caddy 整个挂掉时才用**）
cd / && sudo tar xzf ~/treatbot-deploy-backups/nginx-tree.retired.20260418-121211.tar.gz
sudo systemctl enable nginx && sudo systemctl start nginx
```

---

## 六、Smoke 测（部署后人/agent 都该跑一遍）

`docs/deploy-state.md:60-73` 列了 12 条 endpoint 表格。最小集：

```bash
curl -fsS https://inseq.top/health                             # 200
curl -fsS https://inseq.top/api/demo/samples | head -c 80      # 200，Express {code:0,...}
curl -fsS https://inseq.top/api/matches -o /dev/null -w '%{http_code}\n'  # 401（无 token，期望）
```

> 关键反例：如果 `/api/demo/*` 返回 `{"success":false,"message":"Not found"}`，说明 Caddy 路由 regression 了 —— `@treatbot_api` matcher 缺 `path` 关键字会让 Caddy 把它当未知 matcher 丢弃，回去查 `deploy/Caddyfile`。

---

## 七、本文档维护

- 本文是**人 + agent 共写**。改动遵循 `CONTRIBUTING.md` 的 PR 流程。
- 当 `docs/deploy-state.md` 或 `server/DEPLOYMENT.md` 出现破坏性变化（迁移代理、换 OCR 主路径、切云厂商、改部署分支）时，**必须**回头同步本文的「核心事实」表格。
- 其他主题（OCR streaming、小程序 publish、业务规则）由对应 owner 自己加 section，但保持「指针为主、不抄正文」的原则 —— 避免和上游 docs 漂移。
