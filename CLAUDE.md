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
  - 结构测试断言源码文本模式——重构源码破坏断言时改测试，别改源码（2026-10-15 曾整批同步 13 个过期用例：mysql-schema 断言随 SQLite 迁移作废、MiniMax 断言随 H3 重新接入反转、错误文案/提示词副本随前端 API 化过期）。

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
  - **中间件**（`middleware/logger.ts`）：`requestLogger`（彩色请求日志）+ `errorHandler`（统一错误捕获）；CORS 锁 `localhost:3013`/`5679`（`credentials:true`）
  - **启动清理**：进程重启后内存轮询线程全丢，`index.ts` 启动时把残留 `processing` 任务统一标 `failed`（errorMsg「服务重启，生成任务中断，请重试」），避免前端永久「生成中」
- **Database**: SQLite（better-sqlite3 + WAL），`SQLITE_PATH` 覆盖库文件位置；DDL 在 `src/db/sqlite-schema.ts`，启动时幂等重放；Drizzle 表定义 `src/db/schema.ts`（sqlite-core）
- **路径锚点**: `src/utils/paths.ts` 统一解析 DATA_ROOT/STORAGE_ROOT；桌面版由 Electron 主进程注入 env（`FUSION_DATA_DIR`/`SQLITE_PATH`/`WORKSPACE_PATH`/`FRONTEND_DIST`/`FFMPEG_BIN`/`FFPROBE_BIN`），dev 走仓库相对路径默认值
- **AI Agents**: Mastra，4 个静态 agent（script_rewriter / extractor / storyboard_breaker / prompt_generator）注册于 `agents/index.ts` 的 agentRegistry；instructions 按请求动态拼接 = `workspace/prompts/<type>.md`（按目标语言选 .md/.en/.ja/.ko）+ skills + 语言指令块（非中文时强制覆盖旧模板的语言约束）；模型按请求解析（RequestContext 可覆盖 model/config_id）
  - **工具绑定**（`AGENT_TOOLS`，`agents/tools/`）：script_rewriter→`script-tools`、extractor→`extract-tools`、storyboard_breaker→`storyboard-tools`、prompt_generator→`image-prompt-tools` + 复用 storyboard 的 `readStoryboardContext`/`updateStoryboard`；工具经 Mastra RequestContext 拿 episodeId/dramaId/language（`agents/context.ts` 的 `buildAgentRequestContext`）
  - **fetch 补丁链**（agents/index.ts）：① 关思考（`AI_DISABLE_THINKING` 总开关、`AI_THINKING_OFF_PATCH` JSON 覆盖注入参数；官方 OpenAI/Gemini host 跳过）② 温度注入 ③ undici dispatcher 解除 300s headers 超时（本地大模型长上下文首 token 可超 300s）。generation.ts 的生成/轮询请求同样挂 undici 零超时 dispatcher
