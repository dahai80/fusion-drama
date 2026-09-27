# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fuse 短剧（Fusion Drama）— AI 短剧/漫剧一站式制作工具。全 TypeScript 栈：小说 → 剧本改写 → 资产提取 → 生图 → 分镜拆解 → 生视频 → FFmpeg 拼接导出。支持 Electron 桌面版（macOS dmg / Windows NSIS）、Docker 服务器部署。多语言：中文/英文/日文/韩文。

## Structure

```
backend/   — Hono + Drizzle ORM (better-sqlite3) + Mastra (AI agents)
backend/workspace/ — Agent 工作目录（Mastra Workspace jail 根）
backend/workspace/skills/ — Agent SKILL.md definitions（设置页可在线编辑）
backend/workspace/prompts/ — Agent 提示词文件，每 agent 4 语言（.md/.en.md/.ja.md/.ko.md）
backend/tests/ — node:test 结构测试（断言源码文本模式）+ 1 个 adapter 单测
frontend/  — Nuxt 3 + Vue 3 + TypeScript，ssr:false（纯 CSS，无 UI 框架；vue-i18n 4 语言）
desktop/   — Electron 桌面版：主进程 + esbuild 打包脚本 + electron-builder 配置
docker/    — 容器 entrypoint（workspace 模板 copy-once 到数据卷）
data/      — SQLite 数据库（fusion.sqlite3）+ 生成的静态文件（static/）
configs/   — 遗留死配置，代码零引用
```

## Commands

### Backend (`backend/`)
- `npm run dev` — tsx watch 开发服务（端口 5679）
- `npm start` — tsx 生产启动
- `npm run typecheck` — TypeScript 类型检查
- `npm run backfill-artwork` — 存量图片/视频补缩略图与海报帧
- **测试**（无 npm script，用 node 内置 test runner + tsx loader）：
  - 全量：`node --import tsx --test`（自动发现 `tests/` 下 `.mjs`/`.ts`）
  - 单文件：`node --import tsx --test tests/<file>`
  - ⚠️ 套件当前红：约 13 个结构测试过期（如 `remove-minimax-*` 写于 MiniMax 移除时，后来 MiniMax H3 视频适配器又加回，测试未同步）。结构测试断言源码文本模式——重构源码破坏断言时改测试，别改源码。

### Frontend (`frontend/`)
- `npm run dev` — Vite 开发服务（端口 3013，代理 /api 与 /static 到 5679）
- `npm run generate` — 产出含 index.html 的静态站点（`.output/public`；`nuxt build` 不产 index.html，不能用于静态托管）

### Desktop (`desktop/`，根目录 `npm run dist` 串联全流程)
- `npm run dev` — 打包后端 bundle + Electron 窗口运行
- `npm run build:backend` — esbuild 打包 backend/src → build/backend.mjs（ESM；externals: sharp/better-sqlite3/ffmpeg-static/ffprobe-static）
- `npm run build:main` — 打包主进程 → dist/main.js
- `npm run rebuild:native` — better-sqlite3 按 Electron ABI 重编（原生模块 ABI 变化后必须执行；postinstall 已自动做）
- `npm run dist` — prepare-resources + electron-builder 出 arm64/x64 dmg → release/
- `npm run dist:win` — 交叉打包 Windows NSIS 安装器（win-x64）；win 版 ffmpeg.exe 缓存在 build/win-bin/（缺失时脚本提示下载地址）
- `npm run feed` / `npm run publish` — 生成/发布更新清单（GitHub Releases）

### Docker（仓库根目录）
- `docker compose up -d` — 应用 + Watchtower（自动拉新镜像重建容器，支撑应用内一键更新）
- 数据持久化在命名卷 `fusion-data`（SQLite + 生成文件 + 可编辑 workspace）；`cp .env.example .env` 设 `WATCHTOWER_TOKEN`
- 镜像构建：多阶段 Dockerfile（node:20），构建参数 `FUSION_VERSION` 注入版本号

### 根目录
- `npm run dev:backend` / `dev:frontend` / `dev:desktop` / `build:frontend` / `dist`

## Architecture

### Backend
- **HTTP**: Hono（入口 `src/index.ts`），路由挂 `/api/v1`（dramas/episodes/storyboards/scenes/characters/props/tasks/upload/ai-configs/ai-providers/style-presets/prompts/agent/merge/skills/props/settings/storage/server-update）；`/static` 服务 DATA_ROOT 且标记 immutable 长缓存（uuid 命名内容不变）；生产托管前端静态目录；`/api/v1/health` 返回 `FUSION_VERSION`
- **Database**: SQLite（better-sqlite3 + WAL），`SQLITE_PATH` 覆盖库文件位置；DDL 在 `src/db/sqlite-schema.ts`，启动时幂等重放；Drizzle 表定义 `src/db/schema.ts`（sqlite-core）
- **路径锚点**: `src/utils/paths.ts` 统一解析 DATA_ROOT/STORAGE_ROOT；桌面版由 Electron 主进程注入 env（`FUSION_DATA_DIR`/`SQLITE_PATH`/`WORKSPACE_PATH`/`FRONTEND_DIST`/`FFMPEG_BIN`/`FFPROBE_BIN`），dev 走仓库相对路径默认值
- **AI Agents**: Mastra，4 个静态 agent（script_rewriter / extractor / storyboard_breaker / prompt_generator）注册于 `agents/index.ts` 的 agentRegistry；instructions 按请求动态拼接 = `workspace/prompts/<type>.md`（按目标语言选 .md/.en/.ja/.ko）+ skills + 语言指令块（非中文时强制覆盖旧模板的语言约束）；模型按请求解析（RequestContext 可覆盖 model/config_id）
  - **fetch 补丁链**（agents/index.ts）：① 关思考（`AI_DISABLE_THINKING` 总开关、`AI_THINKING_OFF_PATCH` JSON 覆盖注入参数；官方 OpenAI/Gemini host 跳过）② 温度注入 ③ undici dispatcher 解除 300s headers 超时（本地大模型长上下文首 token 可超 300s）。generation.ts 的生成/轮询请求同样挂 undici 零超时 dispatcher
