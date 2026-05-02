# syntax=docker/dockerfile:1.6
#
# 多阶段构建：
#   1) deps  — 安装 npm 生产依赖（需要 make/g++/python3 编译原生模块）
#   2) runtime — 运行时镜像，只包含 node + 运行期需要的 python3/markitdown
#
# 避免把 make/g++ 留在最终镜像里（减小体积 + 缩小攻击面）。

# =========== Stage 1: 安装依赖 ===========
FROM node:18-alpine AS deps
WORKDIR /app

# 安装原生模块编译工具链（仅在 deps 阶段使用）
RUN apk add --no-cache python3 py3-pip make g++

# 复制 package 清单并安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev


# =========== Stage 2: 运行时镜像 ===========
FROM node:18-alpine AS runtime
WORKDIR /app

# 运行时需要 python3 + markitdown[pdf]（文本 PDF）+ poppler-utils/pdftoppm（扫描 PDF 拆页）
RUN apk add --no-cache python3 py3-pip poppler-utils \
 && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]' \
 && rm -rf /root/.cache /var/cache/apk/*

# 从 deps 阶段拷贝已编译好的 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 以非 root 运行（node:alpine 自带 node 用户 uid=1000）
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "app.js"]
