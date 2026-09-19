/* ============================================
 * app.js — 四川文轩职业学院校园地图应用
 *
 * 模块结构：
 *   1. 全局状态与常量
 *   2. 地图初始化（加载真实校园地图底图）
 *   3. 渲染建筑标记
 *   4. 侧边栏：分类标签 + 建筑列表
 *   5. 搜索功能
 *   6. 建筑信息弹窗
 *   7. 导航：Dijkstra 最短路径 + 路线绘制
 *   8. 点击地图添加新建筑
 *   9. 事件绑定与启动
 * ============================================ */

// ====== 1. 全局状态 ======
const SCALE_M = 1;  // 1 数据单位 ≈ 1 米（校园约 1000m × 500m），导航测距用

// 浏览模式底部预留（悬浮 Tab 栏等操作区，px）：
// POI 定位/浏览视野的中心会上移这段距离的一半，确保落在可视区内
const RESERVED_BOTTOM = 100;

/** 把视野中心纬度上移 RESERVED_BOTTOM/2，使目标点显示在 Tab 栏上方的可视区中央 */
function visibleCenterLat(lat, zoom) {
    const scale = Math.pow(2, zoom || 0);
    return lat - (RESERVED_BOTTOM / 2) / scale;
}


// 重点地点：始终用大号分类色圆点（图标）展示，一眼可辨
const KEY_POIS = new Set([
    'b_gate_main', 'b_gate_vehicle', 'b_fountain', 'b_canteen1',
    'b_field1', 'b_basket_main', 'b_academic',
]);

const state = {
    map: null,
    buildingMarkers: {},  // id -> L.marker
    activeCategory: 'all',
    navRouteLayer: null,
    navCasingLayer: null,    // 主路线白色描边底
    navAltLayer: null,       // 非选中备选路线图层组（淡灰底层）
    navStartMarker: null,
    navEndMarker: null,
    navAlts: null,         // 备选路线数组 [{path, totalDist}]，[0] 为推荐（最近）
    navAltSeq: null,       // 规划时的起终点序列
    navAltIdx: 0,          // 当前展示的路线下标
    tourOrder: null,       // 新生导览智能排序后的站点 id 顺序
    addMode: false,        // 是否处于「添加建筑」的模式
    pendingClickLatLng: null,
    selectedId: null,      // 当前选中的建筑（持续高亮）
    filteredIds: null,     // 当前搜索/筛选结果（null = 全部）
    mapMode: 'detail',     // 'detail' 填满屏幕浏览（可拖动） | 'overview' 完整全览
    viewZooms: { detail: null, overview: null },  // 两种模式的适配 zoom
};

// ====== 1.1 官方数据快照（地点编辑/删除/恢复的基准，必须先于任何修改建立） ======
const ORIG_POI = {};
BUILDINGS.forEach(b => { ORIG_POI[b.id] = { ...b, info: { ...b.info } }; });
const ORIG_NODES = {};
Object.entries(PATH_NODES).forEach(([k, v]) => { ORIG_NODES[k] = [...v]; });
const ORIG_EDGES = PATH_EDGES.map(e => [...e]);

// ====== 1.2 多语言显示适配（地点名 / 描述 / 分类名） ======
// 规则：官方地点（未被用户改过名字）显示 i18n 翻译名；用户自定义地点 / 被改名的地点显示原文字。
const _poiOverriddenName = new Set();   // 启动时标记：哪些官方地点被用户改过名称
function _isOfficial(b) { return !!ORIG_POI[b.id]; }
function displayName(b) {
    if (!b) return '';
    if (_isOfficial(b) && !_poiOverriddenName.has(b.id) && window.I18N) {
        // v3.40 修复：I18N.poi 无翻译时返回 id（真值），曾导致 ?? b.name 失效、列表显示 b_xxx；
        // 这里显式判断翻译是否等于 id，无翻译回退到地点原名。
        const t = window.I18N.poi(b.id);
        return (t && t !== b.id) ? t : b.name;
    }
    return b.name;
}
function displayDesc(b) {
    if (!b) return '';
    const desc = (b.info && b.info.desc) || '';
    if (_isOfficial(b) && window.I18N && !(window.Store && window.Store.getPoiOverride && window.Store.getPoiOverride(b.id))) {
        const d = window.I18N.poiDesc(b.id);
        if (d) return d;
    }
    return desc;
}
function displayCat(catKey) {
    if (window.I18N && CATEGORIES[catKey]) return window.I18N.cat(catKey) || CATEGORIES[catKey].label;
    return CATEGORIES[catKey] ? CATEGORIES[catKey].label : catKey;
}

/**
 * 启动时应用本地编辑：
 *   poiDeleted  → 从 BUILDINGS / 路网中摘除
 *   poiOverrides→ 覆盖位置 / 名称 / 分类 / 简介，并同步路网节点
 */
function applyPoiEdits() {
    const deleted = new Set(Store.data.poiDeleted || []);
    if (deleted.size) {
        for (let i = BUILDINGS.length - 1; i >= 0; i--) {
            if (deleted.has(BUILDINGS[i].id)) BUILDINGS.splice(i, 1);
        }
        deleted.forEach(id => {
            delete PATH_NODES[id];
            for (let i = PATH_EDGES.length - 1; i >= 0; i--) {
                if (PATH_EDGES[i][0] === id || PATH_EDGES[i][1] === id) PATH_EDGES.splice(i, 1);
            }
        });
    }
    Object.entries(Store.data.poiOverrides || {}).forEach(([id, ov]) => {
        const b = BUILDINGS.find(x => x.id === id);
        if (!b) return;
        if (Number.isFinite(ov.x)) b.x = ov.x;
        if (Number.isFinite(ov.y)) b.y = ov.y;
        if (ov.name) { b.name = ov.name; _poiOverriddenName.add(id); }
        if (ov.category && CATEGORIES[ov.category]) b.category = ov.category;
        if (ov.desc) b.info = { ...b.info, desc: ov.desc };
        if (PATH_NODES[id] && (Number.isFinite(ov.x) || Number.isFinite(ov.y))) {
            PATH_NODES[id] = [b.x, b.y];
        }
    });
}

/** 恢复单个官方地点到初始状态（撤销删除 + 撤销修改） */
function restorePoi(id) {
    const orig = ORIG_POI[id];
    if (!orig) return false;
    const existing = BUILDINGS.find(x => x.id === id);
    if (existing) {
        // 仅被修改 → 字段回滚
        Object.assign(existing, { ...orig, info: { ...orig.info } });
        if (ORIG_NODES[id]) PATH_NODES[id] = [...ORIG_NODES[id]];
        const marker = state.buildingMarkers[id];
        if (marker) {
            marker.setLatLng(toLatLng(existing.x, existing.y));
            marker.setIcon(buildPoiIcon(existing));
        }
    } else {
        // 被删除 → 数据 + 路网 + 标记全部加回
        const copy = { ...orig, info: { ...orig.info } };
        BUILDINGS.push(copy);
        if (ORIG_NODES[id]) PATH_NODES[id] = [...ORIG_NODES[id]];
        ORIG_EDGES.forEach(([a, b2]) => {
            if ((a === id || b2 === id) && PATH_NODES[a] && PATH_NODES[b2]
                && !PATH_EDGES.some(e => (e[0] === a && e[1] === b2) || (e[0] === b2 && e[1] === a))) {
                PATH_EDGES.push([a, b2]);
            }
        });
        createPoiMarker(copy);
    }
    Store.restoreBuiltinPoi(id);
    if (window.CampusAPI) CampusAPI.restore(id);   // 同步云端
    populateNavSelects();
    renderBuildingList(document.getElementById('searchInput')?.value || '');
    syncMarkerVisibility();
    if (AppShell._refreshPoiEditDesc) AppShell._refreshPoiEditDesc();
    return true;
}

// ====== 1.5 Toast 通知（替代原生 alert） ======
function showToast(message, type = 'info', duration = 2400) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : '💡';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

// ====== 1.5 通用小工具（转义 / 高亮 / 键盘导航） ======
/** HTML 转义，防止注入（地点名/简介/关键词均可能含特殊字符） */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 搜索结果关键词高亮：先转义再把命中片段包 <mark>（大小写不敏感，兼容拼音） */
function highlightHit(text, kw) {
    const esc = escapeHtml(text);
    const k = (kw || '').trim();
    if (!k) return esc;
    const pat = escapeHtml(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!pat) return esc;
    try {
        return esc.replace(new RegExp(pat, 'gi'), m => `<mark>${m}</mark>`);
    } catch (_) { return esc; }
}

/** 键盘 ↑↓ 在结果列表中移动高亮项，返回当前项 */
function moveKbActive(listSel, dir) {
    const items = [...document.querySelectorAll(listSel)];
    if (!items.length) return null;
    let i = items.findIndex(el => el.classList.contains('kb-active'));
    i = i < 0 ? (dir > 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
    items.forEach(el => el.classList.remove('kb-active'));
    items[i].classList.add('kb-active');
    items[i].scrollIntoView({ block: 'nearest' });
    return items[i];
}

// ====== 2. 地图初始化 ======
function initMap() {
    state.map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 3,
        zoomSnap: 0.1,       // 允许小数 zoom，避免负值取整过度
        zoomDelta: 0.5,
        zoomControl: true,
        attributionControl: false,
    });

    // 加载真实校园地图作为底图
    const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];
    L.imageOverlay('assets/campus-map.jpg?v=52', bounds).addTo(state.map);

    // —— 视野适配（折中方案：双模式）——
    // 竖屏（手机）：默认「浏览」模式 = 地图填满屏幕高度、左右拖动；
    //   右上角常驻小地图提供全貌定位，底部「全览」胶囊一键切换。
    // 横屏 / 桌面：默认「全览」模式 = 完整显示整张地图。
    const savedView = Store.data.settings.rememberView ? Store.data.mapView : null;
    let userTouched = false;
    state.map.on('dragstart', () => { userTouched = true; });

    const computeZooms = () => {
        const size = state.map.getSize();
        // 尺寸异常小视为容器尚未布局/过渡态，等待重试（真机地图容器不会小于 200px）
        if (size.x < 200 || size.y < 200) return false;
        const zFit = Math.log2(Math.min(size.x / MAP_WIDTH, size.y / MAP_HEIGHT));
        // 浏览模式缩放按「可视高度 - 底部 Tab 栏(74px) - 余量」计算，
        // 地图垂直居中时底边也落在 Tab 栏上方，南侧内容不被遮挡
        const zFill = Math.log2((size.y - 152) / MAP_HEIGHT);
        // ⚠️ 必须向下取整：向上会让地图略超出屏幕，裁掉边缘（校门被切）
        state.viewZooms.overview = Math.max(Math.floor(zFit * 10) / 10, -2);
        state.viewZooms.detail = Math.max(
            Math.floor(Math.max(zFit, size.y > size.x ? zFill : zFit) * 10) / 10, -2);
        return true;
    };

    const applyInitialView = () => {
        if (userTouched) return true;           // 用户已交互，不再自动重置视野
        state.map.invalidateSize();
        if (!computeZooms()) return false;      // 容器尚未布局完成，等待重试
        const size = state.map.getSize();

        // 启动视野：无条件「全览」完整显示整张地图（横竖屏、桌面一致）。
        // 仅当用户在设置里关闭「启动时完整显示」且为手机竖屏时，
        // 才恢复上次浏览位置（zoom 限定在合理区间，桌面端永不恢复）。
        const savedOK = savedView
            && [savedView.zoom, savedView.lat, savedView.lng].every(Number.isFinite);
        const restorePos = Store.data.settings.rememberView === false
            && savedOK && size.y > size.x;

        if (!restorePos) {
            state.mapMode = 'overview';
            state.map.setView([MAP_HEIGHT / 2, MAP_WIDTH / 2], state.viewZooms.overview);
        } else {
            const wantDetail = savedView.zoom > state.viewZooms.overview + 0.05;
            state.mapMode = wantDetail ? 'detail' : 'overview';
            const zMin = wantDetail ? state.viewZooms.detail : state.viewZooms.overview;
            const z = Math.min(Math.max(savedView.zoom, zMin), 3);
            const cLat = wantDetail ? visibleCenterLat(savedView.lat, z) : savedView.lat;
            state.map.setView([cLat, savedView.lng], z);
        }
        updateViewToggle();
        updateOverviewPiP();
        updateZoomTiers();
        return true;
    };

    // 容器尺寸在布局过程中可能多次变化（CSS 异步/图片加载），
    // 无条件多轮重新适配，直到布局稳定；用户一旦交互即停止
    applyInitialView();
    requestAnimationFrame(applyInitialView);
    [250, 600, 1200, 2000].forEach(ms => setTimeout(applyInitialView, ms));

    // 记住地图视野：低于全览 zoom 的视野属于过渡态/坏数据，不保存
    state.map.on('moveend zoomend', () => {
        if (!Store.data.settings.rememberView) return;
        const z = state.map.getZoom();
        if (state.viewZooms.overview != null && z < state.viewZooms.overview - 0.01) return;
        const c = state.map.getCenter();
        Store.data.mapView = { lat: c.lat, lng: c.lng, zoom: z };
        Store.save();
    });

    // 自愈：任何路径把视野带到比全览还小（异常缩小）且用户未交互时，重置到适配视野
    const healView = () => {
        if (userTouched) return;
        const z = state.map.getZoom();
        if (state.viewZooms.overview != null && z < state.viewZooms.overview - 0.01) {
            applyInitialView();
        }
    };
    state.map.on('zoomend', healView);

    // 视野/缩放变化 → 同步小地图取景框 + 圆点分层
    state.map.on('move zoom viewreset resize', updateOverviewPiP);
    state.map.on('zoomend viewreset', updateZoomTiers);
    updateZoomTiers();

    // 窗口尺寸 / 旋转跨过竖屏边界 → 重新适配（防抖，避开过渡态尺寸）
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!userTouched) applyInitialView();
        }, 180);
    });

    // 禁止拖出地图范围（竖向贴边，横向留 30 单位余量）
    state.map.setMaxBounds([[-280, -40], [MAP_HEIGHT + 160, MAP_WIDTH + 40]]);

    // 交给 App 壳层管理（我的位置选点等）
    AppShell.setMap(state.map);
}

