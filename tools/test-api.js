/* api.js 云端同步客户端联调测试（需 server.js 已在 localhost:3100 运行） */
const fs = require('fs');

// ---- 桩：浏览器全局 ----
const storeData = {
    custom: [{ id: 'b_user_local1', name: '本机遗留点', category: 'service', x: 100, y: 100,
               info: { desc: '本地模式时期添加的' } }],
    poiOverrides: { b_fountain: { desc: '本机改过的喷泉简介' } },
    poiDeleted: ['b_yanyi'],
    cloudMigrated: false,
};
global.window = {};
global.Store = {
    data: storeData,
    save() {},
};
global.addEntryNodeForBuilding = (id, x, y) => { global.__entries.push(id); };
global.__entries = [];

// ---- 加载数据层 + api.js（new Function 提取，显式挂全局） ----
const D = new Function(fs.readFileSync('js/campus-data.js', 'utf8')
    + '; return { BUILDINGS, PATH_NODES, PATH_EDGES, CATEGORIES };')();
global.BUILDINGS = D.BUILDINGS;
global.PATH_NODES = D.PATH_NODES;
global.PATH_EDGES = D.PATH_EDGES;
global.CATEGORIES = D.CATEGORIES;
new Function(fs.readFileSync('js/api.js', 'utf8'))();
window.CampusAPI.base = 'http://localhost:3100/';

(async () => {
    const before = BUILDINGS.length;
    const ok = await window.CampusAPI.init();
    if (!ok) throw new Error('init 应返回 true（服务器在线）');
    console.log('init 成功, ready =', window.CampusAPI.ready);

    // 迁移是否生效
    if (!storeData.cloudMigrated) throw new Error('迁移标记未设置');
    const list = await window.CampusAPI._fetch('api/pois');
    const ids = list.pois.map(p => p.id);
    if (!ids.includes('b_user_local1')) throw new Error('本机自定义点未迁移上云');
    const fountain = list.pois.find(p => p.id === 'b_fountain');
    if (fountain.desc !== '本机改过的喷泉简介') throw new Error('本机修改未迁移: ' + fountain.desc);
    if (ids.includes('b_yanyi')) throw new Error('本机删除未生效（b_yanyi 应不可见）');
    console.log('迁移校验通过：自定义/修改/删除均已上云');

    // BUILDINGS 合并校验
    if (BUILDINGS.length !== list.total) throw new Error(`BUILDINGS 数量不符: ${BUILDINGS.length} vs ${list.total}`);
    if (!BUILDINGS.some(b => b.id === 'b_user_local1')) throw new Error('云端自定义点未合并进 BUILDINGS');
    if (!global.__entries.includes('b_user_local1')) throw new Error('自定义点未接入路网');
    const f = BUILDINGS.find(b => b.id === 'b_fountain');
    if (f.info.desc !== '本机改过的喷泉简介') throw new Error('BUILDINGS 未应用云端修改');
    console.log('BUILDINGS 合并校验通过，共', BUILDINGS.length, '个地点（启动前', before, '个）');

    // 操作同步
    window.CampusAPI.create({ id: 'b_user_sync1', name: '同步测试点', category: 'service', x: 200, y: 200, info: {} });
    window.CampusAPI.update('b_gate_main', { desc: '同步更新测试' });
    await new Promise(r => setTimeout(r, 800));   // 等异步请求落地
    const after = await window.CampusAPI._fetch('api/pois');
    if (!after.pois.some(p => p.id === 'b_user_sync1')) throw new Error('create 未同步');
    if (after.pois.find(p => p.id === 'b_gate_main').desc !== '同步更新测试') throw new Error('update 未同步');
    console.log('create/update 同步校验通过');

    // 清理测试数据
    await window.CampusAPI._fetch('api/pois/b_user_local1', { method: 'DELETE' });
    await window.CampusAPI._fetch('api/pois/b_user_sync1', { method: 'DELETE' });
    await window.CampusAPI._fetch('api/pois/b_fountain/restore', { method: 'POST' });
    await window.CampusAPI._fetch('api/pois/b_gate_main/restore', { method: 'POST' });
    await window.CampusAPI._fetch('api/pois/b_yanyi/restore', { method: 'POST' });
    const stats = await window.CampusAPI._fetch('api/stats');
    console.log('清理后统计:', JSON.stringify(stats));
    console.log('ALL PASS');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
