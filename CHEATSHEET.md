# Treatbot 快速参考卡片

## 🚀 常用命令

### 开发
```bash
make dev              # 启动开发服务器
make test             # 运行测试
make lint             # 代码检查
```

### 部署
```bash
make deploy           # 部署生产环境
make status           # 查看服务状态
make logs             # 查看日志
```

### 数据库
```bash
make db-migrate       # 数据库迁移
make db-seed          # 导入种子数据
make backup           # 备份数据库
```

## 🔗 常用链接

- **本地开发**: http://localhost:3000
- **管理后台**: http://localhost:3000/admin
- **健康检查**: http://localhost:3000/health
- **API 文档**: docs/openapi.json

## 📁 重要文件

| 文件 | 说明 |
|------|------|
| `.env` | 环境变量配置 |
| `Makefile` | 项目管理命令 |
| `docker-compose.yml` | Docker 编排 |
| `ecosystem.config.js` | PM2 配置 |

## 🐛 故障排查

### 服务无法启动
```bash
./scripts/pre-deploy-check.sh  # 检查环境
make logs                      # 查看日志
```

### 数据库连接失败
```bash
# 检查配置
cat server/.env | grep DB_

# 测试连接
mysql -h $DB_HOST -u $DB_USER -p
```

### 端口被占用
```bash
lsof -i :3000
kill -9 <PID>
```

## 📞 支持

- 📖 文档: docs/README.md
- ❓ FAQ: docs/FAQ.md
- 🐛 Issues: GitHub Issues

---

**版本**: v1.1.0 | **状态**: 生产就绪
