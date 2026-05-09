# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25605324233
- **Commit**: `a0c93a48231e7df23dd2b8ac5d606dd61facc533`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25605324233
- **Generated at**: 2026-05-09T16:43:39Z

---

```
===== Deploy 20260510-000555 — SHA=a0c93a48231e7df23dd2b8ac5d606dd61facc533 =====
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:a0c93a48231e7df23dd2b8ac5d606dd61facc533
a0c93a48231e7df23dd2b8ac5d606dd61facc533: Pulling from james-lebron2000/treatbot-api
61320b01ae5e: Already exists
b98d3ae1ab80: Already exists
b1831021e35a: Already exists
c768ab8cba73: Already exists
8c994cf49dd1: Already exists
6d2412f3a32b: Already exists
119af53f9bd1: Already exists
2ae2f065ee82: Already exists
c083232629af: Pulling fs layer
200d2702ff1b: Pulling fs layer
5c5612b504bf: Pulling fs layer
200d2702ff1b: Verifying Checksum
200d2702ff1b: Download complete
c083232629af: Retrying in 5 seconds
c083232629af: Retrying in 4 seconds
c083232629af: Retrying in 3 seconds
c083232629af: Retrying in 2 seconds
c083232629af: Retrying in 1 second
5c5612b504bf: Retrying in 5 seconds
5c5612b504bf: Retrying in 4 seconds
5c5612b504bf: Retrying in 3 seconds
5c5612b504bf: Retrying in 2 seconds
5c5612b504bf: Retrying in 1 second
c083232629af: Retrying in 10 seconds
c083232629af: Retrying in 9 seconds
c083232629af: Retrying in 8 seconds
c083232629af: Retrying in 7 seconds
c083232629af: Retrying in 6 seconds
c083232629af: Retrying in 5 seconds
c083232629af: Retrying in 4 seconds
c083232629af: Retrying in 3 seconds
c083232629af: Retrying in 2 seconds
c083232629af: Retrying in 1 second
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.47kB 0.1s done
#1 DONE 0.1s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.5s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:18-bookworm-slim
#4 DONE 0.4s

#5 [internal] load .dockerignore
#5 transferring context: 229B done
#5 DONE 0.0s

#6 [internal] load build context
#6 DONE 0.0s

#7 [deps 1/5] FROM docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
#7 DONE 0.0s

#8 [deps 2/5] WORKDIR /app
#8 CACHED

#6 [internal] load build context
#6 transferring context: 6.98MB 0.3s done
#6 DONE 0.3s

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1.072 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#9 2.609 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#9 4.486 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#9 8.767 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 2.264 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#10 24.49 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#10 30.79 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#10 36.78 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
```
