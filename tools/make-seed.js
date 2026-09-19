/* 从 js/campus-data.js 提取 BUILDINGS 生成 data/seed.json（官方 POI 种子数据）
 * 用法：node tools/make-seed.js   （在 campus-map 目录下执行）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/campus-data.js'), 'utf8');
const D = new Function(src + '; return { BUILDINGS, CATEGORIES };')();

const seed = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pois: D.BUILDINGS.map(b => ({
        id: b.id, name: b.name, category: b.category, x: b.x, y: b.y,
        desc: b.info.desc, hours: b.info.hours, phone: b.info.phone, floors: b.info.floors,
        builtin: true,
    })),
    categories: D.CATEGORIES,
};

const out = path.join(root, 'data', 'seed.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seed, null, 2));
console.log(`seed.json 已生成：${seed.pois.length} 个 POI，${Object.keys(seed.categories).length} 个分类`);
