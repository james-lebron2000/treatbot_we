# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25865679903
- **Commit**: `533a4134e572edf902ecb5cd26a4390c2c5d7898`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25865679903
- **Generated at**: 2026-05-14T15:15:34Z

---

```
===== Deploy 20260514-223921 — SHA=533a4134e572edf902ecb5cd26a4390c2c5d7898 =====
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:533a4134e572edf902ecb5cd26a4390c2c5d7898
533a4134e572edf902ecb5cd26a4390c2c5d7898: Pulling from james-lebron2000/treatbot-api
ff86ea2e5edc: Pulling fs layer
e54aec64c365: Pulling fs layer
804d4d68057c: Pulling fs layer
64cfb949317c: Pulling fs layer
3c02fd806613: Pulling fs layer
2777179321ed: Pulling fs layer
3d1baa664707: Pulling fs layer
6c12c8626a2e: Pulling fs layer
4ecb64e8b52d: Pulling fs layer
81e7f3a1802d: Pulling fs layer
95c8b7420227: Pulling fs layer
7818e1ba82a8: Pulling fs layer
3d1baa664707: Waiting
6c12c8626a2e: Waiting
4ecb64e8b52d: Waiting
81e7f3a1802d: Waiting
95c8b7420227: Waiting
7818e1ba82a8: Waiting
64cfb949317c: Waiting
3c02fd806613: Waiting
2777179321ed: Waiting
e54aec64c365: Verifying Checksum
e54aec64c365: Download complete
64cfb949317c: Retrying in 5 seconds
64cfb949317c: Retrying in 4 seconds
64cfb949317c: Retrying in 3 seconds
64cfb949317c: Retrying in 2 seconds
64cfb949317c: Retrying in 1 second
ff86ea2e5edc: Retrying in 5 seconds
ff86ea2e5edc: Retrying in 4 seconds
ff86ea2e5edc: Retrying in 3 seconds
ff86ea2e5edc: Retrying in 2 seconds
ff86ea2e5edc: Retrying in 1 second
804d4d68057c: Retrying in 5 seconds
804d4d68057c: Retrying in 4 seconds
804d4d68057c: Retrying in 3 seconds
804d4d68057c: Retrying in 2 seconds
804d4d68057c: Retrying in 1 second
ff86ea2e5edc: Retrying in 10 seconds
ff86ea2e5edc: Retrying in 9 seconds
ff86ea2e5edc: Retrying in 8 seconds
ff86ea2e5edc: Retrying in 7 seconds
ff86ea2e5edc: Retrying in 6 seconds
ff86ea2e5edc: Retrying in 5 seconds
ff86ea2e5edc: Retrying in 4 seconds
ff86ea2e5edc: Retrying in 3 seconds
ff86ea2e5edc: Retrying in 2 seconds
ff86ea2e5edc: Retrying in 1 second
64cfb949317c: Retrying in 10 seconds
64cfb949317c: Retrying in 9 seconds
64cfb949317c: Retrying in 8 seconds
64cfb949317c: Retrying in 7 seconds
64cfb949317c: Retrying in 6 seconds
64cfb949317c: Retrying in 5 seconds
64cfb949317c: Retrying in 4 seconds
64cfb949317c: Retrying in 3 seconds
64cfb949317c: Retrying in 2 seconds
64cfb949317c: Retrying in 1 second
64cfb949317c: Retrying in 15 seconds
64cfb949317c: Retrying in 14 seconds
64cfb949317c: Retrying in 13 seconds
64cfb949317c: Retrying in 12 seconds
64cfb949317c: Retrying in 11 seconds
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.57kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.4s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:20-bookworm-slim
#4 DONE 0.7s

#5 [internal] load .dockerignore
#5 transferring context: 380B done
#5 DONE 0.0s

#6 [internal] load build context
#6 DONE 0.0s

#7 [deps 1/5] FROM docker.io/library/node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
#7 resolve docker.io/library/node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 0.0s done
#7 sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 6.49kB / 6.49kB done
#7 sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c 1.93kB / 1.93kB done
#7 sha256:9da6b4e352d0d5c94963eba1832408f5b7b08839cd8be9b6610c05de5118c704 6.88kB / 6.88kB done
#7 sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 0B / 28.24MB 0.1s
#7 sha256:e54aec64c365815cd7b91e718f00ac6e625562b1de09036b38614621b42c7582 0B / 3.31kB 0.1s
#7 sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 0B / 41.42MB 0.1s
#7 ...

#6 [internal] load build context
#6 transferring context: 7.70MB 0.2s done
#6 DONE 0.2s

#7 [deps 1/5] FROM docker.io/library/node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
#7 sha256:e54aec64c365815cd7b91e718f00ac6e625562b1de09036b38614621b42c7582 3.31kB / 3.31kB 0.3s done
#7 sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 10.49MB / 41.42MB 0.4s
#7 sha256:64cfb949317c9824fd081d55c59a7225bfe1f650c6395ba42d7ed0ccf51993d2 0B / 1.71MB 0.4s
#7 sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 5.24MB / 28.24MB 0.5s
#7 sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 20.97MB / 41.42MB 0.5s
#7 sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 20.97MB / 28.24MB 0.7s
#7 sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 41.42MB / 41.42MB 0.7s
#7 sha256:64cfb949317c9824fd081d55c59a7225bfe1f650c6395ba42d7ed0ccf51993d2 1.71MB / 1.71MB 0.6s done
#7 sha256:3c02fd806613748139b8b8a14a69ae3518a1b0e863c57c35aada3b92ed87fb31 0B / 447B 0.7s
#7 sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 28.24MB / 28.24MB 0.8s
#7 sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 41.42MB / 41.42MB 0.7s done
#7 sha256:3c02fd806613748139b8b8a14a69ae3518a1b0e863c57c35aada3b92ed87fb31 447B / 447B 0.8s done
#7 extracting sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4
#7 sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 28.24MB / 28.24MB 0.8s done
#7 extracting sha256:ff86ea2e5edce334d19a34fbc65d1a511aa1fc823dba1110422f991aa56b44d4 1.3s done
#7 extracting sha256:e54aec64c365815cd7b91e718f00ac6e625562b1de09036b38614621b42c7582 done
#7 extracting sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f
#7 extracting sha256:804d4d68057cbb26cbcde9a735148ebc6589911bad32cf9dbddb5b0ba878bf1f 1.5s done
#7 extracting sha256:64cfb949317c9824fd081d55c59a7225bfe1f650c6395ba42d7ed0ccf51993d2 0.1s done
#7 extracting sha256:3c02fd806613748139b8b8a14a69ae3518a1b0e863c57c35aada3b92ed87fb31 done
#7 DONE 4.1s

#8 [deps 2/5] WORKDIR /app
#8 DONE 0.4s

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1.307 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#9 5.690 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 1.477 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#10 ...

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 11.17 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#9 15.78 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 12.72 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#10 21.59 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#10 28.62 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
```
