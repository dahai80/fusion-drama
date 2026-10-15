#!/bin/sh
# 容器入口：workspace 模板 copy-once 到数据卷（与桌面版 userData 同一语义），然后启动后端
set -e

if [ ! -e /app/data/workspace/.template-version ]; then
  mkdir -p /app/data/workspace
  # 逐文件不覆盖（-n）：首次启动中途被杀，下次补拷缺的文件而不整体覆盖用户在线编辑的 skills
  cp -an /app/workspace-template/. /app/data/workspace/
  touch /app/data/workspace/.template-version
fi

# 服务器模式必须显式配置 API token（compose 透传 FUSION_API_TOKEN）；
# 默认 token 或缺失直接拒绝启动，避免"开放控制面"上线
if [ -z "$FUSION_API_TOKEN" ]; then
  echo "[entrypoint] ERROR: FUSION_API_TOKEN is required for server deployment. Set it in .env (e.g. via openssl rand -hex 32)."
  exit 1
fi
if [ "$FUSION_API_TOKEN" = "please-change-me" ] || [ "$FUSION_API_TOKEN" = "change-me" ]; then
  echo "[entrypoint] ERROR: FUSION_API_TOKEN is a placeholder value. Generate a real token: openssl rand -hex 32"
  exit 1
fi
if [ "$FUSION_WATCHTOWER_TOKEN" = "please-change-me" ]; then
  echo "[entrypoint] ERROR: WATCHTOWER_TOKEN is a placeholder value. Generate a real token: openssl rand -hex 32"
  exit 1
fi

cd /app/backend
exec node_modules/.bin/tsx src/index.ts
