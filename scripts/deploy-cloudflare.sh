#!/usr/bin/env bash
# ============================================================
# deploy-cloudflare.sh — 一键部署 文轩校园地图 到 Cloudflare
#
# 前置：已 wrangler login（或设置 CLOUDFLARE_API_TOKEN）
#
# 流程：
#   1. 首次运行：创建 D1 数据库，把 database_id 写回 worker/wrangler.jsonc
#   2. 初始化远程 D1 表结构（幂等）
#   3. 部署 Worker（wenxuan-campus-map-api）
#   4. 组装 dist/ 并部署 Pages（wenxuan-campus-map）
#      Pages 通过 Service Binding 绑定上面的 Worker
#
# 用法：bash scripts/deploy-cloudflare.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

WRANGLER="${WRANGLER:-/c/Users/wang5/node_modules/.bin/wrangler}"
WORKER_CFG="worker/wrangler.jsonc"
D1_NAME="wenxuan-campus-map-db-sg"   # v3.38：已迁至新加坡（APAC）

# ---- 1. D1 数据库（只创建一次） ----
D1_ID=$(grep -o '"database_id": *"[^"]*"' "$WORKER_CFG" | grep -o '[a-f0-9-]\{30,\}')
if [ -z "$D1_ID" ] || [ "$D1_ID" = "REPLACE_WITH_D1_ID" ]; then
    echo ">>> 创建 D1 数据库 $D1_NAME ..."
    CREATE_OUT=$("$WRANGLER" d1 create "$D1_NAME" 2>&1 | tee /dev/tty)
    D1_ID=$(echo "$CREATE_OUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
    if [ -z "$D1_ID" ]; then
        echo "!! 无法解析 database_id，请手动把 ID 填入 $WORKER_CFG 后重跑"
        exit 1
    fi
    sed -i "s/REPLACE_WITH_D1_ID/$D1_ID/" "$WORKER_CFG"
    echo ">>> database_id 已写入 $WORKER_CFG"
fi

# ---- 2. 初始化远程表结构 ----
echo ">>> 初始化远程 D1 schema ..."
(cd worker && "$WRANGLER" d1 execute DB --remote --file=schema.sql)

# ---- 3. 部署 Worker ----
echo ">>> 部署 Worker（wenxuan-campus-map-api）..."
(cd worker && "$WRANGLER" deploy)

# ---- 4. 部署 Pages ----
echo ">>> 组装并部署 Pages（wenxuan-campus-map）..."
node scripts/build-pages.mjs
"$WRANGLER" pages deploy dist --project-name=wenxuan-campus-map

echo ""
echo "✅ 部署完成"
echo "   Worker API: https://wenxuan-campus-map-api.<你的子域>.workers.dev"
echo "   前端站点:   https://wenxuan-campus-map.pages.dev"
