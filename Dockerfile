# 多阶段构建 Dockerfile for Huobao Drama

# ==================== 阶段1: 构建前端 ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

# 复制前端依赖文件
COPY web/package*.json ./

# 安装前端依赖（包括 devDependencies，构建需要）
RUN npm ci

# 复制前端源码
COPY web/ ./

# 构建前端
RUN npm run build

# ==================== 阶段2: 构建后端 ====================
FROM golang:1.23-alpine AS backend-builder

# 安装必要的构建工具（包括 gcc、musl-dev 和 sqlite-dev 用于 CGO）
RUN apk add --no-cache \
    git \
    ca-certificates \
    tzdata \
    gcc \
    musl-dev \
    sqlite-dev

WORKDIR /app

# 复制 Go 模块文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制后端源码
COPY . .

# 复制前端构建产物
COPY --from=frontend-builder /app/web/dist ./web/dist

# 构建后端可执行文件（启用 CGO 以支持 go-sqlite3）
RUN CGO_ENABLED=1 go build -ldflags="-w -s" -o huobao-drama .

# ==================== 阶段3: 运行时镜像 ====================
FROM alpine:latest

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    ffmpeg \
    sqlite-libs \
    && rm -rf /var/cache/apk/*

# 设置时区
ENV TZ=Asia/Shanghai

# 创建非 root 用户
RUN addgroup -g 1000 app && \
    adduser -D -u 1000 -G app app

WORKDIR /app

# 从构建阶段复制可执行文件
COPY --from=backend-builder /app/huobao-drama .

# 复制前端构建产物
COPY --from=frontend-builder /app/web/dist ./web/dist

# 复制配置文件模板并创建默认配置
COPY configs/config.example.yaml ./configs/
RUN cp ./configs/config.example.yaml ./configs/config.yaml

# 复制数据库迁移文件
COPY migrations ./migrations/

# 创建数据目录
RUN mkdir -p /app/data/storage && \
    chown -R app:app /app

# 切换到非 root 用户
USER app

# 暴露端口
EXPOSE 5678

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5678/health || exit 1

# 启动应用
CMD ["./huobao-drama"]
