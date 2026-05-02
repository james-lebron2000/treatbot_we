# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25251563623
- **Commit**: `33c5a6803102792a96db2feb3c4523c1761fbeed`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25251563623
- **Generated at**: 2026-05-02T12:17:12Z

---

```
===== Deploy 20260502-182942 — SHA=622fffabc27c6370b331b872b796dd25aa1dea6a =====
::group::A) Backend container replace
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile:
#1 transferring dockerfile: 1.54kB done
#1 DONE 0.2s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 1.3s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 resolve docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021 0.0s done
#3 sha256:657fcc512c7369f4cb3d94ea329150f8daf626bc838b1a1e81f1834c73ecc77e 482B / 482B done
#3 sha256:a17ee7fff8f5e97b974f5b48f51647d2cf28d543f2aa6c11aaa0ea431b44bb89 1.27kB / 1.27kB done
#3 sha256:9d9c93f4b00be908ab694a4df732570bced3b8a96b7515d70ff93402179ad232 0B / 11.80MB 0.1s
#3 sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021 8.40kB / 8.40kB done
#3 sha256:9d9c93f4b00be908ab694a4df732570bced3b8a96b7515d70ff93402179ad232 5.24MB / 11.80MB 0.4s
#3 sha256:9d9c93f4b00be908ab694a4df732570bced3b8a96b7515d70ff93402179ad232 11.80MB / 11.80MB 0.5s done
#3 extracting sha256:9d9c93f4b00be908ab694a4df732570bced3b8a96b7515d70ff93402179ad232 0.1s
#3 extracting sha256:9d9c93f4b00be908ab694a4df732570bced3b8a96b7515d70ff93402179ad232 0.1s done
#3 DONE 0.7s

#4 [internal] load metadata for docker.io/library/node:18-alpine
#4 DONE 0.0s

#4 [internal] load metadata for docker.io/library/node:18-alpine
#4 DONE 0.0s

#5 [internal] load .dockerignore
#5 transferring context: 229B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:18-alpine
#6 DONE 0.0s

#7 [deps 2/5] WORKDIR /app
#7 CACHED

#8 [internal] load build context
#8 transferring context: 6.83MB 0.3s done
#8 DONE 0.3s

#9 [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*
#9 0.579 fetch https://dl-cdn.alpinelinux.org/alpine/v3.21/main/x86_64/APKINDEX.tar.gz
#9 9.056 fetch https://dl-cdn.alpinelinux.org/alpine/v3.21/community/x86_64/APKINDEX.tar.gz
#9 ...

#10 [deps 3/5] RUN apk add --no-cache python3 py3-pip make g++
#10 0.580 fetch https://dl-cdn.alpinelinux.org/alpine/v3.21/main/x86_64/APKINDEX.tar.gz
#10 22.83 fetch https://dl-cdn.alpinelinux.org/alpine/v3.21/community/x86_64/APKINDEX.tar.gz
#10 ...

#9 [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*
#9 59.26 (1/48) Installing libxau (1.0.11-r4)
#9 59.48 (2/48) Installing libmd (1.1.0-r0)
#9 60.05 (3/48) Installing libbsd (0.12.2-r0)
#9 60.83 (4/48) Installing libxdmcp (1.1.5-r1)
#9 61.19 (5/48) Installing libxcb (1.16.1-r0)
#9 65.18 (6/48) Installing libx11 (1.8.10-r0)
#9 88.95 (7/48) Installing libxext (1.3.6-r2)
#9 90.78 (8/48) Installing libxrender (0.9.11-r5)
#9 91.77 (9/48) Installing libexpat (2.7.5-r0)
#9 93.76 (10/48) Installing brotli-libs (1.1.0-r2)
#9 108.1 (11/48) Installing libbz2 (1.0.8-r6)
#9 109.2 (12/48) Installing libpng (1.6.57-r0)
#9 112.9 (13/48) Installing freetype (2.13.3-r0)
#9 124.0 (14/48) Installing fontconfig (2.15.0-r1)
#9 128.8 (15/48) Installing pixman (0.43.4-r1)
#9 ...

#10 [deps 3/5] RUN apk add --no-cache python3 py3-pip make g++
#10 132.2 (1/38) Upgrading musl (1.2.5-r9 -> 1.2.5-r11)
#10 ...

#9 [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*
#9 135.1 (16/48) Installing cairo (1.18.4-r0)
#9 150.4 (17/48) Installing lcms2 (2.19-r0)
#9 ...

#10 [deps 3/5] RUN apk add --no-cache python3 py3-pip make g++
#10 154.2 (2/38) Installing libstdc++-dev (14.2.0-r4)
#10 ...

#9 [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*
#9 154.4 (18/48) Installing libjpeg-turbo (3.0.4-r0)
#9 162.2 (19/48) Installing nspr (4.36-r0)
#9 167.0 (20/48) Installing sqlite-libs (3.48.0-r4)
#9 196.1 (21/48) Installing nss (3.109-r0)
#9 245.2 (22/48) Installing openjpeg (2.5.2-r0)
#9 249.6 (23/48) Installing libsharpyuv (1.4.0-r0)
#9 250.4 (24/48) Installing libwebp (1.4.0-r0)
#9 257.9 (25/48) Installing zstd-libs (1.5.6-r2)
#9 282.6 (26/48) Installing tiff (4.7.1-r0)
#9 299.0 (27/48) Installing poppler (24.02.0-r2)
#9 367.3 (28/48) Installing poppler-utils (24.02.0-r2)
#9 380.5 (29/48) Installing libffi (3.4.7-r0)
#9 381.4 (30/48) Installing gdbm (1.24-r0)
#9 382.5 (31/48) Installing xz-libs (5.8.3-r0)
#9 387.9 (32/48) Installing mpdecimal (4.0.0-r0)
#9 396.1 (33/48) Installing ncurses-terminfo-base (6.5_p20241006-r3)
#9 398.5 (34/48) Installing libncursesw (6.5_p20241006-r3)
#9 412.4 (35/48) Installing libpanelw (6.5_p20241006-r3)
#9 412.8 (36/48) Installing readline (8.2.13-r0)
#9 420.6 (37/48) Installing python3 (3.12.13-r0)
#9 ...

#10 [deps 3/5] RUN apk add --no-cache python3 py3-pip make g++
#10 433.4 (3/38) Installing jansson (2.14-r4)
#10 435.8 (4/38) Installing zstd-libs (1.5.6-r2)
#10 482.9 (5/38) Installing binutils (2.43.1-r3)
#10 621.8 (6/38) Installing libgomp (14.2.0-r4)
#10 629.3 (7/38) Installing libatomic (14.2.0-r4)
#10 629.7 (8/38) Installing gmp (6.3.0-r2)
#10 640.5 (9/38) Installing isl26 (0.26-r1)
#10 681.4 (10/38) Installing mpfr4 (4.2.1-r0)
#10 698.3 (11/38) Installing mpc1 (1.3.1-r1)
#10 701.3 (12/38) Installing gcc (14.2.0-r4)
#10 ...

#9 [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*
#9 702.6 (38/48) Installing python3-pycache-pyc0 (3.12.13-r0)
#9 814.4 (39/48) Installing pyc (3.12.13-r0)
#9 814.4 (40/48) Installing py3-setuptools-pyc (70.3.0-r0)
#9 855.2 (41/48) Installing py3-pip-pyc (24.3.1-r0)
#9 929.3 (42/48) Installing py3-parsing (3.1.4-r0)
#9 932.5 (43/48) Installing py3-parsing-pyc (3.1.4-r0)
#9 941.5 (44/48) Installing py3-packaging-pyc (24.2-r0)
#9 944.2 (45/48) Installing python3-pyc (3.12.13-r0)
#9 944.2 (46/48) Installing py3-packaging (24.2-r0)
#9 946.0 (47/48) Installing py3-setuptools (70.3.0-r0)
#9 966.0 (48/48) Installing py3-pip (24.3.1-r0)
#9 1025.7 Executing busybox-1.37.0-r12.trigger
#9 1025.7 OK: 81 MiB in 65 packages
#9 1032.4 Collecting markitdown[pdf]
#9 1032.9   Downloading markitdown-0.1.5-py3-none-any.whl.metadata (4.1 kB)
#9 1061.1 INFO: pip is looking at multiple versions of markitdown[pdf] to determine which version is compatible with other requirements. This could take a while.
#9 1061.3   Downloading markitdown-0.1.4-py3-none-any.whl.metadata (4.0 kB)
#9 1062.1   Downloading markitdown-0.1.3-py3-none-any.whl.metadata (4.0 kB)
#9 1062.5   Downloading markitdown-0.1.2-py3-none-any.whl.metadata (4.0 kB)
#9 1063.2   Downloading markitdown-0.1.1-py3-none-any.whl.metadata (3.9 kB)
#9 1063.4   Downloading markitdown-0.1.0-py3-none-any.whl.metadata (3.9 kB)
#9 1063.7   Downloading markitdown-0.0.2-py3-none-any.whl.metadata (6.7 kB)
#9 1063.9 WARNING: markitdown 0.0.2 does not provide the extra 'pdf'
#9 1066.1 Collecting azure-ai-documentintelligence (from markitdown[pdf])
#9 1066.3   Downloading azure_ai_documentintelligence-1.0.2-py3-none-any.whl.metadata (53 kB)
#9 1068.7 Collecting azure-identity (from markitdown[pdf])
#9 1068.8   Downloading azure_identity-1.25.3-py3-none-any.whl.metadata (91 kB)
#9 1072.3 Collecting markitdown[pdf]
#9 1072.5   Downloading markitdown-0.0.1-py3-none-any.whl.metadata (8.1 kB)
#9 1072.8 WARNING: markitdown 0.0.1 does not provide the extra 'pdf'
#9 1072.8 INFO: pip is still looking at multiple versions of markitdown[pdf] to determine which version is compatible with other requirements. This could take a while.
#9 1072.8 ERROR: Cannot install markitdown[pdf]==0.0.1, markitdown[pdf]==0.0.2, markitdown[pdf]==0.1.0, markitdown[pdf]==0.1.1, markitdown[pdf]==0.1.2, markitdown[pdf]==0.1.3, markitdown[pdf]==0.1.4 and markitdown[pdf]==0.1.5 because these package versions have conflicting dependencies.
#9 1072.8 
#9 1072.8 The conflict is caused by:
#9 1072.8     markitdown[pdf] 0.1.5 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.1.4 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.1.3 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.1.2 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.1.1 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.1.0 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.0.2 depends on beautifulsoup4
#9 1072.8     markitdown[pdf] 0.0.1 depends on beautifulsoup4
#9 1072.8 
#9 1072.8 To fix this you could try to:
#9 1072.8 1. loosen the range of package versions you've specified
#9 1072.8 2. remove package versions to allow pip to attempt to solve the dependency conflict
#9 1072.8 
#9 1075.1 ERROR: ResolutionImpossible: for help visit https://pip.pypa.io/en/latest/topics/dependency-resolution/#dealing-with-dependency-conflicts
#9 ERROR: process "/bin/sh -c apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*" did not complete successfully: exit code: 1

#10 [deps 3/5] RUN apk add --no-cache python3 py3-pip make g++
#10 CANCELED
------
 > [runtime 3/7] RUN apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*:
1072.8     markitdown[pdf] 0.1.1 depends on beautifulsoup4
1072.8     markitdown[pdf] 0.1.0 depends on beautifulsoup4
1072.8     markitdown[pdf] 0.0.2 depends on beautifulsoup4
1072.8     markitdown[pdf] 0.0.1 depends on beautifulsoup4
1072.8 
1072.8 To fix this you could try to:
1072.8 1. loosen the range of package versions you've specified
1072.8 2. remove package versions to allow pip to attempt to solve the dependency conflict
1072.8 
1075.1 ERROR: ResolutionImpossible: for help visit https://pip.pypa.io/en/latest/topics/dependency-resolution/#dealing-with-dependency-conflicts
------
ERROR: failed to solve: process "/bin/sh -c apk add --no-cache python3 py3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]'  && rm -rf /root/.cache /var/cache/apk/*" did not complete successfully: exit code: 1
  ⚠ Local docker build failed or timed out; trying GHCR fallback
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:622fffabc27c6370b331b872b796dd25aa1dea6a
622fffabc27c6370b331b872b796dd25aa1dea6a: Pulling from james-lebron2000/treatbot-api
f18232174bc9: Already exists
dd71dde834b5: Already exists
1e5a4c89cee5: Already exists
25ff2da83641: Already exists
a97326d97b60: Already exists
30221f21d3ba: Pulling fs layer
d919acc02391: Pulling fs layer
41b4530c5a54: Pulling fs layer
887e4e43c59c: Pulling fs layer
9d10e9c650af: Pulling fs layer
887e4e43c59c: Waiting
9d10e9c650af: Waiting
context canceled
  ⚠ GHCR pull failed or timed out; checking tarball fallback
  ❌ GHCR image unavailable and API tarball /tmp/treatbot-api.tar.gz is missing
```
