# syntax=docker/dockerfile:1.6
#
# 多阶段构建：
#   1) deps  — 安装 npm 生产依赖（需要 make/g++/python3 编译原生模块）
#   2) runtime — 运行时镜像，只包含 node + 运行期需要的 python3/markitdown
#
# 避免把 make/g++ 留在最终镜像里（减小体积 + 缩小攻击面）。
#
# 基础镜像：node:18-bookworm-slim（Debian glibc）
# 切换原因：markitdown 0.1.0+ 强依赖 magika ~=0.6.1 → onnxruntime；onnxruntime
# 不发布 musllinux wheel（PEP 656），Alpine/musl 上 pip 只能源码构建却没有上游支持，
# 反复回溯所有 markitdown 历史版本最终 ResolutionImpossible（run 25249824970 卡 17min）。
# 切到 Debian glibc 后 manylinux 轮子直接可用，install < 60s，无需 cargo/rust 工具链。

# =========== Stage 1: 安装依赖 ===========
FROM node:18-bookworm-slim AS deps
WORKDIR /app

# 安装原生 npm 模块编译工具链（仅 deps 阶段，最终镜像不会保留）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

# 复制 package 清单并安装生产依赖
COPY server/package*.json ./
RUN npm ci --omit=dev


# =========== Stage 2: 运行时镜像 ===========
FROM node:18-bookworm-slim AS runtime
WORKDIR /app

# 运行时需要 python3 + markitdown[pdf]（文本 PDF）+ poppler-utils/pdftoppm（扫描 PDF 拆页）
# markitdown 锁 0.1.5：当前最新稳定版（2026-02-20），有 [pdf] extras（pdfminer-six + pdfplumber）。
# 不锁版本 → 服务器无缓存时 pip 会回溯所有历史版本 17min 后 ResolutionImpossible。
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip poppler-utils \
 && pip3 install --no-cache-dir --break-system-packages 'markitdown[pdf]==0.1.5' \
 && apt-get purge -y python3-pip \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /root/.cache

# 从 deps 阶段拷贝已编译好的 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制应用代码
COPY server/ ./
COPY shared /shared

# 创建日志目录
RUN mkdir -p logs

# 以非 root 运行（node:bookworm-slim 自带 node 用户 uid=1000）
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "app.js"]
