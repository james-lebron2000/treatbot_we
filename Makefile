# Treatbot 项目管理 Makefile
# 使用方法: make [target]

.PHONY: help install dev test lint build deploy clean

# 默认显示帮助
help:
	@echo "Treatbot 项目管理命令"
	@echo ""
	@echo "开发命令:"
	@echo "  make install    安装依赖"
	@echo "  make dev        启动开发环境"
	@echo "  make test       运行测试"
	@echo "  make lint       代码检查"
	@echo ""
	@echo "部署命令:"
	@echo "  make build      构建 Docker 镜像"
	@echo "  make deploy     部署到生产环境"
	@echo "  make rollback   回滚到上一版本"
	@echo ""
	@echo "运维命令:"
	@echo "  make backup     备份数据库"
	@echo "  make logs       查看日志"
	@echo "  make status     查看服务状态"
	@echo "  make clean      清理日志和缓存"
	@echo ""
	@echo "数据库命令:"
	@echo "  make db-migrate 数据库迁移"
	@echo "  make db-seed    导入种子数据"
	@echo "  make db-reset   重置数据库"

# 开发环境
install:
	cd server && npm install

dev:
	cd server && npm run dev

test:
	cd server && npm test

lint:
	cd server && npm run lint

lint-fix:
	cd server && npm run lint:fix

# Docker 操作
build:
	cd server && docker build -t treatbot-api:latest .

build-no-cache:
	cd server && docker build --no-cache -t treatbot-api:latest .

up:
	cd server && docker-compose up -d

down:
	cd server && docker-compose down

restart:
	cd server && docker-compose restart

logs:
	cd server && docker-compose logs -f api

logs-all:
	cd server && docker-compose logs -f

# PM2 操作
pm2-start:
	cd server && pm2 start ecosystem.config.js --env production

pm2-stop:
	cd server && pm2 stop ecosystem.config.js

pm2-restart:
	cd server && pm2 restart ecosystem.config.js

pm2-logs:
	cd server && pm2 logs treatbot-api

pm2-status:
	cd server && pm2 status

pm2-monitor:
	cd server && pm2 monit

# 部署
deploy:
	cd server && ./deploy.sh production

deploy-docker:
	cd server && docker-compose pull && docker-compose up -d

rollback:
	cd server && ./scripts/rollback.sh

# 数据库
db-migrate:
	cd server && npm run db:migrate

db-seed:
	cd server && npm run db:seed

db-reset:
	cd server && npm run db:seed:clean

# 备份和清理
backup:
	cd server && ./scripts/backup.sh

cleanup:
	cd server && ./scripts/cleanup-logs.sh

# 监控和状态
status:
	cd server && docker-compose ps || pm2 status

health:
	@curl -s http://localhost:3000/health | jq .

# 安全检查
security-check:
	@echo "运行安全检查..."
	@cd server && ./scripts/security-check.sh

# 生成环境配置
generate-env:
	@cd server && node scripts/generate-env.js

# 清理
clean:
	@echo "清理临时文件..."
	@find server/logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
	@find server/logs -name "*.gz" -mtime +30 -delete 2>/dev/null || true
	@docker system prune -f 2>/dev/null || true
	@echo "清理完成"

# 一键开发环境
dev-setup: install
	@echo "开发环境准备完成"
	@echo "运行 'make dev' 启动开发服务器"

# 一键生产部署
prod-setup: install build up
	@echo "生产环境部署完成"
	@echo "运行 'make status' 查看服务状态"
