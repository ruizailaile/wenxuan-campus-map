/* ============================================
 * routing.js — 校园路网路由引擎（纯算法层，无 UI 依赖）
 *
 * 原理（参考 GitHub 同类实现：Smart-Campus-navigator、
 * Campus-Navigation-System、DTU-Campus-Navigator）：
 *   1. 手绘路网 = 节点(坐标) + 边(连线)，建筑 POI 即图顶点
 *   2. 边权 = 欧氏距离（1 数据单位 ≈ 1 米）
 *   3. 最短路 = A*（h 为欧氏直线距离；边权同为欧氏距离，
 *      满足可采纳性/一致性，保证结果与 Dijkstra 完全一致，
 *      但探索节点更少 —— 优化"优先最近路线"的第一性）
 *   4. 备选路线 = 逐条移除推荐路径上的边重算（轻量 Yen 思想）
 *   5. 多站点最优顺序 = 最近邻贪心 + 2-opt 改进（开放路径，
 *      起点；参考 Route-Optimizer / tsp-solver-nn）
 *   6. 用户位置贴边（map-matching 思想）：投影到最近路段，
 *      沿"走到路边 → 沿路走"计距，比连最近 3 个节点更真实
 *
 * 依赖（由 campus-data.js 提供）：PATH_NODES / PATH_EDGES / distance
 * 注：distance() 定义于本文件末尾（1 数据单位 ≈ 1 米），
 *     app.js 不再重复定义。
 * ============================================ */

/**
 * 点到线段投影：返回 { x, y, dist } —— 投影点坐标与到线段距离。
 * t 超出 [0,1] 时钳制到端点。
 */
function projectToSegment(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + abx * t, y = a[1] + aby * t;
    return { x, y, dist: distance(p, [x, y]) };
}

/**
 * 【原理】将 PATH_EDGES 转换为邻接表：
 *   { nodeId: [{ to: neighborId, dist: 距离 }, ...] }
 * @param {{x:number,y:number}|null} myLoc 「我的位置」（可选）
 * @param {[string,string]|null} excludeEdge 排除某条边（备选路线用）
 */
function buildGraph(myLoc, excludeEdge) {
    const graph = {};
    for (const nodeId in PATH_NODES) graph[nodeId] = [];
    PATH_EDGES.forEach(([a, b]) => {
        // 防御：跳过引用了缺失节点的边（数据里有 12 条边指向未上线 POI，
        // 不跳过会让 distance(undefined, ...) 直接抛错、导航整体不可用）
        if (!PATH_NODES[a] || !PATH_NODES[b]) return;
        if (excludeEdge && ((excludeEdge[0] === a && excludeEdge[1] === b) ||
                            (excludeEdge[0] === b && excludeEdge[1] === a))) return;
        const dist = distance(PATH_NODES[a], PATH_NODES[b]);
        graph[a].push({ to: b, dist });
        graph[b].push({ to: a, dist });
    });

    if (myLoc) {
        // 「我的位置」虚拟节点 + 贴边投影节点：
        // 投影到最近的路段 p ∈ (a,b)，连 __myloc__—p—(a,b)，
        // 距离 = 走到路边 + 沿路走，比"直连最近 3 个节点"更真实
        // （否则会穿建筑抄近道，距离失真）。
        PATH_NODES.__myloc__ = [myLoc.x, myLoc.y];
        let best = null;   // { edge:[a,b], proj:{x,y,dist} }
        PATH_EDGES.forEach(([a, b]) => {
            if (!PATH_NODES[a] || !PATH_NODES[b]) return;
            if (a === '__myloc__' || b === '__myloc__') return;
            const proj = projectToSegment(PATH_NODES.__myloc__, PATH_NODES[a], PATH_NODES[b]);
            if (!best || proj.dist < best.proj.dist) best = { edge: [a, b], proj };
        });
        if (best && best.proj.dist < 500) {
            const [a, b] = best.edge;
            PATH_NODES.__myproj__ = [best.proj.x, best.proj.y];
            const dLocP = distance(PATH_NODES.__myloc__, PATH_NODES.__myproj__);
            const dPa = distance(PATH_NODES.__myproj__, PATH_NODES[a]);
            const dPb = distance(PATH_NODES.__myproj__, PATH_NODES[b]);
            graph.__myloc__.push({ to: '__myproj__', dist: dLocP });
            graph.__myproj__.push({ to: '__myloc__', dist: dLocP });
            graph.__myproj__.push({ to: a, dist: dPa });
            graph[a].push({ to: '__myproj__', dist: dPa });
            graph.__myproj__.push({ to: b, dist: dPb });
            graph[b].push({ to: '__myproj__', dist: dPb });
        } else {
            delete PATH_NODES.__myproj__;
            // 兜底：没有合适路段时直连最近的 3 个节点
            Object.keys(PATH_NODES)
                .filter(k => k !== '__myloc__')
                .map(k => ({ k, d: distance(PATH_NODES[k], PATH_NODES.__myloc__) }))
                .sort((x, y) => x.d - y.d)
                .slice(0, 3)
                .forEach(({ k, d }) => {
                    graph.__myloc__.push({ to: k, dist: d });
                    graph[k].push({ to: '__myloc__', dist: d });
                });
        }
    } else {
        delete PATH_NODES.__myloc__;
        delete PATH_NODES.__myproj__;
    }
    return graph;
}

