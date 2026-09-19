# Cloudflare 部署指南（Pages 前端 + Workers 后端）

原 Express 单体应用已拆分为 Cloudflare 架构，**前端代码零改动**：

```
浏览器
  │
  ├─ 静态资源（index.html / js / css / assets / sw.js）
  │        → Cloudflare Pages  wenxuan-campus-map.pages.dev
  │
  └─ /api/*（相对路径请求，同源）
           → Pages Function: functions/api/[[path]].js
             通过 Service Binding 转发
                → Worker: wenxuan-campus-map-api
                     └─ D1 数据库: wenxuan-campus-map-db-sg
                        （单行 JSON 文档，结构同原 data/db.json）
```

## 文件结构

| 路径 | 作用 |
|---|---|
| `worker/src/index.js` | API Worker（由 server.js 移植） |
| `worker/wrangler.jsonc` | Worker 配置（D1 绑定） |
| `worker/schema.sql` | D1 表结构 |
| `functions/api/[[path]].js` | Pages Function：同源代理 /api/* 到 Worker |
| `wrangler.toml` | Pages 配置（Service Binding） |
| `scripts/build-pages.mjs` | 组装 dist/（仅前端文件，排除后端） |
| `scripts/deploy-cloudflare.sh` | 一键部署脚本 |

## 与 Express 版的差异

- 密码哈希：scrypt → **PBKDF2-SHA256**（Web Crypto，Workers 原生支持）
- 验证码/登录失败计数：内存 Map → **D1 持久化**（隔离实例不丢状态）
- 静态资源缓存策略由 Cloudflare CDN 接管
- seed.json 编译进 Worker，`data/db.json` 不再需要

## 部署步骤

### 1. 登录 Cloudflare（二选一）

```bash
# 方式 A：浏览器 OAuth（推荐）
npx wrangler login

# 方式 B：API Token
# 在 https://dash.cloudflare.com/profile/api-tokens 创建（模板：Edit Cloudflare Workers）
export CLOUDFLARE_API_TOKEN=xxx
```

### 2. 一键部署

```bash
bash scripts/deploy-cloudflare.sh
```

脚本会自动：创建 D1 → 初始化远程表 → 部署 Worker → 组装并部署 Pages。

### 3. 验证

```bash
curl https://wenxuan-campus-map.pages.dev/api/health
# {"ok":true,"service":"wenxuan-campus-map",...}
```

## 常用运维命令

```bash
WRANGLER=/c/Users/wang5/node_modules/.bin/wrangler

# 查看线上数据库
cd worker && $WRANGLER d1 execute DB --remote --command "SELECT length(data) FROM db"

# 重置全部数据（恢复出厂）
cd worker && $WRANGLER d1 execute DB --remote --command "DELETE FROM db"

# 更新部署
bash scripts/deploy-cloudflare.sh
```

## 费用

全部在 Cloudflare 免费额度内：
- Pages：500 次构建/月，不限请求
- Workers：10 万请求/天
- D1：500 万行读/天（本项目单行 JSON，读一次 = 1 行）
