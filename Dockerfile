# 多阶段构建 Dockerfile for Huobao Drama

# ==================== 阶段1: 构建前端 ====================
FROM node:20-alpine AS frontend-builder

# 配置 npm 镜像源（国内加速）
RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app/web

# 复制前端依赖文件
COPY web/package*.json ./

# 安装前端依赖（包括 devDependencies，构建需要）
RUN npm install

# 复制前端源码
COPY web/ ./

# 构建前端
RUN npm run build

# ==================== 阶段2: 构建后端 ====================
FROM golang:1.23-alpine AS backend-builder

# 配置 Go 代理（国内镜像加速）
ENV GOPROXY=https://goproxy.cn,direct \ 
    GO111MODULE=on

# 安装必要的构建工具（纯 Go 编译，无需 CGO）
RUN apk add --no-cache \
    git \
    ca-certificates \
    tzdata

WORKDIR /app

# 复制 Go 模块文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制后端源码
COPY . .

# 复制前端构建产物
COPY --from=frontend-builder /app/web/dist ./web/dist

# 构建后端可执行文件（纯 Go 编译，使用 modernc.org/sqlite）
RUN CGO_ENABLED=0 go build -ldflags="-w -s" -o huobao-drama .

# ==================== 阶段3: 运行时镜像 ====================
FROM alpine:latest

# 安装运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    ffmpeg \
    wget \
    && rm -rf /var/cache/apk/*

# 设置时区
ENV TZ=Asia/Shanghai

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

# 创建数据目录（root 用户运行，无需权限设置）
RUN mkdir -p /app/data/storage

# 暴露端口
EXPOSE 5678

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5678/health || exit 1

# 启动应用
CMD ["./huobao-drama"]
