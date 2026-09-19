/* ============================================================
 * build-pages.mjs — 组装 Cloudflare Pages 部署目录
 *
 * 把前端静态资源复制到 dist/（Pages 构建产物目录）：
 *   index.html / css / js / assets / manifest.webmanifest / sw.js
 * 后端文件（server.js、data/、tools/、worker/ 等）不进 dist。
 *
 * 用法：node scripts/build-pages.mjs
 * ============================================================ */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const items = [
    'index.html',
    'css',
    'js',
    'assets',
    'manifest.webmanifest',
    'sw.js',
];

for (const item of items) {
    const src = join(root, item);
    if (!existsSync(src)) {
        console.error(`[build] 缺少 ${item}，中止`);
        process.exit(1);
    }
    cpSync(src, join(dist, item), { recursive: true });
    console.log(`[build] + ${item}`);
}

// Iconsax 免费组件库：index.html 以 /vendor/iconsax/ 引用，SW 也预缓存该路径；
// 从 npm 依赖拷入 dist，许可归属见 ICONSAX-NOTICE.md（不把图标源文件入库）。
const iconsaxDist = join(root, 'node_modules', 'iconsax', 'dist');
if (!existsSync(iconsaxDist)) {
    console.error('[build] 缺少 node_modules/iconsax/dist，请先执行 npm install，中止');
    process.exit(1);
}
cpSync(iconsaxDist, join(dist, 'vendor', 'iconsax'), { recursive: true });
console.log('[build] + vendor/iconsax');

console.log('[build] dist/ 组装完成');
