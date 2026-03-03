# 腾讯云云服务购买与配置指南

## 快速购买清单（MVP 阶段）

### 1. 云服务器 CVM
**购买地址**: https://buy.cloud.tencent.com/cvm

**推荐配置**:
- 地域: 上海 / 北京（选择靠近用户的地域）
- 实例: 标准型 SA2 / S6，2核4G 或 4核8G
- 镜像: Ubuntu 20.04 LTS / CentOS 8
- 系统盘: 50GB SSD 云硬盘
- 数据盘: 100GB（可选）
- 带宽: 5Mbps（约 640KB/s）
- 数量: 2 台（主备或负载均衡）

**预估费用**: ¥200-800/月/台

**立即购买命令**（使用腾讯云 CLI）:
```bash
# 安装腾讯云 CLI
pip install tccli

# 配置认证
tccli configure

# 创建实例（示例）
tccli cvm RunInstances \
  --InstanceChargeType POSTPAID_BY_HOUR \
  --Placement '{"Zone":"ap-shanghai-2"}' \
  --InstanceType SA2.MEDIUM4 \
  --ImageId img-l8og963d \
  --SystemDisk '{"DiskType":"CLOUD_SSD","DiskSize":50}' \
  --InternetAccessible '{"InternetChargeType":"TRAFFIC_POSTPAID_BY_HOUR","InternetMaxBandwidthOut":5,"PublicIpAssigned":true}' \
  --InstanceCount 2 \
  --InstanceName treatbot-api \
  --LoginSettings '{"Password":"YourStrongPassword123!"}' \
  --SecurityGroupIds '["sg-xxxxxxxx"]'
```

---

### 2. 云数据库 MySQL
**购买地址**: https://buy.cloud.tencent.com/cdb

**推荐配置**:
- 地域: 与 CVM 相同
- 架构: 基础版（MVP）/ 高可用版（生产）
- 实例规格: 2核4G 或 4核8G
- 硬盘: 100GB SSD
- 版本: MySQL 8.0

**预估费用**: ¥400-1,500/月

**手动配置步骤**:
1. 购买后进入控制台
2. 创建数据库 `treatbot`
3. 创建用户 `treatbot_user`
4. 开启外网访问（或配置 VPC 内网）
5. 配置安全组，只允许应用服务器 IP 访问

---

### 3. 云数据库 Redis
**购买地址**: https://buy.cloud.tencent.com/redis

**推荐配置**:
- 地域: 与 CVM 相同
- 版本: Redis 6.0
- 架构: 标准版
- 规格: 1GB 或 2GB
- 副本: 0（MVP）/ 1（生产）

**预估费用**: ¥150-400/月

---

### 4. 对象存储 COS
**购买地址**: https://buy.cloud.tencent.com/cos

**配置步骤**:
1. 创建存储桶
   - 名称: `treatbot-files`（全球唯一）
   - 地域: 与 CVM 相同
   - 访问权限: **私有读写**

2. 配置跨域访问（CORS）:
```xml
<CORSConfiguration>
  <CORSRule>
    <ID>weapp</ID>
    <AllowedOrigin>https://servicewechat.com</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>300</MaxAgeSeconds>
    <ExposeHeader>ETag</ExposeHeader>
  </CORSRule>
</CORSConfiguration>
```

3. 配置防盗链
4. 开启数据沉降（降低存储成本）

**预估费用**: ¥50-500/月（按存储量和流量计费）

---

### 5. 文字识别 OCR
**开通地址**: https://console.cloud.tencent.com/ocr/overview

**配置步骤**:
1. 开通通用印刷体识别
2. 开通医疗票据识别（如有）
3. 创建 API 密钥（SecretId + SecretKey）
4. 设置调用量包（预付费更便宜）
   - 推荐: 1万次资源包（约 ¥800）

**预估费用**: ¥500-3,000/月（按调用量）

---

