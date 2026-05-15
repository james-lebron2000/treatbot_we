# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25910558463
- **Commit**: `6abd0f5a7bdbd3d9074907e6c9db14d205625107`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25910558463
- **Generated at**: 2026-05-15T11:08:32Z

---

```
===== Deploy 20260515-173208 — SHA=6abd0f5a7bdbd3d9074907e6c9db14d205625107 =====
::group::0) Preflight schema repair
::endgroup::
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:6abd0f5a7bdbd3d9074907e6c9db14d205625107
6abd0f5a7bdbd3d9074907e6c9db14d205625107: Pulling from james-lebron2000/treatbot-api
ff86ea2e5edc: Already exists
e54aec64c365: Already exists
804d4d68057c: Already exists
64cfb949317c: Already exists
3c02fd806613: Already exists
2777179321ed: Pulling fs layer
ec53a7ca10c0: Pulling fs layer
ae5fa506a048: Pulling fs layer
13d562b63548: Pulling fs layer
96126082f4ac: Pulling fs layer
7d4ec91931ea: Pulling fs layer
886bc797040b: Pulling fs layer
13d562b63548: Waiting
96126082f4ac: Waiting
7d4ec91931ea: Waiting
886bc797040b: Waiting
2777179321ed: Verifying Checksum
2777179321ed: Pull complete
13d562b63548: Verifying Checksum
13d562b63548: Download complete
96126082f4ac: Verifying Checksum
96126082f4ac: Download complete
7d4ec91931ea: Verifying Checksum
7d4ec91931ea: Download complete
ec53a7ca10c0: Retrying in 5 seconds
ec53a7ca10c0: Retrying in 4 seconds
ec53a7ca10c0: Retrying in 3 seconds
ec53a7ca10c0: Retrying in 2 seconds
ec53a7ca10c0: Retrying in 1 second
ae5fa506a048: Retrying in 5 seconds
ae5fa506a048: Retrying in 4 seconds
ae5fa506a048: Retrying in 3 seconds
ae5fa506a048: Retrying in 2 seconds
ae5fa506a048: Retrying in 1 second
ec53a7ca10c0: Retrying in 10 seconds
ec53a7ca10c0: Retrying in 9 seconds
ec53a7ca10c0: Retrying in 8 seconds
ec53a7ca10c0: Retrying in 7 seconds
ec53a7ca10c0: Retrying in 6 seconds
ec53a7ca10c0: Retrying in 5 seconds
ec53a7ca10c0: Retrying in 4 seconds
ec53a7ca10c0: Retrying in 3 seconds
ec53a7ca10c0: Retrying in 2 seconds
ec53a7ca10c0: Retrying in 1 second
ae5fa506a048: Retrying in 10 seconds
ae5fa506a048: Retrying in 9 seconds
ae5fa506a048: Retrying in 8 seconds
ae5fa506a048: Retrying in 7 seconds
ae5fa506a048: Retrying in 6 seconds
ae5fa506a048: Retrying in 5 seconds
ae5fa506a048: Retrying in 4 seconds
ae5fa506a048: Retrying in 3 seconds
ae5fa506a048: Retrying in 2 seconds
ae5fa506a048: Retrying in 1 second
ae5fa506a048: Verifying Checksum
ae5fa506a048: Download complete
ec53a7ca10c0: Retrying in 15 seconds
ec53a7ca10c0: Retrying in 14 seconds
ec53a7ca10c0: Retrying in 13 seconds
ec53a7ca10c0: Retrying in 12 seconds
ec53a7ca10c0: Retrying in 11 seconds
ec53a7ca10c0: Retrying in 10 seconds
ec53a7ca10c0: Retrying in 9 seconds
ec53a7ca10c0: Retrying in 8 seconds
ec53a7ca10c0: Retrying in 7 seconds
ec53a7ca10c0: Retrying in 6 seconds
ec53a7ca10c0: Retrying in 5 seconds
ec53a7ca10c0: Retrying in 4 seconds
ec53a7ca10c0: Retrying in 3 seconds
ec53a7ca10c0: Retrying in 2 seconds
ec53a7ca10c0: Retrying in 1 second
886bc797040b: Retrying in 5 seconds
886bc797040b: Retrying in 4 seconds
886bc797040b: Retrying in 3 seconds
886bc797040b: Retrying in 2 seconds
886bc797040b: Retrying in 1 second
886bc797040b: Verifying Checksum
886bc797040b: Download complete
context canceled
  ⚠ GHCR pull failed or timed out; falling back to local build
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.76kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.4s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:20-bookworm-slim
#4 DONE 0.9s

#5 [internal] load .dockerignore
#5 transferring context: 380B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
#6 DONE 0.0s

#7 [deps 2/5] WORKDIR /app
#7 CACHED

#8 [internal] load build context
#8 transferring context: 7.70MB 0.3s done
#8 DONE 0.3s

#9 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#9 CACHED

#10 [deps 4/5] COPY server/package*.json ./
#10 CACHED

#11 [deps 5/5] RUN npm ci --omit=dev
#11 CACHED

#12 [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip python3-requests poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#12 1.560 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#12 2.324 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#12 2.777 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#12 3.124 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#12 305.6 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#12 306.0 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [305 kB]
#12 317.6 Fetched 9358 kB in 5min 17s (29.6 kB/s)
#12 317.6 Reading package lists...
#12 318.4 Reading package lists...
#12 319.2 Building dependency tree...
#12 319.4 Reading state information...
#12 319.8 The following additional packages will be installed:
#12 319.8   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#12 319.8   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#12 319.8   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#12 319.8   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#12 319.8   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#12 319.8   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#12 319.8   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#12 319.8   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#12 319.8   media-types openssl python3-certifi python3-chardet
#12 319.8   python3-charset-normalizer python3-distutils python3-idna python3-lib2to3
#12 319.8   python3-minimal python3-pkg-resources python3-setuptools python3-six
#12 319.8   python3-urllib3 python3-wheel python3.11 python3.11-minimal readline-common
#12 319.8 Suggested packages:
#12 319.8   krb5-doc krb5-user liblcms2-utils python3-doc python3-tk python3-venv
#12 319.8   python3-cryptography python3-openssl python3-socks python-requests-doc
#12 319.8   python-setuptools-doc python3-brotli python3.11-venv python3.11-doc binutils
#12 319.8   binfmt-support readline-doc
#12 319.8 Recommended packages:
#12 319.8   krb5-locales libgpm2 poppler-data build-essential python3-dev
#12 320.3 The following NEW packages will be installed:
#12 320.3   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#12 320.3   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#12 320.3   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#12 320.3   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#12 320.3   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#12 320.3   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#12 320.3   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#12 320.3   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#12 320.3   media-types openssl poppler-utils python3 python3-certifi python3-chardet
#12 320.3   python3-charset-normalizer python3-distutils python3-idna python3-lib2to3
#12 320.3   python3-minimal python3-pip python3-pkg-resources python3-requests
#12 320.3   python3-setuptools python3-six python3-urllib3 python3-wheel python3.11
#12 320.3   python3.11-minimal readline-common
#12 321.2 0 upgraded, 67 newly installed, 0 to remove and 0 not upgraded.
#12 321.2 Need to get 24.3 MB of archives.
#12 321.2 After this operation, 77.5 MB of additional disk space will be used.
#12 321.2 Get:1 http://deb.debian.org/debian-security bookworm-security/main amd64 libssl3 amd64 3.0.19-1~deb12u2 [2032 kB]
#12 409.0 Get:2 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-minimal amd64 3.11.2-6+deb12u6 [817 kB]
#12 449.1 Get:3 http://deb.debian.org/debian bookworm/main amd64 libexpat1 amd64 2.5.0-1+deb12u2 [99.9 kB]
#12 453.9 Get:4 http://deb.debian.org/debian bookworm/main amd64 python3.11-minimal amd64 3.11.2-6+deb12u6 [2064 kB]
#12 543.8 Get:5 http://deb.debian.org/debian bookworm/main amd64 python3-minimal amd64 3.11.2-1+b1 [26.3 kB]
#12 546.0 Get:6 http://deb.debian.org/debian bookworm/main amd64 media-types all 10.0.0 [26.1 kB]
#12 547.0 Get:7 http://deb.debian.org/debian bookworm/main amd64 libncursesw6 amd64 6.4-4 [134 kB]
#12 553.7 Get:8 http://deb.debian.org/debian bookworm/main amd64 libkrb5support0 amd64 1.20.1-2+deb12u4 [33.2 kB]
#12 554.9 Get:9 http://deb.debian.org/debian bookworm/main amd64 libk5crypto3 amd64 1.20.1-2+deb12u4 [79.8 kB]
#12 558.8 Get:10 http://deb.debian.org/debian bookworm/main amd64 libkeyutils1 amd64 1.6.3-2 [8808 B]
#12 559.0 Get:11 http://deb.debian.org/debian bookworm/main amd64 libkrb5-3 amd64 1.20.1-2+deb12u4 [334 kB]
#12 575.4 Get:12 http://deb.debian.org/debian bookworm/main amd64 libgssapi-krb5-2 amd64 1.20.1-2+deb12u4 [135 kB]
#12 581.3 Get:13 http://deb.debian.org/debian bookworm/main amd64 libtirpc-common all 1.3.3+ds-1 [14.0 kB]
#12 581.6 Get:14 http://deb.debian.org/debian bookworm/main amd64 libtirpc3 amd64 1.3.3+ds-1 [85.2 kB]
#12 587.3 Get:15 http://deb.debian.org/debian bookworm/main amd64 libnsl2 amd64 1.3.0-2 [39.5 kB]
#12 589.9 Get:16 http://deb.debian.org/debian bookworm/main amd64 readline-common all 8.2-1.3 [69.0 kB]
#12 596.7 Get:17 http://deb.debian.org/debian bookworm/main amd64 libreadline8 amd64 8.2-1.3 [166 kB]
#12 605.1 Get:18 http://deb.debian.org/debian bookworm/main amd64 libsqlite3-0 amd64 3.40.1-2+deb12u2 [839 kB]
#12 645.3 Get:19 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-stdlib amd64 3.11.2-6+deb12u6 [1798 kB]
#12 728.5 Get:20 http://deb.debian.org/debian bookworm/main amd64 python3.11 amd64 3.11.2-6+deb12u6 [573 kB]
#12 759.0 Get:21 http://deb.debian.org/debian bookworm/main amd64 libpython3-stdlib amd64 3.11.2-1+b1 [9312 B]
#12 759.9 Get:22 http://deb.debian.org/debian bookworm/main amd64 python3 amd64 3.11.2-1+b1 [26.3 kB]
#12 761.2 Get:23 http://deb.debian.org/debian-security bookworm-security/main amd64 openssl amd64 3.0.19-1~deb12u2 [1435 kB]
#12 839.0 Get:24 http://deb.debian.org/debian bookworm/main amd64 ca-certificates all 20230311+deb12u1 [155 kB]
#12 845.4 Get:25 http://deb.debian.org/debian bookworm/main amd64 fonts-dejavu-core all 2.37-6 [1068 kB]
#12 925.8 Get:26 http://deb.debian.org/debian bookworm/main amd64 fontconfig-config amd64 2.14.1-4 [315 kB]
#12 946.4 Get:27 http://deb.debian.org/debian bookworm/main amd64 libbrotli1 amd64 1.0.9-2+b6 [275 kB]
#12 964.7 Get:28 http://deb.debian.org/debian bookworm/main amd64 libbsd0 amd64 0.11.7-2 [117 kB]
#12 971.7 Get:29 http://deb.debian.org/debian-security bookworm-security/main amd64 libpng16-16 amd64 1.6.39-2+deb12u5 [277 kB]
#12 990.8 Get:30 http://deb.debian.org/debian bookworm/main amd64 libfreetype6 amd64 2.12.1+dfsg-5+deb12u4 [398 kB]
#12 1015.3 Get:31 http://deb.debian.org/debian bookworm/main amd64 libfontconfig1 amd64 2.14.1-4 [386 kB]
#12 1038.3 Get:32 http://deb.debian.org/debian bookworm/main amd64 libpixman-1-0 amd64 0.42.2-1 [546 kB]
#12 1080.5 Get:33 http://deb.debian.org/debian bookworm/main amd64 libxau6 amd64 1:1.0.9-1 [19.7 kB]
#12 1081.0 Get:34 http://deb.debian.org/debian bookworm/main amd64 libxdmcp6 amd64 1:1.1.2-3 [26.3 kB]
#12 1081.8 Get:35 http://deb.debian.org/debian bookworm/main amd64 libxcb1 amd64 1.15-1 [144 kB]
#12 1090.3 Get:36 http://deb.debian.org/debian bookworm/main amd64 libx11-data all 2:1.8.4-2+deb12u2 [292 kB]
#12 1102.3 Get:37 http://deb.debian.org/debian bookworm/main amd64 libx11-6 amd64 2:1.8.4-2+deb12u2 [760 kB]
#12 1143.2 Get:38 http://deb.debian.org/debian bookworm/main amd64 libxcb-render0 amd64 1.15-1 [115 kB]
#12 1151.3 Get:39 http://deb.debian.org/debian bookworm/main amd64 libxcb-shm0 amd64 1.15-1 [105 kB]
#12 1161.1 Get:40 http://deb.debian.org/debian bookworm/main amd64 libxext6 amd64 2:1.3.4-1+b1 [52.9 kB]
#12 1165.7 Get:41 http://deb.debian.org/debian bookworm/main amd64 libxrender1 amd64 1:0.9.10-1.1 [33.2 kB]
#12 1167.8 Get:42 http://deb.debian.org/debian bookworm/main amd64 libcairo2 amd64 1.16.0-7 [575 kB]
#12 1211.5 Get:43 http://deb.debian.org/debian bookworm/main amd64 libdeflate0 amd64 1.14-1 [61.4 kB]
#12 1213.7 Get:44 http://deb.debian.org/debian bookworm/main amd64 libjbig0 amd64 2.1-6.1 [31.7 kB]
#12 1215.2 Get:45 http://deb.debian.org/debian bookworm/main amd64 libjpeg62-turbo amd64 1:2.1.5-2 [166 kB]
#12 1226.7 Get:46 http://deb.debian.org/debian-security bookworm-security/main amd64 liblcms2-2 amd64 2.14-2+deb12u1 [154 kB]
#12 1238.8 Get:47 http://deb.debian.org/debian bookworm/main amd64 liblerc4 amd64 4.0.0+ds-2 [170 kB]
#12 1250.7 Get:48 http://deb.debian.org/debian bookworm/main amd64 libnspr4 amd64 2:4.35-1 [113 kB]
#12 1258.9 Get:49 http://deb.debian.org/debian-security bookworm-security/main amd64 libnss3 amd64 2:3.87.1-1+deb12u2 [1332 kB]
#12 1334.1 Get:50 http://deb.debian.org/debian bookworm/main amd64 libopenjp2-7 amd64 2.5.0-2+deb12u2 [189 kB]
#12 1349.8 Get:51 http://deb.debian.org/debian bookworm/main amd64 libwebp7 amd64 1.2.4-0.2+deb12u1 [286 kB]
#12 1369.7 Get:52 http://deb.debian.org/debian-security bookworm-security/main amd64 libtiff6 amd64 4.5.0-6+deb12u4 [316 kB]
#12 1390.2 Get:53 http://deb.debian.org/debian bookworm/main amd64 libpoppler126 amd64 22.12.0-2+deb12u1 [1853 kB]
#12 1506.1 Get:54 http://deb.debian.org/debian bookworm/main amd64 poppler-utils amd64 22.12.0-2+deb12u1 [191 kB]
#12 1518.2 Get:55 http://deb.debian.org/debian bookworm/main amd64 python3-certifi all 2022.9.24-1 [153 kB]
#12 1522.9 Get:56 http://deb.debian.org/debian bookworm/main amd64 python3-pkg-resources all 66.1.1-1+deb12u2 [297 kB]
#12 1537.0 Get:57 http://deb.debian.org/debian bookworm/main amd64 python3-chardet all 5.1.0+dfsg-2 [110 kB]
#12 1543.2 Get:58 http://deb.debian.org/debian bookworm/main amd64 python3-charset-normalizer all 3.0.1-2 [49.3 kB]
#12 1546.0 Get:59 http://deb.debian.org/debian bookworm/main amd64 python3-lib2to3 all 3.11.2-3 [76.3 kB]
#12 1551.0 Get:60 http://deb.debian.org/debian bookworm/main amd64 python3-distutils all 3.11.2-3 [131 kB]
#12 1558.4 Get:61 http://deb.debian.org/debian bookworm/main amd64 python3-idna all 3.3-1+deb12u1 [41.0 kB]
#12 1559.4 Get:62 http://deb.debian.org/debian bookworm/main amd64 python3-setuptools all 66.1.1-1+deb12u2 [522 kB]
#12 1594.1 Get:63 http://deb.debian.org/debian bookworm/main amd64 python3-wheel all 0.38.4-2 [30.8 kB]
#12 1597.2 Get:64 http://deb.debian.org/debian bookworm/main amd64 python3-pip all 23.0.1+dfsg-1 [1325 kB]
#12 1667.9 Get:65 http://deb.debian.org/debian bookworm/main amd64 python3-six all 1.16.0-4 [17.5 kB]
#12 1668.5 Get:66 http://deb.debian.org/debian-security bookworm-security/main amd64 python3-urllib3 all 1.26.12-1+deb12u3 [114 kB]
#12 1679.1 Get:67 http://deb.debian.org/debian bookworm/main amd64 python3-requests all 2.28.1+dfsg-1 [67.9 kB]
#12 1683.8 debconf: delaying package configuration, since apt-utils is not installed
#12 1683.9 Fetched 24.3 MB in 22min 43s (17.8 kB/s)
#12 1683.9 Selecting previously unselected package libssl3:amd64.
#12 1683.9 (Reading database ... (Reading database ... 5%(Reading database ... 10%(Reading database ... 15%(Reading database ... 20%(Reading database ... 25%(Reading database ... 30%(Reading database ... 35%(Reading database ... 40%(Reading database ... 45%(Reading database ... 50%(Reading database ... 55%(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%(Reading database ... 6096 files and directories currently installed.)
#12 1683.9 Preparing to unpack .../libssl3_3.0.19-1~deb12u2_amd64.deb ...
#12 1683.9 Unpacking libssl3:amd64 (3.0.19-1~deb12u2) ...
#12 1684.1 Selecting previously unselected package libpython3.11-minimal:amd64.
#12 1684.1 Preparing to unpack .../libpython3.11-minimal_3.11.2-6+deb12u6_amd64.deb ...
#12 1684.1 Unpacking libpython3.11-minimal:amd64 (3.11.2-6+deb12u6) ...
#12 1684.2 Selecting previously unselected package libexpat1:amd64.
#12 1684.2 Preparing to unpack .../libexpat1_2.5.0-1+deb12u2_amd64.deb ...
#12 1684.3 Unpacking libexpat1:amd64 (2.5.0-1+deb12u2) ...
#12 1684.3 Selecting previously unselected package python3.11-minimal.
#12 1684.3 Preparing to unpack .../python3.11-minimal_3.11.2-6+deb12u6_amd64.deb ...
#12 1684.3 Unpacking python3.11-minimal (3.11.2-6+deb12u6) ...
#12 1684.5 Setting up libssl3:amd64 (3.0.19-1~deb12u2) ...
#12 1684.5 Setting up libpython3.11-minimal:amd64 (3.11.2-6+deb12u6) ...
#12 1684.6 Setting up libexpat1:amd64 (2.5.0-1+deb12u2) ...
#12 1684.6 Setting up python3.11-minimal (3.11.2-6+deb12u6) ...
#12 1685.2 Selecting previously unselected package python3-minimal.
#12 1685.2 (Reading database ... (Reading database ... 5%(Reading database ... 10%(Reading database ... 15%(Reading database ... 20%(Reading database ... 25%(Reading database ... 30%(Reading database ... 35%(Reading database ... 40%(Reading database ... 45%(Reading database ... 50%(Reading database ... 55%(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%(Reading database ... 6424 files and directories currently installed.)
#12 1685.2 Preparing to unpack .../00-python3-minimal_3.11.2-1+b1_amd64.deb ...
#12 1685.2 Unpacking python3-minimal (3.11.2-1+b1) ...
#12 1685.3 Selecting previously unselected package media-types.
#12 1685.3 Preparing to unpack .../01-media-types_10.0.0_all.deb ...
#12 1685.3 Unpacking media-types (10.0.0) ...
#12 1685.3 Selecting previously unselected package libncursesw6:amd64.
#12 1685.3 Preparing to unpack .../02-libncursesw6_6.4-4_amd64.deb ...
#12 1685.3 Unpacking libncursesw6:amd64 (6.4-4) ...
#12 1685.4 Selecting previously unselected package libkrb5support0:amd64.
#12 1685.4 Preparing to unpack .../03-libkrb5support0_1.20.1-2+deb12u4_amd64.deb ...
#12 1685.4 Unpacking libkrb5support0:amd64 (1.20.1-2+deb12u4) ...
#12 1685.4 Selecting previously unselected package libk5crypto3:amd64.
#12 1685.4 Preparing to unpack .../04-libk5crypto3_1.20.1-2+deb12u4_amd64.deb ...
#12 1685.4 Unpacking libk5crypto3:amd64 (1.20.1-2+deb12u4) ...
#12 1685.5 Selecting previously unselected package libkeyutils1:amd64.
#12 1685.5 Preparing to unpack .../05-libkeyutils1_1.6.3-2_amd64.deb ...
#12 1685.5 Unpacking libkeyutils1:amd64 (1.6.3-2) ...
#12 1685.5 Selecting previously unselected package libkrb5-3:amd64.
#12 1685.5 Preparing to unpack .../06-libkrb5-3_1.20.1-2+deb12u4_amd64.deb ...
#12 1685.5 Unpacking libkrb5-3:amd64 (1.20.1-2+deb12u4) ...
#12 1685.6 Selecting previously unselected package libgssapi-krb5-2:amd64.
#12 1685.6 Preparing to unpack .../07-libgssapi-krb5-2_1.20.1-2+deb12u4_amd64.deb ...
#12 1685.6 Unpacking libgssapi-krb5-2:amd64 (1.20.1-2+deb12u4) ...
#12 1685.7 Selecting previously unselected package libtirpc-common.
#12 1685.7 Preparing to unpack .../08-libtirpc-common_1.3.3+ds-1_all.deb ...
#12 1685.7 Unpacking libtirpc-common (1.3.3+ds-1) ...
#12 1685.7 Selecting previously unselected package libtirpc3:amd64.
#12 1685.7 Preparing to unpack .../09-libtirpc3_1.3.3+ds-1_amd64.deb ...
#12 1685.7 Unpacking libtirpc3:amd64 (1.3.3+ds-1) ...
#12 1685.7 Selecting previously unselected package libnsl2:amd64.
#12 1685.7 Preparing to unpack .../10-libnsl2_1.3.0-2_amd64.deb ...
#12 1685.8 Unpacking libnsl2:amd64 (1.3.0-2) ...
#12 1685.8 Selecting previously unselected package readline-common.
#12 1685.8 Preparing to unpack .../11-readline-common_8.2-1.3_all.deb ...
#12 1685.8 Unpacking readline-common (8.2-1.3) ...
#12 1685.8 Selecting previously unselected package libreadline8:amd64.
#12 1685.8 Preparing to unpack .../12-libreadline8_8.2-1.3_amd64.deb ...
#12 1685.8 Unpacking libreadline8:amd64 (8.2-1.3) ...
#12 1685.9 Selecting previously unselected package libsqlite3-0:amd64.
#12 1685.9 Preparing to unpack .../13-libsqlite3-0_3.40.1-2+deb12u2_amd64.deb ...
#12 1685.9 Unpacking libsqlite3-0:amd64 (3.40.1-2+deb12u2) ...
#12 1686.0 Selecting previously unselected package libpython3.11-stdlib:amd64.
#12 1686.0 Preparing to unpack .../14-libpython3.11-stdlib_3.11.2-6+deb12u6_amd64.deb ...
#12 1686.0 Unpacking libpython3.11-stdlib:amd64 (3.11.2-6+deb12u6) ...
#12 1686.2 Selecting previously unselected package python3.11.
#12 1686.2 Preparing to unpack .../15-python3.11_3.11.2-6+deb12u6_amd64.deb ...
#12 1686.2 Unpacking python3.11 (3.11.2-6+deb12u6) ...
#12 1686.2 Selecting previously unselected package libpython3-stdlib:amd64.
#12 1686.3 Preparing to unpack .../16-libpython3-stdlib_3.11.2-1+b1_amd64.deb ...
#12 1686.3 Unpacking libpython3-stdlib:amd64 (3.11.2-1+b1) ...
#12 1686.3 Setting up python3-minimal (3.11.2-1+b1) ...
#12 1686.5 Selecting previously unselected package python3.
#12 1686.5 (Reading database ... (Reading database ... 5%(Reading database ... 10%(Reading database ... 15%(Reading database ... 20%(Reading database ... 25%(Reading database ... 30%(Reading database ... 35%(Reading database ... 40%(Reading database ... 45%(Reading database ... 50%(Reading database ... 55%(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%(Reading database ... 6932 files and directories currently installed.)
#12 1686.5 Preparing to unpack .../00-python3_3.11.2-1+b1_amd64.deb ...
#12 1686.5 Unpacking python3 (3.11.2-1+b1) ...
#12 1686.5 Selecting previously unselected package openssl.
#12 1686.5 Preparing to unpack .../01-openssl_3.0.19-1~deb12u2_amd64.deb ...
#12 1686.5 Unpacking openssl (3.0.19-1~deb12u2) ...
#12 1686.7 Selecting previously unselected package ca-certificates.
#12 1686.7 Preparing to unpack .../02-ca-certificates_20230311+deb12u1_all.deb ...
#12 1686.7 Unpacking ca-certificates (20230311+deb12u1) ...
#12 1686.8 Selecting previously unselected package fonts-dejavu-core.
#12 1686.8 Preparing to unpack .../03-fonts-dejavu-core_2.37-6_all.deb ...
#12 1686.8 Unpacking fonts-dejavu-core (2.37-6) ...
#12 1686.9 Selecting previously unselected package fontconfig-config.
#12 1686.9 Preparing to unpack .../04-fontconfig-config_2.14.1-4_amd64.deb ...
#12 1687.0 Unpacking fontconfig-config (2.14.1-4) ...
#12 1687.1 Selecting previously unselected package libbrotli1:amd64.
#12 1687.1 Preparing to unpack .../05-libbrotli1_1.0.9-2+b6_amd64.deb ...
#12 1687.1 Unpacking libbrotli1:amd64 (1.0.9-2+b6) ...
#12 1687.2 Selecting previously unselected package libbsd0:amd64.
#12 1687.2 Preparing to unpack .../06-libbsd0_0.11.7-2_amd64.deb ...
#12 1687.2 Unpacking libbsd0:amd64 (0.11.7-2) ...
#12 1687.2 Selecting previously unselected package libpng16-16:amd64.
#12 1687.2 Preparing to unpack .../07-libpng16-16_1.6.39-2+deb12u5_amd64.deb ...
#12 1687.2 Unpacking libpng16-16:amd64 (1.6.39-2+deb12u5) ...
#12 1687.3 Selecting previously unselected package libfreetype6:amd64.
#12 1687.3 Preparing to unpack .../08-libfreetype6_2.12.1+dfsg-5+deb12u4_amd64.deb ...
#12 1687.3 Unpacking libfreetype6:amd64 (2.12.1+dfsg-5+deb12u4) ...
#12 1687.3 Selecting previously unselected package libfontconfig1:amd64.
#12 1687.3 Preparing to unpack .../09-libfontconfig1_2.14.1-4_amd64.deb ...
#12 1687.3 Unpacking libfontconfig1:amd64 (2.14.1-4) ...
#12 1687.4 Selecting previously unselected package libpixman-1-0:amd64.
#12 1687.4 Preparing to unpack .../10-libpixman-1-0_0.42.2-1_amd64.deb ...
#12 1687.4 Unpacking libpixman-1-0:amd64 (0.42.2-1) ...
#12 1687.5 Selecting previously unselected package libxau6:amd64.
#12 1687.5 Preparing to unpack .../11-libxau6_1%3a1.0.9-1_amd64.deb ...
#12 1687.5 Unpacking libxau6:amd64 (1:1.0.9-1) ...
#12 1687.5 Selecting previously unselected package libxdmcp6:amd64.
#12 1687.5 Preparing to unpack .../12-libxdmcp6_1%3a1.1.2-3_amd64.deb ...
#12 1687.5 Unpacking libxdmcp6:amd64 (1:1.1.2-3) ...
#12 1687.6 Selecting previously unselected package libxcb1:amd64.
#12 1687.6 Preparing to unpack .../13-libxcb1_1.15-1_amd64.deb ...
#12 1687.6 Unpacking libxcb1:amd64 (1.15-1) ...
#12 1687.6 Selecting previously unselected package libx11-data.
#12 1687.6 Preparing to unpack .../14-libx11-data_2%3a1.8.4-2+deb12u2_all.deb ...
#12 1687.6 Unpacking libx11-data (2:1.8.4-2+deb12u2) ...
#12 1687.7 Selecting previously unselected package libx11-6:amd64.
#12 1687.7 Preparing to unpack .../15-libx11-6_2%3a1.8.4-2+deb12u2_amd64.deb ...
#12 1687.7 Unpacking libx11-6:amd64 (2:1.8.4-2+deb12u2) ...
#12 1687.8 Selecting previously unselected package libxcb-render0:amd64.
#12 1687.8 Preparing to unpack .../16-libxcb-render0_1.15-1_amd64.deb ...
#12 1687.8 Unpacking libxcb-render0:amd64 (1.15-1) ...
#12 1687.8 Selecting previously unselected package libxcb-shm0:amd64.
#12 1687.8 Preparing to unpack .../17-libxcb-shm0_1.15-1_amd64.deb ...
#12 1687.9 Unpacking libxcb-shm0:amd64 (1.15-1) ...
#12 1687.9 Selecting previously unselected package libxext6:amd64.
#12 1687.9 Preparing to unpack .../18-libxext6_2%3a1.3.4-1+b1_amd64.deb ...
#12 1687.9 Unpacking libxext6:amd64 (2:1.3.4-1+b1) ...
#12 1687.9 Selecting previously unselected package libxrender1:amd64.
#12 1687.9 Preparing to unpack .../19-libxrender1_1%3a0.9.10-1.1_amd64.deb ...
#12 1688.0 Unpacking libxrender1:amd64 (1:0.9.10-1.1) ...
#12 1688.0 Selecting previously unselected package libcairo2:amd64.
#12 1688.0 Preparing to unpack .../20-libcairo2_1.16.0-7_amd64.deb ...
#12 1688.0 Unpacking libcairo2:amd64 (1.16.0-7) ...
#12 1688.1 Selecting previously unselected package libdeflate0:amd64.
#12 1688.1 Preparing to unpack .../21-libdeflate0_1.14-1_amd64.deb ...
#12 1688.1 Unpacking libdeflate0:amd64 (1.14-1) ...
#12 1688.1 Selecting previously unselected package libjbig0:amd64.
#12 1688.1 Preparing to unpack .../22-libjbig0_2.1-6.1_amd64.deb ...
#12 1688.1 Unpacking libjbig0:amd64 (2.1-6.1) ...
#12 1688.2 Selecting previously unselected package libjpeg62-turbo:amd64.
#12 1688.2 Preparing to unpack .../23-libjpeg62-turbo_1%3a2.1.5-2_amd64.deb ...
#12 1688.2 Unpacking libjpeg62-turbo:amd64 (1:2.1.5-2) ...
#12 1688.2 Selecting previously unselected package liblcms2-2:amd64.
#12 1688.2 Preparing to unpack .../24-liblcms2-2_2.14-2+deb12u1_amd64.deb ...
#12 1688.2 Unpacking liblcms2-2:amd64 (2.14-2+deb12u1) ...
#12 1688.3 Selecting previously unselected package liblerc4:amd64.
#12 1688.3 Preparing to unpack .../25-liblerc4_4.0.0+ds-2_amd64.deb ...
#12 1688.3 Unpacking liblerc4:amd64 (4.0.0+ds-2) ...
#12 1688.3 Selecting previously unselected package libnspr4:amd64.
#12 1688.3 Preparing to unpack .../26-libnspr4_2%3a4.35-1_amd64.deb ...
#12 1688.3 Unpacking libnspr4:amd64 (2:4.35-1) ...
#12 1688.4 Selecting previously unselected package libnss3:amd64.
#12 1688.4 Preparing to unpack .../27-libnss3_2%3a3.87.1-1+deb12u2_amd64.deb ...
#12 1688.4 Unpacking libnss3:amd64 (2:3.87.1-1+deb12u2) ...
#12 1688.5 Selecting previously unselected package libopenjp2-7:amd64.
#12 1688.5 Preparing to unpack .../28-libopenjp2-7_2.5.0-2+deb12u2_amd64.deb ...
#12 1688.6 Unpacking libopenjp2-7:amd64 (2.5.0-2+deb12u2) ...
#12 1688.6 Selecting previously unselected package libwebp7:amd64.
#12 1688.6 Preparing to unpack .../29-libwebp7_1.2.4-0.2+deb12u1_amd64.deb ...
#12 1688.6 Unpacking libwebp7:amd64 (1.2.4-0.2+deb12u1) ...
#12 1688.7 Selecting previously unselected package libtiff6:amd64.
#12 1688.7 Preparing to unpack .../30-libtiff6_4.5.0-6+deb12u4_amd64.deb ...
#12 1688.7 Unpacking libtiff6:amd64 (4.5.0-6+deb12u4) ...
#12 1688.7 Selecting previously unselected package libpoppler126:amd64.
#12 1688.7 Preparing to unpack .../31-libpoppler126_22.12.0-2+deb12u1_amd64.deb ...
#12 1688.7 Unpacking libpoppler126:amd64 (22.12.0-2+deb12u1) ...
#12 1688.9 Selecting previously unselected package poppler-utils.
#12 1688.9 Preparing to unpack .../32-poppler-utils_22.12.0-2+deb12u1_amd64.deb ...
#12 1688.9 Unpacking poppler-utils (22.12.0-2+deb12u1) ...
#12 1688.9 Selecting previously unselected package python3-certifi.
#12 1688.9 Preparing to unpack .../33-python3-certifi_2022.9.24-1_all.deb ...
#12 1688.9 Unpacking python3-certifi (2022.9.24-1) ...
#12 1689.0 Selecting previously unselected package python3-pkg-resources.
#12 1689.0 Preparing to unpack .../34-python3-pkg-resources_66.1.1-1+deb12u2_all.deb ...
#12 1689.0 Unpacking python3-pkg-resources (66.1.1-1+deb12u2) ...
#12 1689.0 Selecting previously unselected package python3-chardet.
#12 1689.0 Preparing to unpack .../35-python3-chardet_5.1.0+dfsg-2_all.deb ...
#12 1689.0 Unpacking python3-chardet (5.1.0+dfsg-2) ...
#12 1689.1 Selecting previously unselected package python3-charset-normalizer.
#12 1689.1 Preparing to unpack .../36-python3-charset-normalizer_3.0.1-2_all.deb ...
#12 1689.1 Unpacking python3-charset-normalizer (3.0.1-2) ...
#12 1689.2 Selecting previously unselected package python3-lib2to3.
#12 1689.2 Preparing to unpack .../37-python3-lib2to3_3.11.2-3_all.deb ...
#12 1689.2 Unpacking python3-lib2to3 (3.11.2-3) ...
#12 1689.2 Selecting previously unselected package python3-distutils.
#12 1689.2 Preparing to unpack .../38-python3-distutils_3.11.2-3_all.deb ...
#12 1689.2 Unpacking python3-distutils (3.11.2-3) ...
#12 1689.3 Selecting previously unselected package python3-idna.
#12 1689.3 Preparing to unpack .../39-python3-idna_3.3-1+deb12u1_all.deb ...
#12 1689.3 Unpacking python3-idna (3.3-1+deb12u1) ...
#12 1689.4 Selecting previously unselected package python3-setuptools.
#12 1689.4 Preparing to unpack .../40-python3-setuptools_66.1.1-1+deb12u2_all.deb ...
#12 1689.4 Unpacking python3-setuptools (66.1.1-1+deb12u2) ...
#12 1689.6 Selecting previously unselected package python3-wheel.
#12 1689.6 Preparing to unpack .../41-python3-wheel_0.38.4-2_all.deb ...
#12 1689.6 Unpacking python3-wheel (0.38.4-2) ...
#12 1689.6 Selecting previously unselected package python3-pip.
#12 1689.6 Preparing to unpack .../42-python3-pip_23.0.1+dfsg-1_all.deb ...
#12 1689.7 Unpacking python3-pip (23.0.1+dfsg-1) ...
#12 1690.0 Selecting previously unselected package python3-six.
#12 1690.0 Preparing to unpack .../43-python3-six_1.16.0-4_all.deb ...
#12 1690.0 Unpacking python3-six (1.16.0-4) ...
#12 1690.1 Selecting previously unselected package python3-urllib3.
#12 1690.1 Preparing to unpack .../44-python3-urllib3_1.26.12-1+deb12u3_all.deb ...
#12 1690.1 Unpacking python3-urllib3 (1.26.12-1+deb12u3) ...
#12 1690.2 Selecting previously unselected package python3-requests.
#12 1690.2 Preparing to unpack .../45-python3-requests_2.28.1+dfsg-1_all.deb ...
#12 1690.2 Unpacking python3-requests (2.28.1+dfsg-1) ...
#12 1690.2 Setting up media-types (10.0.0) ...
#12 1690.2 Setting up liblcms2-2:amd64 (2.14-2+deb12u1) ...
#12 1690.3 Setting up libpixman-1-0:amd64 (0.42.2-1) ...
#12 1690.3 Setting up libxau6:amd64 (1:1.0.9-1) ...
#12 1690.3 Setting up libkeyutils1:amd64 (1.6.3-2) ...
#12 1690.3 Setting up liblerc4:amd64 (4.0.0+ds-2) ...
#12 1690.3 Setting up libtirpc-common (1.3.3+ds-1) ...
#12 1690.3 Setting up libbrotli1:amd64 (1.0.9-2+b6) ...
#12 1690.3 Setting up libsqlite3-0:amd64 (3.40.1-2+deb12u2) ...
#12 1690.3 Setting up libdeflate0:amd64 (1.14-1) ...
#12 1690.4 Setting up libjbig0:amd64 (2.1-6.1) ...
#12 1690.4 Setting up libkrb5support0:amd64 (1.20.1-2+deb12u4) ...
#12 1690.4 Setting up libjpeg62-turbo:amd64 (1:2.1.5-2) ...
#12 1690.4 Setting up libx11-data (2:1.8.4-2+deb12u2) ...
#12 1690.4 Setting up libnspr4:amd64 (2:4.35-1) ...
#12 1690.4 Setting up libpng16-16:amd64 (1.6.39-2+deb12u5) ...
#12 1690.4 Setting up fonts-dejavu-core (2.37-6) ...
#12 1690.5 Setting up libncursesw6:amd64 (6.4-4) ...
#12 1690.5 Setting up libk5crypto3:amd64 (1.20.1-2+deb12u4) ...
#12 1690.5 Setting up libwebp7:amd64 (1.2.4-0.2+deb12u1) ...
#12 1690.5 Setting up libtiff6:amd64 (4.5.0-6+deb12u4) ...
#12 1690.5 Setting up libopenjp2-7:amd64 (2.5.0-2+deb12u2) ...
#12 1690.5 Setting up libkrb5-3:amd64 (1.20.1-2+deb12u4) ...
#12 1690.6 Setting up openssl (3.0.19-1~deb12u2) ...
#12 1690.6 Setting up libbsd0:amd64 (0.11.7-2) ...
#12 1690.6 Setting up readline-common (8.2-1.3) ...
#12 1690.6 Setting up libxdmcp6:amd64 (1:1.1.2-3) ...
#12 1690.6 Setting up libxcb1:amd64 (1.15-1) ...
#12 1690.6 Setting up libxcb-render0:amd64 (1.15-1) ...
#12 1690.6 Setting up fontconfig-config (2.14.1-4) ...
#12 1690.8 debconf: unable to initialize frontend: Dialog
#12 1690.8 debconf: (TERM is not set, so the dialog frontend is not usable.)
#12 1690.8 debconf: falling back to frontend: Readline
#12 1690.8 debconf: unable to initialize frontend: Readline
#12 1690.8 debconf: (Can't locate Term/ReadLine.pm in @INC (you may need to install the Term::ReadLine module) (@INC contains: /etc/perl /usr/local/lib/x86_64-linux-gnu/perl/5.36.0 /usr/local/share/perl/5.36.0 /usr/lib/x86_64-linux-gnu/perl5/5.36 /usr/share/perl5 /usr/lib/x86_64-linux-gnu/perl-base /usr/lib/x86_64-linux-gnu/perl/5.36 /usr/share/perl/5.36 /usr/local/lib/site_perl) at /usr/share/perl5/Debconf/FrontEnd/Readline.pm line 7.)
#12 1690.8 debconf: falling back to frontend: Teletype
#12 1691.0 Setting up libreadline8:amd64 (8.2-1.3) ...
#12 1691.0 Setting up libnss3:amd64 (2:3.87.1-1+deb12u2) ...
#12 1691.0 Setting up libxcb-shm0:amd64 (1.15-1) ...
#12 1691.0 Setting up ca-certificates (20230311+deb12u1) ...
#12 1691.1 debconf: unable to initialize frontend: Dialog
#12 1691.1 debconf: (TERM is not set, so the dialog frontend is not usable.)
#12 1691.1 debconf: falling back to frontend: Readline
#12 1691.1 debconf: unable to initialize frontend: Readline
#12 1691.1 debconf: (Can't locate Term/ReadLine.pm in @INC (you may need to install the Term::ReadLine module) (@INC contains: /etc/perl /usr/local/lib/x86_64-linux-gnu/perl/5.36.0 /usr/local/share/perl/5.36.0 /usr/lib/x86_64-linux-gnu/perl5/5.36 /usr/share/perl5 /usr/lib/x86_64-linux-gnu/perl-base /usr/lib/x86_64-linux-gnu/perl/5.36 /usr/share/perl/5.36 /usr/local/lib/site_perl) at /usr/share/perl5/Debconf/FrontEnd/Readline.pm line 7.)
#12 1691.1 debconf: falling back to frontend: Teletype
#12 1692.0 Updating certificates in /etc/ssl/certs...
#12 1693.0 142 added, 0 removed; done.
#12 1693.0 Setting up libfreetype6:amd64 (2.12.1+dfsg-5+deb12u4) ...
#12 1693.0 Setting up libgssapi-krb5-2:amd64 (1.20.1-2+deb12u4) ...
#12 1693.1 Setting up libx11-6:amd64 (2:1.8.4-2+deb12u2) ...
#12 1693.1 Setting up libfontconfig1:amd64 (2.14.1-4) ...
#12 1693.1 Setting up libtirpc3:amd64 (1.3.3+ds-1) ...
#12 1693.1 Setting up libxrender1:amd64 (1:0.9.10-1.1) ...
#12 1693.1 Setting up libxext6:amd64 (2:1.3.4-1+b1) ...
#12 1693.1 Setting up libcairo2:amd64 (1.16.0-7) ...
#12 1693.1 Setting up libpoppler126:amd64 (22.12.0-2+deb12u1) ...
#12 1693.2 Setting up libnsl2:amd64 (1.3.0-2) ...
#12 1693.2 Setting up poppler-utils (22.12.0-2+deb12u1) ...
#12 1693.2 Setting up libpython3.11-stdlib:amd64 (3.11.2-6+deb12u6) ...
#12 1693.2 Setting up libpython3-stdlib:amd64 (3.11.2-1+b1) ...
#12 1693.2 Setting up python3.11 (3.11.2-6+deb12u6) ...
#12 1694.2 Setting up python3 (3.11.2-1+b1) ...
#12 1694.3 running python rtupdate hooks for python3.11...
#12 1694.3 running python post-rtupdate hooks for python3.11...
#12 1694.4 Setting up python3-six (1.16.0-4) ...
#12 1694.6 Setting up python3-certifi (2022.9.24-1) ...
#12 1694.8 Setting up python3-idna (3.3-1+deb12u1) ...
#12 1695.1 Setting up python3-urllib3 (1.26.12-1+deb12u3) ...
#12 1695.4 Setting up python3-lib2to3 (3.11.2-3) ...
#12 1695.6 Setting up python3-pkg-resources (66.1.1-1+deb12u2) ...
#12 1696.1 Setting up python3-distutils (3.11.2-3) ...
#12 1696.2 Setting up python3-setuptools (66.1.1-1+deb12u2) ...
#12 1696.9 Setting up python3-charset-normalizer (3.0.1-2) ...
#12 1697.1 Setting up python3-wheel (0.38.4-2) ...
#12 1697.4 Setting up python3-chardet (5.1.0+dfsg-2) ...
#12 1697.8 Setting up python3-requests (2.28.1+dfsg-1) ...
#12 1698.0 Setting up python3-pip (23.0.1+dfsg-1) ...
#12 1699.7 Processing triggers for libc-bin (2.36-9+deb12u13) ...
#12 1699.7 Processing triggers for ca-certificates (20230311+deb12u1) ...
#12 1699.8 Updating certificates in /etc/ssl/certs...
#12 1700.6 0 added, 0 removed; done.
#12 1700.6 Running hooks in /etc/ca-certificates/update.d...
#12 1700.6 done.
#12 1701.7 Collecting markitdown[pdf]==0.1.5
#12 1705.7   Downloading markitdown-0.1.5-py3-none-any.whl (63 kB)
#12 1707.8      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 63.4/63.4 kB 35.3 kB/s eta 0:00:00
#12 1708.7 Collecting beautifulsoup4
#12 1708.8   Downloading beautifulsoup4-4.14.3-py3-none-any.whl (107 kB)
#12 1729.7      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 107.7/107.7 kB 5.6 kB/s eta 0:00:00
#12 1729.7 Requirement already satisfied: charset-normalizer in /usr/lib/python3/dist-packages (from markitdown[pdf]==0.1.5) (3.0.1)
#12 1729.9 Collecting defusedxml
#12 1730.5   Downloading defusedxml-0.7.1-py2.py3-none-any.whl (25 kB)
#12 1734.1 Collecting magika~=0.6.1
#12 1734.2   Downloading magika-0.6.3-py3-none-manylinux_2_28_x86_64.whl (15.4 MB)
#12 2150.9      ━━━━━━━━━                                3.5/15.4 MB 6.9 kB/s eta 0:28:33
#12 2150.9 ERROR: Exception:
#12 2150.9 Traceback (most recent call last):
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 438, in _error_catcher
#12 2150.9     yield
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 561, in read
#12 2150.9     data = self._fp_read(amt) if not fp_closed else b""
#12 2150.9            ^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 527, in _fp_read
#12 2150.9     return self._fp.read(amt) if amt is not None else self._fp.read()
#12 2150.9            ^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3.11/http/client.py", line 465, in read
#12 2150.9     s = self.fp.read(amt)
#12 2150.9         ^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3.11/socket.py", line 706, in readinto
#12 2150.9     return self._sock.recv_into(b)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3.11/ssl.py", line 1311, in recv_into
#12 2150.9     return self.read(nbytes, buffer)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3.11/ssl.py", line 1167, in read
#12 2150.9     return self._sslobj.read(len, buffer)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9 TimeoutError: The read operation timed out
#12 2150.9 
#12 2150.9 During handling of the above exception, another exception occurred:
#12 2150.9 
#12 2150.9 Traceback (most recent call last):
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/cli/base_command.py", line 160, in exc_logging_wrapper
#12 2150.9     status = run_func(*args)
#12 2150.9              ^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/cli/req_command.py", line 247, in wrapper
#12 2150.9     return func(self, options, args)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/commands/install.py", line 419, in run
#12 2150.9     requirement_set = resolver.resolve(
#12 2150.9                       ^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/resolver.py", line 92, in resolve
#12 2150.9     result = self._result = resolver.resolve(
#12 2150.9                             ^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/resolvers.py", line 481, in resolve
#12 2150.9     state = resolution.resolve(requirements, max_rounds=max_rounds)
#12 2150.9             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/resolvers.py", line 373, in resolve
#12 2150.9     failure_causes = self._attempt_to_pin_criterion(name)
#12 2150.9                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/resolvers.py", line 213, in _attempt_to_pin_criterion
#12 2150.9     criteria = self._get_updated_criteria(candidate)
#12 2150.9                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/resolvers.py", line 204, in _get_updated_criteria
#12 2150.9     self._add_to_criteria(criteria, requirement, parent=candidate)
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/resolvers.py", line 172, in _add_to_criteria
#12 2150.9     if not criterion.candidates:
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/resolvelib/structs.py", line 151, in __bool__
#12 2150.9     return bool(self._sequence)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 155, in __bool__
#12 2150.9     return any(self)
#12 2150.9            ^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 143, in <genexpr>
#12 2150.9     return (c for c in iterator if id(c) not in self._incompatible_ids)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/found_candidates.py", line 47, in _iter_built
#12 2150.9     candidate = func()
#12 2150.9                 ^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/factory.py", line 206, in _make_candidate_from_link
#12 2150.9     self._link_candidate_cache[link] = LinkCandidate(
#12 2150.9                                        ^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/candidates.py", line 297, in __init__
#12 2150.9     super().__init__(
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/candidates.py", line 162, in __init__
#12 2150.9     self.dist = self._prepare()
#12 2150.9                 ^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/candidates.py", line 231, in _prepare
#12 2150.9     dist = self._prepare_distribution()
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/resolution/resolvelib/candidates.py", line 308, in _prepare_distribution
#12 2150.9     return preparer.prepare_linked_requirement(self._ireq, parallel_builds=True)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/operations/prepare.py", line 491, in prepare_linked_requirement
#12 2150.9     return self._prepare_linked_requirement(req, parallel_builds)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/operations/prepare.py", line 536, in _prepare_linked_requirement
#12 2150.9     local_file = unpack_url(
#12 2150.9                  ^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/operations/prepare.py", line 166, in unpack_url
#12 2150.9     file = get_http_url(
#12 2150.9            ^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/operations/prepare.py", line 107, in get_http_url
#12 2150.9     from_path, content_type = download(link, temp_dir.path)
#12 2150.9                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/network/download.py", line 147, in __call__
#12 2150.9     for chunk in chunks:
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/cli/progress_bars.py", line 53, in _rich_progress_bar
#12 2150.9     for chunk in iterable:
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_internal/network/utils.py", line 63, in response_chunks
#12 2150.9     for chunk in response.raw.stream(
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 622, in stream
#12 2150.9     data = self.read(amt=amt, decode_content=decode_content)
#12 2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 560, in read
#12 2150.9     with self._error_catcher():
#12 2150.9   File "/usr/lib/python3.11/contextlib.py", line 155, in __exit__
#12 2150.9     self.gen.throw(typ, value, traceback)
#12 2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 443, in _error_catcher
#12 2150.9     raise ReadTimeoutError(self._pool, None, "Read timed out.")
#12 2150.9 pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out.
#12 ERROR: process "/bin/sh -c apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip python3-requests poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache" did not complete successfully: exit code: 2
------
 > [runtime 3/8] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip python3-requests poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache:
2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 622, in stream
2150.9     data = self.read(amt=amt, decode_content=decode_content)
2150.9            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 560, in read
2150.9     with self._error_catcher():
2150.9   File "/usr/lib/python3.11/contextlib.py", line 155, in __exit__
2150.9     self.gen.throw(typ, value, traceback)
2150.9   File "/usr/lib/python3/dist-packages/pip/_vendor/urllib3/response.py", line 443, in _error_catcher
2150.9     raise ReadTimeoutError(self._pool, None, "Read timed out.")
2150.9 pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(host='files.pythonhosted.org', port=443): Read timed out.
------
ERROR: failed to solve: process "/bin/sh -c apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip python3-requests poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache" did not complete successfully: exit code: 2
  ⚠ Local docker build failed or timed out; checking tarball fallback
  ⚠ GHCR/local build unavailable and API tarball /tmp/treatbot-api.tar.gz is missing
  ⚠ Existing treatbot-api is healthy enough to keep serving; skipping backend swap
  ⚠ Backend container swap skipped; continuing with schema repair, migrations, web promote, and smoke
::endgroup::
::group::A.6) DB migrations (idempotent)
  ✅ Migrations done
::endgroup::
::group::B) Web frontend promote
  ✓ Tarball extracted (2 entries)
  ✓ Web backed up to /home/ubuntu/treatbot-deploy-backups/web.20260515-173208
  ✅ Web promoted to /var/www/treatbot-web (index.html OK, base=/treatbot/)
::endgroup::
::group::C) Reverse-proxy discovery (read-only)
  ===== 1. systemctl status (nginx vs caddy) =====
    nginx: active=inactive
unknown, enabled=disabled
unknown
    caddy: active=active, enabled=enabled
  ===== 2. Listening sockets (top relevant ports) =====
    State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess                                                  
    LISTEN 0      4096         0.0.0.0:3000       0.0.0.0:*    users:(("docker-proxy",pid=1496104,fd=4))               
    LISTEN 0      4096       127.0.0.1:2019       0.0.0.0:*    users:(("caddy",pid=303834,fd=6))                       
    LISTEN 0      4096               *:443              *:*    users:(("caddy",pid=303834,fd=7))                       
    LISTEN 0      4096               *:80               *:*    users:(("caddy",pid=303834,fd=11))                      
    LISTEN 0      511                *:5101             *:*    users:(("MainThread",pid=3237127,fd=21))                
    LISTEN 0      4096            [::]:3000          [::]:*    users:(("docker-proxy",pid=1496117,fd=4))               
  ===== 3. Docker containers + ports =====
    NAMES            IMAGE                                                   PORTS                                                  STATUS
    treatbot-api     treatbot-api:b25a7eacfe043da6eadccd82c144e4c5606f54e0   0.0.0.0:3000->3000/tcp, :::3000->3000/tcp              Up 4 days (healthy)
    treatbot-redis   redis:7-alpine                                          0.0.0.0:6379->6379/tcp, :::6379->6379/tcp              Up 2 months (healthy)
    treatbot-mysql   mysql:8.0                                               0.0.0.0:3306->3306/tcp, :::3306->3306/tcp, 33060/tcp   Up 2 months (healthy)
  ===== 4. /etc/caddy/Caddyfile (full) =====
    # TreatBot Caddy 反代配置（唯一源 — deploy.yml 会把本文件 scp 到 /etc/caddy/Caddyfile）
    #
    # 修复：原线上配置中 `/api/demo/*` 缺了 `path` 关键字，导致 Caddy 把它当成未知 matcher 名丢弃，
    # 请求落到 `handle /api/*` catch-all → :5101（Python 服务）→ 返回 404
    # {"success":false,"message":"Not found","code":"not_found"}。
    # 本文件把它补回 `path /api/demo/*` 并保留原 `/api/demo/*` 作为 bare path shorthand 不再使用。
    #
    # 路由拓扑（所有请求经 Caddy:443 → 下游）：
    #   /                         → 127.0.0.1:3000  (Express static landing page)
    #   /treatbot/*               → /var/www/treatbot-web  (Vue SPA + try_files)
    #   /h5 → redir /h5/quick-match
    #   /h5/*                     → 127.0.0.1:3100  (Next.js)
    #   /api/demo/*               → 127.0.0.1:3000  (Express, demo routes)
    #   /api/auth/*, /api/medical/*, /api/matches*, /api/trials*,
    #   /api/applications*, /api/admin/*, /api/cro/*, /api/user/*,
    #   /api/track, /api/me/*     → 127.0.0.1:3000  (Express, treatbot-api)
    #   /api/*  (所有其他)         → 127.0.0.1:5101  (遗留 Python 服务)
    #
    # 历史记录：
    #   2026-04-29 补 /api/track + /api/me/* —— 此前漏配导致小程序 §B.2 漏斗埋点
    #   与 §A.2 合规自助接口在生产环境直接 404（落到了 Python :5101 catch-all）。
    #   /demo-assets/*, /uploads/* → static via Express :3000
    
    {
        # Caddy admin API 只绑 localhost（防止腾讯云告警误判未授权接口暴露）
        admin 127.0.0.1:2019
    }
    
    inseq.top, www.inseq.top {
        tls /etc/caddy/ssl/cert.pem /etc/caddy/ssl/key.pem
    
        header {
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
            X-Frame-Options "DENY"
            X-Content-Type-Options "nosniff"
            -Server
        }
    
        # Vue SPA（/treatbot/*）
        handle_path /treatbot/* {
            root * /var/www/treatbot-web
            try_files {path} /index.html
            file_server
            header Cache-Control "no-store"
        }
    
        # H5（Next.js @ 3100）
        redir /h5 /h5/quick-match
        handle /h5/* {
            reverse_proxy 127.0.0.1:3100 {
                header_up X-Real-IP {remote_host}
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto {scheme}
                transport http {
                    read_timeout 300s
                    write_timeout 300s
                }
            }
        }
    
        # 所有 treatbot-api（Express @ 3000）的专有 API（在 /api/* catch-all 之前）
        @treatbot_api {
            path /api/demo/*
            path /api/auth/h5-login /api/auth/send-code /api/auth/weapp-login /api/auth/refresh /api/auth/bind-phone /api/auth/profile
            path /api/medical/* /api/matches /api/matches/* /api/trials /api/trials/*
            path /api/applications /api/applications/*
            path /api/admin/* /api/cro/* /api/user/*
            # Q3-红线 §B.2 漏斗埋点 + §A.2 合规自助：补齐这两组才算端到端可用
            path /api/track /api/me/*
        }
        handle @treatbot_api {
            reverse_proxy 127.0.0.1:3000 {
                header_up X-Real-IP {remote_host}
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto {scheme}
                transport http {
                    read_timeout 300s
                    write_timeout 300s
                }
            }
        }
    
        # 遗留 Python 服务（其他所有 /api/*）
        handle /api/* {
            reverse_proxy 127.0.0.1:5101 {
                header_up X-Real-IP {remote_host}
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto {scheme}
                transport http {
                    read_timeout 300s
                    write_timeout 300s
                }
            }
        }
    
        # Express 静态：上传文件
        handle_path /uploads/* {
            root * /opt/treatbot/server/uploads
            file_server
        }
    
        # 默认兜底（landing page、/demo-assets/、/health 等都由 Express :3000 处理）
        handle {
            reverse_proxy 127.0.0.1:3000 {
                header_up X-Real-IP {remote_host}
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto {scheme}
                transport http {
                    read_timeout 300s
                    write_timeout 300s
                }
            }
        }
    }
  ===== 5. /etc/caddy/conf.d/* (if any) =====
    (no conf.d)
  ===== 6. /etc/nginx layout =====
    /etc/nginx/sites-available/treatbot
    /etc/nginx/sites-available/default
    /etc/nginx/sites-available/treatbot.bak_20260310_232501
    /etc/nginx/sites-available/treatbot.bak.20260418-031812
    /etc/nginx/fastcgi.conf
    /etc/nginx/nginx.conf
    /etc/nginx/snippets/fastcgi-php.conf
    /etc/nginx/snippets/snakeoil.conf
    /etc/nginx/sites-enabled/treatbot
    /etc/nginx/sites-enabled/treatbot.bak
  ===== 7. /etc/nginx/nginx.conf =====
    user www-data;
    worker_processes auto;
    pid /run/nginx.pid;
    error_log /var/log/nginx/error.log;
    include /etc/nginx/modules-enabled/*.conf;
    
    events {
    	worker_connections 768;
    	# multi_accept on;
    }
    
    http {
    
    	##
    	# Basic Settings
    	##
    
    	sendfile on;
    	tcp_nopush on;
    	types_hash_max_size 2048;
    	# server_tokens off;
    
    	# server_names_hash_bucket_size 64;
    	# server_name_in_redirect off;
    
    	include /etc/nginx/mime.types;
    	default_type application/octet-stream;
    
    	##
    	# SSL Settings
    	##
    
    	ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
    	ssl_prefer_server_ciphers on;
    
    	##
    	# Logging Settings
    	##
    
    	access_log /var/log/nginx/access.log;
    
    	##
    	# Gzip Settings
    	##
    
    	gzip on;
    
    	# gzip_vary on;
    	# gzip_proxied any;
    	# gzip_comp_level 6;
    	# gzip_buffers 16 8k;
    	# gzip_http_version 1.1;
    	# gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    	##
    	# Virtual Host Configs
    	##
    
    	include /etc/nginx/conf.d/*.conf;
    	include /etc/nginx/sites-enabled/*;
    }
    
    
    #mail {
    #	# See sample authentication script at:
    #	# http://wiki.nginx.org/ImapAuthenticateWithApachePhpScript
    #
    #	# auth_http localhost/auth.php;
    #	# pop3_capabilities "TOP" "USER";
    #	# imap_capabilities "IMAP4rev1" "UIDPLUS";
    #
    #	server {
    #		listen     localhost:110;
    #		protocol   pop3;
    #		proxy      on;
    #	}
    #
    #	server {
    #		listen     localhost:143;
    #		protocol   imap;
    #		proxy      on;
    #	}
    #}
  ===== 8. /etc/nginx/sites-enabled/* (full content of each) =====
    --- /etc/nginx/sites-enabled/treatbot (-> /etc/nginx/sites-enabled/treatbot) ---
      server {
          listen 443 ssl;
          server_name inseq.top www.inseq.top;
      
          client_max_body_size 30m;
      
          ssl_certificate /etc/nginx/ssl/inseq.top/www.inseq.top.pem;
          ssl_certificate_key /etc/nginx/ssl/inseq.top/www.inseq.top.key;
          include /etc/letsencrypt/options-ssl-nginx.conf;
          ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
      
          # treatbot 前端（Vue SPA）
          location /treatbot/ {
              alias /var/www/treatbot-web/;
              index index.html;
              try_files $uri $uri/ /treatbot/index.html;
              add_header Cache-Control "no-store";
          }
      
          # h5 前端（Next.js 3100）
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
      
          # ===== treatbot API (3000) =====
          # treatbot 专有接口
          location /api/auth/h5-login {
              proxy_pass http://127.0.0.1:3000;
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
    drwxr-xr-x  3 ubuntu ubuntu 4096 May 15 17:29 treatbot-web
  ===== 11. Backup nginx tree (NOT removing) =====
    ✓ nginx tree → /home/ubuntu/treatbot-deploy-backups/nginx-tree.20260515-173208.tar.gz (16K)
  ===== 12. Backup current Caddyfile =====
    ✓ Caddyfile → /home/ubuntu/treatbot-deploy-backups/Caddyfile.20260515-173208
::group::C.5) Apply new Caddyfile + retire nginx
  ✓ New Caddyfile uploaded (114 lines)
  ✓ Current Caddyfile backed up to /home/ubuntu/treatbot-deploy-backups/Caddyfile.before-swap.20260515-173208
  --- diff (current → new) ---
  --- end diff ---
  --- validate (rc=0) ---
    {"level":"info","ts":1778843295.9757137,"msg":"using config from file","file":"/tmp/deploy/Caddyfile"}
    {"level":"warn","ts":1778843295.9777834,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9778013,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9781017,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9781141,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9781935,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.978203,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9783187,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1778843295.9783297,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"info","ts":1778843295.979695,"msg":"adapted config to JSON","adapter":"caddyfile"}
    {"level":"warn","ts":1778843295.9797094,"msg":"Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies","adapter":"caddyfile","file":"/tmp/deploy/Caddyfile","line":23}
    {"level":"info","ts":1778843295.981131,"logger":"tls.cache.maintenance","msg":"started background certificate maintenance","cache":"0xc000698e00"}
    {"level":"info","ts":1778843296.917784,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"inseq.top","server_name":"srv0"}
    {"level":"info","ts":1778843296.9178069,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"www.inseq.top","server_name":"srv0"}
    {"level":"info","ts":1778843296.9178102,"logger":"http.auto_https","msg":"enabling automatic HTTP->HTTPS redirects","server_name":"srv0"}
    {"level":"info","ts":1778843296.919696,"logger":"tls.cache.maintenance","msg":"stopped background certificate maintenance","cache":"0xc000698e00"}
    Valid configuration
  --- end validate ---
  ✅ Caddy swapped + reloaded
  smoke: 127.0.0.1:3000/api/demo/samples=200  inseq.top/api/demo/samples=200
  ✅ /api/demo/samples=200 — Caddyfile swap confirmed healthy

  ===== Retire nginx (backup + stop + disable) =====
  nginx: active=inactive
unknown enabled=disabled
unknown
  ✓ nginx tree archived → /home/ubuntu/treatbot-deploy-backups/nginx-tree.retired.20260515-173208.tar.gz
  ✓ nginx already disabled
::endgroup::
::group::D) Smoke tests
  /health (container):
{"status":"ok","timestamp":"2026-05-15T11:08:20.096Z","version":"1.0.0","environment":"production"}
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
===== ✅ Deploy 20260515-173208 done =====
```