/** 底部胶囊按钮：浏览（显示「全览」）/ 全览（显示「放大浏览」） */
const ICON_VIEW_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const ICON_VIEW_ZOOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>';
function updateViewToggle() {
    const btn = document.getElementById('viewToggle');
    if (!btn) return;
    btn.innerHTML = state.mapMode === 'detail' ? ICON_VIEW_EXPAND + '全览' : ICON_VIEW_ZOOM + '放大浏览';
    btn.setAttribute('aria-label',
        state.mapMode === 'detail' ? '切换到完整全览' : '放大浏览校园');
    // 横屏/桌面下两模式视野一致，切换无意义 → 隐藏
    const sameZoom = state.viewZooms.detail != null
        && Math.abs(state.viewZooms.detail - state.viewZooms.overview) < 0.05;
    btn.classList.toggle('no-alt', !!sameZoom);
}

function setMapMode(mode) {
    if (!state.map || state.mapMode === mode) return;
    state.mapMode = mode;
    if (mode === 'overview') {
        state.map.setView([MAP_HEIGHT / 2, MAP_WIDTH / 2], state.viewZooms.overview);
    } else {
        // 浏览模式：视野中心上移，地图底边收在底部操作区上方
        const c = state.map.getCenter();
        state.map.setView([visibleCenterLat(c.lat, state.viewZooms.detail), c.lng],
            state.viewZooms.detail);
    }
    updateViewToggle();
    updateOverviewPiP();
}

/** 右上角小地图：显示整校 + 当前取景框（仅浏览模式下出现） */
function updateOverviewPiP() {
    const pip = document.getElementById('mapOverview');
    if (!pip || !state.map) return;
    const useful = state.mapMode === 'detail'
        && state.viewZooms.detail != null
        && state.viewZooms.detail > state.viewZooms.overview + 0.05;
    pip.classList.toggle('visible', !!useful);
    if (!useful) return;

    const b = state.map.getBounds();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const x0 = clamp(b.getWest() / MAP_WIDTH, 0, 1) * 100;
    const x1 = clamp(b.getEast() / MAP_WIDTH, 0, 1) * 100;
    const yTop = clamp((MAP_HEIGHT - b.getNorth()) / MAP_HEIGHT, 0, 1) * 100;
    const yBot = clamp((MAP_HEIGHT - b.getSouth()) / MAP_HEIGHT, 0, 1) * 100;
    const rect = pip.querySelector('.ov-rect');
    rect.style.left = x0 + '%';
    rect.style.top = yTop + '%';
    rect.style.width = Math.max(3, x1 - x0) + '%';
    rect.style.height = Math.max(3, yBot - yTop) + '%';
}

/** v3.38：路网连通性修复（官方化的 59 点中多数只有节点、没有边）。
 *  策略：以学院大门为起点求主连通分量；不在主分量里的点，
 *  连到主分量内最近的节点并立即并入主分量（保证全图可达，无孤岛链）。 */
function ensureEntryNodes() {
    const adj = {};
    PATH_EDGES.forEach(([a, b2]) => {
        if (!PATH_NODES[a] || !PATH_NODES[b2]) return;
        (adj[a] = adj[a] || []).push(b2);
        (adj[b2] = adj[b2] || []).push(a);
    });
    // 主连通分量（BFS from 学院大门）
    const main = new Set(['b_gate_main']);
    const queue = ['b_gate_main'];
    while (queue.length) {
        const cur = queue.shift();
        (adj[cur] || []).forEach(n => { if (!main.has(n)) { main.add(n); queue.push(n); } });
    }
    // 孤岛点 → 连到主分量最近节点（补完即并入，供后续点使用）
    BUILDINGS.forEach(b => {
        if (!PATH_NODES[b.id]) PATH_NODES[b.id] = [b.x, b.y];
        if (main.has(b.id)) return;
        let minD = Infinity, nearest = null;
        for (const nid of main) {
            const d = distance([b.x, b.y], PATH_NODES[nid]);
            if (d < minD) { minD = d; nearest = nid; }
        }
        if (nearest) {
            PATH_EDGES.push([b.id, nearest]);
            main.add(b.id);
            (adj[b.id] = adj[b.id] || []).push(nearest);
        }
    });
}

/** 恢复用户自定义地标：加入 BUILDINGS / 渲染标记 / 挂导航节点 */
function restoreCustomBuildings() {
    Store.data.custom.forEach(b => {
        BUILDINGS.push(b);
        createPoiMarker(b);
        addEntryNodeForBuilding(b.id, b.x, b.y);
    });
}

/**
 * POI 标记 = 分类色圆点（常显，定位用途）
 *   + 名称牌（按需显示：选中 / 搜索筛选命中时才出现）
 * 名称主力在底图上（原版导视注记），marker 保持轻量不与之重复。
 * 分层：poi-key 重点地点常显；poi-t2 生活服务小点仅放大后出现，
 *       避免低缩放下圆点堆积显乱。
 */
function buildPoiIcon(b) {
    const cat = CATEGORIES[b.category] || CATEGORIES.service;
    const isKey = KEY_POIS.has(b.id);
    const tier2 = b.category === 'service' && !isKey;
    return L.divIcon({
        className: '',
        html: `<div class="poi ${isKey ? 'poi-key' : ''} ${tier2 ? 'poi-t2' : ''}" style="--c:${cat.color}" data-id="${b.id}">
                    <div class="poi-chip">${displayName(b)}</div>
                    <div class="poi-dot">${isKey ? cat.icon : ''}</div>
               </div>`,
        iconSize: [44, 64],
        iconAnchor: [22, 52],   // 圆点中心精准钉在建筑坐标上
    });
}

function createPoiMarker(b) {
    const marker = L.marker(toLatLng(b.x, b.y), { icon: buildPoiIcon(b) }).addTo(state.map);
    state.buildingMarkers[b.id] = marker;
    marker.on('click', () => {
        if (editState.suppressClick) return;   // 刚拖完/长按弹完不触发详情
        showBuildingInfo(b.id);
    });
    // 长按 480ms / 右键 → 锚定玻璃气泡（从这里出发 / 到这里去 / 收藏 / 详情）
    attachPoiLongPress(marker, b.id);
    // 编辑模式下拖动圆点直接改位置（移动端长按拖动）
    marker.on('dragend', () => {
        if (editState.moveArmed && editState.id === b.id) {
            const ll = marker.getLatLng();
            editState.suppressClick = true;
            setTimeout(() => { editState.suppressClick = false; }, 350);
            finishPoiMove(ll.lng, MAP_HEIGHT - ll.lat);
        } else {
            marker.setLatLng(toLatLng(b.x, b.y));   // 非编辑态拖回原点
        }
    });
    return marker;
}

/** 缩放分层：低于浏览 zoom（含全览/桌面默认）只显重点点；
 *  接近浏览 zoom 时显示楼栋、隐藏生活服务小点；放大后全显 */
function updateZoomTiers() {
    if (!state.map) return;
    const z = state.map.getZoom();
    const tier = z < 0 ? 'low' : z < 0.15 ? 'mid' : 'high';
    state.map.getContainer().dataset.tier = tier;
}

/** 删除地点（自定义地标彻底移除；官方地点标记为本地删除，可在设置中恢复） */
function deleteBuilding(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    const isCustom = id.startsWith('b_user_');

    // 移除地图标记
    const marker = state.buildingMarkers[id];
    if (marker) {
        state.map.removeLayer(marker);
        delete state.buildingMarkers[id];
    }

    // 移除导航节点及相连边（官方点 = 自身 id；自定义点 = entry_ 前缀）
    const nodeIds = [id, `entry_${id}`];
    nodeIds.forEach(nid => { delete PATH_NODES[nid]; });
    for (let i = PATH_EDGES.length - 1; i >= 0; i--) {
        if (nodeIds.includes(PATH_EDGES[i][0]) || nodeIds.includes(PATH_EDGES[i][1])) {
            PATH_EDGES.splice(i, 1);
        }
    }
    populateNavSelects();

    // 移除数据
    const idx = BUILDINGS.findIndex(x => x.id === id);
    if (idx >= 0) BUILDINGS.splice(idx, 1);
    if (isCustom) Store.removeCustom(id);
    else Store.deleteBuiltinPoi(id);
    if (window.CampusAPI) CampusAPI.remove(id);   // 同步云端

    // 清选中态并刷新列表
    if (state.selectedId === id) {
        state.selectedId = null;
        closeInfoModal();
    }
    renderBuildingList(document.getElementById('searchInput')?.value || '');
    if (AppShell._refreshPoiEditDesc) AppShell._refreshPoiEditDesc();
    showToast(isCustom ? `已删除「${displayName(b)}」` : `已删除「${displayName(b)}」（可在设置中恢复）`, 'success');
}

// ====== 3. 渲染建筑标记 ======
function renderBuildings() {
    BUILDINGS.forEach(b => createPoiMarker(b));
}

// ====== 4. 侧边栏渲染 ======

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    let html = `<button type="button" class="cat-tag active" data-cat="all">${window.I18N ? window.I18N.t('list.all') : '全部'}</button>`;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
        html += `<button type="button" class="cat-tag" data-cat="${key}">${cat.icon} ${displayCat(key)}</button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.cat-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            container.querySelectorAll('.cat-tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            state.activeCategory = tag.dataset.cat;
            renderBuildingList(document.getElementById('searchInput')?.value || '');
        });
    });
}

function renderBuildingList(keyword = '') {
    const container = document.getElementById('buildingList');
    const kw = keyword.trim().toLowerCase();

    let buildings = BUILDINGS;
    if (state.activeCategory !== 'all') {
        buildings = buildings.filter(b => b.category === state.activeCategory);
    }
    if (kw) {
        buildings = buildings.filter(b => matchBuilding(b, kw));
    }

    // 地图联动：非匹配标记淡出（全部时恢复）
    state.filteredIds = (state.activeCategory === 'all' && !kw)
        ? null
        : new Set(buildings.map(b => b.id));
    syncMarkerVisibility();

    // 结果计数
    const countEl = document.getElementById('resultCount');
    const total = BUILDINGS.length;
    if (state.activeCategory === 'all' && !kw) {
        countEl.innerHTML = (window.I18N ? window.I18N.t('list.count', {n: total}) : `共 <b>${total}</b> 个地点`);
    } else {
        countEl.innerHTML = (window.I18N ? window.I18N.t('list.found', {n: buildings.length, total: total}) : `找到 <b>${buildings.length}</b> / ${total} 个地点`);
    }

    if (buildings.length === 0) {
        container.innerHTML = `<div class="empty-result">${window.I18N ? window.I18N.t('list.empty') : '未找到匹配的建筑'}<br><small>${window.I18N ? window.I18N.t('list.empty.hint') : '💡 试试其他关键词，或点右下角 ➕ 添加新地点'}</small></div>`;
        return;
    }

    let html = '';
    buildings.forEach(b => {
        const cat = CATEGORIES[b.category];
        html += `
            <div class="building-item" data-id="${b.id}" role="button" tabindex="0"
                 aria-label="查看 ${displayName(b)} 详情">
                <div class="building-icon" style="background:${cat.color}20;color:${cat.color}">${cat.icon}</div>
                <div class="building-info">
                    <div class="building-name">${highlightHit(displayName(b), kw)}</div>
                    <div class="building-desc">${highlightHit(displayDesc(b).slice(0, 24), kw)}...</div>
                </div>
            </div>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.building-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            flyToBuilding(id);
            showBuildingInfo(id);
        });
        // 键盘可达：Enter / 空格 触发
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const id = item.dataset.id;
                flyToBuilding(id);
                showBuildingInfo(id);
            }
        });
    });
}

/**
 * 地图标记与列表联动：
 * - filteredIds 为 null 时全部显示为圆点（名称由底图承载）
 * - 有筛选/搜索时：命中点显示名称牌并保持高亮，未命中淡出
 * - 选中的建筑始终显示名称牌 + 高亮圈
 */
function syncMarkerVisibility() {
    BUILDINGS.forEach(b => {
        const marker = state.buildingMarkers[b.id];
        if (!marker) return;
        const el = marker.getElement();
        if (!el) return;
        const inner = el.querySelector('.poi');
        if (!inner) return;

        const matched = state.filteredIds !== null && state.filteredIds.has(b.id);
        const isDimmed = state.filteredIds !== null && !matched;
        inner.classList.toggle('show-name', matched || state.selectedId === b.id);
        inner.classList.toggle('dimmed', isDimmed);
        inner.classList.toggle('selected', state.selectedId === b.id);
    });
}

