# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25225839974
- **Commit**: `c18dbbecf35d5b9f48cb78cd2f3635df9adbdc72`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25225839974
- **Generated at**: 2026-05-01T17:56:56Z

---

```
===== Deploy 20260502-015500 — SHA=c18dbbecf35d5b9f48cb78cd2f3635df9adbdc72 =====
::group::A) Backend container replace
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ⚠ docker pull attempt 1/3 失败，30s 后重试…
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ⚠ docker pull attempt 2/3 失败，30s 后重试…
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
  ❌ docker pull 连续 3 次失败 —— 中止 deploy（生产容器未替换，旧版本继续提供服务）
```
