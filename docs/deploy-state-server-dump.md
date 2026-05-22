# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 26240257925
- **Commit**: `db64755fcc449f968539bc346be5af959af71c12`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/26240257925
- **Generated at**: 2026-05-21T17:00:34Z

---

```
===== Deploy 20260522-005350 — SHA=db64755fcc449f968539bc346be5af959af71c12 =====
::group::0) Preflight schema repair
::endgroup::
::group::A) Backend container replace
  Pulling image from GHCR: ghcr.io/james-lebron2000/treatbot-api:db64755fcc449f968539bc346be5af959af71c12
db64755fcc449f968539bc346be5af959af71c12: Pulling from james-lebron2000/treatbot-api
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
  Downloading source tarball from GitHub API for local build fallback
  ✓ Source tarball downloaded (4.7M)
  Building image locally from source tarball: /tmp/server-src.tar.gz
#0 building with "default" instance using docker driver

#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 3.85kB done
#1 DONE 0.0s

#2 resolve image config for docker-image://docker.io/docker/dockerfile:1.6
#2 DONE 1.0s

#3 docker-image://docker.io/docker/dockerfile:1.6@sha256:ac85f380a63b13dfcefa89046420e1781752bab202122f8f50032edf31be0021
#3 CACHED

#4 [internal] load metadata for docker.io/library/node:20-bookworm-slim
#4 DONE 0.8s

#5 [internal] load .dockerignore
#5 transferring context: 380B done
#5 DONE 0.0s

#6 [deps 1/5] FROM docker.io/library/node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
#6 DONE 0.0s

#7 [internal] load build context
#7 transferring context: 7.79MB 0.1s done
#7 DONE 0.2s

#8 [deps 2/5] WORKDIR /app
#8 CACHED

#9 [runtime 3/8] RUN set -eux;     if [ -n "http://mirrors.cloud.tencent.com/debian-security" ]; then       sed -i "s|http://deb.debian.org/debian-security|http://mirrors.cloud.tencent.com/debian-security|g" /etc/apt/sources.list.d/debian.sources;     fi;     if [ -n "http://mirrors.cloud.tencent.com/debian" ]; then       sed -i "s|http://deb.debian.org/debian|http://mirrors.cloud.tencent.com/debian|g" /etc/apt/sources.list.d/debian.sources;     fi;     apt-get update;     apt-get install -y --no-install-recommends python3 python3-pip python3-requests poppler-utils;     PIP_INSTALL_ARGS="--no-cache-dir --break-system-packages --retries 10 --timeout 180";     if [ -n "https://mirrors.cloud.tencent.com/pypi/simple" ]; then       PIP_INSTALL_ARGS="$PIP_INSTALL_ARGS -i https://mirrors.cloud.tencent.com/pypi/simple";     fi;     pip3 install $PIP_INSTALL_ARGS 'markitdown[pdf]==0.1.5';     apt-get purge -y python3-pip;     apt-get autoremove -y;     rm -rf /var/lib/apt/lists/* /root/.cache
#9 CACHED

#10 [deps 3/5] RUN set -eux;     if [ -n "http://mirrors.cloud.tencent.com/debian-security" ]; then       sed -i "s|http://deb.debian.org/debian-security|http://mirrors.cloud.tencent.com/debian-security|g" /etc/apt/sources.list.d/debian.sources;     fi;     if [ -n "http://mirrors.cloud.tencent.com/debian" ]; then       sed -i "s|http://deb.debian.org/debian|http://mirrors.cloud.tencent.com/debian|g" /etc/apt/sources.list.d/debian.sources;     fi;     apt-get update;     apt-get install -y --no-install-recommends python3 build-essential;     rm -rf /var/lib/apt/lists/*
#10 CACHED

#11 [deps 4/5] COPY server/package*.json ./
#11 CACHED

#12 [deps 5/5] RUN npm ci --omit=dev
#12 CACHED

#13 [runtime 4/8] COPY --from=deps /app/node_modules ./node_modules
#13 CACHED

#14 [runtime 5/8] COPY server/ ./
#14 DONE 0.1s

#15 [runtime 6/8] COPY shared /shared
#15 DONE 0.0s

#16 [runtime 7/8] RUN mkdir -p logs
#16 DONE 0.3s

#17 [runtime 8/8] RUN chown -R node:node /app
#17 DONE 52.1s

#18 exporting to image
#18 exporting layers
#18 exporting layers 3.0s done
#18 writing image sha256:2e12abe964c56cfbaf38f4a1a9caaeec34b58924ed1b07e807b510f14cfb1cdf done
#18 naming to docker.io/library/treatbot-api:db64755fcc449f968539bc346be5af959af71c12 done
#18 DONE 3.1s
  ✓ Image treatbot-api:db64755fcc449f968539bc346be5af959af71c12 built locally
  ✓ Image treatbot-api:db64755fcc449f968539bc346be5af959af71c12 ready in local daemon
  ✓ Old image 'treatbot-api:0c9106844ff832c3864cb586f54fb6a5ebafa95d' backed up as treatbot-api:rollback-20260522-005350
  ✓ Old env backed up to /home/ubuntu/treatbot-deploy-backups/treatbot-api.20260522-005350.env (44 vars)
treatbot-api
  Cleaning old prev containers:
treatbot-api-prev-20260519-231150
  ✓ Old container renamed to treatbot-api-prev-20260522-005350
  OCR env override:
    ✓ KIMI_API_KEY (len=51)
    ✓ KIMI_VISION_MODEL=moonshot-v1-128k-vision-preview
    ✓ ARK_API_KEY (len=46)
    ✓ ARK_VISION_MODEL=doubao-seed-1-6-vision-250815
    ✓ ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
    ✓ ARK_TIMEOUT_MS=180000
    ✓ OCR_JOB_TIMEOUT_MS=900000
    ✓ OCR_STRUCTURED_STREAM_TIMEOUT_MS=45000
    ✓ PARSE_STATUS_RATE_LIMIT_MAX=3600
    ✓ OCR_PROVIDER=auto
    ✓ OCR_QUEUE_CONCURRENCY=3
    ✓ OCR_PDF_VISION_MAX_PAGES=3
    ✓ OCR_PDF_VISION_DPI=150
  Admin login override:
    ✓ ADMIN_LOGIN_USERNAME=treatbot_admin
    ✓ ADMIN_LOGIN_KEY_HASH configured (sha256)
    ✓ ADMIN_LOGIN_TOKEN_TTL=3600
    ✓ ADMIN_LOGIN_CAN_REVEAL=true
7b6714cc47b710a749610193b09dca1ffdfcef91b8584d0b681d1bc04652ca6d
  ✓ Healthy after 3s
  ✅ Backend deployed. Rollback cmd:
     docker stop treatbot-api && docker rm treatbot-api && docker rename treatbot-api-prev-20260522-005350 treatbot-api && docker start treatbot-api
  ✓ Backend container image verified: treatbot-api:db64755fcc449f968539bc346be5af959af71c12
::endgroup::
::group::A.6) DB migrations (idempotent)
  ✅ Migrations done
::endgroup::
::group::B) Web frontend promote
  ✓ Tarball extracted (2 entries)
  ✓ Web backed up to /home/ubuntu/treatbot-deploy-backups/web.20260522-005350
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
    LISTEN 0      4096         0.0.0.0:3000       0.0.0.0:*    users:(("docker-proxy",pid=965749,fd=4))                
    LISTEN 0      4096       127.0.0.1:2019       0.0.0.0:*    users:(("caddy",pid=303834,fd=9))                       
    LISTEN 0      4096               *:443              *:*    users:(("caddy",pid=303834,fd=6))                       
    LISTEN 0      4096               *:80               *:*    users:(("caddy",pid=303834,fd=12))                      
    LISTEN 0      511                *:5101             *:*    users:(("MainThread",pid=3237127,fd=21))                
    LISTEN 0      4096            [::]:3000          [::]:*    users:(("docker-proxy",pid=965756,fd=4))                
  ===== 3. Docker containers + ports =====
    NAMES            IMAGE                                                   PORTS                                                  STATUS
    treatbot-api     treatbot-api:db64755fcc449f968539bc346be5af959af71c12   0.0.0.0:3000->3000/tcp, :::3000->3000/tcp              Up 6 seconds (healthy)
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
    
        # 所有 treatbot-api（Express @ 3000）的专有 API（在 /api/* catch-all 之前）
        @treatbot_api {
            path /api/demo/*
            path /api/auth/treatbot-login /api/auth/send-code /api/auth/weapp-login /api/auth/refresh /api/auth/bind-phone /api/auth/profile
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
    drwxr-xr-x  3 ubuntu ubuntu 4096 May 22 00:52 treatbot-web
  ===== 11. Backup nginx tree (NOT removing) =====
    ✓ nginx tree → /home/ubuntu/treatbot-deploy-backups/nginx-tree.20260522-005350.tar.gz (16K)
  ===== 12. Backup current Caddyfile =====
    ✓ Caddyfile → /home/ubuntu/treatbot-deploy-backups/Caddyfile.20260522-005350
::group::C.5) Apply new Caddyfile + retire nginx
  ✓ New Caddyfile uploaded (98 lines)
  ✓ Current Caddyfile backed up to /home/ubuntu/treatbot-deploy-backups/Caddyfile.before-swap.20260522-005350
  --- diff (current → new) ---
  --- end diff ---
  --- validate (rc=0) ---
    {"level":"info","ts":1779382823.2860332,"msg":"using config from file","file":"/tmp/deploy/Caddyfile"}
    {"level":"warn","ts":1779382823.287154,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1779382823.287169,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1779382823.2874777,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1779382823.2874904,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1779382823.2876348,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1779382823.2876463,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"info","ts":1779382823.2885606,"msg":"adapted config to JSON","adapter":"caddyfile"}
    {"level":"warn","ts":1779382823.2885745,"msg":"Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies","adapter":"caddyfile","file":"/tmp/deploy/Caddyfile","line":21}
    {"level":"info","ts":1779382823.2892172,"logger":"tls.cache.maintenance","msg":"started background certificate maintenance","cache":"0xc000496280"}
    {"level":"info","ts":1779382823.2908502,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"inseq.top","server_name":"srv0"}
    {"level":"info","ts":1779382823.2908769,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"www.inseq.top","server_name":"srv0"}
    {"level":"info","ts":1779382823.2908804,"logger":"http.auto_https","msg":"enabling automatic HTTP->HTTPS redirects","server_name":"srv0"}
    {"level":"info","ts":1779382823.2919974,"logger":"tls.cache.maintenance","msg":"stopped background certificate maintenance","cache":"0xc000496280"}
    Valid configuration
  --- end validate ---
  ✅ Caddy swapped + reloaded
  smoke: 127.0.0.1:3000/api/demo/samples=200  inseq.top/api/demo/samples=200
  ✅ /api/demo/samples=200 — Caddyfile swap confirmed healthy

  ===== Retire nginx (backup + stop + disable) =====
  nginx: active=inactive
unknown enabled=disabled
unknown
  ✓ nginx tree archived → /home/ubuntu/treatbot-deploy-backups/nginx-tree.retired.20260522-005350.tar.gz
  ✓ nginx already disabled
::endgroup::
::group::D) Smoke tests
  /health (container):
{"status":"ok","timestamp":"2026-05-21T17:00:26.423Z","version":"1.0.0","environment":"production"}
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
===== ✅ Deploy 20260522-005350 done =====
```