### 6. SSL 证书
**申请地址**: https://console.cloud.tencent.com/ssl

**免费证书**:
1. 选择"申请免费证书"
2. 域名: `api.treatbot.example.com`
3. 验证方式: DNS 验证 / 文件验证
4. 下载 Nginx 格式证书

---

## 一键配置脚本

### 创建配置文件
```bash
cat > ~/treatbot-config.sh << 'EOF'
#!/bin/bash

# 腾讯云配置信息
export TENCENT_SECRET_ID="your-secret-id"
export TENCENT_SECRET_KEY="your-secret-key"
export REGION="ap-shanghai"

# 数据库配置
export DB_HOST="your-mysql-host.mysql.tencentcdb.com"
export DB_PORT=3306
export DB_USER="treatbot"
export DB_PASSWORD="your-db-password"
export DB_NAME="treatbot"

# Redis 配置
export REDIS_HOST="your-redis-host.redis.tencentcdb.com"
export REDIS_PORT=6379
export REDIS_PASSWORD="your-redis-password"

# COS 配置
export COS_SECRET_ID="your-cos-secret-id"
export COS_SECRET_KEY="your-cos-secret-key"
export COS_BUCKET="treatbot-files"
export COS_REGION="ap-shanghai"

# OCR 配置
export OCR_SECRET_ID="your-ocr-secret-id"
export OCR_SECRET_KEY="your-ocr-secret-key"

# 微信小程序
export WEAPP_APPID="your-appid"
export WEAPP_SECRET="your-secret"

# JWT
export JWT_SECRET="$(openssl rand -base64 32)"
EOF

chmod +x ~/treatbot-config.sh
```

---

## 安全组配置

### CVM 安全组规则

**入站规则**:
| 协议 | 端口 | 源 IP | 说明 |
|------|------|-------|------|
| TCP | 22 | 你的 IP/32 | SSH 管理 |
| TCP | 80 | 0.0.0.0/0 | HTTP |
| TCP | 443 | 0.0.0.0/0 | HTTPS |
| TCP | 3000 | 安全组 ID | 应用端口（内网） |

**出站规则**: 默认允许所有

---

## 域名配置

### 1. 购买域名
**地址**: https://dnspod.cloud.tencent.com/

### 2. 添加 DNS 记录
```
类型: A
主机: api
值: 你的服务器公网 IP
TTL: 600
```

### 3. 微信小程序服务器域名配置
登录微信公众平台 → 开发 → 开发设置 → 服务器域名

**request 合法域名**:
- `https://api.treatbot.example.com`

**uploadFile 合法域名**:
- `https://treatbot-files.cos.ap-shanghai.myqcloud.com`

**downloadFile 合法域名**:
- `https://treatbot-files.cos.ap-shanghai.myqcloud.com`

---

## 费用汇总（月度）

| 服务 | 配置 | 预估费用 |
|------|------|----------|
| CVM × 2 | 4C8G | ¥1,600 |
| MySQL | 2C4G | ¥800 |
| Redis | 1GB | ¥250 |
| COS | 100GB | ¥100 |
| OCR | 1万次 | ¥800 |
| 带宽 | 5Mbps | ¥200 |
| **总计** | | **¥3,750/月** |

---

## 快速验证

### 1. 服务器连接测试
```bash
ssh ubuntu@your-server-ip
```

### 2. 数据库连接测试
```bash
mysql -h your-mysql-host -u treatbot -p
```

### 3. Redis 连接测试
```bash
redis-cli -h your-redis-host -p 6379
```

### 4. COS 访问测试
```bash
curl -I https://your-bucket.cos.ap-shanghai.myqcloud.com/
```

---

## 技术支持

- 腾讯云客服: 4009-100-100
- 技术支持工单: https://console.cloud.tencent.com/workorder
- 社区论坛: https://cloud.tencent.com/developer

**准备好开始部署了吗？运行 `./start.sh production` 开始你的生产部署！**