/**
 * A* 最短路径（h = 欧氏直线距离，可采纳 → 结果与 Dijkstra 一致但更快）
 * 返回 { path: [nodeId...], totalDist }；不可达返回 null
 */
function shortestPath(graph, startId, endId) {
    if (startId === endId) return { path: [startId], totalDist: 0 };
    const g = {}, prev = {};
    const closed = new Set();
    const open = new Map();   // id -> f = g + h
    const h = (id) => distance(PATH_NODES[id], PATH_NODES[endId]);
    g[startId] = 0;
    open.set(startId, h(startId));

    while (open.size) {
        // 取 f 最小的开放节点（校园级图线性扫描足够）
        let cur = null, cf = Infinity;
        for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
        if (cur === endId) break;
        open.delete(cur);
        closed.add(cur);
        for (const e of graph[cur] || []) {
            if (closed.has(e.to)) continue;
            const ng = g[cur] + e.dist;
            if (g[e.to] === undefined || ng < g[e.to]) {
                g[e.to] = ng;
                prev[e.to] = cur;
                open.set(e.to, ng + h(e.to));
            }
        }
    }

    if (g[endId] === undefined) return null;
    const path = [];
    let c = endId;
    while (c !== undefined) { path.unshift(c); c = prev[c]; }
    return { path, totalDist: g[endId] };
}

/**
 * 备选路线（轻量 Yen 思想）：逐条移除推荐路径上的边重算，
 * 收集去重后的路径，按距离排序，最多返回 2 条且不超过推荐 1.8 倍。
 * @param {{x,y}|null} myLoc 当前「我的位置」
 * @param {object} base 推荐路线 { path, totalDist }
 */
function planRouteAlternatives(myLoc, startId, endId, base) {
    const seen = new Set([base.path.join('>')]);
    const alts = [];
    const edges = new Map();   // 去重（无向）
    for (let i = 0; i < base.path.length - 1; i++) {
        const a = base.path[i], b = base.path[i + 1];
        if (a.startsWith('__') || b.startsWith('__')) continue;   // 虚拟节点边不移除
        edges.set([a, b].sort().join('|'), [a, b]);
    }
    for (const [, e] of edges) {
        const g2 = buildGraph(myLoc, e);
        const leg = shortestPath(g2, startId, endId);
        if (!leg) continue;
        const key = leg.path.join('>');
        if (seen.has(key)) continue;
        seen.add(key);
        alts.push(leg);
        if (alts.length >= 6) break;
    }
    alts.sort((x, y) => x.totalDist - y.totalDist);
    // 评分维度：totalDist + 节点数（路口数近似）；用于 UI 标签
    alts.forEach(a => { a.crossings = Math.max(0, a.path.length - 2); });
    return alts.filter(l => l.totalDist <= base.totalDist * 1.8 + 30).slice(0, 2);
}

/**
 * 取「我的位置」到一组 POI 的最近 K 个（A* 真实步行距离）。
 * 用于在起终点 select 顶部插"最近 POI"快速选项。
 * @param {{x,y}|null} myLoc
 * @param {string[]} ids POI id 列表
 * @param {number} k
 * @returns {Array<{id:string, dist:number}>}
 */