- **媒体生成**: `services/generation.ts` 统一任务生命周期（sys_task 表）
  - **GPU 串行队列**（`services/gpu-queue.ts` 的 `enqueueGpuWork`/`gpuChain`）：所有 GPU 密集任务（图片/视频生成、资产提取 Agent、Agent 对话路由 `routes/agent.ts`、视频提示词批量 `services/video-prompts.ts`）共用一把锁，任意时刻仅一个 GPU 任务运行——本地模型（fusion-mlx）无法并行多模型（FLUX ~34GB + Qwen3.5 decode burst → GPU 争用 → Metal command buffer execution failed → SIGTERM 进程挂死）。云端并发易触发限流。**不要改成并行**
  - **FLUX 模型卸载**（`unloadFusionImageModel`）：fusion-mlx 的 `model_settings.json` 中 FLUX.1-dev 无 `ttl_seconds` → 图片生成后不自动卸载，常驻 ~34GB 挤占后续提取 Agent。图片任务完成（成功/失败）后主动 `POST /v1/models/{id}/unload` 释放。仅对 fusion-mlx 本地配置生效
  - **资产提取串行**（`extraction.ts`）：前端 `doExtractAll()` 并发 3 POST（characters/scenes/props），每类各起 `agent.generate`（maxSteps:20）打 Qwen3.5；三类共享 GPU 串行队列，逐个执行避免并发 decode 争用
  - 适配器注册表 `services/adapters/registry.ts`：图片 openai/gemini/volcengine；视频 volcengine/minimax/aliyun/fusion（官方清单在 `services/ai.ts` 的 officialProviders）
  - **fusion** = fusion-mlx 本地视频（`adapters/fusion-video.ts`）：同步 `/v1/videos/generate` 直接返回 base64 data URI（无轮询），`downloadFile` 解码落盘后 `result_url` 存 localPath（**勿存 data URI**——37MB base64 会污染 DB/API）；fusion 中文 prompt 先经文本模型译英文（Gemma T5 编码器不识 CJK）——**但 H3 跳过翻译**（MiniMax 中文模型识 CJK，且翻译会加载文本模型与 H3 竞争内存导致 memory guard SIGTERM）；`referenceImageUrls` 映射为 I2V 首帧（无参考图时自动注入分镜图作首帧，commit 0fe5c89）；有首帧时联合 A/V 音频降级关闭——对白由独立 TTS 配音管线合成（见下）
  - **模型感知适配**（`isMiniMaxH3`/`isWan22Ti2v5b`，均已 export 供 generation.ts 判定跳翻译）：三模型路由——
    **LTX-2.5**（`ltx-2.5`，主力）：短边 768（1344x768 实测 197s/5.01s/117f 安全；1088 短边 VAE decode 12min+ OOM 114GB>112GB），#978 起 temporal upsampler 移除、输出帧数 = `num_frames`（8k+1 直算），上限 10s；联合 A/V（无首帧时 `audio:true`），有首帧时 audio 降级关闭（fl2va 与 joint audio 互斥）；
    **MiniMax-H3**（`minimax`/`h3`，画质首选）：33B 须 `quantize=dit8_te4`（DiT 8-bit+TE 4-bit ≈61GB，否则 144GB OOM），**Turbo LoRA（上游 #1213）默认开**：`turbo:true`+`num_inference_steps=4`（4 步实测 271-314s/5s 镜头，2.7x 于 8 步 838s；fusion-mlx 旁路挂载 turbo_lora.safetensors 259 模块，缺文件 400 显式报错），短边 576（16:9→1024x576），无 8k+1 约束（1..361 帧直算），上限 5s（120帧），永不传 audio（fl2va image 互斥 + t2va-av UNVERIFIED → TTS dub），支持 `last_frame_image`（fl2va 末帧锚定）；H3 跳翻译（MiniMax 中文模型），翻译会加载文本模型竞争内存触发 memory guard SIGTERM；
    **Wan2.2-TI2V-5B**（`Anes1032--Wan2.2-TI2V-5B-mlx-q8`，2026-10 试点）：5B compact DiT + Wan2.2-VAE 16×16×4 高压缩（latent 帧数少 4 倍），T2V/I2V 统一单模型，短边 544（16:9→960×544；原生 720P 1280×704 在 MLX 侧 seq=18480 超过 `FUSION_WAN2_Q8_FP32_SEQ`(16384) 阈值走 fp32 慢路径 ~95s/步且触发 memory enforcer 硬压力，上游 #1208，修复后回升 704；544 短边 seq=10710 走 bf16 快路径，实测 525s/81帧/3.375s 输出），帧约束 `(nf-1)%4==0`（4k+1 直算，与 8k+1 兼容），上限 10s；UMT5 文本编码器原生识中文（跳过翻译步）；不传 audio/quantize/steps（q8 权重已预量化，服务端默认 40 步）；
    三者不可同时驻留 fusion（video mutex，issue #950）——切换模型前先 `POST /v1/models/{id}/unload`。LTX-Video legacy 2B 路由已于 2026-10-15 移除（2s 上限/无 A/V 无实用价值，模型文件一并从 `~/.fusion-mlx/models` 删除）
  - **TTS 对白配音**（`utils/video-dub.ts`，commit b7cc013）：修复 LTX-2.5 联合 A/V 只出环境底噪无清晰对白。流程 = 从分镜 `video_prompt` 提取「角色名：台词」→ 逐条调 fusion-mlx `/v1/audio/speech`（Kokoro TTS）合成 → 按顺序拼成一条音轨 → 与原视频混流（原音轨降噪保留环境声，TTS 音轨置前）。`generation.ts` 视频落盘后调 `dubVideoDialogue(localPath, prompt, taskId)`；任一步失败返回原视频路径不阻断主流程。TTS 上游读 `ai_service_configs` 表 active 配置，缺失则跳过
  - 中文图片提示词先经文本模型翻译成英文再生图（FLUX 不识中文，失败回退原文不阻断）
- **视频拼接**: `services/ffmpeg-merge.ts`，FFmpeg 二进制内置（ffmpeg-static），可用 `FFMPEG_BIN`/`FFPROBE_BIN` 覆盖
- **其他 services**：`ai.ts`（AI 配置 CRUD + `officialProviders` 官方清单 + `getActiveConfig`）、`extraction.ts`（资产提取编排）、`final-prompt.ts`（图片最终提示词组装）、`video-prompts.ts`（按集内存态批量为缺 `video_prompt` 的分镜跑 prompt_generator，运行中不重启，重启丢状态）、`app-settings.ts`（全局设置含 `content_language`）、`server-update.ts`（watchtower/GitHub feed 更新检查）

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
- `FUSION_API_TOKEN`：对外部署（非 loopback 绑定）未显式配置时首启自动生成 64 hex 并持久化到 `app_settings.server_api_token`（重启复用）；本地/桌面（loopback）免鉴权不变
- `PUBLIC_BASE_URL`：Seedance 引用本地参考资源需公网地址，桌面版无此能力（有中文报错）