// ====== 4.9 搜索索引：别名 + 拼音 + 数字/简称归一 ======
const SEARCH_ALIASES = {
    b_gate_main: ['大门', '正门', '校门', '南门', '门口', 'damen', 'zhengmen', 'xiaomen'],
    b_gate_vehicle: ['车辆入口', '车道', 'cheliang', 'churukou', 'chekou'],
    b_fountain: ['喷泉', '水景', '广场', 'penquan'],
    b_academic: ['报告厅', '讲座', '报告', 'xueshu', 'baogaoting'],
    b_yanyi: ['剧院', '礼堂', '晚会', '演出', 'yanyi', 'juyuan', 'litang'],
    b_basket_main: ['篮球馆', '主场', '球馆', 'lanqiu', 'lanqiuguan'],
    b_basket_outdoor: ['外场', '露天球场', 'lanqiuchang'],
    b_field1: ['田径场', '操场', '跑道', '运动场', 'caochang', 'tianjing', 'yundong', 'zuqiu'],
    b_field2: ['北操场', 'zuqiuchang', 'tianjingchang'],
    b_canteen1: ['一食堂', '一餐', '1食堂', 'shitang', 'canting', '食堂', '餐厅'],
    b_canteen2: ['二食堂', '二餐', '2食堂'],
    b_canteen3: ['三食堂', '三餐', '3食堂'],
    b_medical: ['校医', '医院', '诊所', '看病', '买药', 'yiwu', 'yiyuan', 'xiaoyi'],
    b_express: ['菜鸟', '驿站', '取快递', '寄快递', 'kuaidi', 'yizhan', 'cainiao'],
    b_supermarket: ['超市', '商店', '小卖部', '便利店', 'chaoshi', 'shangdian'],
    b_parking: ['停车', '车位', 'tingche', 'tingchechang'],
    b_luggage: ['行李', '寄存', '托运', '发放', '领行李', 'xingli', 'fafang', 'luggage'],
    b_water: ['取水', '水站', '桶装水', '饮用水', '打水', 'qushui'],
    b_teach1: ['1教', '一教', 'yijiao'],
    b_teach2: ['2教', '二教'],
    b_teach4: ['4教', '四教', '机房', '阶梯教室'],
    b_teach5: ['5教', '五教'],
    b_teach6: ['6教', '六教'],
    b_train3: ['3实', '实训3'],
    b_train8: ['8实', '实训8', '实训大楼'],
};

const CAT_PINYIN = {
    gate: ['damen', 'men'], teaching: ['jiaoxue', 'jx'], training: ['shixun', 'sx'],
    dorm: ['sushe', 'ss'], faculty: ['jiaogong', 'jg', 'jiaoshi'],
    canteen: ['shitang', 'st', 'canting'], sports: ['yundong', 'yd', 'qiuchang'],
    landmark: ['dibiao', 'db'], service: ['fuwu', 'fw'], academic: ['xueshu', 'xs'],
};

const CN_DIGIT = '一二三四五六七八九十';

// 数字别名的后缀按分类定制，避免「1号教学楼」误挂「1食堂」别名
const CAT_NUM_ALIAS = {
    teaching: { suffix: ['教', '号楼', '号'], prefix: ['教学'], cn: ['教'] },
    training: { suffix: ['实', '号楼', '号'], prefix: ['实训'], cn: ['实'] },
    dorm:     { suffix: ['栋', '舍', '号'],   prefix: ['宿舍'], cn: ['栋', '舍'] },
    faculty:  { suffix: ['栋', '号'],          prefix: ['教工'], cn: ['栋'] },
    canteen:  { suffix: ['食堂', '餐', '餐厅'], prefix: ['食堂'], cn: ['食堂', '餐'] },
    sports:   { suffix: ['馆', '场'],           prefix: [],       cn: ['馆'] },
    gate:     { suffix: ['号'],                 prefix: [],       cn: [] },
    landmark: { suffix: [], prefix: [], cn: [] },
    service:  { suffix: [], prefix: [], cn: [] },
    academic: { suffix: [], prefix: [], cn: [] },
};

/** 为单个建筑构建搜索串（懒构建，新增自定义地标也会自动补） */
function indexBuilding(b) {
    const parts = [b.name, (b.info && b.info.desc) || '', (SEARCH_ALIASES[b.id] || []).join(' ')];
    const cat = CATEGORIES[b.category];
    if (cat) parts.push(cat.label, ...(CAT_PINYIN[b.category] || []));
    // 多语言：加入当前语言的翻译名 / 描述 / 分类名，使非中文用户也能搜到
    if (window.I18N) {
        const trName = window.I18N.poi(b.id); if (trName && trName !== b.name) parts.push(trName);
        const trDesc = window.I18N.poiDesc(b.id); if (trDesc) parts.push(trDesc);
        if (cat) { const trCat = window.I18N.cat(b.category); if (trCat) parts.push(trCat); }
    }
    const m = b.name.match(/(\d{1,2})/);
    if (m) {
        const n = m[1];
        const conf = CAT_NUM_ALIAS[b.category] || { suffix: ['号'], prefix: [], cn: [] };
        parts.push(...conf.suffix.map(s => n + s), ...conf.prefix.map(p => p + n));
        for (const p of (CAT_PINYIN[b.category] || [])) parts.push(p + n);
        const cn = CN_DIGIT[parseInt(n, 10) - 1];
        if (cn) parts.push(...conf.cn.map(s => cn + s));
    }
    b._search = parts.join(' ').toLowerCase().replace(/#/g, '');
}

/** 统一匹配入口：支持空格分隔多关键词（全部命中才算） */
function matchBuilding(b, keyword) {
    if (!b._search) indexBuilding(b);
    const kw = (keyword || '').trim().toLowerCase().replace(/#/g, '');
    if (!kw) return true;
    return kw.split(/\s+/).every(k => b._search.includes(k));
}

// ====== 5. 搜索 ======
function handleSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    if (!input) return;  // 地点页搜索框已被移除，跳过绑定

    input.addEventListener('input', () => {
        clearBtn.classList.toggle('hidden', input.value === '');
        renderBuildingList(input.value);
    });

    // 清空按钮
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        renderBuildingList('');
        input.focus();
    });

    // 搜索按钮：直达选中/第一个结果（与 Enter 一致），无结果给提示
    document.getElementById('searchGo')?.addEventListener('click', () => {
        if (!input.value.trim()) { input.focus(); return; }
        const target = document.querySelector('#buildingList .building-item.kb-active')
            || document.querySelector('#buildingList .building-item');
        if (target) {
            target.click();
        } else if (typeof showToast === 'function') {
            showToast('未找到相关地点，换个关键词试试', 'info', 2200);
        }
    });

    // 输入框内 ESC = 清空，Enter = 直达选中/第一个结果，↑↓ = 在结果间移动
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) {
            e.stopPropagation();
            input.value = '';
            clearBtn.classList.add('hidden');
            renderBuildingList('');
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveKbActive('#buildingList .building-item', e.key === 'ArrowDown' ? 1 : -1);
        }
        if (e.key === 'Enter') {
            const target = document.querySelector('#buildingList .building-item.kb-active')
                || document.querySelector('#buildingList .building-item');
            if (target) target.click();
        }
    });

    // 全局快捷键：/ 聚焦搜索（桌面）
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== input
            && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            input.focus();
            input.select();
        }
    });
}

// ====== 5.5 手机全屏搜索浮层（收纳式入口） ======
const soState = { kw: '', cat: 'all' };

function openSearchOverlay() {
    const ov = document.getElementById('searchOverlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    ov.classList.add('open');
    soState.kw = '';
    soState.cat = 'all';
    renderSearchOverlay();
    setTimeout(() => document.getElementById('soInput')?.focus(), 120);
}

function closeSearchOverlay() {
    const ov = document.getElementById('searchOverlay');
    if (!ov) return;
    ov.classList.add('hidden');
    ov.classList.remove('open');
}

function initSearchOverlay() {
    const ov = document.getElementById('searchOverlay');
    if (!ov) return;

    document.getElementById('searchFab')?.addEventListener('click', openSearchOverlay);
    document.getElementById('soClose')?.addEventListener('click', closeSearchOverlay);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeSearchOverlay(); });

    const input = document.getElementById('soInput');
    input.addEventListener('input', () => {
        soState.kw = input.value.trim();
        document.getElementById('soClear')?.classList.toggle('hidden', !soState.kw);
        renderSearchResults();
    });
    // 回车直达选中/第一个结果（手机键盘「搜索」键），↑↓ 移动高亮
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveKbActive('#soResults .so-result', e.key === 'ArrowDown' ? 1 : -1);
        }
        if (e.key === 'Enter') {
            const target = document.querySelector('#soResults .so-result.kb-active')
                || document.querySelector('#soResults .so-result');
            if (target) target.click();
        }
    });
    document.getElementById('soClear')?.addEventListener('click', () => {
        input.value = '';
        soState.kw = '';
        document.getElementById('soClear').classList.add('hidden');
        renderSearchResults();
        input.focus();
    });

    // 搜索按钮：直达选中/第一个结果（结果点击自带关闭浮层+定位），无结果给提示
    document.getElementById('soGo')?.addEventListener('click', () => {
        if (!soState.kw) { input.focus(); return; }
        const target = document.querySelector('#soResults .so-result.kb-active')
            || document.querySelector('#soResults .so-result');
        if (target) {
            target.click();
        } else if (typeof showToast === 'function') {
            showToast('未找到相关地点，换个关键词试试', 'info', 2200);
        }
    });

    // 分类 chips（全部 + 各分类）
    const cats = document.getElementById('soCats');
    let html = `<button class="so-cat active" data-cat="all">${window.I18N ? window.I18N.t('list.all') : '全部'}</button>`;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
        html += `<button class="so-cat" data-cat="${key}">${cat.icon} ${displayCat(key)}</button>`;
    }
    cats.innerHTML = html;
    cats.addEventListener('click', (e) => {
        const btn = e.target.closest('.so-cat');
        if (!btn) return;
        cats.querySelectorAll('.so-cat').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        soState.cat = btn.dataset.cat;
        renderSearchResults();
    });
}

/** 搜索历史区（无关键词时显示最近 8 条） */
function renderSearchHistory() {
    const box = document.getElementById('soHist');
    if (!box) return;
    const hist = Store.data.searchHistory || [];
    if (!hist.length || soState.kw) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="so-hist-head"><span>最近搜索</span><button id="soHistClear">清空</button></div>`
        + `<div class="so-hist-chips">` + hist.map(k =>
            `<button class="so-hist-chip" data-kw="${k.replace(/"/g, '&quot;')}">⏱ ${k}</button>`).join('') + `</div>`;
    box.querySelector('#soHistClear')?.addEventListener('click', () => {
        Store.clearSearchHistory();
        renderSearchHistory();
    });
    box.querySelectorAll('.so-hist-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const input = document.getElementById('soInput');
            input.value = chip.dataset.kw;
            soState.kw = chip.dataset.kw;
            document.getElementById('soClear')?.classList.remove('hidden');
            renderSearchResults();
        });
    });
}

function renderSearchOverlay() {
    const input = document.getElementById('soInput');
    if (input) input.value = soState.kw;
    document.getElementById('soClear')?.classList.toggle('hidden', !soState.kw);
    document.querySelectorAll('#soCats .so-cat').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === soState.cat);
    });
    renderSearchHistory();
    renderSearchResults();
}

function renderSearchResults() {
    renderSearchHistory();
    const box = document.getElementById('soResults');

    // 无关键词 → 显示搜索历史，不列全部
    if (!soState.kw) {
        const hist = Store.data.searchHistory || [];
        box.innerHTML = hist.length
            ? `<div class="so-empty">输入关键词或点上方历史记录</div>`
            : `<div class="so-empty">输入关键词搜索，如「食堂」「宿舍」「篮球」</div>`;
        return;
    }

    let list = BUILDINGS;
    if (soState.cat !== 'all') list = list.filter(b => b.category === soState.cat);
    const kw = soState.kw.toLowerCase();
    list = list.filter(b => matchBuilding(b, kw));

    if (list.length === 0) {
        box.innerHTML = `<div class="so-empty">没有找到匹配的地点<br><small>换个关键词试试</small></div>`;
        return;
    }

    box.innerHTML = list.map(b => {
        const cat = CATEGORIES[b.category] || CATEGORIES.service;
        return `<div class="so-result" data-id="${b.id}" role="button" tabindex="0">
            <div class="so-result-icon" style="background:${cat.color}1f">${cat.icon}</div>
            <div style="min-width:0">
                <div class="so-result-name">${highlightHit(displayName(b), soState.kw)}</div>
                <div class="so-result-desc">${highlightHit(displayDesc(b), soState.kw)}</div>
            </div>
        </div>`;
    }).join('');

    box.querySelectorAll('.so-result').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.id;
            if (soState.kw) Store.pushSearch(soState.kw);
            closeSearchOverlay();
            flyToBuilding(id);
            showBuildingInfo(id);
        });
    });
}

// ====== 6. 建筑信息弹窗 ======
function flyToBuilding(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    // 定位到建筑时使用「浏览」级 zoom，保证名称与细节可读
    const flyZoom = Math.max(state.viewZooms.detail ?? 1, 0.8);
    const t = toLatLng(b.x, b.y);
    state.map.flyTo([visibleCenterLat(t[0], flyZoom), t[1]], flyZoom, { duration: 0.6 });
}

/** 选中某建筑：地图标记持续高亮 */
function selectBuilding(id) {
    state.selectedId = id;
    syncMarkerVisibility();
}

