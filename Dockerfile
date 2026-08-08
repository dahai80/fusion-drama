# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
    COPY frontend/ ./
    RUN npm run generate

# ── Stage 2: Build backend native modules ────────────────────
FROM node:20-slim AS backend-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./

# Production deps only (native modules compiled here)
RUN npm ci --omit=dev

# ── Stage 3: Production image (lean) ────────────────────────
FROM node:20-slim

# tsx 直接运行 TS 源码;ffmpeg 用 npm 包 ffmpeg-static/ffprobe-static 内置二进制,无需系统安装
RUN npm i -g tsx

WORKDIR /app

# Pre-built node_modules (production only, native modules ready)
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY backend/package.json backend/package-lock.json ./backend/

# Backend source
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Frontend static output
COPY --from=frontend-build /app/frontend/.output/public ./frontend/dist

# Skills
COPY backend/workspace/skills/ ./backend/workspace/skills/

RUN mkdir -p data/static

ENV NODE_ENV=production
ENV PORT=5679

EXPOSE 5679
VOLUME ["/app/data"]

CMD ["tsx", "backend/src/index.ts"]
