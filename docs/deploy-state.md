# Deploy State — TreatBot → https://inseq.top

Persistent journal for the autonomous hourly deploy operator. Update on
every wake-up. Keep the newest entry at the top of each section.

## Master 5-phase plan

- [x] **PHASE 1** — Discover server state (read-only dump of Caddyfile + nginx + ports + containers).
  - Shipped in commit `e15295c` (deploy.yml PART C). Output lives in the
    GitHub Actions run log, not the repo.
- [ ] **PHASE 2** — Author `deploy/Caddyfile` (unified HTTPS + all routes).
- [ ] **PHASE 3** — Migrate: scp new Caddyfile → validate → reload caddy → stop+disable nginx.
- [ ] **PHASE 4** — Mobile login adapt (`/h5/quick-match/login` AND `/treatbot/login` both reach Vue `LoginView`).
- [ ] **PHASE 5** — Real-data smoke on https://inseq.top.

## Required routes (ground truth — from `deploy/nginx-patch.conf`)

All proxy to `http://127.0.0.1:3000` unless noted.

| Path                                  | Target                              |
|---------------------------------------|-------------------------------------|
| `/` (exact)                           | API container (express.static landing) |
| `/health`, `/ready`, `/live` (exact)  | API container                       |
| `/api/*`                              | API container (30m body, 300s read) |
| `/demo-assets/*`                      | API container                       |
| `/treatbot/*` (Vue SPA, SPA fallback) | `/var/www/treatbot-web` (static)    |
| `/h5/quick-match/login` (PHASE 4)     | Vue `LoginView` (SPA)               |

## Journal

### 2026-04-18 — wake-up 1 (agent init)

- Repo state clean; last commit `e15295c deploy: PHASE 1 — read-only
  discovery dump`.
- Attempted to advance PHASE 1 → PHASE 2. **Blocked**: the PART C
  discovery output lives in the GitHub Actions run log. This agent's
  environment has no `gh` CLI and the GitHub MCP surface does not expose
  workflow-run logs, so ground-truth of the running `/etc/caddy/Caddyfile`
  (and whether Caddy is active/enabled vs. just installed) is not visible
  from here.
- Cannot safely author `deploy/Caddyfile` without that ground truth — a
  blind authorship risks overwriting TLS/email/admin directives already
  present in the live config. Server-side `caddy validate` would catch
  syntactic failures but not semantic regressions such as dropping an
  existing ACME email or an unrelated host block.
- Action this wake-up: initialize this journal, record the block, exit
  without code changes to deploy logic.

## Needs human

- [ ] **2026-04-18** — Paste the PART C ("Reverse-proxy discovery")
  section from the most recent successful "Deploy to Production" run
  log into this file (or attach as a gist / paste path). Specifically
  needed:
  1. Sections 1–3 (systemctl state for nginx & caddy, listening sockets on
     :80/:443/:3000/:2019, `docker ps` port mappings).
  2. Sections 4–5 (full `/etc/caddy/Caddyfile` and any `/etc/caddy/conf.d/*`).
  3. Sections 6–9 (nginx layout, `nginx.conf`, each `sites-enabled/*`
     file, and the `nginx -T` heads).

  Once pasted, this agent can proceed to PHASE 2 (author
  `deploy/Caddyfile`) on the next wake-up.

- [ ] **Alternative**: if the user prefers, grant this agent access to a
  tool that can read GitHub Actions workflow-run logs (e.g. a
  `gh run view --log` wrapper), and PHASE 2 can proceed autonomously.

## Rollback cheat-sheet (unchanged)

```sh
# Backend container rollback (TS = timestamp of a prior deploy)
docker stop treatbot-api
docker rm   treatbot-api
docker rename treatbot-api-prev-<TS> treatbot-api
docker start treatbot-api

# Caddy rollback (after PHASE 3)
sudo cp ~/treatbot-deploy-backups/Caddyfile.<TS> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Nginx re-enable (if PHASE 3 migration needs to be undone)
sudo systemctl enable --now nginx
```

## Stuck counter

0 consecutive failed wake-ups on the current phase.