function showBuildingInfo(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    selectBuilding(id);
    Store.pushHistory(id, b.name);
    const cat = CATEGORIES[b.category];
    const content = document.getElementById('info-content');
    const isFav = Store.isFav(id);
    const isCustom = b.id.startsWith('b_user_');
    const T = window.I18N ? window.I18N.t.bind(window.I18N) : (k) => k;

    content.innerHTML = `
        <div class="info-header">
            <div class="info-icon" style="background:${cat.color}20">${cat.icon}</div>
            <div class="info-title">
                <h2>${displayName(b)}</h2>
                <span class="tag">${displayCat(b.category)}${isCustom ? ' · ' + T('info.mine') : ''}</span>
            </div>
            <button class="btn-fav ${isFav ? 'faved' : ''}" id="favBtn"
                    aria-label="${isFav ? T('info.del.confirm') : T('info.fav')}" title="${T('info.fav')}">${isFav ? '⭐' : '☆'}</button>
        </div>
        <p class="info-desc">${displayDesc(b)}</p>
        <!-- 详情元信息（可折叠胶囊） -->
        <div class="info-meta-collapse" id="infoMetaCollapse">
            <button class="info-meta-toggle" id="infoMetaToggle" aria-expanded="true">
                <span>${T('info.meta')}</span><span class="im-arrow">▾</span>
            </button>
            <div class="info-meta" id="infoMetaBody">
                <div class="info-meta-row"><span class="meta-label">🕐 ${T('info.hours')}</span><span>${b.info.hours}</span></div>
                <div class="info-meta-row"><span class="meta-label">📞 ${T('info.phone')}</span><span>${b.info.phone}</span></div>
                <div class="info-meta-row"><span class="meta-label">🏢 ${T('info.floors')}</span><span>${b.info.floors}</span></div>
            </div>
        </div>
        <div class="info-actions">
            <button class="btn-nav" onclick="setNavEndpoint('${id}', 'end')">🎯 ${T('info.to')}</button>
            <button class="btn-amap" onclick="openAmapNav('${id}')">🗺️ ${T('info.amap')}</button>
        </div>
        <div class="info-actions info-actions-secondary">
            <button class="btn-share" id="shareBtn">🔗 ${T('info.share')}</button>
        </div>
                <div class="info-actions info-actions-manage">
            <button class="btn-edit" id="editBtn">✏️ ${T('info.edit')}</button>
            <button class="btn-delete" id="delBtn">🗑️ ${T('info.del')}</button>
        </div>
        <div class="info-note">
            <label for="noteText">📝 ${T('info.note')}</label>
            <textarea id="noteText" maxlength="100" rows="2"
                placeholder="${T('info.note.ph')}">${Store.getNote(id).replace(/</g, '&lt;')}</textarea>
            <span class="note-hint" id="noteHint">${Store.getNote(id) ? T('info.note.saved') : T('info.note.local')}</span>
        </div>
        <div class="info-feedback">
            <button class="info-fb-link" id="poiFeedbackBtn">📝 ${T('poi.feedback.entry')}</button>
        </div>
    `;
    ensureSheetHandle(content);   // 手势抽屉手柄（innerHTML 会重建，需补挂）
    document.getElementById('info-modal').classList.remove('hidden');

    // 折叠元信息胶囊
    const metaToggle = document.getElementById('infoMetaToggle');
    const metaBody = document.getElementById('infoMetaBody');
    if (metaToggle && metaBody) {
        metaToggle.addEventListener('click', () => {
            const collapsed = metaBody.classList.toggle('collapsed');
            metaToggle.setAttribute('aria-expanded', String(!collapsed));
            metaToggle.querySelector('.im-arrow').textContent = collapsed ? '▸' : '▾';
        });
    }

    // 收藏切换
    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
        favBtn.addEventListener('click', () => {
            const nowFav = Store.toggleFav(id);
            favBtn.textContent = nowFav ? '⭐' : '☆';
            favBtn.classList.toggle('faved', nowFav);
            favBtn.setAttribute('aria-label', nowFav ? T('info.del.confirm') : T('info.fav'));
            showToast(nowFav ? T('info.faved', {name: displayName(b)}) : T('info.unfav'), 'success', 1600);
        });
    }

    // 分享：生成 ?poi= 深链，优先系统分享，失败则复制到剪贴板
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            const url = `${location.origin}${location.pathname}?poi=${id}`;
            try {
                if (navigator.share) {
                    await navigator.share({ title: `${T('info.share.title')}·${displayName(b)}`, text: displayDesc(b), url });
                    return;
                }
                await navigator.clipboard.writeText(url);
                showToast(T('info.share.copied'), 'success', 2200);
            } catch (e) {
                if (e && e.name === 'AbortError') return;   // 用户取消系统分享
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    showToast('链接已复制，发给同学就能直达这里', 'success', 2200);
                } catch (_) {
                    showToast('复制失败，请手动复制地址栏链接', 'error', 2400);
                }
                ta.remove();
            }
        });
    }

    // 编辑（全部地点：改名/分类/简介/移点/删除/恢复默认）
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditPanel(id));
    }

    // 删除：第一次点进入确认态，第二次执行
    const delBtn = document.getElementById('delBtn');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            if (!delBtn.dataset.armed) {
                delBtn.dataset.armed = '1';
                delBtn.textContent = '⚠️ 再点一次确认';
                setTimeout(() => {
                    delete delBtn.dataset.armed;
                    delBtn.textContent = '🗑️ 删除';
                }, 2600);
                return;
            }
            deleteBuilding(id);
        });
    }

    // 我的备注（本机保存）
    const noteText = document.getElementById('noteText');
    if (noteText) {
        let timer = null;
        noteText.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                Store.setNote(id, noteText.value);
                const hint = document.getElementById('noteHint');
                if (hint) hint.textContent = noteText.value.trim() ? '已保存 ✓' : '仅保存在本机';
            }, 400);
        });
    }

    // v3.21：地点数据报错入口（无需登录）
    const fbBtn = document.getElementById('poiFeedbackBtn');
    if (fbBtn) {
        fbBtn.addEventListener('click', () => openPoiFeedback(id));
    }

    // 焦点移到关闭按钮，保证键盘用户能立即操作
    const closeBtn = document.querySelector('#info-modal .modal-close');
    if (closeBtn) closeBtn.focus();
}

function closeInfoModal() {
    const modal = document.getElementById('info-modal');
    modal.classList.add('hidden');
    // 手势抽屉状态复位（拖拽中途关闭也要清干净）
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.classList.remove('sheet-full');
        content.style.transform = '';
        content.style.transition = '';
        content.style.animation = '';
    }
    state.selectedId = null;
    syncMarkerVisibility();
}

// ====== 6.1 热门地点快捷 chips（v3.21） ======
// 高频地点按语义匹配，而非依赖一组会被云端数据覆盖的固定 id。
// 这样即使管理员合并、替换或迁移 POI，入口也不会静默消失。
const QUICK_POIS = [
    { icon: '🍴', key: 'quick.canteen', fallback: '食堂', matches: b => b.category === 'canteen' || /食堂|餐厅|美食/.test(b.name) },
    { icon: '📦', key: 'quick.express', fallback: '快递站', matches: b => /快递/.test(b.name) },
    { icon: '⚽', key: 'quick.field',   fallback: '运动场', matches: b => b.category === 'sports' || /运动场|足球场/.test(b.name) },
    { icon: '⛑', key: 'quick.medical', fallback: '医务室', matches: b => /医务|医疗|卫生/.test(b.name) },
];

function renderQuickChips() {
    const wrap = document.getElementById('quickChips');
    if (!wrap) return;
    const T = window.I18N ? window.I18N.t.bind(window.I18N) : (k) => k;
    wrap.innerHTML = QUICK_POIS
        .map(q => ({ q, poi: BUILDINGS.find(q.matches) }))
        .filter(({ poi }) => poi)
        .map(({ q, poi }) =>
            `<button class="quick-chip" data-poi="${poi.id}" title="${displayName(poi)}">${q.icon}<span>${T(q.key) || q.fallback}</span></button>`
        ).join('');
    wrap.querySelectorAll('.quick-chip').forEach(btn => {
        btn.addEventListener('click', () => goQuickPoi(btn.dataset.poi));
    });
}

/** 点击 chip：若详情已开先关，再飞到该 POI 并打开详情卡 */
function goQuickPoi(id) {
    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden')) closeInfoModal();
    flyToBuilding(id);
    showBuildingInfo(id);
}

// ====== 6.2 地点「数据报错」反馈（v3.21） ======
let _fbPoiId = null;   // 当前反馈的地点 id
let _fbType = '';      // 当前选中的问题类型

function openPoiFeedback(poiId) {
    const b = BUILDINGS.find(x => x.id === poiId);
    if (!b) return;
    _fbPoiId = poiId;
    _fbType = '';
    const sheet = document.getElementById('poiFeedbackSheet');
    if (!sheet) return;
    const poiEl = document.getElementById('poiFeedbackPoi');
    if (poiEl) poiEl.textContent = '📍 ' + displayName(b);
    document.querySelectorAll('#poiFeedbackTypes .poi-fb-type').forEach(btn => btn.classList.remove('active'));
    const text = document.getElementById('poiFeedbackText');
    if (text) text.value = '';
    const count = document.getElementById('poiFeedbackCount');
    if (count) count.textContent = '0';
    sheet.classList.remove('hidden');
}

function closePoiFeedback() {
    const sheet = document.getElementById('poiFeedbackSheet');
    if (sheet) sheet.classList.add('hidden');
    _fbPoiId = null;
    _fbType = '';
}

function bindPoiFeedbackSheet() {
    const sheet = document.getElementById('poiFeedbackSheet');
    if (!sheet || sheet._fbBound) return;
    sheet._fbBound = true;
    const mask = document.getElementById('poiFeedbackMask');
    const close = document.getElementById('poiFeedbackClose');
    if (mask) mask.addEventListener('click', closePoiFeedback);
    if (close) close.addEventListener('click', closePoiFeedback);

    document.querySelectorAll('#poiFeedbackTypes .poi-fb-type').forEach(btn => {
        btn.addEventListener('click', () => {
            _fbType = btn.dataset.type;
            document.querySelectorAll('#poiFeedbackTypes .poi-fb-type').forEach(x => x.classList.toggle('active', x === btn));
        });
    });

    const text = document.getElementById('poiFeedbackText');
    const count = document.getElementById('poiFeedbackCount');
    if (text && count) {
        text.addEventListener('input', () => {
            count.textContent = String(text.value.length);
        });
    }

    const submit = document.getElementById('poiFeedbackSubmit');
    if (submit) submit.addEventListener('click', submitPoiFeedback);
}

