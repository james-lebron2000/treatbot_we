# Deploy State — Server Dump (auto-generated, do not edit)

> Written by `.github/workflows/deploy.yml` after every deploy.
> autonomous routine reads this file via `git pull` — no GitHub API needed.

- **Run**: 24597764390
- **Commit**: `4f47e875e606a8a1a9101b0510c904044e957b2c`
- **Workflow URL**: https://github.com/james-lebron2000/treatbot_we/actions/runs/24597764390
- **Generated at**: 2026-04-18T05:24:19Z

---

```
===== Deploy 20260418-132336 — SHA=4f47e875e606a8a1a9101b0510c904044e957b2c =====
::group::A) Backend container replace
4f47e875e606a8a1a9101b0510c904044e957b2c: Pulling from jakelebron18/treatbot-api
f18232174bc9: Already exists
dd71dde834b5: Already exists
1e5a4c89cee5: Already exists
25ff2da83641: Already exists
c749fc04fe4b: Already exists
c100d188d6e3: Already exists
b21bbfc04d8e: Already exists
92c0ebd44d44: Pulling fs layer
f6e4dac582af: Pulling fs layer
c63045e052f3: Pulling fs layer
f6e4dac582af: Verifying Checksum
f6e4dac582af: Download complete
92c0ebd44d44: Verifying Checksum
92c0ebd44d44: Download complete
92c0ebd44d44: Pull complete
f6e4dac582af: Pull complete
c63045e052f3: Verifying Checksum
c63045e052f3: Download complete
c63045e052f3: Pull complete
Digest: sha256:0a03a71d09c071af02eb62d7cd06461e8955161c32213e6d68d3d61327d85a13
Status: Downloaded newer image for jakelebron18/treatbot-api:4f47e875e606a8a1a9101b0510c904044e957b2c
docker.io/jakelebron18/treatbot-api:4f47e875e606a8a1a9101b0510c904044e957b2c
  ✓ Old image 'treatbot-api:a9576480a841d1f91f3c3f47669042cc0ed8ad2e' backed up as treatbot-api:rollback-20260418-132336
  ✓ Old env backed up to /home/ubuntu/treatbot-deploy-backups/treatbot-api.20260418-132336.env (29 vars)
treatbot-api
  Cleaning old prev containers:
treatbot-api-prev-20260418-032706
  ✓ Old container renamed to treatbot-api-prev-20260418-132336
29ce7dd5be354798487b92ae96b61d90685c0413781997449a2a6b6ee4c604ae
  ✓ Healthy after 3s
  ✅ Backend deployed. Rollback cmd:
     docker stop treatbot-api && docker rm treatbot-api && docker rename treatbot-api-prev-20260418-132336 treatbot-api && docker start treatbot-api
::endgroup::
::group::B) Web frontend promote
  ✓ Tarball extracted (2 entries)
  ✓ Web backed up to /home/ubuntu/treatbot-deploy-backups/web.20260418-132336
  ✅ Web promoted to /var/www/treatbot-web (index.html OK, base=/treatbot/)
::endgroup::
::group::C) Reverse-proxy discovery (read-only)
  ===== 1. systemctl status (nginx vs caddy) =====
    nginx: active=inactive
unknown, enabled=disabled
unknown
    caddy: active=active, enabled=enabled
  ===== 2. Listening sockets (top relevant ports) =====
    State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess                                                  
    LISTEN 0      4096         0.0.0.0:3000      0.0.0.0:*    users:(("docker-proxy",pid=2330858,fd=4))               
    LISTEN 0      4096       127.0.0.1:2019      0.0.0.0:*    users:(("caddy",pid=303834,fd=7))                       
    LISTEN 0      4096               *:443             *:*    users:(("caddy",pid=303834,fd=9))                       
    LISTEN 0      4096               *:80              *:*    users:(("caddy",pid=303834,fd=10))                      
    LISTEN 0      511                *:5101            *:*    users:(("MainThread",pid=3237127,fd=21))                
    LISTEN 0      4096            [::]:3000         [::]:*    users:(("docker-proxy",pid=2330863,fd=4))               
  ===== 3. Docker containers + ports =====
    NAMES            IMAGE                                                   PORTS                                                  STATUS
    treatbot-api     treatbot-api:4f47e875e606a8a1a9101b0510c904044e957b2c   0.0.0.0:3000->3000/tcp, :::3000->3000/tcp              Up 5 seconds (health: starting)
    treatbot-redis   redis:7-alpine                                          0.0.0.0:6379->6379/tcp, :::6379->6379/tcp              Up 7 weeks (healthy)
    treatbot-mysql   mysql:8.0                                               0.0.0.0:3306->3306/tcp, :::3306->3306/tcp, 33060/tcp   Up 7 weeks (healthy)
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
    #   /api/applications*, /api/admin/*, /api/cro/*, /api/user/*
    #                             → 127.0.0.1:3000  (Express, treatbot-api)
    #   /api/*  (所有其他)         → 127.0.0.1:5101  (遗留 Python 服务)
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
    drwxr-xr-x  3 ubuntu ubuntu 4096 Apr 18 13:22 treatbot-web
  ===== 11. Backup nginx tree (NOT removing) =====
    ✓ nginx tree → /home/ubuntu/treatbot-deploy-backups/nginx-tree.20260418-132336.tar.gz (16K)
  ===== 12. Backup current Caddyfile =====
    ✓ Caddyfile → /home/ubuntu/treatbot-deploy-backups/Caddyfile.20260418-132336
::group::C.5) Apply new Caddyfile + retire nginx
  ✓ New Caddyfile uploaded (108 lines)
  ✓ Current Caddyfile backed up to /home/ubuntu/treatbot-deploy-backups/Caddyfile.before-swap.20260418-132336
  --- diff (current → new) ---
  --- end diff ---
  --- validate (rc=0) ---
    {"level":"info","ts":1776489842.9023817,"msg":"using config from file","file":"/tmp/deploy/Caddyfile"}
    {"level":"warn","ts":1776489842.9035447,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.9035594,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.9038393,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.9038515,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.9039533,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.903971,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.904083,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-For: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"warn","ts":1776489842.9040937,"logger":"caddyfile","msg":"Unnecessary header_up X-Forwarded-Proto: the reverse proxy's default behavior is to pass headers to the upstream"}
    {"level":"info","ts":1776489842.9050481,"msg":"adapted config to JSON","adapter":"caddyfile"}
    {"level":"warn","ts":1776489842.9050615,"msg":"Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies","adapter":"caddyfile","file":"/tmp/deploy/Caddyfile","line":19}
    {"level":"info","ts":1776489842.9057405,"logger":"tls.cache.maintenance","msg":"started background certificate maintenance","cache":"0xc00056f300"}
    {"level":"info","ts":1776489842.9059303,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"inseq.top","server_name":"srv0"}
    {"level":"info","ts":1776489842.9059432,"logger":"http.auto_https","msg":"skipping automatic certificate management because one or more matching certificates are already loaded","domain":"www.inseq.top","server_name":"srv0"}
    {"level":"info","ts":1776489842.905946,"logger":"http.auto_https","msg":"enabling automatic HTTP->HTTPS redirects","server_name":"srv0"}
    {"level":"info","ts":1776489842.9072733,"logger":"tls.cache.maintenance","msg":"stopped background certificate maintenance","cache":"0xc00056f300"}
    Valid configuration
  --- end validate ---
  ✅ Caddy swapped + reloaded
  smoke: 127.0.0.1:3000/api/demo/samples=200  inseq.top/api/demo/samples=200
  ✅ /api/demo/samples=200 — Caddyfile swap confirmed healthy

  ===== Retire nginx (backup + stop + disable) =====
  nginx: active=inactive
unknown enabled=disabled
unknown
  ✓ nginx tree archived → /home/ubuntu/treatbot-deploy-backups/nginx-tree.retired.20260418-132336.tar.gz
  ✓ nginx already disabled
::endgroup::
::group::D) Smoke tests
  /health (container):
{"status":"ok","timestamp":"2026-04-18T05:24:06.095Z","version":"1.0.0","environment":"production"}
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
===== ✅ Deploy 20260418-132336 done =====
```
