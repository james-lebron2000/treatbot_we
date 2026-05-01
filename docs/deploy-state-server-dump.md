# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25227394183
- **Commit**: `fa2870341cc959460a687301a3fc548335f73087`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25227394183
- **Generated at**: 2026-05-01T18:37:34Z

---

```
===== Deploy 20260502-023534 — SHA=fa2870341cc959460a687301a3fc548335f73087 =====
::group::A) Backend container replace
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ⚠ docker pull attempt 1/3 失败，30s 后重试…
fa2870341cc959460a687301a3fc548335f73087: Pulling from jakelebron18/treatbot-api
Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ⚠ docker pull attempt 2/3 失败，30s 后重试…
fa2870341cc959460a687301a3fc548335f73087: Pulling from jakelebron18/treatbot-api
Get "https://registry-1.docker.io/v2/": context deadline exceeded (Client.Timeout exceeded while awaiting headers)
  ❌ docker pull 连续 3 次失败 —— 中止 deploy（生产容器未替换，旧版本继续提供服务）
```