async function submitPoiFeedback() {
    if (!_fbPoiId) return;
    if (!_fbType) { showToast('请选择问题类型', 'error', 1800); return; }
    const textEl = document.getElementById('poiFeedbackText');
    const text = textEl ? textEl.value.trim() : '';
    if (!text) { showToast('请填写备注', 'error', 1800); return; }
    if (text.length > 100) { showToast('备注不能超过 100 字', 'error', 1800); return; }

    const btn = document.getElementById('poiFeedbackSubmit');
    if (btn) btn.disabled = true;
    try {
        await CampusAPI._fetch(`api/pois/${encodeURIComponent(_fbPoiId)}/feedback`, {
            method: 'POST',
            body: JSON.stringify({ type: _fbType, text }),
        });
        closePoiFeedback();
        showToast((window.I18N && window.I18N.t('poi.feedback.done')) || '感谢反馈，我们会尽快核实', 'success', 2200);
    } catch (e) {
        showToast(e.message || '提交失败，请重试', 'error', 2600);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ====== 7. 导航 ======
// 路由算法层已抽离到 js/routing.js（A* 最短路 + 贴边投影 + 备选路线 + 2-opt 游览排序），
// 这里保留兼容包装：UI 层继续用 buildGraph() / dijkstra() 这两个名字。

function buildGraph() {
    return Routing.buildGraph(Store.data.myLocation);
}

/** 兼容旧名：内部为 A* 最短路（routing.js） */
function dijkstra(graph, startId, endId) {
    return Routing.shortestPath(graph, startId, endId);
}

/** 起终点 id → 显示名（兼容「我的位置」虚拟节点） */
function navStopName(id) {
    if (id === '__myloc__') return window.I18N ? window.I18N.t('settings.myloc') : '我的位置';
    const b = BUILDINGS.find(x => x.id === id);
    return b ? displayName(b) : id;
}

/**
 * 渲染路线。可传入 alts（所有备选）+ idx（当前选中）一次画出分层效果：
 *   - 非选中备选：浅灰半透明 4px + 白色描边底
 *   - 选中主路线：蓝色实线 6px + 白色描边底（最上层）
 * 兼容旧调用 renderRoute(path) —— 单条按主选样式画。
 */
function renderRoute(path, alts, idx) {
    // 清理旧图层（含新增的备选层 + 描边底）
    if (state.navRouteLayer) state.map.removeLayer(state.navRouteLayer);
    if (state.navCasingLayer) state.map.removeLayer(state.navCasingLayer);
    if (state.navAltLayer) state.map.removeLayer(state.navAltLayer);
    if (state.navStartMarker) state.map.removeLayer(state.navStartMarker);
    if (state.navEndMarker) state.map.removeLayer(state.navEndMarker);
    state.navRouteLayer = state.navCasingLayer = state.navAltLayer = null;
    state.navStartMarker = state.navEndMarker = null;
    if (!path || path.length === 0) return;

    const toLL = (id) => { const [x, y] = PATH_NODES[id]; return toLatLng(x, y); };
    const mainLL = path.map(toLL);

    // 多备选模式：先画所有非选中备选（淡灰底层）
    if (Array.isArray(alts) && alts.length > 1) {
        const altLayers = [];
        alts.forEach((a, i) => {
            if (i === idx) return;   // 选中的最后画、最上层
            const ll = a.path.map(toLL);
            // 描边底
            altLayers.push(L.polyline(ll, {
                color: '#ffffff', weight: 9, opacity: 0.5,
                lineCap: 'round', lineJoin: 'round', interactive: false,
            }).addTo(state.map));
            // 主体淡灰
            altLayers.push(L.polyline(ll, {
                color: '#9E9E9E', weight: 4, opacity: 0.45,
                lineCap: 'round', lineJoin: 'round', interactive: false,
            }).addTo(state.map));
        });
        state.navAltLayer = L.layerGroup(altLayers).addTo(state.map);
    }

    // 白色描边底（选中主路线）
    state.navCasingLayer = L.polyline(mainLL, {
        color: '#ffffff', weight: 10, opacity: 0.9,
        lineCap: 'round', lineJoin: 'round', interactive: false,
    }).addTo(state.map);

    // 主路线：选中=蓝实线；单条模式（无备选）=红实线
    const isMulti = Array.isArray(alts) && alts.length > 1;
    state.navRouteLayer = L.polyline(mainLL, {
        color: isMulti ? '#1565C0' : '#FF1744',
        weight: 6,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
    }).addTo(state.map);

    state.navStartMarker = L.circleMarker(mainLL[0], {
        radius: 9, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 1, weight: 3,
    }).addTo(state.map);
    state.navEndMarker = L.circleMarker(mainLL[mainLL.length - 1], {
        radius: 9, color: '#FF1744', fillColor: '#FF1744', fillOpacity: 1, weight: 3,
    }).addTo(state.map);

    state.map.fitBounds(state.navRouteLayer.getBounds(), { padding: [80, 80] });
}

function populateNavSelects() {
    const startSel = document.getElementById('navStart');
    const endSel = document.getElementById('navEnd');
    if (!startSel || !endSel) return;
    // 刷新时尽量保留用户已选的起终点
    const prevStart = startSel.value;
    const prevEnd = endSel.value;

    // 新版数据里建筑 POI 本身就是路网节点，全部可直接作起终点
    const navPoints = BUILDINGS.map(b => ({ id: b.id, name: displayName(b) }));

    // 「我的位置」已设置时可作起点/终点（顶部固定项）
    const myLoc = Store.data.myLocation;
    const myLocOption = myLoc
        ? `<option value="__myloc__">📍 ${window.I18N ? window.I18N.t('settings.myloc') : '我的位置'}</option>` : '';

    // 「最近 POI」推荐：仅在「我的位置」存在时，按 A* 步行距离取最近 5 个，
    // 作为起点面板顶部的快捷分组（终点不需要"最近起点"，故仅插入起点）
    let nearestOpt = '';
    if (myLoc) {
        try {
            const ids = navPoints.map(p => p.id);
            const top = Routing.topNearestFrom(myLoc, ids, 5);
            if (top.length) {
                const byId = Object.fromEntries(navPoints.map(p => [p.id, p.name]));
                nearestOpt = `<optgroup label="🎯 ${window.I18N ? window.I18N.t('nav.nearest.group') || '最近（按步行距离）' : '最近（按步行距离）'}">` +
                    top.map(({ id, d }) => `<option value="${id}">▸ ${byId[id] || id} · 约${Math.round(d)}m</option>`).join('') +
                    `</optgroup>`;
            }
        } catch (e) { /* 顶部无最近组，不影响主列表 */ }
    }

    const allOpt = `<optgroup label="${window.I18N ? window.I18N.t('nav.all.places') || '全部地点' : '全部地点'}">` +
        navPoints.map(p => `<option value="${p.id}">${p.name}</option>`).join('') + `</optgroup>`;

    startSel.innerHTML = myLocOption + nearestOpt + allOpt;
    endSel.innerHTML = myLocOption + allOpt;

    const has = (sel, v) => v && sel.querySelector(`option[value="${v}"]`);
    startSel.value = has(startSel, prevStart) ? prevStart
        : (myLoc ? '__myloc__' : 'b_gate_main');
    endSel.value = has(endSel, prevEnd) ? prevEnd : 'b_fountain';
}
// 供 appshell 在「我的位置」变更后刷新导航下拉
window.refreshNavSelects = populateNavSelects;

function setNavEndpoint(buildingId, type) {
    document.getElementById('nav-panel').classList.remove('hidden');
    const sel = type === 'start'
        ? document.getElementById('navStart')
        : document.getElementById('navEnd');
    sel.value = buildingId;
    closeInfoModal();
}

/** 收集导航途经序列：起点 → 途经点(最多4) → 终点，去掉相邻重复 */
function collectNavStops() {
    const stops = [document.getElementById('navStart').value,
        ...[...document.querySelectorAll('#navWays .nav-way')].map(s => s.value),
        document.getElementById('navEnd').value];
    return stops.filter((v, i) => i === 0 || v !== stops[i - 1]);
}

/** 添加途经点下拉行 */
function addNavWay() {
    const box = document.getElementById('navWays');
    if (!box) return;
    if (box.children.length >= 4) {
        showToast('途经点最多 4 个', 'info', 1600);
        return;
    }
    const row = document.createElement('div');
    row.className = 'nav-point nav-way-row';
    const label = document.createElement('label');
    label.textContent = '途经';
    const sel = document.createElement('select');
    sel.className = 'nav-way';
    sel.innerHTML = document.getElementById('navStart').innerHTML;
    const del = document.createElement('button');
    del.className = 'nav-way-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', '移除途经点');
    del.addEventListener('click', () => row.remove());
    row.append(label, sel, del);
    box.appendChild(row);
}

/**
 * 由节点序列生成转向指引（数据坐标系 y 轴向下，顺时针=右转）。
 *
 * 阈值分层：
 *   - < 30°  → 继续直行
 *   - 30°~60° → 缓转（slight left/right）
 *   - ≥ 60°  → 急转（left/right）
 * 每段同时给出"已步行 Xm"，让用户清楚下一动作距离上一动作多远。
 */
function buildNavSteps(nodePath, stops) {
    const stopSet = new Set(stops);
    const T = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const bName = (id) => id === '__myloc__' ? (window.I18N ? window.I18N.t('settings.myloc') : '我的位置')
        : (BUILDINGS.find(b => b.id === id) ? displayName(BUILDINGS.find(b => b.id === id)) : id);
    const pts = nodePath.map(id => PATH_NODES[id]);
    const steps = [{ icon: '🚩', text: `从「${bName(nodePath[0]) || '起点'}」出发` }];
    let acc = 0, prevBearing = null;
    for (let i = 1; i < nodePath.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        const segLen = Math.hypot(dx, dy) * SCALE_M;
        acc += segLen;
        const bearing = Math.atan2(dy, dx) * 180 / Math.PI;
        if (prevBearing !== null && i < nodePath.length - 1) {
            let diff = bearing - prevBearing;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            const ad = Math.abs(diff);
            if (ad >= 30) {
                // 急转：左/右；缓转：向左前方/向右前方
                let icon, label;
                if (ad >= 60) {
                    icon = diff < 0 ? '↩️' : '↪️';
                    label = diff < 0 ? T('nav.turn.left') : T('nav.turn.right');
                } else {
                    icon = diff < 0 ? '↖️' : '↗️';
                    label = diff < 0 ? T('nav.turn.slight.left') : T('nav.turn.slight.right');
                }
                steps.push({ icon, text: `${T('nav.straight', { d: Math.round(acc) })} · ${label}` });
                acc = 0;
            }
        }
        prevBearing = bearing;
        const id = nodePath[i];
        if (i < nodePath.length - 1 && stopSet.has(id)) {
            steps.push({ icon: '📍', text: `途经「${bName(id) || '途经点'}」` });
            acc = 0;
        }
    }
    steps.push({ icon: '🏁', text: `到达「${bName(nodePath[nodePath.length - 1]) || '终点'}」` });
    return steps;
}

function doNavigation() {
    const seq = collectNavStops();
    if (seq.length < 2) {
        showToast('起点和终点不能相同', 'error');
        return;
    }

    const graph = buildGraph();
    const nodePath = [];
    let total = 0;
    for (let i = 0; i < seq.length - 1; i++) {
        const leg = dijkstra(graph, seq[i], seq[i + 1]);
        if (!leg) {
            showToast(`无法规划到「${navStopName(seq[i + 1])}」的路线`, 'error');
            return;
        }
        if (i > 0) leg.path.shift();   // 与上一段共享衔接点，去重
        nodePath.push(...leg.path);
        total += leg.totalDist;
    }

    // 备选路线：仅简单起终点（无途经点）时提供；有途经点仍以推荐路线为准
    let alts = [];
    if (seq.length === 2) {
        try {
            alts = Routing.planRouteAlternatives(Store.data.myLocation, seq[0], seq[1],
                { path: nodePath, totalDist: total });
        } catch (e) { alts = []; }
    }
    state.navAlts = [{ path: nodePath.slice(), totalDist: total },
        ...alts.map(a => ({ path: a.path.slice(), totalDist: a.totalDist }))];
    state.navAltSeq = seq;
    state.navAltIdx = 0;

    renderNavResult();
}

/**
 * 渲染导航结果（含备选路线胶囊 + 路线摘要）。state.navAlts[navAltIdx] 为当前展示的路线。
 */
function renderNavResult() {
    const seq = state.navAltSeq || [];
    const alts = state.navAlts || [];
    const idx = Math.min(state.navAltIdx || 0, alts.length - 1);
    const cur = alts[idx];
    if (!cur) return;

    renderRoute(cur.path, alts, idx);

    const minutes = Math.ceil(cur.totalDist / WALK_SPEED);
    const startName = document.getElementById('navStart').selectedOptions[0].text;
    const endName = document.getElementById('navEnd').selectedOptions[0].text;
    const wayNames = [...document.querySelectorAll('#navWays .nav-way')]
        .map(s => s.selectedOptions[0]?.text).filter(Boolean);

    // 备选路线卡片：⭐最近 / 绕远，带时长 + 与最近差值 + 选中态
    const base = alts[0].totalDist;
    const T = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const chips = alts.length > 1
        ? `<div class="route-alts">` + alts.map((a, i) => {
            const diff = Math.round(a.totalDist - base);
            const min = Math.ceil(a.totalDist / WALK_SPEED);
            const isMain = i === 0;
            const ico = isMain ? '⭐' : '↩';
            const tag = isMain ? (T('nav.alt.nearest') || '最近') : (T('nav.alt.alt') || '备选') + ' ' + i;
            const diffHtml = isMain ? '' : `<span class="alt-diff">+${diff}m · +${min - Math.ceil(base / WALK_SPEED)}min</span>`;
            return `<button class="alt-chip${i === idx ? ' active' : ''}" data-alt="${i}">` +
                `<span class="alt-ico">${ico}</span>` +
                `<span class="alt-txt">${tag}<b>${Math.round(a.totalDist)}m</b><i>· ${min}min</i></span>` +
                `${diffHtml}` +
                `</button>`;
        }).join('') + `</div>`
        : '';

    // 直线 vs 绕路对比
    let summaryExtra = '';
    if (seq.length === 2) {
        const sNode = PATH_NODES[seq[0]], eNode = PATH_NODES[seq[1]];
        if (sNode && eNode) {
            const crowDist = distance(sNode, eNode);
            const detour = cur.totalDist - crowDist;
            if (crowDist > 5) {
                const pct = Math.round((detour / crowDist) * 100);
                summaryExtra = `<span class="detour">${T('nav.crow.fly', { d: Math.round(crowDist) })} · ${T('nav.detour', { d: Math.round(detour), p: pct })}</span>`;
            }
        }
    }

    document.getElementById('navResult').innerHTML = `
        <div class="route-summary">
            <span>📏 <span class="stat-num">${Math.round(cur.totalDist)}</span> m</span>
            <span>· 步行 <span class="stat-num">${minutes}</span> 分钟</span>
            <span>· ${cur.path.length} 节点</span>
            ${summaryExtra}
        </div>
        <div style="margin-bottom:10px;font-size:13px;color:var(--color-text-light);">
            <span style="color:#4CAF50">●</span> ${startName}
            ${wayNames.length ? `→ <b>${wayNames.join(' → ')}</b> ` : ''}
            → <span style="color:#FF1744">●</span> ${endName}
        </div>
        ${chips}
        <div class="route-info">
            <div><div class="stat">${Math.round(cur.totalDist)}m</div><div class="label">距离</div></div>
            <div><div class="stat">${minutes}</div><div class="label">步行(分钟)</div></div>
            <div><div class="stat">${cur.path.length}</div><div class="label">途经节点</div></div>
        </div>
        <button class="btn-amap btn-amap-sm" onclick="openAmapNav('${seq[seq.length - 1]}')">🗺️ 用高德导航到终点（从校外出发）</button>`;

    // 转向指引
    const steps = buildNavSteps(cur.path, seq);
    const box = document.getElementById('navSteps');
    if (box) {
        box.classList.remove('hidden');
        box.innerHTML = `<div class="steps-title">📋 ${T('nav.steps.title')}</div>` + steps.map((s, i) =>
            `<div class="steps-row"><i>${i + 1}</i><span class="steps-icon">${s.icon}</span><span>${s.text}</span></div>`).join('');
    }

    // 备选胶囊点击 → 切换
    document.querySelectorAll('#navResult .alt-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.navAltIdx = parseInt(btn.dataset.alt, 10) || 0;
            renderNavResult();
        });
    });
}

/** 清除已规划的路线 */
function clearRoute() {
    if (state.navRouteLayer) state.map.removeLayer(state.navRouteLayer);
    if (state.navCasingLayer) state.map.removeLayer(state.navCasingLayer);
    if (state.navAltLayer) state.map.removeLayer(state.navAltLayer);
    if (state.navStartMarker) state.map.removeLayer(state.navStartMarker);
    if (state.navEndMarker) state.map.removeLayer(state.navEndMarker);
    state.navRouteLayer = state.navCasingLayer = state.navAltLayer = null;
    state.navStartMarker = state.navEndMarker = null;
    document.getElementById('navResult').innerHTML = '';
    const steps = document.getElementById('navSteps');
    if (steps) { steps.innerHTML = ''; steps.classList.add('hidden'); }
    const ways = document.getElementById('navWays');
    if (ways) ways.innerHTML = '';
    state.navAlts = state.navAltSeq = null;
    state.navAltIdx = 0;
    if (typeof tourState !== 'undefined' && tourState.active) endTour(true);
    showToast('已清除路线', 'info', 1500);
}

