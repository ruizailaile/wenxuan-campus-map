# 历史数据归档（冷备份，不参与运行）

| 文件 | 说明 |
|---|---|
| `legacy-db-wnam-archive.sql` | 旧北美库（wenxuan-campus-map-db，WNAM/SJC）的全量 SQL 导出，**2026-09-19 该库已从 Cloudflare 删除**。仅作最后的数据找回后手，任何程序都不会读取它。 |

当前生产数据库：`wenxuan-campus-map-db-sg`（新加坡 APAC/SIN）。
如需从本归档恢复：`npx wrangler d1 execute <目标库> --remote --file=backups/legacy-db-wnam-archive.sql`