- **媒体生成**: `services/generation.ts` 统一任务生命周期（sys_task 表）
  - **全局串行队列**（`enqueueTask`/`taskChain`）：所有图片/视频任务严格按提交顺序逐一执行——本地模型（fusion-mlx）无法并行（显存挤占），云端并发易触发限流。**不要改成并行**
  - 适配器注册表 `services/adapters/registry.ts`：图片 openai/gemini/volcengine；视频 volcengine/minimax/aliyun/fusion（官方清单在 `services/ai.ts` 的 officialProviders）
  - **fusion** = fusion-mlx 本地视频（`adapters/fusion-video.ts`）：同步 `/v1/videos/generate` 直接返回 base64 data URI（无轮询），`downloadFile` 解码落盘后 `result_url` 存 localPath（**勿存 data URI**——37MB base64 会污染 DB/API）；fusion 中文 prompt 先经文本模型译英文（Gemma T5 编码器不识 CJK）
  - **模型感知适配**（`isLegacyLtx`）：LTX-2.5（`ltx-2.5`）短边 1088、temporal upsampler ×2（输出 = 16T−7 帧反推）、高分辨率(短边≥1000)限 5s，但 5s 产出 LOW_MOTION（后半段冻结，diff≈3.9、55% 帧冻结）；LTX-Video legacy 2B（`Lightricks--LTX-Video`，无 upsampler）短边 768、`num_frames=8k+1` 直算、限 2s（49帧）、`cfg_scale=1.0`+`num_inference_steps=30`（rectified-flow 蒸馏模型官方推荐 cfg=1.0；fusion 默认 3.0 致逐帧亮度振荡闪烁，luma_std 12.5→4.8）；#951 修复 cf765fa6 后 49帧 denoise+VAE 全程跑完 server 存活。两者不可同时驻留 fusion（video mutex，issue #950）——切换模型前先 `POST /v1/models/{id}/unload`
  - 中文图片提示词先经文本模型翻译成英文再生图（FLUX 不识中文，失败回退原文不阻断）
- **视频拼接**: `services/ffmpeg-merge.ts`，FFmpeg 二进制内置（ffmpeg-static），可用 `FFMPEG_BIN`/`FFPROBE_BIN` 覆盖

### Frontend
- Nuxt 3 SPA，动态路由在 `nuxt.config.ts` 的 `pages:extend` 手动注册（views/drama/：detail.vue 剧集列表 + episode.vue 工作台）
- `app/composables/useApi.ts` 统一 fetch 客户端（全相对路径，生产与后端同源）
- i18n：vue-i18n，`app/locales/{zh,en,ja,ko}.json`；Agent 产出语言由后端按请求注入指令控制

### Desktop
- 主进程 `desktop/src/main.ts`：单实例锁 → 空闲端口 → userData 准备（workspace 模板 copy-once + `.template-version` 版本标记）→ `utilityProcess.fork` 后端 → 轮询 health → BrowserWindow
- userData：打包版 `~/Library/Application Support/FusionDrama/`，dev 版 `FusionDrama-Dev/`（互不干扰）
- 后端 bundle 在 asar 内（externals 经 asar node_modules 解析，.node 自动重定向 unpacked）

### Docker
- 与桌面版同语义：entrypoint 把 workspace 模板 copy-once 到数据卷（可在线编辑），后端 tsx 直跑，前端静态由后端托管
- 应用内一键更新：watchtower HTTP API（`FUSION_WATCHTOWER_URL`/`FUSION_WATCHTOWER_TOKEN`）+ 发布清单 `FUSION_UPDATE_FEED`（默认 GitHub Releases，与桌面版同一份）；删除 watchtower 配置则退化为手动更新提示

## Database

SQLite 单文件（默认 `data/fusion.sqlite3`，桌面版在 userData，Docker 在数据卷）。启动时 `initSqliteSchema` 幂等建表 + 风格预设种子。MySQL→SQLite 一次性迁移：`cd backend && npx tsx scripts/import-mysql-to-sqlite.ts [--force]`（逐表行数校验、写前备份）。

## Key Config

- **环境变量**（全部有默认值，本地 dev 零配置；全集见 README「Environment Variables」）：`SQLITE_PATH` / `PORT`(5679) / `STORAGE_PATH` / `FUSION_DATA_DIR` / `WORKSPACE_PATH` / `FRONTEND_DIST` / `FFMPEG_BIN`/`FFPROBE_BIN` / `PUBLIC_BASE_URL` / `FUSION_VERSION` / `FUSION_UPDATE_FEED` / `FUSION_WATCHTOWER_URL`/`TOKEN` / `AI_DISABLE_THINKING` / `AI_THINKING_OFF_PATCH`
- AI 服务配置（API key/baseUrl/模型/温度）存 DB（`ai_service_configs` 表），设置页维护，**不在配置文件或环境变量**
- `configs/config.yaml` 是死配置（勿参考）
- `PUBLIC_BASE_URL`：Seedance 引用本地参考资源需公网地址，桌面版无此能力（有中文报错）