// ====== 7.5 新生导览模式 ======
const TOUR = [
    { id: 'b_gate_main',  tip: '新生报到的第一站，门卫处可咨询' },
    { id: 'b_teach1',     tip: '公共基础课大多在这栋楼上' },
    { id: 'b_train3',     tip: '实训课与实操工坊' },
    { id: 'b_fountain',   tip: '校园中心地标，打卡必来' },
    { id: 'b_academic',   tip: '讲座、报告会都在这里' },
    { id: 'b_canteen1',   tip: '主食堂，川粤湘风味都有' },
    { id: 'b_dorm15',     tip: '学生公寓群，找到你的宿舍号' },
    { id: 'b_field1',     tip: '运动会和日常锻炼的地方' },
    { id: 'b_medical',    tip: '看病就医，急诊 24 小时' },
    { id: 'b_express',    tip: '快递在这里取件' },
];
const TOUR_MODES = {
    nearest: { label: '最近优先', badge: '⚡', ids: TOUR.map(t => t.id), optimize: true },
    checkin: { label: '报到路线', badge: '🏛️', ids: ['b_gate_main', 'b_dorm15', 'b_canteen1', 'b_teach1', 'b_academic', 'b_express'] },
    daily: { label: '生活动线', badge: '🛏️', ids: ['b_dorm15', 'b_canteen1', 'b_express', 'b_medical', 'b_field1'] },
};
const tourState = { active: false, i: 0, auto: false, mode: 'nearest', start: 'gate', order: [], total: 0, graph: null };

/** 是否已看过导览（完成或主动跳过都算看过，避免重复打扰） */
function tourIsDone() {
    try { return localStorage.getItem('wenxuanTourDone') === '1'; } catch (e) { return false; }
}

/**
 * 开始新生导览。
 * @param {boolean} auto true=首次自动触发（用户未看过时由启动逻辑调用）
 */
function getTourStops(mode) {
    const config = TOUR_MODES[mode] || TOUR_MODES.nearest;
    return config.ids.filter(id => BUILDINGS.some(b => b.id === id) && PATH_NODES[id]);
}

function syncTourPicker() {
    const hasLocation = !!Store.data.myLocation;
    document.querySelectorAll('.tour-mode[data-mode]').forEach(btn => {
        const selected = btn.dataset.mode === tourState.mode;
        btn.classList.toggle('selected', selected);
        btn.setAttribute('aria-pressed', String(selected));
    });
    const here = document.getElementById('tourStartHere');
    if (here) {
        here.disabled = !hasLocation;
        here.title = hasLocation ? '' : '请先在地图上设置我的位置';
    }
}

function openTourPicker() {
    syncTourPicker();
    document.getElementById('tourPicker')?.classList.remove('hidden');
}

function closeTourPicker() {
    document.getElementById('tourPicker')?.classList.add('hidden');
}

function startTour(options = {}) {
    const mode = TOUR_MODES[options.mode] ? options.mode : tourState.mode;
    const canStartHere = options.start === 'here' && !!Store.data.myLocation;
    const start = canStartHere ? 'here' : 'gate';
    const startId = start === 'here' ? '__myloc__' : 'b_gate_main';
    const stops = getTourStops(mode);
    if (!stops.length) { showToast('暂无可用的导览站点', 'error'); return; }

    const graph = buildGraph();
    let order = stops.slice();
    // 仅“最近优先”打乱中间站点；其他模式严格保持学习/报到动线。
    if (TOUR_MODES[mode].optimize) {
        try {
            const planIds = [startId, ...stops.filter(id => id !== startId)];
            const plan = Routing.planTourOrder(graph, planIds, startId);
            if (plan.order?.length === planIds.length) {
                order = startId === 'b_gate_main' ? plan.order : plan.order.slice(1);
            }
        } catch (e) { /* 路网异常时保持原站点顺序 */ }
    }
    if (startId === 'b_gate_main' && !order.includes(startId)) order.unshift(startId);

    const routeSeq = order[0] === startId ? order : [startId, ...order];
    const nodePath = [];
    let total = 0;
    for (let i = 0; i < routeSeq.length - 1; i++) {
        const leg = dijkstra(graph, routeSeq[i], routeSeq[i + 1]);
        if (!leg?.path?.length) {
            showToast('部分站点暂无法连通，已停止生成导览', 'error');
            return;
        }
        total += leg.totalDist || 0;
        nodePath.push(...(i ? leg.path.slice(1) : leg.path));
    }

    tourState.active = true;
    tourState.auto = !!options.auto;
    tourState.mode = mode;
    tourState.start = start;
    tourState.order = order;
    tourState.total = total;
    tourState.graph = graph;
    state.tourOrder = order;
    renderRoute(nodePath);
    document.getElementById('nav-panel')?.classList.add('hidden');
    document.getElementById('tourBtn')?.classList.add('hidden');
    document.getElementById('tourCard')?.classList.remove('hidden');
    closeTourPicker();
    showTourStop(0);
    showToast(`已开始${TOUR_MODES[mode].label}导览`, 'success', 1800);
}

function showTourStop(i) {
    const order = tourState.order.length ? tourState.order : TOUR.map(t => t.id);
    if (i < 0 || i >= order.length) return;
    tourState.i = i;
    const stopId = order[i];
    const stop = TOUR.find(t => t.id === stopId) || TOUR[i];
    const b = BUILDINGS.find(x => x.id === stop.id);
    document.getElementById('tourStep').textContent = `${i + 1} / ${order.length}`;
    document.getElementById('tourName').textContent = b ? displayName(b) : '';
    document.getElementById('tourTip').textContent = stop.tip;
    document.getElementById('tourPrev').style.visibility = i === 0 ? 'hidden' : 'visible';
    document.getElementById('tourNext').textContent = i === order.length - 1 ? '完成' : '下一步';
    const config = TOUR_MODES[tourState.mode] || TOUR_MODES.nearest;
    const badge = document.getElementById('tourModeBadge');
    if (badge) badge.textContent = config.badge;
    const summary = document.getElementById('tourSummary');
    if (summary) summary.innerHTML = `<b>${config.label}</b> · ${order.length} 站 · 约 ${Math.round(tourState.total)}m / ${Math.max(1, Math.ceil(tourState.total / WALK_SPEED))} 分钟`;
    const legEl = document.getElementById('tourLeg');
    if (legEl) {
        const nextId = order[i + 1];
        const leg = nextId && tourState.graph ? dijkstra(tourState.graph, stop.id, nextId) : null;
        legEl.textContent = nextId && leg ? `下一站：${navStopName(nextId)} · 约 ${Math.round(leg.totalDist)}m` : '已到达本次导览最后一站';
    }

    // 进度小圆点：已走过/当前/未到达三态
    const dots = document.getElementById('tourDots');
    if (dots) {
        dots.innerHTML = order.map((_, k) =>
            `<span class="tour-dot${k === i ? ' cur' : (k < i ? ' done' : '')}"></span>`
        ).join('');
    }

    state.selectedId = stop.id;
    syncMarkerVisibility();
    flyToBuilding(stop.id);
}

function endTour(silent) {
    tourState.active = false;
    tourState.auto = false;
    tourState.order = [];
    tourState.total = 0;
    tourState.graph = null;
    state.tourOrder = null;
    document.getElementById('tourCard')?.classList.add('hidden');
    document.getElementById('tourBtn')?.classList.remove('hidden');
    state.selectedId = null;
    syncMarkerVisibility();
    renderRoute(null);
    state.navAlts = state.navAltSeq = null;
    state.navAltIdx = 0;
    if (!silent && typeof showToast === 'function') showToast('导览已退出', 'info', 1500);
}

// ====== 8. 点击地图添加新建筑 ======

// 添加按钮图标（Apple 胶囊设计：描边 SVG，替代 emoji）
const ICON_ADD_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_ADD_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * 启动"添加建筑"模式后，用户点击地图任意位置，
 * 弹出页内小面板输入名称并选择分类（替代原生 prompt，体验更连贯）。
 */
function toggleAddMode(force) {
    const target = typeof force === 'boolean' ? force : !state.addMode;
    if (target === state.addMode) return;
    // v3.12：发布新地标需登录（未登录弹登录抽屉，不进入添加模式）
    if (target && window.AuthCenter && !AuthCenter.requireLogin('发布新地标需要先登录')) return;
    state.addMode = target;
    document.body.dataset.addMode = target ? '1' : '0';
    const fab = document.getElementById('addToggle');

    if (state.addMode && fab) {
        fab.classList.add('active');
        fab.innerHTML = ICON_ADD_CLOSE;
        fab.setAttribute('aria-label', '退出添加地标模式');
        state.map.getContainer().style.cursor = 'crosshair';
        showToast('点击地图任意位置添加地标', 'info');
    } else if (fab) {
        fab.classList.remove('active');
        fab.innerHTML = ICON_ADD_PLUS;
        fab.setAttribute('aria-label', '在地图上添加新地标');
        state.map.getContainer().style.cursor = '';
        hideAddPanel();
    }
}

