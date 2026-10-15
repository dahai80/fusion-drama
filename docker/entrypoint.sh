#!/bin/sh
# 容器入口：workspace 模板 copy-once 到数据卷（与桌面版 userData 同一语义），然后启动后端
set -e

# L12: 与桌面版 main.ts syncWorkspaceTemplate 对齐——按版本比对，镜像升级后
# 修复过的 prompts 强制覆盖（与代码内 DEFAULT_PROMPTS 同源迭代），skills 只增不覆盖
TEMPLATE_VERSION=$(cat /app/workspace-template/.template-version 2>/dev/null || echo 1)
CURRENT_VERSION=$(cat /app/data/workspace/.template-version 2>/dev/null || echo none)
if [ "$CURRENT_VERSION" != "$TEMPLATE_VERSION" ]; then
  mkdir -p /app/data/workspace
  # 逐文件不覆盖（-n）：首次启动中途被杀，下次补拷缺的文件而不整体覆盖用户在线编辑的 skills
  cp -an /app/workspace-template/. /app/data/workspace/
  # prompts 随模板升级强制覆盖
  cp -a /app/workspace-template/prompts/. /app/data/workspace/prompts/ 2>/dev/null || true
  echo "$TEMPLATE_VERSION" > /app/data/workspace/.template-version
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
