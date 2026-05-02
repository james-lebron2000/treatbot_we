# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 25251742589
- **Commit**: `d2730541022fe9886c1393fb00179f29961eea7b`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/25251742589
- **Generated at**: 2026-05-02T13:02:21Z

---

```
===== Deploy 20260502-202705 — SHA=d2730541022fe9886c1393fb00179f29961eea7b =====
::group::A) Backend container replace
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2.47kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 0.8s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:18-bookworm-slim
#4 DONE 1.0s

#5 [internal] load .dockerignore
#5 transferring context: 229B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
#6 resolve docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e 0.0s done
#6 sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 0B / 28.23MB 0.1s
#6 sha256:b98d3ae1ab80d768fc7be41c07c4757d205cc33d2d26261b8273defb45455315 0B / 3.31kB 0.1s
#6 sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 0B / 38.25MB 0.1s
#6 sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e 6.49kB / 6.49kB done
#6 sha256:fc3faf127a182135fd956e68d570b1932a758f8008866d8dd6e131cf89de9605 1.93kB / 1.93kB done
#6 sha256:101e0128c8ea90af6e5eba2abbae8486503c6383c35cb30e2c60842a5a288479 6.54kB / 6.54kB done
#6 ...

#7 [internal] load build context
#7 transferring context: 6.83MB 0.1s done
#7 DONE 0.1s

#6 [deps 1/5] FROM docker.io/library/node:18-bookworm-slim@sha256:f9ab18e354e6855ae56ef2b290dd225c1e51a564f87584b9bd21dd651838830e
#6 sha256:b98d3ae1ab80d768fc7be41c07c4757d205cc33d2d26261b8273defb45455315 3.31kB / 3.31kB 0.2s done
#6 sha256:c768ab8cba73bb84835e67ed974c93e3e0e3ce1f67a73802422d66021fc9a07a 0B / 1.71MB 0.3s
#6 sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 4.19MB / 28.23MB 0.4s
#6 sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 17.83MB / 28.23MB 0.5s
#6 sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 6.29MB / 38.25MB 0.5s
#6 sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 28.23MB / 28.23MB 0.6s
#6 sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 16.78MB / 38.25MB 0.6s
#6 sha256:c768ab8cba73bb84835e67ed974c93e3e0e3ce1f67a73802422d66021fc9a07a 1.05MB / 1.71MB 0.6s
#6 extracting sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62
#6 sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 28.23MB / 28.23MB 0.6s done
#6 sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 38.25MB / 38.25MB 0.8s
#6 sha256:c768ab8cba73bb84835e67ed974c93e3e0e3ce1f67a73802422d66021fc9a07a 1.71MB / 1.71MB 0.7s done
#6 sha256:8c994cf49dd19aec88c96926e1a13b36a8f3e159942a5a2d0a9e2dc3e9e6c3dc 448B / 448B 0.8s
#6 sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 38.25MB / 38.25MB 0.8s done
#6 sha256:8c994cf49dd19aec88c96926e1a13b36a8f3e159942a5a2d0a9e2dc3e9e6c3dc 448B / 448B 0.8s done
#6 extracting sha256:61320b01ae5e0798393ef25f2dc72faf43703e60ba089b07d7170acbabbf8f62 1.3s done
#6 extracting sha256:b98d3ae1ab80d768fc7be41c07c4757d205cc33d2d26261b8273defb45455315 done
#6 extracting sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d
#6 extracting sha256:b1831021e35a69864dfc4c89eab9ab1232cf3508c787b082c55ee386c5c8527d 1.4s done
#6 extracting sha256:c768ab8cba73bb84835e67ed974c93e3e0e3ce1f67a73802422d66021fc9a07a 0.1s done
#6 extracting sha256:8c994cf49dd19aec88c96926e1a13b36a8f3e159942a5a2d0a9e2dc3e9e6c3dc done
#6 DONE 3.9s

#8 [deps 2/5] WORKDIR /app
#8 DONE 0.2s

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 0.614 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#9 2.916 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#9 6.206 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 0.582 Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]
#10 3.303 Get:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]
#10 5.745 Get:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 10.52 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 12.36 Get:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8792 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 531.1 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#9 531.6 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [299 kB]
#9 548.8 Fetched 9352 kB in 9min 8s (17.1 kB/s)
#9 548.8 Reading package lists...
#9 549.4 Reading package lists...
#9 550.0 Building dependency tree...
#9 550.1 Reading state information...
#9 550.3 The following additional packages will be installed:
#9 550.3   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 550.3   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 550.3   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 550.3   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 550.3   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 550.3   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 550.3   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 550.3   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 550.3   media-types openssl python3-distutils python3-lib2to3 python3-minimal
#9 550.3   python3-pkg-resources python3-setuptools python3-wheel python3.11
#9 550.3   python3.11-minimal readline-common
#9 550.3 Suggested packages:
#9 550.3   krb5-doc krb5-user liblcms2-utils python3-doc python3-tk python3-venv
#9 550.3   python-setuptools-doc python3.11-venv python3.11-doc binutils binfmt-support
#9 550.3   readline-doc
#9 550.3 Recommended packages:
#9 550.3   krb5-locales libgpm2 poppler-data build-essential python3-dev
#9 550.6 The following NEW packages will be installed:
#9 550.6   ca-certificates fontconfig-config fonts-dejavu-core libbrotli1 libbsd0
#9 550.6   libcairo2 libdeflate0 libexpat1 libfontconfig1 libfreetype6 libgssapi-krb5-2
#9 550.6   libjbig0 libjpeg62-turbo libk5crypto3 libkeyutils1 libkrb5-3 libkrb5support0
#9 550.6   liblcms2-2 liblerc4 libncursesw6 libnsl2 libnspr4 libnss3 libopenjp2-7
#9 550.6   libpixman-1-0 libpng16-16 libpoppler126 libpython3-stdlib
#9 550.6   libpython3.11-minimal libpython3.11-stdlib libreadline8 libsqlite3-0 libssl3
#9 550.6   libtiff6 libtirpc-common libtirpc3 libwebp7 libx11-6 libx11-data libxau6
#9 550.6   libxcb-render0 libxcb-shm0 libxcb1 libxdmcp6 libxext6 libxrender1
#9 550.6   media-types openssl poppler-utils python3 python3-distutils python3-lib2to3
#9 550.6   python3-minimal python3-pip python3-pkg-resources python3-setuptools
#9 550.6   python3-wheel python3.11 python3.11-minimal readline-common
#9 553.0 0 upgraded, 60 newly installed, 0 to remove and 23 not upgraded.
#9 553.0 Need to get 23.7 MB of archives.
#9 553.0 After this operation, 74.7 MB of additional disk space will be used.
#9 553.0 Get:1 http://deb.debian.org/debian-security bookworm-security/main amd64 libssl3 amd64 3.0.19-1~deb12u2 [2032 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 706.5 Get:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [6924 B]
#10 708.2 Get:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [299 kB]
#10 763.8 Fetched 9352 kB in 12min 43s (12.2 kB/s)
#10 763.8 Reading package lists...
#10 764.4 Reading package lists...
#10 764.9 Building dependency tree...
#10 765.1 Reading state information...
#10 765.3 The following additional packages will be installed:
#10 765.3   binutils binutils-common binutils-x86-64-linux-gnu bzip2 cpp cpp-12 dpkg-dev
#10 765.3   g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils libc-bin libc-dev-bin
#10 765.3   libc6 libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0 libdpkg-perl
#10 765.3   libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1 libgprofng0
#10 765.3   libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3 libkeyutils1
#10 765.3   libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6 libncursesw6 libnsl-dev
#10 765.3   libnsl2 libperl5.36 libpython3-stdlib libpython3.11-minimal
#10 765.3   libpython3.11-stdlib libquadmath0 libreadline8 libsqlite3-0 libssl3
#10 765.3   libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3 libtsan2 libubsan1
#10 765.3   linux-libc-dev make media-types patch perl perl-base perl-modules-5.36
#10 765.3   python3-minimal python3.11 python3.11-minimal readline-common rpcsvc-proto
#10 765.3   xz-utils
#10 765.3 Suggested packages:
#10 765.3   binutils-doc bzip2-doc cpp-doc gcc-12-locales cpp-12-doc debian-keyring
#10 765.3   g++-multilib g++-12-multilib gcc-12-doc gcc-multilib manpages-dev autoconf
#10 765.3   automake libtool flex bison gdb gcc-doc gcc-12-multilib glibc-doc libc-l10n
#10 765.3   locales libnss-nis libnss-nisplus gnupg | sq | sqop | pgpainless-cli
#10 765.3   sensible-utils git bzr gdbm-l10n krb5-doc krb5-user libstdc++-12-doc
#10 765.3   make-doc ed diffutils-doc perl-doc libterm-readline-gnu-perl
#10 765.3   | libterm-readline-perl-perl libtap-harness-archive-perl python3-doc
#10 765.3   python3-tk python3-venv python3.11-venv python3.11-doc binfmt-support
#10 765.3   readline-doc
#10 765.3 Recommended packages:
#10 765.3   fakeroot gnupg | sq | sqop | pgpainless-cli libalgorithm-merge-perl manpages
#10 765.3   manpages-dev libc-devtools libfile-fcntllock-perl liblocale-gettext-perl
#10 765.3   krb5-locales libgpm2 netbase ca-certificates
#10 765.6 The following NEW packages will be installed:
#10 765.6   binutils binutils-common binutils-x86-64-linux-gnu build-essential bzip2 cpp
#10 765.6   cpp-12 dpkg-dev g++ g++-12 gcc gcc-12 libasan8 libatomic1 libbinutils
#10 765.6   libc-dev-bin libc6-dev libcc1-0 libcrypt-dev libctf-nobfd0 libctf0
#10 765.6   libdpkg-perl libexpat1 libgcc-12-dev libgdbm-compat4 libgdbm6 libgomp1
#10 765.6   libgprofng0 libgssapi-krb5-2 libisl23 libitm1 libjansson4 libk5crypto3
#10 765.6   libkeyutils1 libkrb5-3 libkrb5support0 liblsan0 libmpc3 libmpfr6
#10 765.6   libncursesw6 libnsl-dev libnsl2 libperl5.36 libpython3-stdlib
#10 765.6   libpython3.11-minimal libpython3.11-stdlib libquadmath0 libreadline8
#10 765.6   libsqlite3-0 libssl3 libstdc++-12-dev libtirpc-common libtirpc-dev libtirpc3
#10 765.6   libtsan2 libubsan1 linux-libc-dev make media-types patch perl
#10 765.6   perl-modules-5.36 python3 python3-minimal python3.11 python3.11-minimal
#10 765.6   readline-common rpcsvc-proto xz-utils
#10 765.6 The following packages will be upgraded:
#10 765.6   libc-bin libc6 perl-base
#10 795.9 3 upgraded, 69 newly installed, 0 to remove and 20 not upgraded.
#10 795.9 Need to get 88.1 MB of archives.
#10 795.9 After this operation, 348 MB of additional disk space will be used.
#10 795.9 Ign:1 http://deb.debian.org/debian bookworm/main amd64 perl-base amd64 5.36.0-7+deb12u3
#10 796.2 Get:2 http://deb.debian.org/debian bookworm/main amd64 libc6 amd64 2.36-9+deb12u13 [2758 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 923.0 Get:2 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-minimal amd64 3.11.2-6+deb12u6 [817 kB]
#9 963.9 Get:3 http://deb.debian.org/debian bookworm/main amd64 libexpat1 amd64 2.5.0-1+deb12u2 [99.9 kB]
#9 966.5 Get:4 http://deb.debian.org/debian bookworm/main amd64 python3.11-minimal amd64 3.11.2-6+deb12u6 [2064 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 981.0 Get:3 http://deb.debian.org/debian bookworm/main amd64 libc-bin amd64 2.36-9+deb12u13 [609 kB]
#10 1011.4 Get:4 http://deb.debian.org/debian bookworm/main amd64 perl-modules-5.36 all 5.36.0-7+deb12u3 [2815 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1058.5 Get:5 http://deb.debian.org/debian bookworm/main amd64 python3-minimal amd64 3.11.2-1+b1 [26.3 kB]
#9 1060.3 Get:6 http://deb.debian.org/debian bookworm/main amd64 media-types all 10.0.0 [26.1 kB]
#9 1064.3 Get:7 http://deb.debian.org/debian bookworm/main amd64 libncursesw6 amd64 6.4-4 [134 kB]
#9 1074.1 Get:8 http://deb.debian.org/debian bookworm/main amd64 libkrb5support0 amd64 1.20.1-2+deb12u4 [33.2 kB]
#9 1076.7 Get:9 http://deb.debian.org/debian bookworm/main amd64 libk5crypto3 amd64 1.20.1-2+deb12u4 [79.8 kB]
#9 1079.1 Get:10 http://deb.debian.org/debian bookworm/main amd64 libkeyutils1 amd64 1.6.3-2 [8808 B]
#9 1079.5 Get:11 http://deb.debian.org/debian bookworm/main amd64 libkrb5-3 amd64 1.20.1-2+deb12u4 [334 kB]
#9 1095.7 Get:12 http://deb.debian.org/debian bookworm/main amd64 libgssapi-krb5-2 amd64 1.20.1-2+deb12u4 [135 kB]
#9 1112.8 Get:13 http://deb.debian.org/debian bookworm/main amd64 libtirpc-common all 1.3.3+ds-1 [14.0 kB]
#9 1113.3 Get:14 http://deb.debian.org/debian bookworm/main amd64 libtirpc3 amd64 1.3.3+ds-1 [85.2 kB]
#9 1116.8 Get:15 http://deb.debian.org/debian bookworm/main amd64 libnsl2 amd64 1.3.0-2 [39.5 kB]
#9 1117.6 Get:16 http://deb.debian.org/debian bookworm/main amd64 readline-common all 8.2-1.3 [69.0 kB]
#9 1120.1 Get:17 http://deb.debian.org/debian bookworm/main amd64 libreadline8 amd64 8.2-1.3 [166 kB]
#9 1127.7 Get:18 http://deb.debian.org/debian bookworm/main amd64 libsqlite3-0 amd64 3.40.1-2+deb12u2 [839 kB]
#9 1158.5 Get:19 http://deb.debian.org/debian bookworm/main amd64 libpython3.11-stdlib amd64 3.11.2-6+deb12u6 [1798 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 1188.6 Get:5 http://deb.debian.org/debian bookworm/main amd64 libgdbm6 amd64 1.23-3 [72.2 kB]
#10 1192.5 Get:6 http://deb.debian.org/debian bookworm/main amd64 libgdbm-compat4 amd64 1.23-3 [48.2 kB]
#10 1196.7 Get:7 http://deb.debian.org/debian bookworm/main amd64 libperl5.36 amd64 5.36.0-7+deb12u3 [4196 kB]
#10 ...

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 1249.1 Get:20 http://deb.debian.org/debian bookworm/main amd64 python3.11 amd64 3.11.2-6+deb12u6 [573 kB]
#9 1278.0 Get:21 http://deb.debian.org/debian bookworm/main amd64 libpython3-stdlib amd64 3.11.2-1+b1 [9312 B]
#9 1278.3 Get:22 http://deb.debian.org/debian bookworm/main amd64 python3 amd64 3.11.2-1+b1 [26.3 kB]
#9 1279.8 Get:23 http://deb.debian.org/debian-security bookworm-security/main amd64 openssl amd64 3.0.19-1~deb12u2 [1435 kB]
#9 1371.2 Get:24 http://deb.debian.org/debian bookworm/main amd64 ca-certificates all 20230311+deb12u1 [155 kB]
#9 1382.4 Get:25 http://deb.debian.org/debian bookworm/main amd64 fonts-dejavu-core all 2.37-6 [1068 kB]
#9 1422.1 Get:26 http://deb.debian.org/debian bookworm/main amd64 fontconfig-config amd64 2.14.1-4 [315 kB]
#9 1436.7 Get:27 http://deb.debian.org/debian bookworm/main amd64 libbrotli1 amd64 1.0.9-2+b6 [275 kB]
#9 1451.5 Get:28 http://deb.debian.org/debian bookworm/main amd64 libbsd0 amd64 0.11.7-2 [117 kB]
#9 1457.5 Get:29 http://deb.debian.org/debian-security bookworm-security/main amd64 libpng16-16 amd64 1.6.39-2+deb12u4 [276 kB]
#9 ...

#10 [deps 3/5] RUN apt-get update  && apt-get install -y --no-install-recommends python3 build-essential  && rm -rf /var/lib/apt/lists/*
#10 CANCELED

#9 [runtime 3/7] RUN apt-get update  && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils  && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5'  && apt-get purge -y python3-pip  && apt-get autoremove -y  && rm -rf /var/lib/apt/lists/* /root/.cache
#9 CANCELED
ERROR: failed to solve: Canceled: context canceled
  ⚠ Local docker build failed or timed out; trying GHCR fallback
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:d2730541022fe9886c1393fb00179f29961eea7b
d2730541022fe9886c1393fb00179f29961eea7b: Pulling from james-lebron2000/treatbot-api
61320b01ae5e: Already exists
b98d3ae1ab80: Already exists
b1831021e35a: Already exists
c768ab8cba73: Already exists
8c994cf49dd1: Already exists
6d2412f3a32b: Pulling fs layer
119af53f9bd1: Pulling fs layer
2ae2f065ee82: Pulling fs layer
77de9ac737d8: Pulling fs layer
40133cc85bce: Pulling fs layer
e0acb7483c12: Pulling fs layer
77de9ac737d8: Waiting
40133cc85bce: Waiting
e0acb7483c12: Waiting
6d2412f3a32b: Verifying Checksum
6d2412f3a32b: Download complete
6d2412f3a32b: Pull complete
77de9ac737d8: Retrying in 5 seconds
77de9ac737d8: Retrying in 4 seconds
77de9ac737d8: Retrying in 3 seconds
77de9ac737d8: Retrying in 2 seconds
77de9ac737d8: Retrying in 1 second
```