/** 渲染添加面板里的分类选择 chips */
function renderAddCats() {
    const container = document.getElementById('addCats');
    const keys = Object.keys(CATEGORIES);
    let html = '';
    keys.forEach((k, i) => {
        const c = CATEGORIES[k];
        html += `<button type="button" class="add-cat ${i === 0 ? 'active' : ''}" data-cat="${k}">${c.icon} ${displayCat(k)}</button>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.add-cat').forEach(chip => {
        chip.addEventListener('click', () => {
            container.querySelectorAll('.add-cat').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });
}

function showAddPanel(x, y) {
    state.pendingClickLatLng = { x, y };
    const panel = document.getElementById('add-panel');
    renderAddCats();
    document.getElementById('addName').value = '';
    panel.classList.remove('hidden');
    document.getElementById('addName').focus();
}

function hideAddPanel() {
    document.getElementById('add-panel').classList.add('hidden');
    state.pendingClickLatLng = null;
}

function confirmAddBuilding() {
    if (!state.pendingClickLatLng) return;
    const name = document.getElementById('addName').value.trim();
    if (!name) {
        showToast('请输入建筑名称', 'error', 1800);
        document.getElementById('addName').focus();
        return;
    }
    const activeChip = document.querySelector('#addCats .add-cat.active');
    const catKey = activeChip ? activeChip.dataset.cat : Object.keys(CATEGORIES)[0];
    const cat = CATEGORIES[catKey];
    const { x, y } = state.pendingClickLatLng;

    // 添加到数据
    const newId = 'b_user_' + Date.now();
    const newBuilding = {
        id: newId,
        name: name,
        category: catKey,
        x: x,
        y: y,
        info: {
            desc: '用户自定义添加的地标',
            hours: '待补充',
            phone: '待补充',
            floors: '待补充'
        }
    };
    BUILDINGS.push(newBuilding);
    Store.addCustom(newBuilding);
    if (window.CampusAPI) CampusAPI.create(newBuilding);   // 同步云端

    // 渲染新标记
    createPoiMarker(newBuilding);

    // 更新列表
    renderBuildingList(document.getElementById('searchInput')?.value || '');

    // 同时把入口节点加到导航图（连接到最近的现有节点）
    addEntryNodeForBuilding(newId, x, y);

    hideAddPanel();
    toggleAddMode(false);
    showToast(`已添加「${name}」到${displayCat(catKey)}分类`, 'success');
}

function handleMapClick(e) {
    // 移点模式：点击处即新位置
    if (editState.moveArmed && editState.id) {
        finishPoiMove(e.latlng.lng, MAP_HEIGHT - e.latlng.lat);
        return;
    }
    if (AppShell.pickMode) return;   // 位置选点模式优先，交给 appshell 处理
    if (!state.addMode) return;

    // 把 Leaflet 坐标转换回我们的数据坐标
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const dataX = lng;
    const dataY = MAP_HEIGHT - lat;

    showAddPanel(dataX, dataY);
}

/**
 * 为新建筑自动创建入口节点，并连接到最近的现有节点
 */
function addEntryNodeForBuilding(buildingId, x, y) {
    const entryId = `entry_${buildingId}`;
    PATH_NODES[entryId] = [x, y];

    // 找最近的现有节点
    let minDist = Infinity;
    let nearestNode = null;
    for (const [nodeId, coords] of Object.entries(PATH_NODES)) {
        if (nodeId === entryId) continue;
        const d = distance([x, y], coords);
        if (d < minDist) {
            minDist = d;
            nearestNode = nodeId;
        }
    }
    if (nearestNode) {
        PATH_EDGES.push([entryId, nearestNode]);
        // 刷新导航下拉选项
        populateNavSelects();
    }
}

// ====== 8.5 地点编辑（改名 / 改分类 / 改简介 / 移点 / 删除 / 恢复） ======
const editState = {
    id: null,            // 正在编辑的地点
    moveArmed: false,    // 移点模式：下一次点地图/拖动圆点 = 新位置
    suppressClick: false,
};

function renderEditCats(active) {
    const container = document.getElementById('editCats');
    container.innerHTML = Object.entries(CATEGORIES).map(([k, c]) =>
        `<button type="button" class="add-cat ${k === active ? 'active' : ''}" data-cat="${k}">${c.icon} ${displayCat(k)}</button>`
    ).join('');
    container.querySelectorAll('.add-cat').forEach(chip => {
        chip.addEventListener('click', () => {
            container.querySelectorAll('.add-cat').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });
}

function openEditPanel(id) {
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    editState.id = id;
    closeInfoModal();
    document.getElementById('editName').value = b.name;
    document.getElementById('editDesc').value = (b.info && b.info.desc) || '';
    renderEditCats(b.category);
    const isCustom = id.startsWith('b_user_');
    const canRestore = !isCustom && (!!Store.getPoiOverride(id) || (Store.data.poiDeleted || []).includes(id));
    document.getElementById('editRestore').classList.toggle('hidden', !canRestore);
    document.getElementById('edit-panel').classList.remove('hidden');
    setTimeout(() => document.getElementById('editName').focus(), 80);
}

function closeEditPanel() {
    disarmPoiMove();
    document.getElementById('edit-panel').classList.add('hidden');
    editState.id = null;
}

/** 保存名称 / 分类 / 简介修改（位置修改走 finishPoiMove） */
function saveEditPanel() {
    const b = BUILDINGS.find(x => x.id === editState.id);
    if (!b) { closeEditPanel(); return; }
    const name = document.getElementById('editName').value.trim();
    if (!name) {
        showToast('名称不能为空', 'error', 1600);
        document.getElementById('editName').focus();
        return;
    }
    const activeChip = document.querySelector('#editCats .add-cat.active');
    const catKey = activeChip ? activeChip.dataset.cat : b.category;
    const desc = document.getElementById('editDesc').value.trim();

    b.name = name;
    if (CATEGORIES[catKey]) b.category = catKey;
    b.info = { ...b.info, desc: desc || b.info.desc };
    b._search = null;   // 重建搜索索引

    if (b.id.startsWith('b_user_')) {
        Store.updateCustom(b.id, { name: b.name, category: b.category, info: { desc: b.info.desc } });
    } else {
        Store.setPoiOverride(b.id, { name: b.name, category: b.category, desc: b.info.desc });
    }
    if (window.CampusAPI) CampusAPI.update(b.id, { name: b.name, category: b.category, desc: b.info.desc });   // 同步云端

    const marker = state.buildingMarkers[b.id];
    if (marker) marker.setIcon(buildPoiIcon(b));
    populateNavSelects();
    renderBuildingList(document.getElementById('searchInput')?.value || '');
    syncMarkerVisibility();
    if (AppShell._refreshPoiEditDesc) AppShell._refreshPoiEditDesc();
    closeEditPanel();
    showToast(`「${name}」已保存`, 'success');
}

/** 进入移点模式：隐藏面板，下一次点地图或直接拖动圆点即新位置 */
function armPoiMove() {
    const b = BUILDINGS.find(x => x.id === editState.id);
    if (!b) return;
    editState.moveArmed = true;
    document.getElementById('edit-panel').classList.add('hidden');
    state.map.getContainer().style.cursor = 'crosshair';
    const marker = state.buildingMarkers[b.id];
    if (marker && marker.dragging) marker.dragging.enable();
    closeInfoModal();
    showToast('点地图选新位置，或按住圆点直接拖', 'info', 3200);
}

function disarmPoiMove() {
    if (!editState.moveArmed) return;
    editState.moveArmed = false;
    state.map.getContainer().style.cursor = '';
    const marker = state.buildingMarkers[editState.id];
    if (marker && marker.dragging) marker.dragging.disable();
}

function finishPoiMove(x, y) {
    const b = BUILDINGS.find(x2 => x2.id === editState.id);
    if (!b) { disarmPoiMove(); return; }
    // 限制在校园范围内
    b.x = Math.max(0, Math.min(MAP_WIDTH, Math.round(x * 10) / 10));
    b.y = Math.max(0, Math.min(MAP_HEIGHT, Math.round(y * 10) / 10));

    // 路网节点同步（官方点 = 自身 id；自定义点 = entry_ 前缀）
    if (PATH_NODES[b.id]) PATH_NODES[b.id] = [b.x, b.y];
    const entryId = `entry_${b.id}`;
    if (PATH_NODES[entryId]) PATH_NODES[entryId] = [b.x, b.y];

    if (b.id.startsWith('b_user_')) {
        Store.updateCustom(b.id, { x: b.x, y: b.y });
    } else {
        Store.setPoiOverride(b.id, { x: b.x, y: b.y });
    }
    if (window.CampusAPI) CampusAPI.update(b.id, { x: b.x, y: b.y });   // 同步云端

    const marker = state.buildingMarkers[b.id];
    if (marker) marker.setLatLng(toLatLng(b.x, b.y));
    if (AppShell._refreshPoiEditDesc) AppShell._refreshPoiEditDesc();
    disarmPoiMove();
    openEditPanel(b.id);   // 回到编辑面板继续改
    showToast('位置已更新', 'success', 1600);
}

/** 编辑面板里的删除：第一次点进入确认态，第二次执行 */
function handleEditDelete() {
    const delBtn = document.getElementById('editDelete');
    const id = editState.id;
    if (!id) return;
    if (!delBtn.dataset.armed) {
        delBtn.dataset.armed = '1';
        delBtn.textContent = '⚠️ 再点一次确认删除';
        delBtn.classList.add('armed');
        setTimeout(() => {
            delete delBtn.dataset.armed;
            delBtn.textContent = '🗑️ 删除该地点';
            delBtn.classList.remove('armed');
        }, 2800);
        return;
    }
    closeEditPanel();
    deleteBuilding(id);
}

function initEditPanel() {
    document.getElementById('editCancel').addEventListener('click', closeEditPanel);
    document.getElementById('editSave').addEventListener('click', saveEditPanel);
    document.getElementById('editMove').addEventListener('click', armPoiMove);
    document.getElementById('editDelete').addEventListener('click', handleEditDelete);
    document.getElementById('editRestore').addEventListener('click', () => {
        const id = editState.id;
        if (!id) return;
        if (restorePoi(id)) {
            closeEditPanel();
            showToast('已恢复默认', 'success', 1500);
        }
    });
    document.getElementById('editName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEditPanel();
        if (e.key === 'Escape') e.stopPropagation();
    });
    document.getElementById('editDesc').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') e.stopPropagation();
    });
}

// ====== 9. 工具函数 ======

/** 拉起高德 App / H5 步行导航到校园地点（URI API 免费无 key，坐标由 toGeo 换算） */
function openAmapNav(id) {
    // 「我的位置」虚拟点：直接用已设坐标调高德
    if (id === '__myloc__') {
        const loc = Store.data.myLocation;
        if (!loc || typeof toGeo !== 'function') return;
        const g = toGeo(loc.x, loc.y);
        window.open(`https://uri.amap.com/navigation?to=${g.lng},${g.lat},我的位置&mode=walk&coordinate=gaode&callnative=1`, '_blank');
        showToast('正在打开高德导航到「我的位置」…', 'info', 2200);
        return;
    }
    const b = BUILDINGS.find(x => x.id === id);
    if (!b || typeof amapNavUrl !== 'function') return;
    window.open(amapNavUrl(b), '_blank');
    showToast(`正在打开高德导航到「${displayName(b)}」…`, 'info', 2200);
}
function toLatLng(x, y) {
    // 数据 y 向下递增 → Leaflet lat 向上递增，故翻转
    return [MAP_HEIGHT - y, x];
}

// 暴露给失物招领等外部模块复用（地图实例 / 坐标换算 / 常量）
window.MAP = { get map() { return state.map; }, MAP_WIDTH, MAP_HEIGHT, toLatLng };

// distance() 已移至 routing.js（全局唯一定义，含 SCALE_M 语义）

// ====== 10. 事件绑定与启动 ======
function bindEvents() {
    handleSearch();

    document.getElementById('info-modal').addEventListener('click', (e) => {
        if (e.target.id === 'info-modal') closeInfoModal();
    });

    // 手势底部抽屉（移动端详情弹窗拖拽/吸附/全屏）
    initSheetDrag();

    document.getElementById('navToggle').addEventListener('click', () => {
        document.getElementById('nav-panel').classList.toggle('hidden');
    });
    document.getElementById('navClose').addEventListener('click', () => {
        document.getElementById('nav-panel').classList.add('hidden');
    });
    document.getElementById('navAddWay')?.addEventListener('click', addNavWay);
    document.getElementById('navGo').addEventListener('click', doNavigation);
    document.getElementById('navClear').addEventListener('click', clearRoute);
    // 备选路线胶囊：点击切换路线（事件委托，chips 由 renderNavResult 动态生成）
    document.getElementById('navResult')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.alt-chip');
        if (!chip) return;
        const i = Number(chip.dataset.alt);
        if (state.navAlts && state.navAlts[i]) {
            state.navAltIdx = i;
            renderNavResult();
        }
    });

    // 新生导览：先选路线与起点，避免一点击就被强制带入单一路线。
    document.getElementById('tourBtn')?.addEventListener('click', openTourPicker);
    document.getElementById('tourPickerClose')?.addEventListener('click', closeTourPicker);
    document.querySelectorAll('.tour-mode[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            tourState.mode = TOUR_MODES[btn.dataset.mode] ? btn.dataset.mode : 'nearest';
            syncTourPicker();
        });
    });
    document.getElementById('tourStartGate')?.addEventListener('click', () => startTour({ mode: tourState.mode, start: 'gate' }));
    document.getElementById('tourStartHere')?.addEventListener('click', () => {
        if (!Store.data.myLocation) {
            showToast('请先在地图上设置我的位置', 'info');
            return;
        }
        startTour({ mode: tourState.mode, start: 'here' });
    });
    document.getElementById('tourModeBtn')?.addEventListener('click', openTourPicker);
    document.getElementById('tourNext')?.addEventListener('click', () => {
        if (tourState.i < tourState.order.length - 1) showTourStop(tourState.i + 1);
        else {
            endTour(true);
            try { localStorage.setItem('wenxuanTourDone', '1'); } catch (e) {}
            showToast('导览完成，欢迎入学！🎓', 'success', 2400);
        }
    });
    document.getElementById('tourPrev')?.addEventListener('click', () => {
        showTourStop(Math.max(0, tourState.i - 1));
    });
    document.getElementById('tourExit')?.addEventListener('click', () => endTour());

    document.getElementById('addToggle')?.addEventListener('click', () => toggleAddMode());
    document.getElementById('addConfirm').addEventListener('click', confirmAddBuilding);
    document.getElementById('addCancel').addEventListener('click', hideAddPanel);
    initEditPanel();
    document.getElementById('locToggle').addEventListener('click', () => {
        if (AppShell.pickMode === 'location') {
            AppShell.exitPickMode();
            showToast('已取消位置设置', 'info', 1400);
        } else if (!Store.data.myLocation) {
            AppShell.startLocationPick();
        } else {
            // 已有位置：飞过去并提示
            const loc = Store.data.myLocation;
            state.map.flyTo(toLatLng(loc.x, loc.y), 1.5, { duration: 0.6 });
            showToast('这是我的位置，拖动蓝点可调整', 'info', 2200);
        }
    });
    document.getElementById('addName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmAddBuilding();
        if (e.key === 'Escape') e.stopPropagation();
    });

    // 图例折叠（手机端默认收起，减少对地图的遮挡）
    if (window.matchMedia('(max-width: 768px)').matches) {
        document.getElementById('legend')?.classList.add('collapsed');
    }
    document.getElementById('legendToggle').addEventListener('click', () => {
        const legend = document.getElementById('legend');
        const collapsed = legend.classList.toggle('collapsed');
        document.getElementById('legendToggle')
            .setAttribute('aria-expanded', String(!collapsed));
    });

    // 视野模式切换（竖屏：浏览 ↔ 全览）
    document.getElementById('viewToggle')?.addEventListener('click', () => {
        setMapMode(state.mapMode === 'detail' ? 'overview' : 'detail');
    });

    // 小地图：点击任意位置跳转过去
    const pip = document.getElementById('mapOverview');
    if (pip) {
        pip.addEventListener('click', (e) => {
            if (state.mapMode !== 'detail') return;
            const r = pip.getBoundingClientRect();
            const fx = (e.clientX - r.left) / r.width;
            const fy = (e.clientY - r.top) / r.height;
            state.map.panTo([MAP_HEIGHT * (1 - fy), MAP_WIDTH * fx], { animate: true });
        });
    }

    // ESC 逐层关闭：搜索浮层 → 弹窗 → 编辑面板 → 添加面板 → 导航面板
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('info-modal');
        const addPanel = document.getElementById('add-panel');
        const editPanel = document.getElementById('edit-panel');
        const navPanel = document.getElementById('nav-panel');
        const so = document.getElementById('searchOverlay');

        if (editState.moveArmed) {
            disarmPoiMove();
            if (editState.id) openEditPanel(editState.id);
        } else if (so && !so.classList.contains('hidden')) {
            closeSearchOverlay();
        } else if (!modal.classList.contains('hidden')) {
            closeInfoModal();
        } else if (editPanel && !editPanel.classList.contains('hidden')) {
            closeEditPanel();
        } else if (!addPanel.classList.contains('hidden')) {
            hideAddPanel();
        } else if (!navPanel.classList.contains('hidden')) {
            navPanel.classList.add('hidden');
        }
    });

    // 地图点击事件
    state.map.on('click', handleMapClick);

    // 手机全屏搜索浮层
    initSearchOverlay();
}

// v3.21：深链解析 —— ?poi=xxx 直达地点详情（冷启动 + PWA 同窗口二次导航共用）
// 返回命中的 poi id（无深链或已处理返回 null），供启动逻辑判断是否跳过引导弹窗
function handleDeepLink() {
    const poi = new URLSearchParams(location.search).get('poi');
    if (!poi) return null;
    // 清掉参数，避免刷新/回退重复弹出
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
    if (BUILDINGS.some(b => b.id === poi)) {
        setTimeout(() => {
            flyToBuilding(poi);
            showBuildingInfo(poi);
        }, 350);
    } else {
        showToast('分享的地点不存在或已被删除', 'error', 2600);
    }
    return poi;
}

