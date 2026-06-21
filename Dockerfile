# =============================================================================
#  Markdown 编辑器 - Docker 多阶段构建
#  与 fnOS 原生构建并行支持，可用于 CI/CD 或本地 Docker 运行
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 构建前端
# -----------------------------------------------------------------------------
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 复制前端依赖与配置（利用层缓存）
COPY app/ui/frontend/package*.json ./
COPY .npmrc ./

RUN npm install --legacy-peer-deps

COPY app/ui/frontend/ .

# Docker 构建时隐藏「新窗口」按钮（Docker 内无多窗口场景）
ENV VITE_RUN_IN_DOCKER=true

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: 生产运行（使用 slim 以兼容 better-sqlite3 等原生模块）
# -----------------------------------------------------------------------------
FROM node:18-slim

WORKDIR /app

# 复制后端依赖
COPY app/server/package*.json ./
COPY .npmrc ./

RUN npm install --omit=dev

# 复制后端代码
COPY app/server/ ./server/

# 从前一阶段复制构建好的前端
COPY --from=frontend-builder /app/dist ./ui/frontend/dist/

# 创建默认数据目录（可通过 volume 挂载覆盖）
RUN mkdir -p /app/data

ENV PORT=18080
# Docker 模式下通过 TRIM_DATA_ACCESSIBLE_PATHS 指定可访问目录，挂载 volume 时设置
ENV TRIM_DATA_ACCESSIBLE_PATHS=/app/data

EXPOSE 18080

CMD ["node", "server/server.js"]
