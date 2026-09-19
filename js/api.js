/* ============================================
 * api.js — 云端数据同步客户端
 *
 * 职责：
 *   1. 启动时从后端拉取 POI 数据（超时/失败自动降级本地数据）
 *   2. 本机历史改动（自定义/修改/删除）首次联网时一次性迁移上云
 *   3. 增 / 改 / 删 / 恢复 操作实时同步到服务器
 *
 * 设计原则：云端不可用时应用完全保持本地模式，功能不受任何影响。
 * 依赖：campus-data.js（BUILDINGS/PATH_NODES）、appshell.js（Store）
 * ============================================ */

const CampusAPI = {
    ready: false,        // 云端是否可用
    migrated: false,     // 本次启动是否执行了迁移
    base: '',            // API 前缀；浏览器留空（相对路径），测试可指向绝对地址

    /** 带超时的 fetch 包装（自动附带登录 token，v3.12） */
    async _fetch(url, options = {}, timeoutMs = 3500) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(this.base + url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    // 登录后发布类操作携带身份；未登录不写（服务端会 401，保持本地模式）
                    ...(window.AuthCenter && AuthCenter.token
                        ? { Authorization: 'Bearer ' + AuthCenter.token } : {}),
                    ...(options.headers || {}),
                },
            });
            clearTimeout(timer);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const err = new Error(body.error || ('HTTP ' + res.status));
                // 透传业务码（如 CHAT_BANNED / CONTENT_BLOCKED）供调用方分支处理
                err.code = body.code;
                err.banned = !!body.banned;
                err.strike = body.strike;
                throw err;
            }
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    },

    /**
     * 启动初始化：拉取云端 POI 合并进 BUILDINGS / PATH_NODES。
     * 返回 true = 云端模式（调用方应跳过本地 applyPoiEdits/restoreCustomBuildings）
     */
    async init() {
        try {
            const data = await this._fetch('api/pois');
            this.ready = true;

            // 本机历史改动一次性迁移上云（老用户升级不丢数据）
            await this.migrateLocalEdits();
            const pois = this.migrated ? (await this._fetch('api/pois')).pois : data.pois;

            this.applyServerPois(pois);
            console.log(`[api] 云端模式：${pois.length} 个地点已同步`);
            return true;
        } catch (e) {
            this.ready = false;
            console.log('[api] 云端不可用，使用本地数据：', e.message);
            return false;
        }
    },

    /** 把服务器 POI 列表合并进前端数据结构 */
    applyServerPois(pois) {
        BUILDINGS.length = 0;
        pois.filter(p => !p.deleted).forEach(p => {
            BUILDINGS.push({
                id: p.id, name: p.name, category: p.category, x: p.x, y: p.y,
                info: { desc: p.desc, hours: p.hours, phone: p.phone, floors: p.floors },
            });
        });
        // 路网节点坐标同步（官方点本身即节点）
        BUILDINGS.forEach(b => {
            if (PATH_NODES[b.id]) PATH_NODES[b.id] = [b.x, b.y];
        });
        // 云端共建点接入路网（复用本地入口节点逻辑）
        BUILDINGS
            .filter(b => b.id.startsWith('b_user_') && !PATH_NODES['entry_' + b.id])
            .forEach(b => addEntryNodeForBuilding(b.id, b.x, b.y));
    },

    /** 首次联网：把本机的自定义/修改/删除上传到云端（只执行一次；需登录） */
    async migrateLocalEdits() {
        if (Store.data.cloudMigrated) return;
        // v3.12：发布类数据需登录后才能上云，未登录保持本机（登录后由 AuthCenter 触发迁移）
        if (window.AuthCenter && !AuthCenter.token) return;
        const hasLocal = (Store.data.custom || []).length
            || Object.keys(Store.data.poiOverrides || {}).length
            || (Store.data.poiDeleted || []).length;
        if (!hasLocal) {
            Store.data.cloudMigrated = true;
            Store.save();
            return;
        }
        try {
            for (const c of Store.data.custom) {
                await this._fetch('api/pois', {
                    method: 'POST',
                    body: JSON.stringify({
                        id: c.id, name: c.name, category: c.category, x: c.x, y: c.y,
                        desc: c.info && c.info.desc,
                    }),
                });
            }
            for (const [id, ov] of Object.entries(Store.data.poiOverrides || {})) {
                await this._fetch('api/pois/' + id, { method: 'PUT', body: JSON.stringify(ov) });
            }
            for (const id of Store.data.poiDeleted || []) {
                await this._fetch('api/pois/' + id, { method: 'DELETE' });
            }
            Store.data.cloudMigrated = true;
            Store.save();
            this.migrated = true;
            console.log('[api] 本机历史改动已迁移上云');
        } catch (e) {
            console.warn('[api] 迁移失败，下次启动重试：', e.message);
        }
    },

    /** 同步失败提示（本地已生效，仅提示云端未同步） */
    _syncFail(action, e) {
        if (typeof showToast === 'function') {
            showToast(`已${action}到本机（云端同步失败，联网后自动恢复）`, 'info', 2600);
        }
        console.warn('[api] 同步失败:', action, e.message);
    },

    /** 新建地点（异步同步，不阻塞本地流程） */
    create(poi) {
        if (!this.ready) return;
        this._fetch('api/pois', {
            method: 'POST',
            body: JSON.stringify({
                id: poi.id, name: poi.name, category: poi.category, x: poi.x, y: poi.y,
                desc: poi.info && poi.info.desc,
            }),
        }).catch(e => this._syncFail('保存', e));
    },

    /** 编辑地点（名称/分类/简介/坐标，部分字段） */
    update(id, fields) {
        if (!this.ready) return;
        this._fetch('api/pois/' + id, { method: 'PUT', body: JSON.stringify(fields) })
            .catch(e => this._syncFail('更新', e));
    },

    /** 删除地点 */
    remove(id) {
        if (!this.ready) return;
        this._fetch('api/pois/' + id, { method: 'DELETE' })
            .catch(e => this._syncFail('删除', e));
    },

    /** 恢复内置地点 */
    restore(id) {
        if (!this.ready) return;
        this._fetch('api/pois/' + id + '/restore', { method: 'POST' })
            .catch(e => this._syncFail('恢复', e));
    },

    /** 一键恢复全部官方地点（设置页「恢复默认」） */
    async restoreAll() {
        if (!this.ready) return;
        try {
            const data = await this._fetch('api/pois?includeDeleted=1');
            const tasks = data.pois
                .filter(p => p.builtin && (p.deleted || p.edited))
                .map(p => this._fetch('api/pois/' + p.id + '/restore', { method: 'POST' }));
            await Promise.all(tasks);
        } catch (e) {
            this._syncFail('恢复', e);
        }
    },

    /* ============================================================
     * 用户云数据（收藏 / 自定义地标 / 备注，按登录用户隔离）
     *   - 未登录：不读写（数据仅存本机）
     *   - 已登录：登录后 pull 合并，本地变更 debounce push 上云
     * ============================================================ */

    _udTimer: null,

    /** 拉取云端用户数据（需登录）；返回 {fav, custom, notes} 或 null */
    async pullUserData() {
        if (!window.AuthCenter || !AuthCenter.token) return null;
        try {
            const res = await this._fetch('api/userdata');
            return res.data || { fav: [], custom: [], notes: {} };
        } catch (e) {
            console.warn('[api] 拉取云端用户数据失败:', e.message);
            return null;
        }
    },

    /** 推送本地用户数据上云（debounce 500ms 合并高频操作） */
    pushUserData(immediate) {
        if (!window.AuthCenter || !AuthCenter.token || !window.Store) return;
        clearTimeout(this._udTimer);
        const doPush = () => {
            const d = window.Store.data;
            this._fetch('api/userdata', {
                method: 'PUT',
                body: JSON.stringify({
                    fav: d.fav || [],
                    custom: d.custom || [],
                    notes: d.notes || {},
                }),
            }).catch(e => console.warn('[api] 推送用户数据失败:', e.message));
        };
        if (immediate) doPush();
        else this._udTimer = setTimeout(doPush, 500);
    },
};

window.CampusAPI = CampusAPI;