window.addEventListener('DOMContentLoaded', async () => {
    // 云端模式：拉取服务器数据（含本机历史改动迁移）；失败自动降级本地
    const cloud = window.CampusAPI ? await CampusAPI.init() : false;

    initMap();
    if (!cloud) {
        applyPoiEdits();        // 本地模式：应用本机编辑（删除/修改官方地点）
        restoreCustomBuildings();
    }
    ensureEntryNodes();   // v3.38：为缺少路网节点的地点（官方化的 59 点）挂入口
    renderBuildings();
    renderCategoryFilters();
    renderBuildingList();
    populateNavSelects();
    renderQuickChips();          // v3.21：热门地点快捷 chips
    bindPoiFeedbackSheet();      // v3.21：地点报错反馈 sheet 事件
    bindEvents();
    AppShell.init();   // Tab 壳 / 个人中心 / 设置 / 我的位置
    if (window.PermCenter) PermCenter.init();   // 权限中心：隐私与权限页事件绑定
    if (window.AuthCenter) AuthCenter.init();   // 账户中心：注册/登录/数据隔离 + 渲染账号卡片
    if (window.LostFound) LostFound.init();      // 失物招领模块
    if (window.Chat) Chat.init();                // 聊天模块：公共大厅 + 私聊

    // 多语言切换钩子：语言变化后重渲染所有动态地点/分类文案
    window.__onLangChange = (lang) => {
        // 重建搜索索引（含新语言译名），使非中文关键词可命中
        BUILDINGS.forEach(b => { delete b._search; });
        renderBuildings();          // 重建标记（名称牌翻译）
        renderCategoryFilters();    // 分类标签翻译
        renderBuildingList();       // 列表重绘
        populateNavSelects();       // 导航下拉重绘
        renderQuickChips();         // v3.21：热门地点 chips 文案翻译
        if (typeof window.__refreshLangDesc === 'function') window.__refreshLangDesc();   // v3.40：语言行描述
        if (typeof renderSearchOverlay === 'function') renderSearchOverlay();
        // 若详情弹窗正打开，刷新其内容
        if (state.selectedId && !document.getElementById('info-modal').classList.contains('hidden')) {
            showBuildingInfo(state.selectedId);
        }
        // 导游卡片名称
        if (typeof tourState !== 'undefined' && tourState.active && typeof TOUR !== 'undefined') {
            showTourStop(tourState.i);
        }
        if (window.LostFound && LostFound._onLangChange) LostFound._onLangChange();
        if (window.Chat && Chat._onLangChange) Chat._onLangChange();
    };

    // 深链：?poi=xxx 分享链接直达地点详情（随后清掉参数，避免刷新重复弹出）
    const deepPoi = handleDeepLink();

    // v3.21：PWA 同窗口二次导航——已打开页面再收到带 ?poi= 的链接时，pageshow 也能解析
    window.addEventListener('pageshow', () => { handleDeepLink(); });

    // 定位权限仅在用户点“我的位置”后请求，避免新用户首屏连续被教学与权限打断。

    // 新生导览改为按需触发（地图上的“新生导览”入口）。首屏只服务找地点，
    // 避免卡片遮挡地图、快捷入口和导航操作。

    // 首次打开时的竖屏使用提示
    if (window.matchMedia('(max-width: 768px)').matches) {
        setTimeout(() => {
            showToast('已完整显示全图 · 点「放大浏览」看清细节', 'info', 3200);
        }, 900);
    }

    // PWA：注册 Service Worker（可安装、离线可用）
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(() => {});
        // 新版本 SW 接管时自动刷新一次，避免停留在旧版（功能更新不及时）
        let swRefreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (swRefreshing) return;
            swRefreshing = true;
            location.reload();
        });
    }
});

// ============================================================
// 12. 高级弹窗交互（v3.8 液态玻璃手势）
//   12.1 手势底部抽屉：详情弹窗移动端可拖拽、阻尼、吸附、全屏
//   12.2 锚定浮动气泡：长按/右键地图标记弹出快捷菜单
// ============================================================

// ---- 12.1 手势底部抽屉 ----

/** 详情内容重建后补挂拖拽手柄（innerHTML 会清掉旧节点） */
function ensureSheetHandle(content) {
    if (!content || content.querySelector('.sheet-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'sheet-handle';
    handle.innerHTML = '<span class="sheet-grip"></span>';
    handle.setAttribute('aria-hidden', 'true');
    content.prepend(handle);
}

const sheetState = {
    active: false,     // 拖拽进行中
    startY: 0,
    baseY: 0,          // 手指按住时面板当前 translateY 基准（全屏回拉用）
    dy: 0,
    lastY: 0, lastT: 0,
    vel: 0,            // px/ms，速度用于甩动判定
    fromFull: false,
};

/** 阻尼：向上拖（展开）更费力，向下拖跟手一些——模拟玻璃的重量感 */
function sheetDamping(dy, fromFull) {
    if (fromFull) {
        // 全屏态只允许向下收起：正位移跟手，负位移（再往上）强阻尼
        return dy > 0 ? dy * 0.82 : dy * 0.2;
    }
    return dy > 0 ? dy * 0.85 : dy * 0.4;
}

function initSheetDrag() {
    const modal = document.getElementById('info-modal');
    const content = modal.querySelector('.modal-content');
    if (!content || content.dataset.sheetInit) return;
    content.dataset.sheetInit = '1';

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    content.addEventListener('pointerdown', (e) => {
        if (!isMobile()) return;
        if (!e.target.closest('.sheet-handle')) return;
        if (!e.isPrimary) return;
        sheetState.active = true;
        sheetState.startY = sheetState.lastY = e.clientY;
        sheetState.lastT = performance.now();
        sheetState.vel = 0;
        sheetState.dy = 0;
        sheetState.fromFull = content.classList.contains('sheet-full');
        content.style.transition = 'none';
        content.style.animation = 'none';
        try { content.setPointerCapture(e.pointerId); } catch (_) {}
    });

    content.addEventListener('pointermove', (e) => {
        if (!sheetState.active) return;
        const now = performance.now();
        const dt = Math.max(1, now - sheetState.lastT);
        sheetState.vel = sheetState.vel * 0.6 + ((e.clientY - sheetState.lastY) / dt) * 0.4;  // 平滑速度
        sheetState.lastY = e.clientY;
        sheetState.lastT = now;
        sheetState.dy = sheetDamping(e.clientY - sheetState.startY, sheetState.fromFull);
        content.style.transform = `translateY(${sheetState.dy}px)`;
    });

    const finish = (e) => {
        if (!sheetState.active) return;
        sheetState.active = false;
        const { dy, vel, fromFull } = sheetState;

        const springBack = () => {
            content.style.transition = 'transform 0.45s cubic-bezier(0.32, 1.3, 0.36, 1)';
            content.style.transform = '';
        };
        const expandFull = () => {
            content.style.transition = 'transform 0.42s cubic-bezier(0.3, 1.25, 0.35, 1)';
            content.style.transform = '';
            content.classList.add('sheet-full');
        };
        const collapsePeek = () => {
            content.style.transition = 'transform 0.42s cubic-bezier(0.3, 1.25, 0.35, 1)';
            content.style.transform = '';
            content.classList.remove('sheet-full');
        };
        const slideClose = () => {
            content.style.transition = 'transform 0.3s cubic-bezier(0.55, 0, 0.85, 0.4)';
            content.style.transform = 'translateY(105%)';
            setTimeout(closeInfoModal, 300);
        };

        if (fromFull) {
            if (dy > 220 || (vel > 0.65 && dy > 30)) slideClose();
            else if (dy > 90) collapsePeek();
            else springBack();
        } else {
            if (dy > 140 || (vel > 0.65 && dy > 20)) slideClose();
            else if (dy < -38 || vel < -0.45) expandFull();
            else springBack();
        }
    };
    content.addEventListener('pointerup', finish);
    content.addEventListener('pointercancel', finish);
}

// ---- 12.2 锚定浮动气泡 ----

const poiPopover = { el: null, id: null, timer: null, marker: null };

/** 给标记挂长按/右键弹出气泡 */
function attachPoiLongPress(marker, id) {
    let downX = 0, downY = 0;
    const cancel = () => {
        clearTimeout(poiPopover.timer);
        poiPopover.timer = null;
    };
    marker.on('mousedown', (e) => {
        if (editState.moveArmed) return;   // 编辑移点模式不弹气泡
        downX = e.originalEvent.clientX; downY = e.originalEvent.clientY;
        cancel();
        poiPopover.timer = setTimeout(() => {
            poiPopover.timer = null;
            editState.suppressClick = true;             // 松手别再打开详情
            setTimeout(() => { editState.suppressClick = false; }, 500);
            openPoiPopover(id, e.originalEvent.clientX, e.originalEvent.clientY, marker);
            if (navigator.vibrate) navigator.vibrate(12);
        }, 480);
    });
    marker.on('mouseup', cancel);
    marker.on('contextmenu', (e) => {
        e.originalEvent.preventDefault();
        openPoiPopover(id, e.originalEvent.clientX, e.originalEvent.clientY, marker);
    });
}

function openPoiPopover(id, clientX, clientY, marker) {
    closePoiPopover();
    const b = BUILDINGS.find(x => x.id === id);
    if (!b) return;
    poiPopover.id = id;
    poiPopover.marker = marker;

    const el = document.createElement('div');
    el.className = 'poi-popover';
    el.setAttribute('role', 'menu');
    const isFav = Store.isFav(id);
    const T = window.I18N ? window.I18N.t.bind(window.I18N) : (k) => k;
    el.innerHTML = `
        <button role="menuitem" data-act="start">🚩 ${T('info.from')}</button>
        <button role="menuitem" data-act="end">🎯 ${T('info.to')}</button>
        <button role="menuitem" data-act="fav">${isFav ? '💫 ' + T('info.unfav') : '⭐ ' + T('info.fav')}</button>
        <button role="menuitem" data-act="info">📋 ${T('info.meta')}</button>
    `;

    // 防止气泡上的点击冒泡到地图
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        closePoiPopover();
        if (act === 'start') { setNavEndpoint(id, 'start'); showToast(`已设「${displayName(b)}」为出发点`, 'success', 1600); }
        if (act === 'end')   { setNavEndpoint(id, 'end');   showToast(`已设「${displayName(b)}」为目的地`, 'success', 1600); }
        if (act === 'fav') {
            const nowFav = Store.toggleFav(id);
            showToast(nowFav ? `已收藏「${displayName(b)}」` : '已取消收藏', 'success', 1500);
        }
        if (act === 'info') showBuildingInfo(id);
    });

    document.body.appendChild(el);
    poiPopover.el = el;

    // 定位：指向标记（屏幕坐标），并夹在视口内
    const rect = el.getBoundingClientRect();
    const W = rect.width || 176;
    const H = rect.height || 160;
    let left = Math.min(Math.max(clientX, W / 2 + 10), window.innerWidth - W / 2 - 10);
    let top = clientY - 14;
    if (top - H < 10) {   // 太靠上：气泡放到标记下方，箭头朝上
        top = clientY + 14;
        el.classList.add('below');
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;

    setTimeout(() => {
        document.addEventListener('pointerdown', closePoiPopover, { once: true });
    }, 30);
    state.map.once('movestart', closePoiPopover);
    state.map.once('zoomstart', closePoiPopover);
}

function closePoiPopover() {
    clearTimeout(poiPopover.timer);
    poiPopover.timer = null;
    if (poiPopover.el) {
        const el = poiPopover.el;
        el.classList.add('closing');
        setTimeout(() => el.remove(), 160);
        poiPopover.el = null;
        poiPopover.id = null;
    }
}

/* ============================================================
   NingGuang FX（v3.27）· 光影即交互
   涟漪：手指落点光斑弥散；滑条：光随手指扩散；
   渐进模糊帽：地图内容接近导航岛逐级模糊；切 tab：浮岛受压回弹。
   全部为事件委托 + transform/box-shadow，无逐帧样式写入。
   ============================================================ */
(function initNingguangFX() {
    if (window.__ningguangFX) return;
    window.__ningguangFX = true;

    var RIPPLE_SEL = [
        '.quick-chip', '#tabbar .tab', '.search-fab', '.tour-btn',
        '.seg-btn', '.geo-action-btn', '.lf-mine-tab', '.so-hist-chip', '.alt-chip'
    ].join(', ');

    // —— 涟漪：光从手指落点弥散 ——
    document.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var host = e.target && e.target.closest ? e.target.closest(RIPPLE_SEL) : null;
        if (!host) return;
        host.classList.add('fx-host');
        var rect = host.getBoundingClientRect();
        var d = Math.max(rect.width, rect.height) * 2.2;
        var s = document.createElement('span');
        s.className = 'fx-ripple';
        s.style.width = s.style.height = d + 'px';
        s.style.left = Math.round(e.clientX - rect.left - d / 2) + 'px';
        s.style.top = Math.round(e.clientY - rect.top - d / 2) + 'px';
        host.appendChild(s);
        s.addEventListener('animationend', function () { s.remove(); }, { once: true });
        setTimeout(function () { s.remove(); }, 900);   // 兜底清理
    }, { passive: true, capture: true });

    // —— 光随：滑条写入 --pct，拇指光环在拖动时弥散（配合 CSS :active） ——
    function setPct(el) {
        var min = Number(el.min || 0), max = Number(el.max || 100), v = Number(el.value);
        var pct = max > min ? ((v - min) / (max - min)) * 100 : 50;
        el.style.setProperty('--pct', pct.toFixed(1) + '%');
    }
    document.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.tagName === 'INPUT' && t.type === 'range') setPct(t);
    }, { passive: true });
    function initRanges() {
        var ranges = document.querySelectorAll('input[type="range"]');
        for (var i = 0; i < ranges.length; i++) setPct(ranges[i]);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRanges, { once: true });
    } else {
        initRanges();
    }

    // —— 渐进模糊帽：挂在浮岛上沿，随岛拖动 ——
    var bar = document.getElementById('tabbar');
    if (bar) {
        var cap = document.createElement('div');
        cap.className = 'fx-pblur';
        cap.setAttribute('aria-hidden', 'true');
        bar.appendChild(cap);

        // —— 流体导航：切 tab 浮岛受压回弹（拖拽中不触发） ——
        bar.addEventListener('click', function (e) {
            if (!e.target.closest || !e.target.closest('.tab')) return;
            if (bar.classList.contains('tabbar-dragging')) return;
            bar.classList.remove('tabbar-bounce');
            void bar.offsetWidth;   // 重启动画
            bar.classList.add('tabbar-bounce');
        }, true);
        bar.addEventListener('animationend', function (e) {
            if (e.target === bar && e.animationName === 'tabbar-squash') {
                bar.classList.remove('tabbar-bounce');
            }
        });
    }
})();
/* NingGuang FX（v3.28）：抽屉跟手拖拽由 auth.js bindSheetDragClose 统一实现（弹性阻尼 + 速度判定） */
