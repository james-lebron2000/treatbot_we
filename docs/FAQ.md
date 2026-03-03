# Treatbot 常见问题解答 (FAQ)

## 🔧 部署相关问题

### Q1: 如何快速部署到生产环境？

**A**: 使用 Makefile 一键部署：

```bash
cd ~/treatbot-weapp
make generate-env  # 生成交互式配置
make deploy        # 一键部署
```

或手动部署：
```bash
cd server
cp .env.example .env
# 编辑 .env 配置
./start.sh production
```

---

### Q2: 部署后服务无法启动怎么办？

**A**: 按以下步骤排查：

1. 检查环境变量配置
   ```bash
   cat .env
   ```

2. 检查端口占用
   ```bash
   netstat -tulnp | grep :3000
   ```

3. 查看错误日志
   ```bash
   make logs
   # 或
   pm2 logs treatbot-api
   ```

4. 检查数据库连接
   ```bash
   mysql -h $DB_HOST -u $DB_USER -p
   ```

---

### Q3: 如何配置 HTTPS？

**A**: 使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d api.treatbot.example.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 🗄️ 数据库相关问题

### Q4: 如何备份数据库？

**A**: 使用自动备份脚本：

```bash
# 手动备份
make backup

# 或
./server/scripts/backup.sh
```

**定时备份**（添加到 crontab）：
```bash
# 每天凌晨2点备份
0 2 * * * /opt/treatbot/server/scripts/backup.sh >> /var/log/treatbot-backup.log 2>&1
```

---

### Q5: 数据库连接失败怎么处理？

**A**: 

1. 检查网络连通性
   ```bash
   telnet your-db-host 3306
   ```

2. 检查安全组配置
   - 确保数据库安全组允许应用服务器 IP 访问

3. 检查用户名密码
   ```bash
   mysql -h host -u user -p
   ```

4. 检查数据库是否启动
   ```bash
   systemctl status mysql
   ```

---

## 🔐 安全相关问题

### Q6: 如何保证数据安全？

**A**: 已实施的安全措施：

1. **传输安全**
   - 强制 HTTPS
   - TLS 1.2+

2. **认证安全**
   - JWT 认证
   - Token 过期机制

3. **API 安全**
   - 限流保护
   - 幂等性校验
   - CORS 白名单

4. **数据安全**
   - 敏感信息脱敏
   - 数据库加密
   - 定期备份

**额外建议**：
- 定期更换密钥
- 启用操作审计日志
- 配置防火墙规则

---

### Q7: 如何配置防火墙？

**A**: 使用 UFW（Ubuntu）：

```bash
# 启用防火墙
sudo ufw enable

# 允许必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Application

# 查看状态
sudo ufw status
```

---

## 📱 小程序相关问题

### Q8: 小程序审核被拒怎么办？

**A**: 常见原因及解决方案：

| 拒绝原因 | 解决方案 |
|----------|----------|
| 缺少医疗资质 | 准备医疗机构执业许可证 |
| 隐私政策不完整 | 完善隐私政策页面 |
| 功能不符合类目 | 调整服务类目或功能 |
| 存在敏感内容 | 审核并过滤敏感信息 |

**审核技巧**：
- 提供详细的测试账号和说明
- 确保功能完整可用
- 准备相关资质证明

---

### Q9: 如何配置小程序服务器域名？

**A**: 登录微信公众平台 → 开发 → 开发设置 → 服务器域名：

```
request合法域名: https://api.treatbot.example.com
uploadFile合法域名: https://your-bucket.cos.ap-shanghai.myqcloud.com
downloadFile合法域名: https://your-bucket.cos.ap-shanghai.myqcloud.com
```

---

## 🔍 OCR 相关问题

### Q10: OCR 识别失败怎么办？

**A**: 

1. 检查 OCR 密钥配置
   ```bash
   echo $OCR_SECRET_ID
   echo $OCR_SECRET_KEY
   ```

2. 检查图片格式和大小
   - 支持格式：JPG、PNG
   - 最大大小：10MB

3. 检查图片清晰度
   - 确保文字清晰可见
   - 避免过度曝光或模糊

4. 查看 OCR 服务状态
   - 登录腾讯云控制台查看

---

## 📊 性能相关问题

### Q11: 如何优化 API 响应速度？

**A**: 

1. **启用缓存**
   ```javascript
   // Redis 缓存热点数据
   const cacheKey = `user:stats:${userId}`;
   let stats = await redis.get(cacheKey);
   ```

2. **数据库优化**
   - 添加索引
   - 优化慢查询
   - 使用连接池

3. **启用压缩**
   ```javascript
   app.use(compression());
   ```

4. **CDN 加速**
   - 静态资源使用 CDN
   - 图片使用 COS + CDN

---

### Q12: 如何监控应用性能？

**A**: 

1. 查看 PM2 监控
   ```bash
   pm2 monit
   ```

2. 查看详细健康检查
   ```bash
   curl http://localhost:3000/health/detailed
   ```

3. 配置 Prometheus + Grafana
   - 查看 docs/monitoring/prometheus.yml

---

## 💰 成本相关问题

### Q13: 如何降低运营成本？

**A**: 

| 优化项 | 建议 |
|--------|------|
| 服务器 | 使用轻量应用服务器 |
| 数据库 | 使用云数据库基础版 |
| 存储 | 启用生命周期管理，自动转低频 |
| OCR | 购买预付费资源包 |
| 带宽 | 使用 CDN 减少源站流量 |

**预计节省**：30-50%

---

### Q14: 月度成本大概多少？

**A**: MVP 阶段参考成本：

| 服务 | 费用 |
|------|------|
| 云服务器 (2台 × 4C8G) | ¥1,600 |
| MySQL (2C4G) | ¥800 |
| Redis (1GB) | ¥250 |
| COS + CDN | ¥100 |
| OCR (1万次) | ¥800 |
| **总计** | **¥3,750/月** |

---

## 🐛 调试相关问题

### Q15: 如何查看日志？

**A**: 

```bash
# 应用日志
make logs

# 或
pm2 logs treatbot-api

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 系统日志
sudo journalctl -u treatbot-api -f
```

---

### Q16: 如何进行本地调试？

**A**: 

1. 启动开发环境
   ```bash
   make dev
   ```

2. 使用微信开发者工具
   - 配置不校验合法域名
   - 开启调试模式

3. 查看详细错误信息
   ```bash
   NODE_ENV=development npm run dev
   ```

---

## 🔄 更新维护

### Q17: 如何更新到最新版本？

**A**: 

```bash
# 拉取最新代码
git pull origin main

# 安装依赖
make install

# 执行数据库迁移
make db-migrate

# 重启服务
make deploy
```

---

### Q18: 如何回滚到上一版本？

**A**: 

```bash
# Docker 方式
docker-compose down
docker pull your-image:previous-tag
docker-compose up -d

# PM2 方式
make rollback
# 或
git reset --hard HEAD~1
make deploy
```

---

## 📝 其他问题

### Q19: 如何获取技术支持？

**A**: 

1. 查看文档
   - docs/QUICKSTART.md
   - docs/production-plan.md
   - docs/api-spec.md

2. 提交 GitHub Issue

3. 联系技术支持邮箱

---

### Q20: 项目是否开源？

**A**: 是的，项目采用 MIT 许可证开源。您可以：

- 自由使用和修改
- 用于商业用途
- 但需要保留版权声明

---

**还有其他问题？** 请查看详细文档或提交 Issue。

**祝使用愉快！** 🎉
