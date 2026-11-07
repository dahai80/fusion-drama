---
doc_id: fusion-drama/troubleshooting
product: fusion-drama
class: app
entry: guided-ui
doc_type: troubleshooting
title: { zh: "Fusion Drama 故障排查", en: "Fusion Drama troubleshooting" }
audience: engineer
status: draft
version: 1.0.0
updated: 2026-11-07
owner: @dahai
source_of_truth:
  - README.md
  - backend/src/index.ts
  - .env.example
---

# 故障排查 / Troubleshooting

## 快速诊断 / Quick diagnosis

```bash
curl http://localhost:5679/api/v1/health
# {"status":"ok","schemaVersion":8,"storageWritable":true,"engineOk":true}
```

## 服务问题 / Service issues

### 1. 单服务模式访问 `/` 返回 404

`FRONTEND_DIST`（默认 `<repo>/frontend/dist`）不存在或后端无法读取。先构建前端：`cd frontend && npm run generate && cp -r .output/public dist`，或改用开发模式（前端 `:3013` + 后端 `:5679`）。另注意 `/api/v1/*` 未匹配路由时返回 JSON 404 而非 SPA 页面——这是刻意的 API 404 硬闸，防止把调用方路径错误伪装成"成功返回了一段 HTML"。

### 2. 非本机部署 401

非 loopback 绑定（`FUSION_BIND_HOST` 非 `127.0.0.1`/`localhost`/`::1`）强制要求 `FUSION_API_TOKEN`（≥32 字符，弱 token 拒绝启动）。首启自动生成 64-hex token 存入 `app_settings.server_api_token`（日志只打前缀）；前端在 设置 → General 填入一次。`/static/*` 支持 `?token=` 供 `<img>`/下载链接使用。

### 3. Docker 部署 token 校验失败

`.env` 的 `FUSION_API_TOKEN` 未改默认值或不足 32 字符。`openssl rand -hex 32` 生成后重启容器。

## AI 服务问题 / AI service issues

### 4. 页面顶部一直有"配置 AI 服务"横幅

文本/图像/视频三类模型配置至少缺一。设置 → Fusion Quick Setup 一键写入，或 Manual Templates 逐个添加。AI 配置存数据库（不入配置文件/环境变量）。

### 5. 中转站 400 / reasoning_content 报错

new-api 类中转站会强制回传 reasoning_content 导致 400。设置 `AI_DISABLE_THINKING=false` 相关项：`.env` 里 `AI_DISABLE_THINKING`（默认 true 关思考）与 `AI_THINKING_OFF_PATCH`（自定义注入 JSON，如 `{"thinking":{"type":"disabled"},"enable_thinking":false}`）；官方 OpenAI/Gemini 端点自动跳过注入。

### 6. 视频生成引用本地文件报错

Seedance 等上游无法读取本地 `/static` 路径。设置 `PUBLIC_BASE_URL` 为本后端公网地址（本地 `/static` 路径会解析为 `PUBLIC_BASE_URL + path` 传给上游）。

### 7. 生图质量差 / 人物不一致

fusion provider 默认开启图像 QA 门（`FUSION_IMAGE_REVIEW`，视觉模型打分，低分触发一次纠错重试；云端 provider 默认关）。可用 `FUSION_IMAGE_REVIEW=1/0` 强制开/关；视觉模型经 `FUSION_IMAGE_REVIEW_MODEL` 指定（默认 `mlx-community--Qwen2.5-VL-7B-Instruct-4bit`，必须由所配文本端点提供）。

## Agent / RAG / 记忆问题 / Agent issues

### 8. Agent 对话没有上下文 / RAG 不生效

RAG fail-open 设计：`bge-small-zh-v1.5` 模型文件缺失或索引失败时静默退回无检索模式。检查索引（设置 → Rebuild Index）；索引在首次对话自动开始、脚本保存时刷新。

### 9. 记忆显示 offline

fusion-memory（fm-server，`:11435`）未运行或 `FUSION_MEMORY_API_KEY` 不匹配（默认读 `~/.fusion-memory/api_key`）。桌面版会在启动时自动拉起内置 fm-server（已运行则复用，退出时停止）；二进制缺失时降级 offline，其余功能不受影响。整条链路 fail-open。

### 10. Agent 回复被警告 toast 拦下

supervisor 复核判定 `issues`（缺必需输出/格式错/违背请求）。按 toast 列表修正后重发即可；复核失败本身降级放行原回复，不会阻塞。

## 数据问题 / Data issues

### 11. 数据库迁移 / 备份

- Schema 升级走 `PRAGMA user_version` 版本迁移，迁移前自动 `VACUUM INTO` 备份到 `data/backups/`（保留最近 10 份）
- 服务器部署可在 设置 → Storage → Backup 手动全量备份（SQLite 快照 + static/ 打包 tar.gz）
- 老版 MySQL 升级：SQLite 空库且配置 `DATABASE_URL`/`MYSQL_HOST` 时启动自动一次性导入（`.mysql-imported` 标记防重入）；手动迁移 `cd backend && npx tsx scripts/import-mysql-to-sqlite.ts`（非空目标需 `--force`）。迁移只覆盖行数据，`data/static/` 媒体文件需手工拷贝

### 12. 桌面版数据在哪

`~/Library/Application Support/FusionDrama/data/`（Electron 注入 `FUSION_DATA_DIR`）；服务器/开发模式默认 `<repo>/data/`（`SQLITE_PATH`/`STORAGE_PATH` 可覆盖）。

## 桌面版 / Desktop issues

### 13. 桌面版端口冲突

桌面模式端口动态分配（健康检查/后端用实际端口覆写静态资源里的默认值），一般无需干预；确认无僵死的 `tsx`/Electron 辅助进程占用即可。服务器模式固定 `:5679`（`PORT` 可覆盖）。
