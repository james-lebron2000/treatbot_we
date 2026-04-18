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

---

## Needs human

<!-- 人类留指令给 agent；agent 处理完就移掉该 bullet -->

- [ ] **腾讯云风险告警原文**：请把告警类型 / 时间 / 涉及路径贴到这里，agent 会据此排查。最可能是 Caddy admin API（:2019）对公网开放，但不敢瞎猜。

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
