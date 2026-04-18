# Deploy State — TreatBot (nginx → Caddy migration)

> 由 routine / autonomous /loop 自动维护。人类介入请在 `## Needs human` 段写指令，下一次 cycle 会读到。

---

## Ground truth

- Repo:       `/Users/lijinming/Documents/Commerce/AItrial/treatbot_we`
- Prod URL:   https://inseq.top
- Branch:     `main` (auto-deploys via `.github/workflows/deploy.yml` on push)
- API host:   docker container `treatbot-api` on `:3000`
- Web host:   `/var/www/treatbot-web` (Vue SPA, base=`/treatbot/`)
- Proxy:      Caddy on `:443` (nginx 待下线)
- Backups:    `~/treatbot-deploy-backups/` on the server

---

## Phase checklist

- [ ] **PHASE 1** — Discover: dump Caddyfile + nginx + ports + containers
- [ ] **PHASE 2** — Author `deploy/Caddyfile` (HTTPS + 所有路由)
- [ ] **PHASE 3** — Migrate: scp + validate + swap Caddyfile → stop/disable nginx
- [ ] **PHASE 4** — Mobile login 适配（手机视口验证 `/h5/quick-match/login` 和 `/treatbot/login`）
- [ ] **PHASE 5** — Real-data smoke on https://inseq.top（landing / demo / login / API）

---

## Cycle log

<!-- 每次 cycle 追加一段：日期 + cycle # + phase + action + result -->

### 2026-04-18 cycle 0 (manual init)
- Created this file as the persistent journal.
- Phase 1 已提交 commit `e15295c`（read-only discovery），等待 deploy run `24583327098` 跑完。
- Blocker pending: 腾讯云风险告警（等待用户贴原文）。

### 2026-04-18 cycle 1 (sandbox probe)

## Capabilities (cycle 1)
- git: 2.43.0, origin = `http://local_proxy@127.0.0.1:25538/git/james-lebron2000/treatbot_we` (HTTP proxy, NOT direct github.com)
- HEAD: `claude/blissful-brahmagupta-Ie3qr` (NOT main — harness branch pin, see below)
- curl: `/usr/bin/curl` present
- gh: not installed / not configured
- `GET https://inseq.top/health` → **403** (sandbox egress blocked, not a prod signal)
- `GET https://inseq.top/api/demo/samples` → **403** (same)
- `docs/deploy-state-server-dump.md` mtime: 2026-04-18 03:31 UTC (fresh, <1h old, run 24595460091)
- `origin/main` latest: `55b8a6d chore(deploy-state): update server dump from run 24595460091` — recent auto-commit-back landed OK

## Signal matrix result
- (a) recent deploy-state auto-commit on origin/main — YES (`55b8a6d`, <1h)
- (b) prod health — UNKNOWN (403 from sandbox; cannot distinguish prod-down from egress-block)
- (c) feature endpoint — UNKNOWN (same reason)
Cannot advance phase without a real prod signal.

## Action taken this cycle
- None beyond journaling. Did not `git checkout main` (harness pin forbids), did not push to main.

---

## Needs human

<!-- 人类留指令给 agent；agent 处理完就移掉该 bullet -->

- [ ] **腾讯云风险告警原文**：请把告警类型 / 时间 / 涉及路径贴到这里，agent 会据此排查。最可能是 Caddy admin API（:2019）对公网开放，但不敢瞎猜。
- [ ] **Harness branch pin conflicts with deploy-operator contract.** This session was started with instructions "DEVELOP on `claude/blissful-brahmagupta-Ie3qr`, NEVER push to a different branch without explicit permission." But the deploy operator routine requires operating on `main` (deploys trigger only on `main` push). I cannot checkout/push main in this sandbox. To let the autonomous loop actually drive deploys, either (1) start the cron session without the side-branch pin so I can work on main, or (2) explicitly authorize `git checkout main && git push origin main` in the session instructions.
- [ ] **Egress to inseq.top returns 403 from this sandbox.** All three git-only signals reduce to signal (a) only; I cannot verify prod health or feature liveness. If the environment is expected to allow `curl https://inseq.top/*`, the proxy/allowlist needs updating. Otherwise the operator contract needs a new signal source (e.g. CI artifact committed back to repo).

---

## Stuck

<!-- 如果连续 3 次同一错，agent 在这里写原因并停下 -->

_none_

---

## Rollback cheatsheet

```bash
# 后端容器回滚（在服务器上跑）
docker stop treatbot-api && docker rm treatbot-api
docker rename treatbot-api-prev-<TS> treatbot-api
docker start treatbot-api

# nginx 恢复（如果已下线后出问题）
cd / && sudo tar xzf ~/treatbot-deploy-backups/nginx-tree.<TS>.tar.gz
sudo systemctl enable nginx && sudo systemctl start nginx

# Caddyfile 回滚
sudo cp ~/treatbot-deploy-backups/Caddyfile.<TS> /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
