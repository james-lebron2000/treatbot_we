# 使用 Node.js 18 官方镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装系统依赖（如需编译原生模块）
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令
CMD ["node", "app.js"]
