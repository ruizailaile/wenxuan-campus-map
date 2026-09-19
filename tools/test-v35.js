const fs = require('fs');
const data = fs.readFileSync('js/campus-data.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

const dataFn = new Function(data + '; return {PATH_NODES, PATH_EDGES, BUILDINGS, MAP_HEIGHT, toGeo};');
const D = dataFn();

function grab(name) {
    const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n}\\r?\\n'));
    if (!m) throw new Error('not found: ' + name);
    return m[0];
}
const SCALE_M = 1;
const Store = { data: { myLocation: { x: 500, y: 250 } } };
const BUILDINGS = D.BUILDINGS;
const PATH_NODES = D.PATH_NODES;
const PATH_EDGES = D.PATH_EDGES;
const harness = grab('distance') + grab('escapeHtml') + grab('highlightHit') + grab('buildGraph') + grab('navStopName') + grab('dijkstra');
const test = new Function('SCALE_M','Store','BUILDINGS','PATH_NODES','PATH_EDGES', harness + `
    Store.data.myLocation = null;
    let g = buildGraph();
    if (g.__myloc__) throw new Error('myloc leaked');
    Store.data.myLocation = { x: 500, y: 250 };
    g = buildGraph();
    if (!g.__myloc__ || g.__myloc__.length !== 3) throw new Error('myloc edges != 3');
    const leg = dijkstra(g, '__myloc__', 'b_gate_main');
    if (!leg) throw new Error('no route from myloc');
    console.log('myloc->gate dist:', Math.round(leg.totalDist), 'm, nodes:', leg.path.length, 'first:', leg.path[0]);
    if (leg.path[0] !== '__myloc__') throw new Error('path not start at myloc');
    if (navStopName('__myloc__') !== '我的位置') throw new Error('navStopName myloc');
    if (!navStopName('b_gate_main')) throw new Error('navStopName gate');
    const h1 = highlightHit('第一教学楼', '一教');
    const h2 = highlightHit('学生食堂', '食堂');
    if (!h2.includes('<mark>食堂</mark>')) throw new Error('highlight cn fail: ' + h2);
    const h3 = highlightHit('ShiTang 食堂', 'shit');
    if (!/<mark>ShiT<\\/mark>/i.test(h3)) throw new Error('highlight ci fail: ' + h3);
    const h4 = highlightHit('<img onerror=alert(1)>', '<img');
    if (h4.includes('<img onerror')) throw new Error('XSS escape fail: ' + h4);
    const h5 = highlightHit('操场(东)', '(东)');
    if (!h5.includes('<mark>')) throw new Error('regex char fail: ' + h5);
    console.log('highlight ok:', h2, '|', h4);
    return 'ALL PASS';
`);
console.log(test(SCALE_M, Store, BUILDINGS, PATH_NODES, PATH_EDGES));
