# Treatbot 项目完整索引

> 临床试验智能匹配平台 - 完整解决方案

---

## 🚀 5分钟快速开始

### 全新服务器
```bash
# 1. 安装环境（自动）
sudo ./server/scripts/install-env.sh

# 2. 克隆并设置
git clone <repo-url> && cd treatbot
./setup.sh

# 3. 一键部署
make deploy
```

### 已有环境
```bash
cd treatbot
make install && make deploy
```

### Docker 方式
```bash
docker-compose up -d
```

---

## 📚 文档导航

### 新手必读
| 文档 | 阅读时间 | 说明 |
|------|----------|------|
| [README.md](README.md) | 5分钟 | 项目总览 |
| [CHEATSHEET.md](CHEATSHEET.md) | 2分钟 | 快速参考 |
| [QUICKSTART.md](docs/QUICKSTART.md) | 30分钟 | 详细部署指南 |
| [FAQ.md](docs/FAQ.md) | 10分钟 | 常见问题 |

### 开发文档
| 文档 | 阅读时间 | 说明 |
|------|----------|------|
| [api-spec.md](docs/api-spec.md) | 20分钟 | API 接口规范 |
| [production-plan.md](docs/production-plan.md) | 30分钟 | 架构设计 |
| [performance-optimization.md](docs/performance-optimization.md) | 15分钟 | 性能优化 |

### 运维文档
| 文档 | 阅读时间 | 说明 |
|------|----------|------|
| [deployment-checklist.md](docs/deployment-checklist.md) | 20分钟 | 部署检查清单 |
| [security-checklist.md](docs/security-checklist.md) | 15分钟 | 安全加固 |
| [tencent-cloud-setup.md](docs/tencent-cloud-setup.md) | 10分钟 | 云服务购买 |

### 项目文档
| 文档 | 说明 |
|------|------|
| [FINAL_DELIVERY_REPORT.md](FINAL_DELIVERY_REPORT.md) | 最终交付报告 |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | 项目总结 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则 |
| [LICENSE](LICENSE) | MIT 许可证 |

---

## 📂 项目结构速查

```
treatbot/
├── 📱 treatbot-weapp/          # 微信小程序
│   ├── pages/                   # 13个页面
│   │   ├── guide/              # 引导页
│   │   ├── index/              # 首页
│   │   ├── upload/             # 上传页
│   │   ├── records/            # 病历管理
│   │   ├── matches/            # 试验匹配
│   │   ├── search/             # 搜索页
│   │   └── profile/            # 用户中心
│   └── ...
│
├── 🔧 server/                   # Node.js 后端
│   ├── app.js                  # 入口
│   ├── controllers/            # 控制器
│   ├── middleware/             # 中间件
│   ├── models/                 # 数据模型
│   ├── services/               # 业务服务
│   ├── routes/                 # 路由
│   ├── scripts/                # 运维脚本
│   ├── public/admin/           # 管理后台
│   └── tests/                  # 测试
│
├── 📖 docs/                     # 文档中心
│   ├── QUICKSTART.md
│   ├── api-spec.md
│   ├── FAQ.md
│   └── ...
│
├── 🛠️ scripts/                  # 项目脚本
│   ├── stats.js               # 统计
│   ├── pre-deploy-check.sh    # 部署检查
│   └── release.sh             # 版本发布
│
└── 📋 项目配置
    ├── Makefile               # 项目管理
    ├── docker-compose.yml     # Docker 编排
    ├── setup.sh              # 一键设置
    ├── verify.sh             # 项目验证
    └── ...
```

---

## 🎯 功能模块

### 患者端（小程序）
- ✅ 引导页 - 新用户引导
- ✅ 首页 - 数据统计 + 搜索
- ✅ 上传页 - 病历上传 + AI 解析
- ✅ 病历管理 - 查看/删除
- ✅ 试验匹配 - 智能推荐
- ✅ 搜索页 - 关键词 + 筛选
- ✅ 用户中心 - 个人信息/统计

### 后端 API
- ✅ 认证 - 微信登录 + JWT
- ✅ 病历 - 上传/解析/管理
- ✅ 匹配 - 智能推荐算法
- ✅ 搜索 - 多维度筛选
- ✅ 报名 - 状态跟踪
- ✅ 管理 - 仪表盘/用户/报名

### 运维工具
- ✅ Makefile - 项目管理
- ✅ Docker - 容器化部署
- ✅ PM2 - 进程管理
- ✅ CI/CD - 自动部署
- ✅ 监控 - Prometheus + 告警
- ✅ 备份 - 自动数据库备份

---

## 💻 常用命令

### 开发
```bash
make dev          # 启动开发服务器
make test         # 运行测试
make lint         # 代码检查
```

### 部署
```bash
make deploy       # 部署生产环境
make status       # 查看服务状态
make logs         # 查看日志
make rollback     # 回滚版本
```

### 数据库
```bash
make db-migrate   # 数据库迁移
make db-seed      # 导入种子数据
make backup       # 备份数据库
```

### 维护
```bash
make cleanup      # 清理日志
./verify.sh       # 验证项目
./setup.sh        # 一键设置
```

---

## 🔗 重要链接

### 本地访问
- **管理后台**: http://localhost:3000/admin
- **健康检查**: http://localhost:3000/health
- **API 基础**: http://localhost:3000/api

### 文档
- **API 文档 (Postman)**: [Treatbot-API.postman_collection.json](docs/Treatbot-API.postman_collection.json)
- **API 文档 (Swagger)**: [openapi.json](docs/openapi.json)

### 外部资源
- [微信小程序文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [Node.js 文档](https://nodejs.org/docs/)
- [Express 文档](https://expressjs.com/)

---

## 📊 项目统计

| 类别 | 数量 |
|------|------|
| 总文件数 | 168 |
| 代码文件 | 49 |
| 文档 | 23 |
| 脚本 | 10 |
| API 接口 | 25+ |
| 小程序页面 | 13 |

---

## 💰 成本估算

### MVP 阶段（月度）
- 云服务器: ¥1,600
- 数据库: ¥800
- Redis: ¥250
- 存储: ¥100
- OCR: ¥800
- **总计: ¥3,750/月**

---

## 🤝 贡献

欢迎贡献代码！请阅读：
- [CONTRIBUTING.md](CONTRIBUTING.md) - 贡献指南
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - 行为准则

---

## 📞 支持

- 📧 Email: support@treatbot.example.com
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

---

## 📜 许可证

[MIT License](LICENSE)

---

**版本**: v1.1.0  
**状态**: ✅ 生产就绪  
**最后更新**: 2026-02-25

---

**祝使用愉快！** 🚀
