import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(join(root, 'js/i18n.js'), 'utf8');

// LANGS 数量
const langCodes = [...src.matchAll(/code:\s*'([^']+)'/g)].map(m => m[1]);
console.log('语言数量:', langCodes.length, '->', langCodes.join(', '));

// POI id 提取（单引号 key）
const poiBlock = src.slice(src.indexOf('const POI'), src.indexOf('const CAT'));
const poiIds = [...poiBlock.matchAll(/'([a-zA-Z0-9_]+)':\s*\{/g)].map(m => m[1]);
console.log('POI 数量:', poiIds.length);

// 校验每个 POI 是否含全部 10 种语言
let incomplete = [];
for (const id of poiIds) {
    const start = poiBlock.indexOf("'" + id + "'");
    const end = poiBlock.indexOf("},", start);
    const seg = poiBlock.slice(start, end > 0 ? end : start + 300);
    for (const c of langCodes) {
        if (!new RegExp("\\b" + c + ":").test(seg)) incomplete.push(id + ':' + c);
    }
}
console.log('缺语言项的 POI:', incomplete.length ? incomplete.join(', ') : '无');

// CAT keys
const catBlock = src.slice(src.indexOf('const CAT'), src.indexOf('const STR'));
const catKeys = [...catBlock.matchAll(/'([a-zA-Z0-9_]+)':\s*\{/g)].map(m => m[1]);
console.log('分类数量:', catKeys.length, '->', catKeys.join(', '));

// 与 campus-data.js 的 building id 对比（单引号）
const cd = fs.readFileSync(join(root, 'js/campus-data.js'), 'utf8');
const buildingIds = [...cd.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
console.log('campus-data building 数量:', buildingIds.length);
const missing = buildingIds.filter(id => !poiIds.includes(id));
const extra = poiIds.filter(id => !buildingIds.includes(id));
console.log('缺失翻译的 building:', missing.length ? missing.join(', ') : '无');
console.log('多余的 POI key:', extra.length ? extra.join(', ') : '无');
