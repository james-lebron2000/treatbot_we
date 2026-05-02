# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25255963801
- **Commit**: `af75b0ccbbe8daea0019600a506deb072aa4ccad`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25255963801
- **Generated at**: 2026-05-02T16:47:10Z

---

```
===== Deploy 20260503-001158 — SHA=af75b0ccbbe8daea0019600a506deb072aa4ccad =====
::group::A) Backend container replace
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.47kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.7s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:18-bookworm-slim
#4 DONE 0.8s

#5 [internal] load .dockerignore
#5 transferring context: 229B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
#6 DONE 0.0s

#7 [deps 2/5] WORKDIR /app
#7 CACHED

#8 [internal] load build context
#8 transferring context: 6.82MB 0.2s done
#8 DONE 0.2s

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 0.734 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#9 1.726 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#9 3.372 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#9 5.392 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 0.740 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#10 1.756 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#10 2.876 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#10 4.130 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#10 562.4 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#10 562.9 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [299 kB]
#10 582.9 Fetched 9352 kB in 9min 42s (16.1 kB/s)
#10 582.9 Reading package lists...
#10 583.4 Reading package lists...
#10 584.1 Building dependency tree...
#10 584.2 Reading state information...
#10 584.4 The following additional packages will be installed:
#10 584.4   binutils binutils-common binutils-x86-64-linux-gnu bzip2 cpp cpp-12 dpkg-dev
#10 584.4   g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils libc-bin libc-dev-bin
#10 584.4   libc6 libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0 libdpkg-perl
#10 584.4   libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1 libgprofng0
#10 584.4   libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3 libkeyutils1
#10 584.4   libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6 libncursesw6 libnsl-dev
#10 584.4   libnsl2 libperl5.36 libpython3-stdlib libpython3.11-minimal
#10 584.4   libpython3.11-stdlib libquadmath0 libreadline8 libsqlite3-0 libssl3
#10 584.4   libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3 libtsan2 libubsan1
#10 584.4   linux-libc-dev make media-types patch perl perl-base perl-modules-5.36
#10 584.4   python3-minimal python3.11 python3.11-minimal readline-common rpcsvc-proto
#10 584.4   xz-utils
#10 584.4 Suggested packages:
#10 584.4   binutils-doc bzip2-doc cpp-doc gcc-12-locales cpp-12-doc debian-keyring
#10 584.4   g++-multilib g++-12-multilib gcc-12-doc gcc-multilib manpages-dev autoconf
#10 584.4   automake libtool flex bison gdb gcc-doc gcc-12-multilib glibc-doc libc-l10n
#10 584.4   locales libnss-nis libnss-nisplus gnupg | sq | sqop | pgpainless-cli
#10 584.4   sensible-utils git bzr gdbm-l10n krb5-doc krb5-user libstdc++-12-doc
#10 584.4   make-doc ed diffutils-doc perl-doc libterm-readline-gnu-perl
#10 584.4   | libterm-readline-perl-perl libtap-harness-archive-perl python3-doc
#10 584.4   python3-tk python3-venv python3.11-venv python3.11-doc binfmt-support
#10 584.4   readline-doc
#10 584.4 Recommended packages:
#10 584.4   fakeroot gnupg | sq | sqop | pgpainless-cli libalgorithm-merge-perl manpages
#10 584.4   manpages-dev libc-devtools libfile-fcntllock-perl liblocale-gettext-perl
#10 584.4   krb5-locales libgpm2 netbase ca-certificates
#10 584.8 The following NEW packages will be installed:
#10 584.8   binutils binutils-common binutils-x86-64-linux-gnu build-essential bzip2 cpp
#10 584.8   cpp-12 dpkg-dev g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils
#10 584.8   libc-dev-bin libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0
#10 584.8   libdpkg-perl libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1
#10 584.8   libgprofng0 libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3
#10 584.8   libkeyutils1 libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6
#10 584.8   libncursesw6 libnsl-dev libnsl2 libperl5.36 libpython3-stdlib
#10 584.8   libpython3.11-minimal libpython3.11-stdlib libquadmath0 libreadline8
#10 584.8   libsqlite3-0 libssl3 libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3
#10 584.8   libtsan2 libubsan1 linux-libc-dev make media-types patch perl
#10 584.8   perl-modules-5.36 python3 python3-minimal python3.11 python3.11-minimal
#10 584.8   readline-common rpcsvc-proto xz-utils
#10 584.8 The following packages will be upgraded:
#10 584.8   libc-bin libc6 perl-base
#10 585.5 3 upgraded, 69 newly installed, 0 to remove and 20 not upgraded.
#10 585.5 Need to get 88.1 MB of archives.
#10 585.5 After this operation, 348 MB of additional disk space will be used.
#10 585.5 Get:1 http://deb.debian.org/debian bookworm/main amd64 perl-base amd64 5.36.0-7+deb12u3 [1608 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 591.0 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#9 591.7 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [299 kB]
#9 614.1 Fetched 9352 kB in 10min 14s (15.2 kB/s)
#9 614.1 Reading package lists...
#9 614.7 Reading package lists...
#9 615.3 Building dependency tree...
#9 615.4 Reading state information...
#9 615.6 The following additional packages will be installed:
#9 615.6   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 615.6   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 615.6   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 615.6   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 615.6   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 615.6   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 615.6   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 615.6   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 615.6   media-types openssl python3-distutils python3-lib2to3 python3-minimal
#9 615.6   python3-pkg-resources python3-setuptools python3-wheel python3.11
#9 615.6   python3.11-minimal readline-common
#9 615.6 Suggested packages:
#9 615.6   krb5-doc krb5-user liblcms2-utils python3-doc python3-tk python3-venv
#9 615.6   python-setuptools-doc python3.11-venv python3.11-doc binutils binfmt-support
#9 615.6   readline-doc
#9 615.6 Recommended packages:
#9 615.6   krb5-locales libgpm2 poppler-data build-essential python3-dev
#9 616.0 The following NEW packages will be installed:
#9 616.0   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 616.0   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 616.0   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 616.0   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 616.0   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 616.0   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 616.0   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 616.0   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 616.0   media-types openssl poppler-utils python3 python3-distutils python3-lib2to3
#9 616.0   python3-minimal python3-pip python3-pkg-resources python3-setuptools
#9 616.0   python3-wheel python3.11 python3.11-minimal readline-common
#9 616.4 0 upgraded, 60 newly installed, 0 to remove and 23 not upgraded.
#9 616.4 Need to get 23.7 MB of archives.
#9 616.4 After this operation, 74.7 MB of additional disk space will be used.
#9 616.4 Get:1 http://deb.debian.org/debian-security bookworm-security/main amd64 libssl3 amd64 3.0.19-1~deb12u2 [2032 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 692.8 Get:2 http://deb.debian.org/debian bookworm/main amd64 libc6 amd64 2.36-9+deb12u13 [2758 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 778.3 Get:2 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-minimal amd64 3.11.2-6+deb12u6 [817 kB]
#9 886.3 Get:3 http://deb.debian.org/debian bookworm/main amd64 libexpat1 amd64 2.5.0-1+deb12u2 [99.9 kB]
#9 905.3 Get:4 http://deb.debian.org/debian bookworm/main amd64 python3.11-minimal amd64 3.11.2-6+deb12u6 [2064 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 1018.3 Ign:2 http://deb.debian.org/debian bookworm/main amd64 libc6 amd64 2.36-9+deb12u13
#10 1020.2 Get:3 http://deb.debian.org/debian bookworm/main amd64 libc-bin amd64 2.36-9+deb12u13 [609 kB]
#10 1060.3 Get:4 http://deb.debian.org/debian bookworm/main amd64 perl-modules-5.36 all 5.36.0-7+deb12u3 [2815 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1110.6 Get:5 http://deb.debian.org/debian bookworm/main amd64 python3-minimal amd64 3.11.2-1+b1 [26.3 kB]
#9 1111.8 Get:6 http://deb.debian.org/debian bookworm/main amd64 media-types all 10.0.0 [26.1 kB]
#9 1113.4 Get:7 http://deb.debian.org/debian bookworm/main amd64 libncursesw6 amd64 6.4-4 [134 kB]
#9 1124.0 Get:8 http://deb.debian.org/debian bookworm/main amd64 libkrb5support0 amd64 1.20.1-2+deb12u4 [33.2 kB]
#9 1127.0 Get:9 http://deb.debian.org/debian bookworm/main amd64 libk5crypto3 amd64 1.20.1-2+deb12u4 [79.8 kB]
#9 1132.9 Get:10 http://deb.debian.org/debian bookworm/main amd64 libkeyutils1 amd64 1.6.3-2 [8808 B]
#9 1133.8 Get:11 http://deb.debian.org/debian bookworm/main amd64 libkrb5-3 amd64 1.20.1-2+deb12u4 [334 kB]
#9 1166.7 Get:12 http://deb.debian.org/debian bookworm/main amd64 libgssapi-krb5-2 amd64 1.20.1-2+deb12u4 [135 kB]
#9 1177.7 Get:13 http://deb.debian.org/debian bookworm/main amd64 libtirpc-common all 1.3.3+ds-1 [14.0 kB]
#9 1179.1 Get:14 http://deb.debian.org/debian bookworm/main amd64 libtirpc3 amd64 1.3.3+ds-1 [85.2 kB]
#9 1185.3 Get:15 http://deb.debian.org/debian bookworm/main amd64 libnsl2 amd64 1.3.0-2 [39.5 kB]
#9 1188.6 Get:16 http://deb.debian.org/debian bookworm/main amd64 readline-common all 8.2-1.3 [69.0 kB]
#9 1193.4 Get:17 http://deb.debian.org/debian bookworm/main amd64 libreadline8 amd64 8.2-1.3 [166 kB]
#9 1202.2 Get:18 http://deb.debian.org/debian bookworm/main amd64 libsqlite3-0 amd64 3.40.1-2+deb12u2 [839 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 1214.6 Get:5 http://deb.debian.org/debian bookworm/main amd64 libgdbm6 amd64 1.23-3 [72.2 kB]
#10 1219.0 Get:6 http://deb.debian.org/debian bookworm/main amd64 libgdbm-compat4 amd64 1.23-3 [48.2 kB]
#10 1220.2 Get:7 http://deb.debian.org/debian bookworm/main amd64 libperl5.36 amd64 5.36.0-7+deb12u3 [4196 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1253.5 Get:19 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-stdlib amd64 3.11.2-6+deb12u6 [1798 kB]
#9 1359.6 Get:20 http://deb.debian.org/debian bookworm/main amd64 python3.11 amd64 3.11.2-6+deb12u6 [573 kB]
#9 1397.1 Get:21 http://deb.debian.org/debian bookworm/main amd64 libpython3-stdlib amd64 3.11.2-1+b1 [9312 B]
#9 1397.4 Get:22 http://deb.debian.org/debian bookworm/main amd64 python3 amd64 3.11.2-1+b1 [26.3 kB]
#9 1399.2 Get:23 http://deb.debian.org/debian-security bookworm-security/main amd64 openssl amd64 3.0.19-1~deb12u2 [1435 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 1461.3 Get:8 http://deb.debian.org/debian bookworm/main amd64 perl amd64 5.36.0-7+deb12u3 [239 kB]
#10 1475.1 Get:9 http://deb.debian.org/debian-security bookworm-security/main amd64 libssl3 amd64 3.0.19-1~deb12u2 [2032 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1485.1 Get:24 http://deb.debian.org/debian bookworm/main amd64 ca-certificates all 20230311+deb12u1 [155 kB]
#9 1494.1 Get:25 http://deb.debian.org/debian bookworm/main amd64 fonts-dejavu-core all 2.37-6 [1068 kB]
#9 CANCELED

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 CANCELED
ERROR: failed to solve: Canceled: context canceled
  ⚠ Local docker build failed or timed out; trying GHCR fallback
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:af75b0ccbbe8daea0019600a506deb072aa4ccad
af75b0ccbbe8daea0019600a506deb072aa4ccad: Pulling from james-lebron2000/treatbot-api
61320b01ae5e: Already exists
b98d3ae1ab80: Already exists
b1831021e35a: Already exists
c768ab8cba73: Already exists
8c994cf49dd1: Already exists
6d2412f3a32b: Already exists
119af53f9bd1: Pulling fs layer
2ae2f065ee82: Pulling fs layer
26c59ee2f6a9: Pulling fs layer
72ca2b769a00: Pulling fs layer
05c6e5f821d6: Pulling fs layer
26c59ee2f6a9: Download complete
72ca2b769a00: Download complete
```