function topNearestFrom(myLoc, ids, k = 5) {
    if (!myLoc || !ids || !ids.length) return [];
    const g = buildGraph(myLoc);
    const list = [];
    for (const id of ids) {
        if (!PATH_NODES[id]) continue;
        const leg = shortestPath(g, '__myloc__', id);
        if (leg && Number.isFinite(leg.totalDist)) {
            list.push({ id, dist: leg.totalDist });
        }
    }
    list.sort((a, b) => a.dist - b.dist);
    return list.slice(0, k);
}

/**
 * 多站点最优游览顺序（开放路径 TSP，起点固定）：
 * 最近邻贪心构造 + 2-opt 反转段改进。
 * @param {string[]} ids 站点 id 列表（含起点）
 * @param {string} startId 固定起点
 * @returns {{ order: string[], total: number, D: object }}
 */
function planTourOrder(graph, ids, startId) {
    const nodes = [startId, ...ids.filter(id => id !== startId)];
    // 全对最短路矩阵（10 站 = 45 次 A*，校园图毫秒级）
    const D = {};
    for (const a of nodes) {
        D[a] = {};
        for (const b of nodes) {
            if (a === b) { D[a][b] = 0; continue; }
            const leg = shortestPath(graph, a, b);
            D[a][b] = leg ? leg.totalDist : Infinity;
        }
    }

    // 最近邻贪心
    const rest = nodes.slice(1);
    const order = [startId];
    let cur = startId;
    while (rest.length) {
        let bi = 0, bd = Infinity;
        rest.forEach((id, i) => {
            if (D[cur][id] < bd) { bd = D[cur][id]; bi = i; }
        });
        cur = rest.splice(bi, 1)[0];
        order.push(cur);
    }

    // 2-opt：反转 order[i..j]（开放路径，起点固定不动）
    const totalOf = (arr) => {
        let s = 0;
        for (let i = 0; i < arr.length - 1; i++) s += D[arr[i]][arr[i + 1]];
        return s;
    };
    let improved = true, guard = 0;
    while (improved && guard++ < 50) {
        improved = false;
        for (let i = 1; i < order.length - 1; i++) {
            for (let j = i + 1; j < order.length; j++) {
                const rev = order.slice(i, j + 1).reverse();
                const cand = order.slice(0, i).concat(rev, order.slice(j + 1));
                if (totalOf(cand) < totalOf(order) - 0.5) {
                    order.splice(i, j - i + 1, ...rev);
                    improved = true;
                }
            }
        }
    }
    return { order, total: totalOf(order), D };
}

/** 两点距离（数据坐标系，1 单位 ≈ 1 米）。本文件为唯一定义。 */
function distance(a, b) {
    const s = (typeof SCALE_M === 'number') ? SCALE_M : 1;   // SCALE_M 由 app.js 定义
    return Math.hypot((a[0] - b[0]) * s, (a[1] - b[1]) * s);
}

/**
 * 从「我的位置」出发，按 A* 路网距离排序，取最近 k 个 POI。
 * 用于导航面板起/终点的「最近推荐」快捷项。
 * @param {{x,y}|null} myLoc 我的设备位置（含 __myloc__ 虚拟节点）
 * @param {string[]} ids 候选 POI id 列表
 * @param {number} k 取前 k 个
 * @returns {{id, d}[]} 按距离升序，d 为步行距离(米)，Infinity 表示不可达
 */
function topNearestFrom(myLoc, ids, k = 5) {
    if (!myLoc || !ids || !ids.length) return [];
    const g = buildGraph(myLoc);
    return ids
        .map(id => {
            let d = Infinity;
            try { const leg = shortestPath(g, '__myloc__', id); if (leg) d = leg.totalDist; } catch (e) {}
            return { id, d };
        })
        .sort((a, b) => a.d - b.d)
        .filter(x => x.d !== Infinity)
        .slice(0, k);
}

// 暴露为全局 Routing 命名空间（app.js 通过 Routing.* 调用）
if (typeof window !== 'undefined') {
    window.Routing = {
        buildGraph,
        shortestPath,
        planRouteAlternatives,
        planTourOrder,
        topNearestFrom,
        distance,
    };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildGraph, shortestPath, planRouteAlternatives, planTourOrder, topNearestFrom, distance };
}
