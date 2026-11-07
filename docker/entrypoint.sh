#!/bin/sh
# 容器入口：workspace 模板 copy-once 到数据卷（与桌面版 userData 同一语义），然后启动后端
set -e

# L12 + checklist 1107 #6: workspace template upgrade — hash-based three-way
# merge, aligned with desktop main.ts syncWorkspaceTemplate:
#   first run -> copy all (no overwrite)
#   upgrade   -> per file: same as new = skip; same as last-deployed baseline
#                (user untouched) = overwrite; user-modified = keep + <file>.new
TEMPLATE_VERSION=$(cat /app/workspace-template/.template-version 2>/dev/null || echo 1)
CURRENT_VERSION=$(cat /app/data/workspace/.template-version 2>/dev/null || echo none)
if [ "$CURRENT_VERSION" != "$TEMPLATE_VERSION" ]; then
  mkdir -p /app/data/workspace
  HASHFILE=/app/data/workspace/.template-hashes
  copied=0; overwritten=0; kept_new=0
  cd /app/workspace-template
  # list to temp file: pipe-while would run the loop in a subshell and lose counters
  find . -type f ! -name '.template-version' > /tmp/workspace-template-files
  while read -r rel; do
    dest="/app/data/workspace/$rel"
    new_hash=$(md5sum "$rel" | cut -d' ' -f1)
    mkdir -p "$(dirname "$dest")"
    if [ ! -f "$dest" ]; then
      cp "$rel" "$dest"; copied=$((copied+1)); continue
    fi
    cur_hash=$(md5sum "$dest" | cut -d' ' -f1)
    [ "$cur_hash" = "$new_hash" ] && continue
    old_hash=$(grep "  ${rel#./}\$" "$HASHFILE" 2>/dev/null | cut -d' ' -f1)
    if [ -n "$old_hash" ] && [ "$cur_hash" = "$old_hash" ]; then
      cp "$rel" "$dest"; overwritten=$((overwritten+1))
    else
      cp "$rel" "$dest.new"; kept_new=$((kept_new+1))
      echo "[entrypoint] workspace file user-modified, new template saved as ${rel}.new"
    fi
  done < /tmp/workspace-template-files
  rm -f /tmp/workspace-template-files
  # regenerate baseline: hash of every bundled file as now deployed
  find . -type f ! -name '.template-version' -exec md5sum {} \; | sed 's|\./||' > "$HASHFILE"
  echo "$TEMPLATE_VERSION" > /app/data/workspace/.template-version
  echo "[entrypoint] workspace template synced: copied=$copied overwritten=$overwritten kept_as_new=$kept_new"
  cd /app/backend
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
