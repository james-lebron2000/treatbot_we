# Treatbot 安全加固检查清单

## 一、服务器安全

### 1. 系统安全
- [ ] 更新系统补丁
  ```bash
  sudo apt-get update && sudo apt-get upgrade -y
  ```

- [ ] 配置自动安全更新
  ```bash
  sudo apt-get install unattended-upgrades
  sudo dpkg-reconfigure unattended-upgrades
  ```

- [ ] 配置防火墙（UFW）
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp    # SSH
  sudo ufw allow 80/tcp    # HTTP
  sudo ufw allow 443/tcp   # HTTPS
  sudo ufw enable
  ```

### 2. SSH 安全
- [ ] 禁用 root 登录
  ```bash
  # 编辑 /etc/ssh/sshd_config
  PermitRootLogin no
  ```

- [ ] 禁用密码登录（使用密钥）
  ```bash
  PasswordAuthentication no
  PubkeyAuthentication yes
  ```

- [ ] 修改默认端口
  ```bash
  Port 2222  # 或其他非标准端口
  ```

- [ ] 限制登录用户
  ```bash
  AllowUsers ubuntu deploy
  ```

- [ ] 重启 SSH 服务
  ```bash
  sudo systemctl restart sshd
  ```

### 3.  fail2ban 防暴力破解
```bash
sudo apt-get install fail2ban

# 配置 /etc/fail2ban/jail.local
[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
```

---

## 二、应用安全

### 1. 环境变量安全
- [ ] 生产环境使用强密码
  ```bash
  # 生成随机 JWT Secret
  openssl rand -base64 32
  ```

- [ ] 使用 .env 文件并限制权限
  ```bash
  chmod 600 .env
  ```

- [ ] 不在代码中硬编码敏感信息
- [ ] 定期轮换密钥

### 2. 数据库安全
- [ ] 使用强密码
- [ ] 限制访问 IP（安全组）
- [ ] 启用 SSL 连接
- [ ] 定期备份
- [ ] 敏感字段加密存储

### 3. API 安全
- [ ] 启用 HTTPS（强制）
- [ ] 配置 CORS 白名单
- [ ] 实现限流保护
- [ ] 实现幂等性校验
- [ ] 验证所有输入参数
- [ ] 统一错误处理（不暴露敏感信息）

---

## 三、网络安全

### 1. HTTPS 配置
- [ ] 使用有效 SSL 证书
- [ ] 强制 HTTPS 重定向
- [ ] 配置 HSTS
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ```

- [ ] 使用现代 TLS 版本
  ```nginx
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
  ```

### 2. DDoS 防护
- [ ] 配置 rate limiting
- [ ] 使用云厂商 DDoS 防护（腾讯云/阿里云）
- [ ] 配置连接数限制

---

## 四、数据安全

### 1. 数据加密
- [ ] 传输加密（HTTPS/TLS）
- [ ] 存储加密（数据库字段）
- [ ] 备份加密

### 2. 数据脱敏
- [ ] 日志中脱敏敏感信息
- [ ] API 响应中脱敏
- [ ] 错误信息中不包含敏感数据

### 3. 数据访问控制
- [ ] 最小权限原则
- [ ] 用户只能访问自己的数据
- [ ] 审计日志记录

---

## 五、监控与告警

### 1. 日志监控
- [ ] 配置集中式日志收集
- [ ] 设置异常日志告警
- [ ] 定期审计日志

### 2. 安全告警
- [ ] 登录失败告警
- [ ] 异常访问告警
- [ ] 数据库慢查询告警
- [ ] 磁盘空间告警

### 3. 入侵检测
- [ ] 配置 IDS/IPS（可选）
- [ ] 定期安全扫描
- [ ] 漏洞扫描

---

## 六、合规性

### 1. 数据保护
- [ ] 隐私政策页面
- [ ] 用户同意机制
- [ ] 数据删除功能
- [ ] 数据导出功能

### 2. 医疗数据合规
- [ ] 数据分类分级
- [ ] 访问审计日志
- [ ] 数据保留策略
- [ ] 等保测评（如需）

---

## 七、应急响应

### 1. 应急预案
- [ ] 数据泄露响应流程
- [ ] 服务中断恢复流程
- [ ] 联系人清单

### 2. 备份恢复
- [ ] 定期备份验证
- [ ] 灾难恢复演练
- [ ] RTO/RPO 定义

---

## 八、安全工具推荐

### 扫描工具
- [Nmap](https://nmap.org/) - 端口扫描
- [OWASP ZAP](https://www.zaproxy.org/) - Web 漏洞扫描
- [SQLMap](https://sqlmap.org/) - SQL 注入检测

### 监控工具
- [Fail2ban](https://www.fail2ban.org/) - 暴力破解防护
- [OSSEC](https://www.ossec.net/) - 入侵检测
- [Prometheus](https://prometheus.io/) + [Grafana](https://grafana.com/) - 监控告警

---

## 九、安全检查脚本

### 运行安全检查
```bash
cd ~/treatbot-weapp/server
./scripts/security-check.sh
```

### 检查内容
- [ ] 系统更新状态
- [ ] 开放端口检查
- [ ] 弱密码检查
- [ ] 文件权限检查
- [ ] 日志审计检查

---

## 十、定期维护任务

### 每日
- [ ] 检查安全告警
- [ ] 审查异常日志
- [ ] 检查系统资源

### 每周
- [ ] 更新安全补丁
- [ ] 审查访问日志
- [ ] 检查备份状态

### 每月
- [ ] 安全漏洞扫描
- [ ] 密码轮换
- [ ] 安全策略审查
- [ ] 灾备演练

### 每季度
- [ ] 渗透测试
- [ ] 安全培训
- [ ] 应急响应演练
- [ ] 合规性审查

---

**安全是一个持续的过程，不是一次性的任务！**

**建议至少每季度进行一次全面的安全审查。**
