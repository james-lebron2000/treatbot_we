# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 26239668285
- **Commit**: `ed11727ce802c3f48e3bdb603d3b5fa0453aeb57`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/26239668285
- **Generated at**: 2026-05-21T16:50:40Z

---

```
===== Deploy 20260522-004230 — SHA=ed11727ce802c3f48e3bdb603d3b5fa0453aeb57 =====
::group::0) Preflight schema repair
::endgroup::
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:ed11727ce802c3f48e3bdb603d3b5fa0453aeb57
ed11727ce802c3f48e3bdb603d3b5fa0453aeb57: Pulling from james-lebron2000/treatbot-api
ff86ea2e5edc: Already exists
e54aec64c365: Already exists
804d4d68057c: Already exists
64cfb949317c: Already exists
3c02fd806613: Already exists
2777179321ed: Pulling fs layer
7254f7eba08e: Pulling fs layer
b507896b62da: Pulling fs layer
99b5712e9489: Pulling fs layer
2a276de3c76f: Pulling fs layer
6b1ee9093355: Pulling fs layer
00128d868b47: Pulling fs layer
99b5712e9489: Waiting
2a276de3c76f: Waiting
6b1ee9093355: Waiting
00128d868b47: Waiting
2777179321ed: Verifying Checksum
2777179321ed: Download complete
2777179321ed: Pull complete
99b5712e9489: Verifying Checksum
99b5712e9489: Download complete
2a276de3c76f: Verifying Checksum
2a276de3c76f: Download complete
6b1ee9093355: Verifying Checksum
6b1ee9093355: Download complete
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  ⚠ source tarball /tmp/server-src.tar.gz missing; checking tarball fallback
  ❌ API image is not ready: GHCR pull failed, local docker build failed or timed out, and API tarball /tmp/treatbot-api.tar.gz is missing
  ❌ Refusing to mark deploy successful while treatbot-api would keep serving the previous image
```
