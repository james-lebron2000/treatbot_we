# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25633557945
- **Commit**: `30aa874d2d160e0ebbc37019159276b44056a27f`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25633557945
- **Generated at**: 2026-05-10T16:51:16Z

---

```
===== Deploy 20260511-002103 — SHA=30aa874d2d160e0ebbc37019159276b44056a27f =====
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:30aa874d2d160e0ebbc37019159276b44056a27f
30aa874d2d160e0ebbc37019159276b44056a27f: Pulling from james-lebron2000/treatbot-api
61320b01ae5e: Already exists
b98d3ae1ab80: Already exists
b1831021e35a: Already exists
c768ab8cba73: Already exists
8c994cf49dd1: Already exists
6d2412f3a32b: Already exists
119af53f9bd1: Already exists
2ae2f065ee82: Already exists
e1002189350e: Pulling fs layer
16a43b4094c8: Pulling fs layer
4174cbaa6524: Pulling fs layer
238c420461f6: Pulling fs layer
16a43b4094c8: Waiting
4174cbaa6524: Waiting
238c420461f6: Waiting
16a43b4094c8: Download complete
4174cbaa6524: Verifying Checksum
4174cbaa6524: Download complete
e1002189350e: Verifying Checksum
e1002189350e: Download complete
e1002189350e: Pull complete
16a43b4094c8: Pull complete
4174cbaa6524: Pull complete
238c420461f6: Retrying in 5 seconds
238c420461f6: Retrying in 4 seconds
238c420461f6: Retrying in 3 seconds
238c420461f6: Retrying in 2 seconds
238c420461f6: Retrying in 1 second
238c420461f6: Retrying in 10 seconds
238c420461f6: Retrying in 9 seconds
238c420461f6: Retrying in 8 seconds
238c420461f6: Retrying in 7 seconds
238c420461f6: Retrying in 6 seconds
238c420461f6: Retrying in 5 seconds
238c420461f6: Retrying in 4 seconds
238c420461f6: Retrying in 3 seconds
238c420461f6: Retrying in 2 seconds
238c420461f6: Retrying in 1 second
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  ⚠ source tarball /tmp/server-src.tar.gz missing; checking tarball fallback
  ❌ GHCR image unavailable and API tarball /tmp/treatbot-api.tar.gz is missing
74c: Retrying in 9 seconds
e2b6560b774c: Retrying in 8 seconds
e2b6560b774c: Retrying in 7 seconds
e2b6560b774c: Retrying in 6 seconds
e2b6560b774c: Retrying in 5 seconds
e2b6560b774c: Retrying in 4 seconds
e2b6560b774c: Retrying in 3 seconds
e2b6560b774c: Retrying in 2 seconds
e2b6560b774c: Retrying in 1 second
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.51kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.8s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:18-bookworm-slim
#4 DONE 0.4s

#5 [internal] load .dockerignore
#5 transferring context: 380B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
#6 DONE 0.0s

#7 [deps 2/5] WORKDIR /app
#7 CACHED

#8 [internal] load build context
#8 transferring context: 7.36MB 0.3s done
#8 DONE 0.3s

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 0.997 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#9 2.083 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#9 2.471 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#9 3.181 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 0.755 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#10 1.346 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#10 1.757 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#10 2.109 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#10 ...

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 315.4 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#9 316.1 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [303 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 326.2 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#10 326.4 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [303 kB]
#10 ...

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 330.3 Fetched 9357 kB in 5min 30s (28.4 kB/s)
#9 330.3 Reading package lists...
#9 330.8 Reading package lists...
#9 331.4 Building dependency tree...
#9 331.6 Reading state information...
#9 331.8 The following additional packages will be installed:
#9 331.8   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 331.8   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 331.8   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 331.8   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 331.8   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 331.8   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 331.8   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 331.8   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 331.8   media-types openssl python3-distutils python3-lib2to3 python3-minimal
#9 331.8   python3-pkg-resources python3-setuptools python3-wheel python3.11
#9 331.8   python3.11-minimal readline-common
#9 331.8 Suggested packages:
#9 331.8   krb5-doc krb5-user liblcms2-utils python3-doc python3-tk python3-venv
#9 331.8   python-setuptools-doc python3.11-venv python3.11-doc binutils binfmt-support
#9 331.8   readline-doc
#9 331.8 Recommended packages:
#9 331.8   krb5-locales libgpm2 poppler-data build-essential python3-dev
#9 332.1 The following NEW packages will be installed:
#9 332.1   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 332.1   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 332.1   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 332.1   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 332.1   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 332.1   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 332.1   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 332.1   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 332.1   media-types openssl poppler-utils python3 python3-distutils python3-lib2to3
#9 332.1   python3-minimal python3-pip python3-pkg-resources python3-setuptools
#9 332.1   python3-wheel python3.11 python3.11-minimal readline-common
#9 332.6 0 upgraded, 60 newly installed, 0 to remove and 23 not upgraded.
#9 332.6 Need to get 23.7 MB of archives.
#9 332.6 After this operation, 74.7 MB of additional disk space will be used.
#9 332.6 Get:1 http://deb.debian.org/debian-security bookworm-security/main amd64 libssl3 amd64 3.0.19-1~deb12u2 [2032 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 337.6 Fetched 9357 kB in 5min 37s (27.7 kB/s)
#10 337.6 Reading package lists...
#10 338.3 Reading package lists...
#10 338.9 Building dependency tree...
#10 339.0 Reading state information...
#10 339.2 The following additional packages will be installed:
#10 339.2   binutils binutils-common binutils-x86-64-linux-gnu bzip2 cpp cpp-12 dpkg-dev
#10 339.2   g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils libc-bin libc-dev-bin
#10 339.2   libc6 libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0 libdpkg-perl
#10 339.2   libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1 libgprofng0
#10 339.2   libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3 libkeyutils1
#10 339.2   libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6 libncursesw6 libnsl-dev
#10 339.2   libnsl2 libperl5.36 libpython3-stdlib libpython3.11-minimal
#10 339.2   libpython3.11-stdlib libquadmath0 libreadline8 libsqlite3-0 libssl3
#10 339.2   libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3 libtsan2 libubsan1
#10 339.2   linux-libc-dev make media-types patch perl perl-base perl-modules-5.36
#10 339.2   python3-minimal python3.11 python3.11-minimal readline-common rpcsvc-proto
#10 339.2   xz-utils
#10 339.2 Suggested packages:
#10 339.2   binutils-doc bzip2-doc cpp-doc gcc-12-locales cpp-12-doc debian-keyring
#10 339.2   g++-multilib g++-12-multilib gcc-12-doc gcc-multilib manpages-dev autoconf
#10 339.2   automake libtool flex bison gdb gcc-doc gcc-12-multilib glibc-doc libc-l10n
#10 339.2   locales libnss-nis libnss-nisplus gnupg | sq | sqop | pgpainless-cli
#10 339.2   sensible-utils git bzr gdbm-l10n krb5-doc krb5-user libstdc++-12-doc
#10 339.2   make-doc ed diffutils-doc perl-doc libterm-readline-gnu-perl
#10 339.2   | libterm-readline-perl-perl libtap-harness-archive-perl python3-doc
#10 339.2   python3-tk python3-venv python3.11-venv python3.11-doc binfmt-support
#10 339.2   readline-doc
#10 339.2 Recommended packages:
#10 339.2   fakeroot gnupg | sq | sqop | pgpainless-cli libalgorithm-merge-perl manpages
#10 339.2   manpages-dev libc-devtools libfile-fcntllock-perl liblocale-gettext-perl
#10 339.2   krb5-locales libgpm2 netbase ca-certificates
#10 339.5 The following NEW packages will be installed:
#10 339.5   binutils binutils-common binutils-x86-64-linux-gnu build-essential bzip2 cpp
#10 339.5   cpp-12 dpkg-dev g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils
#10 339.5   libc-dev-bin libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0
#10 339.5   libdpkg-perl libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1
#10 339.5   libgprofng0 libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3
#10 339.5   libkeyutils1 libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6
#10 339.5   libncursesw6 libnsl-dev libnsl2 libperl5.36 libpython3-stdlib
#10 339.5   libpython3.11-minimal libpython3.11-stdlib libquadmath0 libreadline8
#10 339.5   libsqlite3-0 libssl3 libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3
#10 339.5   libtsan2 libubsan1 linux-libc-dev make media-types patch perl
#10 339.5   perl-modules-5.36 python3 python3-minimal python3.11 python3.11-minimal
#10 339.5   readline-common rpcsvc-proto xz-utils
#10 339.5 The following packages will be upgraded:
#10 339.5   libc-bin libc6 perl-base
#10 339.9 3 upgraded, 69 newly installed, 0 to remove and 20 not upgraded.
#10 339.9 Need to get 88.1 MB of archives.
#10 339.9 After this operation, 348 MB of additional disk space will be used.
#10 339.9 Get:1 http://deb.debian.org/debian bookworm/main amd64 perl-base amd64 5.36.0-7+deb12u3 [1608 kB]
#10 442.5 Get:2 http://deb.debian.org/debian bookworm/main amd64 libc6 amd64 2.36-9+deb12u13 [2758 kB]
#10 ...

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 463.4 Get:2 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-minimal amd64 3.11.2-6+deb12u6 [817 kB]
#9 535.2 Get:3 http://deb.debian.org/debian bookworm/main amd64 libexpat1 amd64 2.5.0-1+deb12u2 [99.9 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 540.7 Get:3 http://deb.debian.org/debian bookworm/main amd64 libc-bin amd64 2.36-9+deb12u13 [609 kB]
#10 ...

#9 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 544.4 Get:4 http://deb.debian.org/debian bookworm/main amd64 python3.11-minimal amd64 3.11.2-6+deb12u6 [2064 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 568.9 Get:4 http://deb.debian.org/debian bookworm/main amd64 perl-modules-5.36 all 5.36.0-7+deb12u3 [2815 kB]
#10 653.9 Get:5 http://deb.debian.org/debian bookworm/main amd64 libgdbm6 amd64 1.23-3 [72.2 kB]
#10 656.8 Get:6 http://deb.debian.org/debian bookworm/main amd64 libgdbm-compat4 amd64 1.23-3 [48.2 kB]
#10 661.2 Get:7 http://deb.debian.org/debian bookworm/main amd64 libperl5.36 amd64 5.36.0-7+deb12u3 [4196 kB]
ttp://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/auth/send-code {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/auth/weapp-login {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/auth/refresh {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/auth/bind-phone {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/auth/profile {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/medical/ {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
          location /api/matches {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/trials/ {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/applications {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/admin/ {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/cro/ {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
          location /api/user/ {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
      
          # ===== 旧后端 API (5101) — h5 专用 =====
          location /api/ {
              proxy_pass http://127.0.0.1:5101/api/;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          # 静态上传文件
          location /uploads/ {
              alias /opt/treatbot/server/uploads/;
              expires 7d;
          }
      
          # 首页
          location = / {
              root /var/www/clinicalmatch-home;
              try_files /index.html =404;
              add_header Cache-Control "no-store";
          }
      
          # 默认 → treatbot API
          location / {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      }
      
      server {
          listen 80;
          server_name inseq.top www.inseq.top;
          return 301 https://$host$request_uri;
      }
      
      server {
          listen 80;
          server_name 49.235.162.129;
          return 404;
      }
    --- /etc/nginx/sites-enabled/treatbot.bak (-> /etc/nginx/sites-enabled/treatbot.bak) ---
      server {
          listen 443 ssl;
          server_name inseq.top www.inseq.top;
      
          client_max_body_size 30m;
      
          ssl_certificate /etc/nginx/ssl/inseq.top/www.inseq.top.pem;
          ssl_certificate_key /etc/nginx/ssl/inseq.top/www.inseq.top.key;
          include /etc/letsencrypt/options-ssl-nginx.conf;
          ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
      
          location /treatbot/ {
              alias /var/www/treatbot-web/;
              index index.html;
              try_files $uri $uri/ /treatbot/index.html;
              add_header Cache-Control "no-store";
          }
      
          location = /h5 {
              return 302 /h5/quick-match;
          }
      
          location /h5/ {
              proxy_pass http://127.0.0.1:3100;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location /api/auth/phone/ {
              proxy_pass http://127.0.0.1:5101/api/auth/phone/;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location = /api/auth/profile {
              proxy_pass http://127.0.0.1:5101/api/auth/profile;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location /api/patients {
              proxy_pass http://127.0.0.1:5101/api/patients;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location /api/public/quick-match/ {
              proxy_pass http://127.0.0.1:5101/api/public/quick-match/;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location /api/ {
              proxy_pass http://127.0.0.1:5101/api/;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location = / {
              root /var/www/clinicalmatch-home;
              try_files /index.html =404;
              add_header Cache-Control "no-store";
          }
      
          location / {
              proxy_pass http://127.0.0.1:3000;
              proxy_http_version 1.1;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_connect_timeout 300s;
              proxy_send_timeout 300s;
              proxy_read_timeout 300s;
          }
      
          location /uploads/ {
              alias /opt/treatbot/server/uploads/;
              expires 7d;
          }
      }
      
      server {
          listen 80;
          server_name inseq.top www.inseq.top;
          return 301 https://$host$request_uri;
      }
      
      server {
          listen 80;
          server_name 49.235.162.129;
          return 404;
      }
  ===== 9. nginx -T (effective merged config, just server_name + listen + location heads) =====
    }
    }
    }
    server {
        listen 443 ssl;
        server_name inseq.top www.inseq.top;
        location /treatbot/ {
        }
        location = /h5 {
            return 302 /h5/quick-match;
        }
        location /h5/ {
            proxy_pass http://127.0.0.1:3100;
        }
        location /api/auth/h5-login {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/auth/send-code {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/auth/weapp-login {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/auth/refresh {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/auth/bind-phone {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/auth/profile {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/medical/ {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/matches {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/trials/ {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/applications {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/admin/ {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/cro/ {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/user/ {
            proxy_pass http://127.0.0.1:3000;
        }
        location /api/ {
            proxy_pass http://127.0.0.1:5101/api/;
        }
        location /uploads/ {
        }
        location = / {
            root /var/www/clinicalmatch-home;
        }
        location / {
            proxy_pass http://127.0.0.1:3000;
        }
    }
    server {
        listen 80;
        server_name inseq.top www.inseq.top;
        return 301 https://$host$request_uri;
    }
    server {
        listen 80;
        server_name 49.235.162.129;
        return 404;
    }
    server {
        listen 443 ssl;
        server_name inseq.top www.inseq.top;
        location /treatbot/ {
        }
        location = /h5 {
            return 302 /h5/quick-match;
        }
        location /h5/ {
            proxy_pass http://127.0.0.1:3100;
        }
        location /api/auth/phone/ {
            proxy_pass http://127.0.0.1:5101/api/auth/phone/;
        }
        location = /api/auth/profile {
            proxy_pass http://127.0.0.1:5101/api/auth/profile;
        }
        location /api/patients {
            proxy_pass http://127.0.0.1:5101/api/patients;
        }
        location /api/public/quick-match/ {
            proxy_pass http://127.0.0.1:5101/api/public/quick-match/;
        }
        location /api/ {
            proxy_pass http://127.0.0.1:5101/api/;
        }
        location = / {
            root /var/www/clinicalmatch-home;
        }
        location / {
            proxy_pass http://127.0.0.1:3000;
        }
        location /uploads/ {
        }
    }
    server {
        listen 80;
        server_name inseq.top www.inseq.top;
        return 301 https://$host$request_uri;
    }
    server {
        listen 80;
        server_name 49.235.162.129;
        return 404;
    }
  ===== 10. /var/www listing =====
    total 20
    drwxr-xr-x  5 root   root   4096 Mar 31 17:15 .
    drwxr-xr-x 14 root   root   4096 Feb 26 16:26 ..
    drwxr-xr-x  2 root   root   4096 Mar 25 16:46 clinicalmatch-home
    drwxr-xr-x  2 root   root   4096 Feb 26 16:26 html
    drwxr-xr-x  3 ubuntu ubuntu 4096 May 11 00:16 treatbot-web
  ===== 11. Backup nginx tree (NOT removing) =====
    ✓ nginx tree → /home/ubuntu/treatbot-deploy-backups/nginx-tree.20260510-235811.tar.gz (16K)
  ===== 12. Backup current Caddyfile =====
    ✓ Caddyfile → /home/ubuntu/treatbot-deploy-backups/Caddyfile.20260510-235811
::group::C.5) Apply new Caddyfile + retire nginx
  ✓ New Caddyfile uploaded (114 lines)
  ✓ Current Caddyfile backed up to /home/ubuntu/treatbot-deploy-backups/Caddyfile.before-swap.20260510-235811
  --- diff (current → new) ---
  --- end diff ---
  --- validate (rc=0) ---
    {"level":"info","ts":1778430113.7910204,"msg":"using config from file","file":"/tmp/deploy/Caddyfile"}
    {"level":"warn","ts":1778430113.7939367,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.793968,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.794348,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.7959015,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.796017,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.7960346,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.7962232,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778430113.7962418,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"info","ts":1778430113.7973433,"msg":"adapted config to JSON","adapter":"caddyfile"}
    {"level":"warn","ts":1778430113.7981849,"msg":"Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies","adapter":"caddyfile","file":"/tmp/deploy/Caddyfile","line":23}
    {"level":"info","ts":1778430113.799927,"logger":"tls.cache.maintenance","msg":"started background certificate maintenance","cache":"0xc00056a880"}
    {"level":"info","ts":1778430113.8029819,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"inseq.top","server_name":"srv0"}
    {"level":"info","ts":1778430113.8030083,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"www.inseq.top","server_name":"srv0"}
    {"level":"info","ts":1778430113.8030221,"logger":"http.auto_https","msg":"enabling automatic HTTP->HTTPS redirects","server_name":"srv0"}
    {"level":"info","ts":1778430113.8045778,"logger":"tls.cache.maintenance","msg":"stopped background certificate maintenance","cache":"0xc00056a880"}
    Valid configuration
  --- end validate ---
  ✅ Caddy swapped + reloaded
  smoke: 127.0.0.1:3000/api/demo/samples=200  inseq.top/api/demo/samples=200
  ✅ /api/demo/samples=200 — Caddyfile swap confirmed healthy

  ===== Retire nginx (backup + stop + disable) =====
  nginx: active=inactive
unknown enabled=disabled
unknown
  ✓ nginx tree archived → /home/ubuntu/treatbot-deploy-backups/nginx-tree.retired.20260510-235811.tar.gz
  ✓ nginx already disabled
::endgroup::
::group::D) Smoke tests
  /health (container):
{"status":"ok","timestamp":"2026-05-10T16:21:57.043Z","version":"1.0.0","environment":"production"}
  / (via nginx):
    HTTP 200
  /api/demo/samples (via nginx):
    HTTP 200
  /demo-assets/sample-1-hcc.jpg (via nginx):
    HTTP 200
  /treatbot/ (Vue SPA):
    HTTP 200
::endgroup::
Total reclaimed space: 0B
===== ✅ Deploy 20260510-235811 done =====
```
