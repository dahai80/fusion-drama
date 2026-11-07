---
doc_id: fusion-drama/get-started
product: fusion-drama
class: app
entry: guided-ui
doc_type: get-started
title: { zh: "Fusion Drama 快速上手", en: "Fusion Drama get started" }
audience: engineer
status: draft
version: 1.0.0
updated: 2026-11-07
owner: @dahai
source_of_truth:
  - README.md
  - backend/package.json
  - frontend/package.json
---

# 快速上手 / Get Started

## 前置条件 / Prerequisites

- Node.js 20+，npm 9+
- 零安装数据库：内置 SQLite（`data/fusion.sqlite3`，WAL），无需数据库服务
- 无需装 FFmpeg：`ffmpeg-static` / `ffprobe-static` npm 包自带二进制
- AI 能力需先在 Web UI「设置」里配置模型服务（文本/图像/视频至少各一个），或使用自托管 fusion-mlx（Apple Silicon，文本/图像/视频全离线）

## 安装 / Install

```bash
git clone https://github.com/dahai80/fusion-drama.git
cd fusion-drama
cd backend && npm install
cd ../frontend && npm install
```

## 启动（开发模式）/ Run (development)

```bash
# 终端 1：后端（:5679）
cd backend && npm run dev

# 终端 2：前端（:3013）
cd frontend && npm run dev
```

浏览器打开 `http://localhost:3013`；前端自动代理 `/api` 与 `/static` 到后端。

## 启动（单服务模式）/ Run (single service)

```bash
cd frontend && npm run generate     # 输出 .output/public
cp -r .output/public dist           # 后端读取 frontend/dist
cd ../backend && npm start          # http://localhost:5679
```

## 首次使用 / First use

1. 打开「设置」页
2. 在「Fusion Quick Setup」粘贴 Fusion API key（bench.dpdns.org 获取），一键写入文本/图像/视频三个推荐配置；或在「Manual Templates」逐个添加并测连通性
3. 配置完成后页面顶部引导横幅消失，即可建项目开工

首次建项目：选画幅（16:9 / 9:16，创建后固定）与视觉风格（注入每个图像 prompt）。

## 验证 / Verify

- 后端存活：`curl http://localhost:5679/api/v1/health`（或浏览器打开 `:3013` 看到首页）
- 非本机部署：首启生成 64-hex token，仅打印前缀到日志，存于 `app_settings.server_api_token`；前端在 设置 → General 填入

## 下一步 / Next steps

- 全流程走读（小说导入 → 剧本 → 资产 → 分镜 → 视频 → 拼接导出）：README「Visual Walkthrough」章节
- 桌面版打包：`cd desktop && npm run dist`（macOS dmg / Windows NSIS）
- 故障排查：[troubleshooting.md](troubleshooting.md)
