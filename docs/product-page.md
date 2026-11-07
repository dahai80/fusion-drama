---
doc_id: fusion-drama/product-page
product: fusion-drama
class: app
entry: guided-ui
doc_type: product-page
title: { zh: "Fusion Drama 产品页", en: "Fusion Drama product page" }
audience: engineer
status: draft
version: 1.0.0
updated: 2026-11-07
owner: @dahai
source_of_truth:
  - README.md
  - backend/src/index.ts
  - frontend/package.json
  - desktop/package.json
---

# Fusion Drama 产品页 / Product Page

AI 短剧制作平台。从小说导入到成片导出的完整流水线：剧本改写、角色/场景/道具提取、人设生图、分镜拆解、图生视频、TTS 配音、FFmpeg 拼接导出。全 TypeScript 栈。

AI short-drama production platform. A full pipeline from novel import to finished episode: script rewriting, character/scene/prop extraction, character artwork, storyboard breakdown, image-to-video, TTS dubbing, and FFmpeg stitching/export. Full TypeScript stack.

## 网格定位 / Grid position

- 产品类别 class: `app`
- 入口形态 entry: `guided-ui` — 创作者通过 Web UI（Nuxt 3 + Vue 3，开发模式 `:3013`，单服务模式由后端在 `:5679` 同时服务 API 与前端静态文件）或 Electron 桌面版（macOS dmg / Windows NSIS）驱动全部制作流程。后端为 Hono + Drizzle + better-sqlite3，只服务 UI 与 API。见 `README.md` 架构章节与 `desktop/package.json`。

## 核心能力 / Capabilities

### 1. 全小说导入流水线 / Full-novel import pipeline

整本小说分块（章节边界感知，约 18k 字窗口）→ 分段大纲（批量、可断点续跑）→ 集数规划（含覆盖校验，重规划不碰用户已编辑集）→ 滚动改写（带前情回顾保证连续性）。全部跑在共享 GPU 串行队列上，幂等可恢复。

- 用户不再需要 / Users no longer need to: 手工把小说拆成剧本、逐集复制前情提要。
- 约束 / Constraints: 依赖所配文本模型上下文（按 20k 上下文验证的窗口设计）；中断后从断点续跑，但不回滚已生成的集数。

### 2. 角色与资产管理 / Character and asset management

AI 生成人设图、批量生成、图片上传管理；FLUX.1 Kontext 上下文编辑（保持脸型/服装一致换姿势/背景）。

- 用户不再需要 / Users no longer need to: 在外部画图工具里逐张生成并手工维护角色一致性。
- 约束 / Constraints: 图像质量取决于所配图像模型；一致性编辑要求 provider 支持 `/v1/images/edits` 类接口。

### 3. 视频生成与成片 / Video generation and finishing

文生视频/图生视频批量任务、逐镜头 FFmpeg 合成与字幕、整集拼接导出、按角色稳定声线的 TTS 配音（Kokoro 内置音色；Qwen3-TTS 用 `workspace/voices/<name>.wav` 参考音频克隆）。

- 用户不再需要 / Users no longer need to: 手工逐镜头下载视频、用剪辑软件拼接对轨。
- 约束 / Constraints: 云端视频模型按 vendor 计费；本地 fusion-mlx 视频（LTX-2.5 / MiniMax-H3 / Wan2.2）需 Apple Silicon。

### 4. 四个内置 Agent / Four built-in agents

`script_rewriter` / `extractor` / `storyboard_breaker` / `prompt_generator`（Mastra，配置入库，SKILL.md 可在 UI 编辑）。全部 SSE 流式输出 + supervisor 复核（结构化 pass/issues 裁决）。

- 用户不再需要 / Users no longer need to: 逐段复制粘贴调用 LLM、肉眼审校每次输出。
- 约束 / Constraints: supervisor 只拦实质性缺陷（缺字段/格式错/违背请求），文风问题放行；复核失败降级放行原回复。

### 5. 离线 RAG 与跨会话记忆 / Offline RAG and cross-session memory

脚本/角色/场景/道具用 `bge-small-zh-v1.5`（ONNX，CPU）本地嵌入进 SQLite 向量索引，Agent 对话自动注入 top-5 相关块；跨会话记忆经 fusion-memory（`:11435`），桌面版自动拉起内置 fm-server。全部 fail-open。

- 用户不再需要 / Users no longer need to: 每次开新会话重新交代项目背景与创作偏好。
- 约束 / Constraints: 检索失败时 Agent 退回无上下文模式；记忆注入与用户指令冲突时用户指令优先。

### 6. 可编程 Provider / Programmable providers

Settings → AI Services → Custom Providers 里写 JS adapter（`node:vm` 沙箱，无 require/process/fs，5s 超时）接入任意图像/视频 vendor，热生效无需重启，带 Dry Run 预览请求。

- 用户不再需要 / Users no longer need to: 改源码加新 vendor、重启服务。
- 约束 / Constraints: 沙箱无网络外能力（走统一生成管线），5s eval 上限。

### 7. 无限画布 / Infinite canvas

制作舞台的自由画布视图：每个分镜为可拖拽节点，位置持久化入库，虚线连线显式表达拼接顺序，节点上一键生成图/视频。

- 用户不再需要 / Users no longer need to: 在列表里靠序号脑补镜头顺序。
- 约束 / Constraints: 画布只重排视觉与明确拼接顺序，不改变集数/镜头数据本身。

## 部署形态 / Deployment forms

| 形态 | 入口 | 说明 |
|------|------|------|
| 开发模式 | `npm run dev`（backend + frontend） | 前端 `:3013`，后端 `:5679`，前端代理 `/api` 与 `/static` |
| 单服务模式 | backend `npm start` | 后端同时服务 API 与 `frontend/dist` 静态文件 |
| 桌面版 | Electron（`desktop/`） | 自动拉起后端与 fm-server，数据在 userData 目录 |
| Docker | `docker-compose.yml` | 服务器部署，强制 `FUSION_API_TOKEN` |

## 相关文档 / Related docs

- 快速上手 / Get started: [get-started.md](get-started.md)
- 故障排查 / Troubleshooting: [troubleshooting.md](troubleshooting.md)
