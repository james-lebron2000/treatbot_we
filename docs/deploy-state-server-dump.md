# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25226665003
- **Commit**: `1a0055f3f734d814eac8557db5738cefa2091f8a`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25226665003
- **Generated at**: 2026-05-01T18:18:34Z

---

```
===== Deploy 20260502-021635 — SHA=1a0055f3f734d814eac8557db5738cefa2091f8a =====
::group::A) Backend container replace
1a0055f3f734d814eac8557db5738cefa2091f8a: Pulling from jakelebron18/treatbot-api
Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ⚠ docker pull attempt 1/3 失败，30s 后重试…
1a0055f3f734d814eac8557db5738cefa2091f8a: Pulling from jakelebron18/treatbot-api
Get "https://registry-1.docker.io/v2/": context deadline exceeded
  ⚠ docker pull attempt 2/3 失败，30s 后重试…
1a0055f3f734d814eac8557db5738cefa2091f8a: Pulling from jakelebron18/treatbot-api
Get "https://registry-1.docker.io/v2/": context deadline exceeded (Client.Timeout exceeded while awaiting headers)
  ❌ docker pull 连续 3 次失败 —— 中止 deploy（生产容器未替换，旧版本继续提供服务）
```
