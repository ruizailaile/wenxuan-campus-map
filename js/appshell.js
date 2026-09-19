/* ============================================
 * appshell.js — App 壳层
 *
 * 职责：
 *   1. Store：localStorage 本地存储（用户/地标/收藏/历史/设置）
 *   2. 底部 Tab 导航 + 页面路由
 *   3. 个人中心页（资料、统计、我的地标、收藏、历史）
 *   4. 设置页（定位权限、隐私、通用、关于）
 *   5. 「我的位置」蓝色定位标记（可拖动）
 * ============================================ */

// ====== 1. 本地存储 ======
const STORE_KEY = 'wenxuan_campus_app_v2';

const Store = {
    data: null,

    defaults() {
        return {
            user: { nickname: '校园漫步者', avatar: '🎓', bio: '' },
            custom: [],       // 用户自定义地标 [{id, name, category, x, y, info}]
            fav: [],          // 收藏的建筑 id
            history: [],      // 浏览历史 [{id, name, ts}]，最新在前
            searchHistory: [],// 搜索历史 [kw]，最新在前，最多 8 条
            notes: {},        // 地点备注 { [poiId]: text }
            settings: {
                anonymous: false,      // 匿名模式：不记录历史
                geoService: true,      // 定位服务开关：false=不获取设备位置并清除已存 gps
                showLocation: true,    // 是否显示我的位置标记
                rememberView: true,    // 启动时完整显示全图
                theme: 'system',       // 主题：system 跟随系统 | light 浅色 | dark 深色
                glassAlpha: 55,        // 液态玻璃透明度 10~90（%）
                glassBlur: 28,         // 液态玻璃模糊度 0~48（px）
                aurora: 'aurora',      // v3.28 极光灵感主题：aurora|dawn|night|amber|auto（每日轮播）
                tabbarPos: null,       // 底部胶囊悬浮位置 {w,left,right,bottom}
            },
            myLocation: null,     // {x, y} 校园坐标系
            gps: null,            // 设备 GPS 坐标（仅权限验证展示）
            poiOverrides: {},     // 内置地点的本地修改 {id: {x?, y?, name?, desc?, category?}}
            poiDeleted: [],       // 被删除的内置地点 id（可通过设置恢复）
        };
    },

    load() {
        this.data = this.defaults();
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                this.data = {
                    ...this.data,
                    ...saved,
                    user: { ...this.data.user, ...(saved.user || {}) },
                    settings: { ...this.data.settings, ...(saved.settings || {}) },
                };
            }
        } catch (e) {
            console.warn('本地数据读取失败，使用默认值', e);
        }
        return this.data;
    },

    save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('本地数据保存失败', e);
        }
    },

    /** 收藏/地标/备注变更后：登录态下 debounce 同步上云（未登录自动忽略） */
    _cloudSync() {
        if (window.CampusAPI && window.AuthCenter && AuthCenter.token) {
            CampusAPI.pushUserData();
        }
    },

    // ---- 收藏 ----
    isFav(id) { return this.data.fav.includes(id); },
    toggleFav(id) {
        const i = this.data.fav.indexOf(id);
        if (i >= 0) this.data.fav.splice(i, 1);
        else this.data.fav.unshift(id);
        this.save();
        this._cloudSync();
        return i < 0; // 返回 true = 已收藏
    },

    // ---- 历史 ----
    pushHistory(id, name) {
        if (this.data.settings.anonymous) return;
        const h = this.data.history;
        const i = h.findIndex(x => x.id === id);
        if (i >= 0) h.splice(i, 1);
        h.unshift({ id, name, ts: Date.now() });
        if (h.length > 30) h.length = 30;
        this.save();
    },
    clearHistory() {
        this.data.history = [];
        this.save();
    },

    // ---- 搜索历史 ----
    pushSearch(kw) {
        const k = (kw || '').trim();
        if (!k) return;
        const h = this.data.searchHistory;
        const i = h.indexOf(k);
        if (i >= 0) h.splice(i, 1);
        h.unshift(k);
        if (h.length > 8) h.length = 8;
        this.save();
    },
    clearSearchHistory() {
        this.data.searchHistory = [];
        this.save();
    },

    // ---- 地点备注（仅本机） ----
    setNote(id, text) {
        const t = (text || '').trim();
        if (t) this.data.notes[id] = t;
        else delete this.data.notes[id];
        this.save();
        this._cloudSync();
    },
    getNote(id) {
        return this.data.notes[id] || '';
    },

    // ---- 自定义地标 ----
    addCustom(b) {
        this.data.custom.push({
            id: b.id, name: b.name, category: b.category, x: b.x, y: b.y, info: b.info,
        });
        this.save();
        this._cloudSync();
    },
    removeCustom(id) {
        this.data.custom = this.data.custom.filter(b => b.id !== id);
        this.data.fav = this.data.fav.filter(f => f !== id);
        this.data.history = this.data.history.filter(h => h.id !== id);
        this.save();
        this._cloudSync();
    },

    /** 更新自定义地标（名称/分类/位置/简介等） */
    updateCustom(id, patch) {
        const c = this.data.custom.find(b => b.id === id);
        if (!c) return;
        const { info: patchInfo, ...rest } = patch;
        Object.assign(c, rest);
        if (patchInfo) c.info = { ...(c.info || {}), ...patchInfo };
        this.save();
        this._cloudSync();
    },

    // ---- 内置地点的本地编辑（覆盖 + 删除，均可恢复） ----
    setPoiOverride(id, patch) {
        this.data.poiOverrides[id] = { ...(this.data.poiOverrides[id] || {}), ...patch };
        this.save();
    },
    getPoiOverride(id) {
        return this.data.poiOverrides[id] || null;
    },
    deleteBuiltinPoi(id) {
        if (!this.data.poiDeleted.includes(id)) this.data.poiDeleted.push(id);
        this.data.fav = this.data.fav.filter(f => f !== id);
        this.data.history = this.data.history.filter(h => h.id !== id);
        this.save();
    },
    /** 恢复单个内置地点：清除删除标记 + 本地覆盖 */
    restoreBuiltinPoi(id) {
        this.data.poiDeleted = this.data.poiDeleted.filter(x => x !== id);
        delete this.data.poiOverrides[id];
        this.save();
    },
    /** 恢复全部官方地点到初始状态 */
    resetPoiEdits() {
        this.data.poiOverrides = {};
        this.data.poiDeleted = [];
        this.save();
    },
    poiEditCount() {
        return Object.keys(this.data.poiOverrides).length + this.data.poiDeleted.length;
    },

    clearAll() {
        localStorage.removeItem(STORE_KEY);
    },
};

Store.load();

// ====== 2. AppShell ======
const AppShell = {
    map: null,
    locationMarker: null,
    pickMode: null,        // null | 'location'
    geoPermState: null,
    _loaded: {},           // v3.21：模块懒加载缓存 { lostfound: Promise, chat: Promise }

    setMap(map) {
        this.map = map;
        map.on('click', (e) => {
            if (this.pickMode !== 'location') return;
            const x = e.latlng.lng;
            const y = MAP_HEIGHT - e.latlng.lat;
            this.setMyLocation(x, y);
            this.exitPickMode();
        });
    },

    init() {
        this.initTheme();
        this.applyGlassSettings();   // 启动即应用持久化的玻璃透明/模糊设置
        this.initSplash();
        this.initTabs();
        // 主导航保持固定位置：地图页需要稳定的拇指热区，不能被长按意外拖走。
        this.initPageEvents();
        this.preloadLazyModules();   // v3.35
        this.initProfile();
        this.initSettings();
        this.initExtras();
        this.renderUserLocation();
        this.initOnboarding();
    },

    // ---------- 主题（浅色 / 深色 / 跟随系统） ----------
    initTheme() {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            const pref = Store.data.settings.theme || 'system';
            const dark = pref === 'dark' || (pref === 'system' && mq.matches);
            document.documentElement.dataset.theme = dark ? 'dark' : 'light';
            // v3.28 灵感主题：auto = 按天轮播四款配色
            const AURORA_POOL = ['aurora', 'dawn', 'night', 'amber'];
            const auroraPref = Store.data.settings.aurora || 'aurora';
            document.documentElement.dataset.aurora =
                auroraPref === 'auto' ? AURORA_POOL[Math.floor(Date.now() / 86400000) % AURORA_POOL.length] : auroraPref;
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.content = dark ? '#14161f' : '#FFF7EE';
        };
        if (mq.addEventListener) mq.addEventListener('change', apply);
        else if (mq.addListener) mq.addListener(apply);   // 旧版 Safari
        this._applyTheme = apply;
        apply();
    },

    // ---------- 启动屏 ----------
    initSplash() {
        const splash = document.getElementById('splash');
        if (!splash) return;
        const hide = () => splash.classList.add('gone');
        splash.addEventListener('animationend', hide, { once: true });
        setTimeout(hide, 2200);   // 兜底（如动画被禁用）
    },

    // ---------- 首次使用引导 ----------
    initOnboarding() {
        const ob = document.getElementById('onboard');
        if (!ob) return;
        const KEY = 'wx_onboarded_v1';
        let shown = false;
        try { shown = localStorage.getItem(KEY) === '1'; } catch (e) {}
        // 首次使用不再用全屏教学和登录抽屉打断找地点；新生导览保留为地图上的按需入口。
        if (shown) return;
        ob.classList.add('hidden');
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
        return;

        ob.classList.remove('hidden');
        const slides = [...ob.querySelectorAll('.ob-slide')];
        const dots = [...ob.querySelectorAll('.ob-dots i')];
        const nextBtn = document.getElementById('obNext');
        const skipBtn = document.getElementById('obSkip');
        let i = 0;

        const finish = () => {
            ob.classList.add('hidden');
            try { localStorage.setItem(KEY, '1'); } catch (e) {}
        };
        const show = (n) => {
            slides.forEach((s, k) => {
                s.classList.toggle('active', k === n);
                s.classList.toggle('leaving', k < n);
            });
            dots.forEach((d, k) => d.classList.toggle('active', k === n));
            nextBtn.textContent = n === slides.length - 1 ? '开始探索' : '下一步';
            i = n;
        };
        nextBtn.addEventListener('click', () => (i < slides.length - 1 ? show(i + 1) : finish()));
        skipBtn.addEventListener('click', finish);
        show(0);
    },

    // ---------- 求助 / 协议 / 检查更新 ----------
    initExtras() {
        // 紧急求助：一键呼叫保卫处（号码与地点数据保持一致）
        const sos = document.getElementById('btnSOS');
        if (sos) {
            sos.classList.add('sos');
            sos.addEventListener('click', () => {
                const phone = (BUILDINGS.find(b => b.id === 'b_medical')?.info.phone) || '0825-8888888';
                if (typeof showToast === 'function') showToast('正在呼叫校园保卫处…', 'info', 1600);
                setTimeout(() => { location.href = 'tel:' + phone; }, 500);
            });
        }

        // 用户协议 / 隐私政策
        const docs = {
            btnTerms: {
                title: '用户协议',
                body: '本应用为四川文轩职业学院遂宁校区校园导览工具，由「锐仔来了」独立开发与维护，面向师生及访客免费提供。' +
                    '使用本应用即表示您同意：仅将地图与导航信息作为出行参考，遵守校园管理规定；' +
                    '不利用本应用发布违法违规信息。应用内容（地图数据、地点信息）可能随校园建设调整而更新，以现场指引为准。' +
                    '\n\n如有问题或建议，欢迎加入地图反馈QQ群：1094409084。'
            },
            btnPrivacy: {
                title: '隐私政策',
                body: '本应用由「锐仔来了」开发。您的昵称、收藏、浏览记录、自定义地标与位置标记默认仅保存在本机浏览器（localStorage），' +
                    '清除浏览器数据或点击"清除全部本地数据"即彻底删除。' +
                    '如您开启系统定位，设备位置仅用于本机显示，不会被记录或上传。' +
                    '登录账号后，同学共建的地点数据（新增/修改）会同步到共享服务器，仅保存地点内容本身，不含任何个人隐私信息。' +
                    '\n\n对隐私有任何疑问，欢迎加入地图反馈QQ群：1094409084 联系我们。'
            }
        };
        Object.entries(docs).forEach(([id, doc]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => this.showDoc(doc.title, doc.body));
        });

        // 地图反馈：一键复制Q群号
        const fb = document.getElementById('btnFeedback');
        if (fb) {
            fb.addEventListener('click', async () => {
                const qq = '1094409084';
                try {
                    await navigator.clipboard.writeText(qq);
                    if (typeof showToast === 'function') showToast('Q群号 1094409084 已复制，去QQ加群吧', 'success', 2200);
                } catch (e) {
                    this.showDoc('地图反馈', '加入地图反馈QQ群：1094409084\n（作者：锐仔来了，欢迎反馈问题与建议）');
                }
            });
        }

        // 检查更新（纯静态应用：刷新缓存即最新）
        const upd = document.getElementById('btnUpdate');
        if (upd) {
            upd.addEventListener('click', () => {
                upd.classList.add('busy');
                upd.textContent = '检查中…';
                setTimeout(() => {
                    upd.classList.remove('busy');
                    upd.textContent = '已最新';
                    const desc = document.getElementById('updateDesc');
                    if (desc) desc.textContent = '已是最新版本 v3.40（' + new Date().toLocaleDateString('zh-CN') + '）';
                    if (typeof showToast === 'function') showToast('已是最新版本', 'success', 1600);
                    if (navigator.serviceWorker) {
                        navigator.serviceWorker.getRegistrations?.()
                            .then(rs => rs.forEach(r => r.update?.()));
                    }
                }, 900);
            });
        }
    },

    /** 协议/政策/帮助 弹窗（复用玻璃卡风格；html=true 时正文为富文本） */
    showDoc(title, body, html) {
        let layer = document.getElementById('doc-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'doc-layer';
            layer.className = 'doc-layer';
            layer.innerHTML = `
                <div class="doc-card">
                    <h3 class="doc-title"></h3>
                    <div class="doc-body"></div>
                    <button class="btn-primary btn-sm doc-ok">我知道了</button>
                </div>`;
            document.body.appendChild(layer);
            layer.addEventListener('click', (e) => {
                if (e.target === layer || e.target.classList.contains('doc-ok')) {
                    layer.classList.remove('open');
                }
            });
        }
        layer.querySelector('.doc-title').textContent = title;
        const bodyEl = layer.querySelector('.doc-body');
        if (html) bodyEl.innerHTML = body;
        else bodyEl.textContent = body;
        layer.classList.add('open');
    },

    // ---------- Tab 路由 ----------
    initTabs() {
        document.querySelectorAll('#tabbar .tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // 桌面侧边栏底部入口
        document.querySelectorAll('.side-entry').forEach(btn => {
            btn.addEventListener('click', () => this.openPage(btn.dataset.goto));
        });
    },

    /**
     * 底部胶囊长按拖动悬浮（液态玻璃悬浮体验）
     * 长按 260ms 拾起 → 跟手拖动 → 松手吸附到左/右/底部边缘
     * 仅移动端（<768px）生效；位置存本机（settings.tabbarPos）
     * 优化：pointer capture 防拖出丢手、rAF 节流、避免强制重排
     */
    initTabbarFloat() {
        const bar = document.getElementById('tabbar');
        if (!bar) return;

        let dragging = false;
        let longPressTimer = null;
        let startX = 0, startY = 0;
        let moved = false;
        let baseLeft = 0, baseBottom = 0;
        let barW = 0;              // 拾起时的胶囊宽度（缓存，避免拖拽中反复读布局）
        let raf = null;            // rAF 节流句柄
        let pendingX = 0, pendingY = 0;   // 待应用的最新指针坐标
        let activePointer = null;  // 当前指针 id（capture 用）

        const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

        // 恢复上次位置
        const saved = Store.data.settings.tabbarPos;
        if (saved && saved.w) {
            bar.style.width = saved.w + 'px';
            bar.style.left = saved.left + 'px';
            bar.style.right = 'auto';
            bar.style.bottom = saved.bottom + 'px';
        }

        // 用 rAF 合并高频 pointermove，避免每帧多次写 style 触发重排
        const applyFrame = () => {
            raf = null;
            if (!dragging) return;
            const maxLeft = Math.max(14, window.innerWidth - barW - 14);
            bar.style.left = Math.min(Math.max(14, baseLeft + (pendingX - startX)), maxLeft) + 'px';
            bar.style.bottom = Math.min(Math.max(10, baseBottom + (startY - pendingY)), 120) + 'px';
        };

        const start = (e) => {
            if (!isMobile()) return;
            if (activePointer !== null) return;   // 已在拖动，忽略多指
            moved = false;
            dragging = false;
            activePointer = e.pointerId;
            startX = e.clientX; startY = e.clientY;
            const rect = bar.getBoundingClientRect();
            // 拾起前固定宽度、切到 left 定位，避免拖拽时胶囊被拉伸
            barW = rect.width;
            bar.style.width = barW + 'px';
            bar.style.left = rect.left + 'px';
            bar.style.right = 'auto';
            baseLeft = rect.left;
            baseBottom = window.innerHeight - rect.bottom;
            // 捕获指针：手指拖出胶囊仍能持续跟踪，避免 pointerleave 丢手
            try { bar.setPointerCapture(e.pointerId); } catch (_) {}
            longPressTimer = setTimeout(() => {
                dragging = true;
                bar.classList.add('tabbar-dragging');
            }, 260);
        };

        const move = (e) => {
            if (e.pointerId !== activePointer) return;
            pendingX = e.clientX; pendingY = e.clientY;
            const dx = pendingX - startX, dy = pendingY - startY;
            if (!dragging) {
                // 未触发长按前移动超过阈值则取消（判定为点击）
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                return;
            }
            moved = true;
            if (!raf) raf = requestAnimationFrame(applyFrame);
        };

        const end = (e) => {
            if (e && e.pointerId !== activePointer) return;
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            if (activePointer !== null) {
                try { bar.releasePointerCapture(activePointer); } catch (_) {}
                activePointer = null;
            }
            if (!dragging) return;
            bar.classList.remove('tabbar-dragging');
            dragging = false;
            if (raf) { cancelAnimationFrame(raf); raf = null; }
            if (!moved) return;
            // 松手吸附：靠近哪边就贴哪边
            const rect = bar.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const margin = 14;
            const bottom = Math.min(Math.max(10, window.innerHeight - rect.bottom), 120);
            if (cx < window.innerWidth / 2) {
                bar.style.left = margin + 'px';
                bar.style.right = 'auto';
            } else {
                bar.style.left = 'auto';
                bar.style.right = margin + 'px';
            }
            bar.style.bottom = bottom + 'px';
            const r2 = bar.getBoundingClientRect();
            Store.data.settings.tabbarPos = {
                w: r2.width,
                left: r2.left,
                right: window.innerWidth - r2.right,
                bottom: window.innerHeight - r2.bottom,
            };
            Store.save();
        };

        bar.addEventListener('pointerdown', start);
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
        // 拖动后阻止误触发 tab 点击（幽灵点击）
        bar.addEventListener('click', (e) => {
            if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
        }, true);
        // 阻止拖动时选中文本
        bar.addEventListener('dragstart', (e) => e.preventDefault());
    },

    switchTab(tab) {
        document.body.dataset.tab = tab;
        document.querySelectorAll('#tabbar .tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        if (tab === 'map' && this.map) {
            // 切回地图时重算尺寸，避免容器变换后渲染错位
            setTimeout(() => this.map.invalidateSize(), 60);
        }
        if (tab === 'profile') {
            this.openPage('profile');
        } else if (tab === 'lostfound') {
            this.openPage('lostfound');
            this._ensureLoaded('lostfound').then(() => {
                if (window.LostFound) {
                    // v3.35 修复：模块从未被 init()，绑定从未发生（"能看不能点"根因）
                    if (!LostFound._inited) { LostFound._inited = true; LostFound.init(); }
                    else { LostFound.load(); setTimeout(() => LostFound.render(), 60); }
                }
            });
        } else if (tab === 'chat') {
            this.openPage('chat');
            this._ensureLoaded('chat').then(() => {
                if (window.Chat) {
                    if (!Chat._inited) { Chat._inited = true; Chat.init(); }
                    else {
                        Chat.user = (window.AuthCenter && AuthCenter.user) || null;
                        Chat.renderRooms();
                    }
                }
            });
        } else {
            this.closePage('profile');
            this.closePage('settings');
            this.closePage('lostfound');
            this.closePage('chat');
            this.closePage('chatroom');
        }
    },

    // v3.21：按需加载失物招领 / 聊天模块（首次进入 tab 时插入 <script>，经典脚本兼容）
    _ensureLoaded(mod) {
        if (this._loaded[mod]) return this._loaded[mod];
        // v3.35：懒加载模块版本自动跟随主资源版本（此前硬编码 v=86，HTTP 缓存导致发版后旧模块长期残留）
        let assetVer = '95';
        const selfTag = document.querySelector('script[src*="appshell.js"]');
        const vm = selfTag && (selfTag.src.match(/v=([\w.]+)/) || [])[1];
        if (vm) assetVer = vm;
        const path = mod === 'lostfound' ? 'js/lostfound.js?v=' + assetVer : 'js/chat.js?v=' + assetVer;
        this._loaded[mod] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = path;
            s.async = false;
            s.onload = () => resolve();
            s.onerror = () => {
                delete this._loaded[mod];
                showToast('模块加载失败，请刷新页面', 'error', 2200);
                reject(new Error('load failed: ' + path));
            };
            document.head.appendChild(s);
        });
        return this._loaded[mod];
    },

    /** 打开覆盖式页面（profile / settings），桌面与手机一致 */
    openPage(name) {
        const page = document.getElementById('page-' + name);
        if (!page) return;
        page.classList.add('open');
        if (name === 'profile') this.renderProfile();
        if (name === 'settings') this.refreshGeoPerm();
        if (name === 'permissions' && window.PermCenter) PermCenter.renderPage();
    },

    closePage(name) {
        const page = document.getElementById('page-' + name);
        if (page) page.classList.remove('open');
    },

    /** 页面内通用事件（返回按钮 / 入口） */
    /** v3.35：启动即预载懒加载模块（失物招领/聊天）。此前首切 tab 才注入脚本，
     *  弱网下偶发加载失败且无重试，页面渲染但无任何事件处理器（"能看不能点"）。 */
    preloadLazyModules() {
        const boot = (mod, obj, initFlag) => this._ensureLoaded(mod).then(() => {
            if (window[obj] && !window[obj][initFlag]) { window[obj][initFlag] = true; window[obj].init(); }
        }).catch(() => {});
        const kick = () => { try { boot('lostfound', 'LostFound', '_inited'); boot('chat', 'Chat', '_inited'); } catch (e) { /* 下次切 tab 仍会重试 */ } };
        if (window.requestIdleCallback) requestIdleCallback(kick, { timeout: 3000 });
        else setTimeout(kick, 1200);
    },

    initPageEvents() {
        document.querySelectorAll('.ap-back').forEach(btn => {
            btn.addEventListener('click', () => {
                const goto = btn.dataset.goto;
                const page = btn.closest('.app-page');
                if (page) page.classList.remove('open');
                if (goto === 'map') this.switchTab('map');
            });
        });

        document.querySelectorAll('[data-goto]').forEach(btn => {
            if (btn.classList.contains('ap-back')) return;
            btn.addEventListener('click', () => {
                const goto = btn.dataset.goto;
                if (btn.dataset.action === 'add') {
                    this.closePage('profile');
                    this.switchTab('map');
                    if (typeof toggleAddMode === 'function') toggleAddMode(true);
                    return;
                }
                if (goto === 'settings') { this.openPage('settings'); return; }
                if (goto === 'permissions') { this.openPage('permissions'); return; }
                if (goto === 'map') { this.switchTab('map'); return; }
            });
        });

        document.querySelectorAll('[data-action="clear-history"]').forEach(btn => {
            btn.addEventListener('click', () => {
                Store.clearHistory();
                this.renderProfile();
                if (typeof showToast === 'function') showToast('已清空浏览记录', 'success', 1600);
            });
        });
    },

    // ---------- 个人中心 ----------
    // 头像/昵称/签名/学生信息 全部并入「编辑资料」抽屉（AuthCenter.open('editProfile')），
    // 这里不再有可点击的头像按钮，故 initProfile 暂留作空函数以兼容旧引用。
    initProfile() {},

    renderProfile() {
        const d = Store.data;
        const customCount = d.custom.length;
        document.getElementById('statLandmarks').textContent = customCount;
        document.getElementById('statFav').textContent = d.fav.length;
        document.getElementById('statHistory').textContent = d.history.length;

        // ---- 我的地标 ----
        const lmList = document.getElementById('myLandmarkList');
        if (customCount === 0) {
            lmList.innerHTML = `<div class="ps-empty">还没有自定义地标<br><small>点地图右下角 ➕ 或中间按钮添加</small></div>`;
        } else {
            lmList.innerHTML = d.custom.map(b => {
                const cat = CATEGORIES[b.category] || {};
                return `
                    <div class="ps-item" data-id="${b.id}">
                        <span class="ps-item-icon" style="background:${(cat.color || '#888')}20">${cat.icon || '📍'}</span>
                        <span class="ps-item-name">${b.name}</span>
                        <button class="ps-item-btn" data-loc="${b.id}" title="定位" aria-label="定位 ${b.name}">📍</button>
                        <button class="ps-item-btn ps-del" data-del="${b.id}" title="删除" aria-label="删除 ${b.name}">🗑️</button>
                    </div>`;
            }).join('');
        }

        // ---- 收藏 ----
        const favList = document.getElementById('myFavList');
        const favBuildings = d.fav
            .map(id => BUILDINGS.find(b => b.id === id))
            .filter(Boolean);
        if (favBuildings.length === 0) {
            favList.innerHTML = `<div class="ps-empty">打开地点详情点 ⭐ 即可收藏</div>`;
        } else {
            favList.innerHTML = favBuildings.map(b => {
                const cat = CATEGORIES[b.category] || {};
                return `
                    <div class="ps-item" data-id="${b.id}">
                        <span class="ps-item-icon" style="background:${cat.color}20">${cat.icon}</span>
                        <span class="ps-item-name">${b.name}</span>
                        <button class="ps-item-btn" data-loc="${b.id}" title="定位" aria-label="定位 ${b.name}">📍</button>
                    </div>`;
            }).join('');
            enableFavReorder(favList);   // 长按拖动排序（顺序持久化到 Store.fav）
        }

        // ---- 历史 ----
        const hList = document.getElementById('myHistoryList');
        if (d.history.length === 0) {
            hList.innerHTML = `<div class="ps-empty">暂无浏览记录${d.settings.anonymous ? '（匿名模式已开启）' : ''}</div>`;
        } else {
            hList.innerHTML = d.history.slice(0, 10).map(h => `
                <div class="ps-item" data-id="${h.id}">
                    <span class="ps-item-icon" style="background:#9575CD20">🕘</span>
                    <span class="ps-item-name">${h.name}</span>
                    <button class="ps-item-btn" data-loc="${h.id}" title="定位" aria-label="定位 ${h.name}">📍</button>
                </div>`).join('');
        }

        // ---- 绑定点击 ----
        lmList.querySelectorAll('[data-loc]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.locateFromProfile(btn.dataset.loc);
            });
        });
        lmList.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof deleteBuilding === 'function') deleteBuilding(btn.dataset.del);
                this.renderProfile();
            });
        });
        favList.querySelectorAll('[data-loc]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.locateFromProfile(btn.dataset.loc);
            });
        });
        hList.querySelectorAll('[data-loc]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.locateFromProfile(btn.dataset.loc);
            });
        });
    },

    /** 从个人中心跳到地图并定位某个地点 */
    locateFromProfile(id) {
        this.closePage('profile');
        this.switchTab('map');
        if (typeof flyToBuilding === 'function') flyToBuilding(id);
        if (typeof showBuildingInfo === 'function') showBuildingInfo(id);
    },

    // ---------- 设置页 ----------
    initSettings() {
        // 开关组件
        const bindSwitch = (el, key, onChange) => {
            if (!el) return;
            const sync = () => {
                el.classList.toggle('on', !!Store.data.settings[key]);
                el.setAttribute('aria-checked', String(!!Store.data.settings[key]));
            };
            el.addEventListener('click', () => {
                Store.data.settings[key] = !Store.data.settings[key];
                Store.save();
                sync();
                if (onChange) onChange(Store.data.settings[key]);
            });
            sync();
        };

        bindSwitch(document.getElementById('swAnonymous'), 'anonymous', (on) => {
            if (on) {
                Store.clearHistory();
                Store.clearSearchHistory();
                this.renderProfile();
            }
            if (typeof showToast === 'function') showToast(on ? '已开启匿名模式' : '已关闭匿名模式', 'info', 1600);
        });

        bindSwitch(document.getElementById('swShowLocation'), 'showLocation', (on) => {
            this.renderUserLocation();
            if (typeof showToast === 'function') showToast(on ? '已显示我的位置' : '已隐藏我的位置', 'info', 1500);
        });

        bindSwitch(document.getElementById('swRememberView'), 'rememberView', (on) => {
            // 开启 = 启动时完整显示全图（清除历史位置避免误解）；关闭 = 启动恢复上次位置
            if (on) { Store.data.mapView = null; Store.save(); }
        });

        // ---- 主题模式（分段选择：跟随系统 / 浅色 / 深色） ----
        const themeSeg = document.getElementById('themeSeg');
        if (themeSeg) {
            const labels = { system: '跟随系统', light: '浅色', dark: '深色' };
            const syncSeg = () => {
                const cur = Store.data.settings.theme || 'system';
                themeSeg.querySelectorAll('.seg-btn').forEach(b => {
                    const on = b.dataset.theme === cur;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-checked', String(on));
                });
            };
            const setTheme = (theme, announce = true) => {
                if (!labels[theme]) return;
                Store.data.settings.theme = theme;
                Store.save();
                syncSeg();
                if (this._applyTheme) this._applyTheme();
                if (announce && typeof showToast === 'function') {
                    showToast(`主题已切换：${labels[theme]}`, 'success', 1500);
                }
            };
            themeSeg.addEventListener('click', (e) => {
                const btn = e.target.closest('.seg-btn');
                if (!btn) return;
                setTheme(btn.dataset.theme);
            });
            themeSeg.addEventListener('keydown', (e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                const buttons = [...themeSeg.querySelectorAll('.seg-btn')];
                const current = Math.max(0, buttons.findIndex(b => b.dataset.theme === (Store.data.settings.theme || 'system')));
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
                    : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                e.preventDefault();
                buttons[next].focus();
                setTheme(buttons[next].dataset.theme);
            });
            syncSeg();
        }

        // ---- v3.28 极光灵感主题（分段：极光 / 晨曦 / 夜航 / 琥珀 / 轮播） ----
        const auroraSeg = document.getElementById('auroraSeg');
        if (auroraSeg) {
            const aLabels = { aurora: '极光', dawn: '晨曦', night: '夜航', amber: '琥珀', auto: '轮播' };
            const syncAurora = () => {
                const cur = Store.data.settings.aurora || 'aurora';
                auroraSeg.querySelectorAll('.seg-btn').forEach(b => {
                    const on = b.dataset.aurora === cur;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-checked', String(on));
                });
            };
            const setAurora = (a, announce = true) => {
                if (!aLabels[a]) return;
                Store.data.settings.aurora = a;
                Store.save();
                syncAurora();
                if (this._applyTheme) this._applyTheme();
                if (announce && typeof showToast === 'function') {
                    showToast(a === 'auto' ? '灵感轮播已开启，每天换一款' : ('极光主题：' + aLabels[a]), 'success', 1500);
                }
            };
            auroraSeg.addEventListener('click', (e) => {
                const btn = e.target.closest('.seg-btn');
                if (!btn) return;
                setAurora(btn.dataset.aurora);
            });
            auroraSeg.addEventListener('keydown', (e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                const buttons = [...auroraSeg.querySelectorAll('.seg-btn')];
                const current = Math.max(0, buttons.findIndex(b => b.dataset.aurora === (Store.data.settings.aurora || 'aurora')));
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
                    : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                e.preventDefault();
                buttons[next].focus();
                setAurora(buttons[next].dataset.aurora);
            });
            syncAurora();
        }

        // ---- v3.38 项目源码：点击复制仓库地址（失败则打开）----
        const btnGithub = document.getElementById('btnGithub');
        if (btnGithub) {
            btnGithub.addEventListener('click', async () => {
                const url = 'https://github.com/ruizailaile/wenxuan-campus-map';
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('项目地址已复制，去浏览器打开即可', 'success', 2600);
                } catch (e) {
                    window.open(url, '_blank');
                }
            });
        }

        // ---- 液态玻璃自定义：透明度 / 模糊度滑块（实时写入 :root，持久化本机） ----
        this.bindGlassSliders();

        // ---- 地点数据：恢复官方默认 ----
        const refreshPoiEditDesc = () => {
            const desc = document.getElementById('poiEditDesc');
            if (!desc) return;
            const n = Store.poiEditCount();
            const del = Store.data.poiDeleted.length;
            desc.textContent = n === 0
                ? '未修改过官方地点'
                : `已修改 ${n - del} 处 · 删除 ${del} 个（仅本机生效）`;
        };
        refreshPoiEditDesc();
        this._refreshPoiEditDesc = refreshPoiEditDesc;

        const btnResetPoi = document.getElementById('btnResetPoi');
        if (btnResetPoi) {
            const resetPoiLabel = btnResetPoi.textContent;
            btnResetPoi.addEventListener('click', () => {
                if (Store.poiEditCount() === 0) {
                    if (typeof showToast === 'function') showToast('地点数据本来就是默认状态', 'info', 1600);
                    return;
                }
                if (!btnResetPoi.dataset.armed) {
                    btnResetPoi.dataset.armed = '1';
                    btnResetPoi.textContent = '再点确认';
                    btnResetPoi.classList.add('armed');
                    setTimeout(() => {
                        delete btnResetPoi.dataset.armed;
                        btnResetPoi.textContent = resetPoiLabel;
                        btnResetPoi.classList.remove('armed');
                    }, 2600);
                    return;
                }
                Store.resetPoiEdits();
                if (window.CampusAPI) CampusAPI.restoreAll();   // 云端同步恢复
                if (typeof showToast === 'function') {
                    showToast('已恢复官方地点数据，即将刷新…', 'success', 1400);
                }
                setTimeout(() => location.reload(), 1200);
            });
        }

        // 定位服务开关：开启=请求系统定位（仅本地记录）；关闭=清除设备位置
        const swGeo = document.getElementById('swGeoService');
        if (swGeo) {
            swGeo.addEventListener('click', () => {
                const turningOn = !swGeo.classList.contains('on');
                Store.data.settings.geoService = turningOn;
                Store.save();
                if (turningOn) {
                    this.requestGeo();
                } else {
                    Store.data.gps = null;
                    Store.save();
                    this.refreshGeoPerm();
                    if (window.PermCenter) PermCenter.refreshIfOpen();
                    if (typeof showToast === 'function') showToast('已关闭定位服务', 'info', 1600);
                }
            });
        }
        this.refreshGeoPerm();

        // 设置我的位置 / 清除
        const btnSetLoc = document.getElementById('btnSetLocation');
        const btnRemoveLoc = document.getElementById('btnRemoveLocation');
        const refreshLocationActions = () => {
            const hasLocation = !!Store.data.myLocation;
            if (!btnRemoveLoc) return;
            btnRemoveLoc.disabled = !hasLocation;
            btnRemoveLoc.setAttribute('aria-disabled', String(!hasLocation));
            if (!hasLocation) {
                delete btnRemoveLoc.dataset.armed;
                btnRemoveLoc.classList.remove('armed');
                btnRemoveLoc.setAttribute('aria-label', '没有可清除的位置');
            } else {
                btnRemoveLoc.setAttribute('aria-label', '清除我的位置');
            }
        };
        this._refreshLocationActions = refreshLocationActions;
        refreshLocationActions();
        if (btnSetLoc) {
            btnSetLoc.addEventListener('click', () => {
                this.closePage('settings');
                this.switchTab('map');
                this.startLocationPick();
            });
        }
        if (btnRemoveLoc) {
            btnRemoveLoc.addEventListener('click', () => {
                if (!Store.data.myLocation) return;
                if (!btnRemoveLoc.dataset.armed) {
                    btnRemoveLoc.dataset.armed = '1';
                    btnRemoveLoc.classList.add('armed');
                    btnRemoveLoc.setAttribute('aria-label', '再次点击确认清除我的位置');
                    setTimeout(() => {
                        delete btnRemoveLoc.dataset.armed;
                        btnRemoveLoc.classList.remove('armed');
                        refreshLocationActions();
                    }, 2600);
                    return;
                }
                Store.data.myLocation = null;
                Store.save();
                this.removeLocationMarker();
                if (typeof window.refreshNavSelects === 'function') window.refreshNavSelects();
                refreshLocationActions();
                if (typeof showToast === 'function') showToast('已清除位置标记', 'info', 1600);
            });
        }

        // 帮助与反馈（FAQ）
        const help = document.getElementById('btnHelp');
        if (help) {
            help.addEventListener('click', () => {
                const faq = [
                    ['怎么找到要去的地方？', '点地图左上角「搜索地点」输入名称（如"食堂"），或在「地点」页按分类浏览，点结果即可定位。'],
                    ['怎么导航？', '在地点详情点「导航到这里」，或打开 🧭 面板选择起终点（可添加途经点），路线和转向指引会一起给出。'],
                    ['怎么设置"我的位置"？', '点地图右侧 📍 按钮，再点地图上的位置即可；蓝色定位点可长按拖动微调。'],
                    ['收藏 / 备注保存在哪？', '全部只保存在本机浏览器，不上传服务器；换设备或清除浏览器数据后不会同步。'],
                    ['发现地点位置不对？', '地图数据可能随校园建设调整，可加入地图反馈QQ群 1094409084 告诉我们，会尽快更新。'],
                    ['有其他问题或建议？', '作者「锐仔来了」持续更新维护中，欢迎加入反馈QQ群 1094409084 交流。'],
                ].map(([q, a]) => `<div class="faq-item"><div class="faq-q">${q}</div><div class="faq-a">${a}</div></div>`).join('');
                this.showDoc('帮助与反馈', faq, true);
            });
        }

        // 清除全部数据
        const btnClear = document.getElementById('btnClearAll');
        if (btnClear) {
            const clearLabel = btnClear.textContent;
            btnClear.addEventListener('click', () => {
                if (!btnClear.dataset.armed) {
                    btnClear.dataset.armed = '1';
                    btnClear.textContent = '再点确认清除';
                    btnClear.classList.add('armed');
                    setTimeout(() => {
                        delete btnClear.dataset.armed;
                        btnClear.textContent = clearLabel;
                        btnClear.classList.remove('armed');
                    }, 2600);
                    return;
                }
                if (typeof showToast === 'function') {
                    showToast('已清除全部本地数据，即将刷新…', 'success', 1400);
                }
                setTimeout(() => {
                    Store.clearAll();
                    location.reload();
                }, 1200);
            });
        }

        // ---- 折叠展开胶囊：设置页各分组 ----
        document.querySelectorAll('#page-settings .set-group[data-collapse-group]').forEach(group => {
            const toggle = group.querySelector('[data-collapse-toggle]');
            const body = group.querySelector('[data-collapse-body]');
            if (!toggle || !body) return;
            toggle.addEventListener('click', () => {
                const collapsed = body.classList.toggle('collapsed');
                toggle.setAttribute('aria-expanded', String(!collapsed));
                const arrow = toggle.querySelector('.set-group-arrow');
                if (arrow) arrow.textContent = collapsed ? '▸' : '▾';
            });
        });

        // ---- 语言选择器（胶囊下拉，10 种语言） ----
        this.initLanguagePicker();
    },

    /** 语言选择弹层：渲染语言列表 + 切换 + 持久化 */
    initLanguagePicker() {
        if (!window.I18N) return;
        const btn = document.getElementById('btnOpenLangPicker');
        const picker = document.getElementById('langPicker');
        const mask = document.getElementById('langPickerMask');
        const close = document.getElementById('langPickerClose');
        const list = document.getElementById('langPickerList');
        if (!btn || !picker || !list) return;

        // 更新「通用」分组里当前语言描述
        const updateDesc = () => {
            const cur = window.I18N.langs.find(l => l.code === window.I18N.lang);
            const desc = document.getElementById('langCurrentDesc');
            if (desc && cur) desc.textContent = `${cur.flag} ${cur.label}`;
        };

        // 渲染语言列表
        const renderList = () => {
            list.innerHTML = window.I18N.langs.map(l => `
                <button class="lang-option ${l.code === window.I18N.lang ? 'active' : ''}" data-lang="${l.code}">
                    <span class="lang-flag">${l.flag}</span>
                    <span class="lang-name">${l.label}</span>
                    <span class="lang-check">${l.code === window.I18N.lang ? '✓' : ''}</span>
                </button>`).join('');
        };

        const open = () => {
            renderList();
            picker.classList.remove('hidden');
        };
        const closeFn = () => picker.classList.add('hidden');

        btn.addEventListener('click', open);
        close?.addEventListener('click', closeFn);
        mask?.addEventListener('click', closeFn);

        list.addEventListener('click', (e) => {
            const opt = e.target.closest('.lang-option');
            if (!opt) return;
            const code = opt.dataset.lang;
            window.I18N.setLang(code, true);   // 持久化 + 触发 __onLangChange 重渲染
            updateDesc();
            closeFn();
            if (typeof showToast === 'function') {
                const cur = window.I18N.langs.find(l => l.code === code);
                showToast(`语言已切换：${cur ? cur.label : code}`, 'success', 1600);
            }
        });

        updateDesc();
        // v3.40：暴露给全局语言切换钩子（任何路径切换语言后刷新"语言"行描述）
        window.__refreshLangDesc = updateDesc;
    },

    /** 把玻璃透明度/模糊度写入 :root 内联样式（供 CSS 变量读取） */
    applyGlassSettings() {
        const alpha = Store.data.settings.glassAlpha ?? 55;   // 0~90（%）
        const blur = Store.data.settings.glassBlur ?? 28;     // 0~48（px）
        const root = document.documentElement;
        root.style.setProperty('--glass-alpha', (alpha / 100).toFixed(2));
        root.style.setProperty('--glass-blur-px', blur + 'px');
        const av = document.getElementById('glassAlphaVal');
        const bv = document.getElementById('glassBlurVal');
        if (av) av.textContent = alpha + '%';
        if (bv) bv.textContent = blur + 'px';
    },

    /** 绑定设置页玻璃滑块（透明度/模糊度） */
    bindGlassSliders() {
        const alphaEl = document.getElementById('glassAlpha');
        const blurEl = document.getElementById('glassBlur');
        if (!alphaEl || !blurEl) return;

        // 初始化当前值到滑块
        alphaEl.value = Store.data.settings.glassAlpha ?? 55;
        blurEl.value = Store.data.settings.glassBlur ?? 28;
        const syncTrack = (el) => {
            const min = Number(el.min) || 0;
            const max = Number(el.max) || 100;
            const progress = ((Number(el.value) - min) / (max - min)) * 100;
            el.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, progress))}%`);
        };
        syncTrack(alphaEl);
        syncTrack(blurEl);
        this.applyGlassSettings();

        const onAlpha = () => {
            const v = parseInt(alphaEl.value, 10);
            Store.data.settings.glassAlpha = v;
            Store.save();
            syncTrack(alphaEl);
            this.applyGlassSettings();
        };
        const onBlur = () => {
            const v = parseInt(blurEl.value, 10);
            Store.data.settings.glassBlur = v;
            Store.save();
            syncTrack(blurEl);
            this.applyGlassSettings();
        };
        alphaEl.addEventListener('input', onAlpha);
        blurEl.addEventListener('input', onBlur);
        // 触摸端滑动更跟手
        alphaEl.addEventListener('change', onAlpha);
        blurEl.addEventListener('change', onBlur);
    },

    async refreshGeoPerm() {
        // 定位服务改为开关形态：开关状态 = 浏览器权限 granted 且用户未主动关闭
        const sw = document.getElementById('swGeoService');
        const desc = document.getElementById('permGeoDesc');
        if (!sw && !desc) return;
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        const wantOn = Store.data.settings.geoService !== false;
        const apply = (state) => {
            this.geoPermState = state;
            const on = state === 'granted' && wantOn;
            if (sw) {
                sw.classList.toggle('on', on);
                sw.setAttribute('aria-checked', String(on));
            }
            if (desc) {
                desc.textContent = T(
                    !wantOn ? 'geo.desc.off'
                    : state === 'granted' ? 'geo.desc.granted'
                    : state === 'denied' ? 'geo.desc.denied'
                    : state === 'unsupported' ? 'geo.desc.unsupported'
                    : state === 'unknown' ? 'geo.desc.unknown'
                    : 'geo.desc.prompt'
                );
            }
        };

        if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) {
            apply('unsupported');
            return;
        }
        try {
            const st = await navigator.permissions.query({ name: 'geolocation' });
            const sync = () => apply(st.state);
            sync();
            st.onchange = sync;
        } catch (e) {
            apply('unknown');
        }
    },

    requestGeo() {
        if (!navigator.geolocation) {
            if (typeof showToast === 'function') showToast('当前浏览器不支持定位', 'error');
            return;
        }
        if (typeof showToast === 'function') showToast('正在请求定位权限…', 'info', 1800);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                Store.data.gps = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    ts: Date.now(),
                };
                Store.save();
                this.refreshGeoPerm();
                if (window.PermCenter) PermCenter.refreshIfOpen();
                if (typeof showToast === 'function') showToast('定位服务已开启 ✅ 位置仅本地记录，不上传', 'success');
            },
            (err) => {
                if (err.code === 1) {
                    // 用户在浏览器弹窗里点了拒绝：同步关闭偏好，避免开关显示与实际不符
                    Store.data.settings.geoService = false;
                    Store.save();
                }
                this.refreshGeoPerm();
                if (window.PermCenter) PermCenter.refreshIfOpen();
                if (typeof showToast === 'function') {
                    showToast(err.code === 1 ? '定位权限被拒绝，可稍后在浏览器设置中重新允许' : '定位失败，请检查网络', 'error');
                }
            },
            { timeout: 8000, maximumAge: 60000 }
        );
    },

    // ---------- 我的位置 ----------
    startLocationPick() {
        this.pickMode = 'location';
        if (this.map) this.map.getContainer().style.cursor = 'crosshair';
        if (typeof showToast === 'function') showToast('点击地图设置你的位置', 'info');
    },

    exitPickMode() {
        this.pickMode = null;
        if (this.map) this.map.getContainer().style.cursor = '';
    },

    setMyLocation(x, y) {
        Store.data.myLocation = { x, y };
        Store.save();
        this.renderUserLocation();
        if (this._refreshLocationActions) this._refreshLocationActions();
        if (typeof window.refreshNavSelects === 'function') window.refreshNavSelects();
        if (typeof showToast === 'function') showToast('已设置我的位置 📍 导航可直接选它作起终点', 'success');
    },

    removeLocationMarker() {
        if (this.locationMarker && this.map) {
            this.map.removeLayer(this.locationMarker);
        }
        this.locationMarker = null;
    },

    renderUserLocation() {
        this.removeLocationMarker();
        if (!this.map) return;
        const loc = Store.data.myLocation;
        if (!loc || !Store.data.settings.showLocation) return;

        this.locationMarker = L.marker(toLatLng(loc.x, loc.y), {
            icon: L.divIcon({
                className: '',
                html: `<div class="user-location">
                            <div class="ul-pulse"></div>
                            <div class="ul-dot"></div>
                            <div class="ul-label">我的位置</div>
                       </div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            }),
            draggable: true,
            zIndexOffset: 2000,
        }).addTo(this.map);

        this.locationMarker.on('dragend', (e) => {
            const ll = e.target.getLatLng();
            Store.data.myLocation = { x: ll.lng, y: MAP_HEIGHT - ll.lat };
            Store.save();
            if (this._refreshLocationActions) this._refreshLocationActions();
            if (typeof window.refreshNavSelects === 'function') window.refreshNavSelects();
            if (typeof showToast === 'function') showToast('位置已更新', 'success', 1400);
        });

        this.locationMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (typeof showToast === 'function') showToast('拖动蓝点可调整位置', 'info', 1800);
        });
    },
};

// ============================================================
// 收藏列表长按拖拽排序（v3.8）
//   长按 380ms 进入拖拽态：被拖项放大+阴影跟手，其余项实时让位，
//   松手按 DOM 顺序持久化到 Store.fav
// ============================================================
function enableFavReorder(list) {
    if (!list || list.dataset.reorderInit) return;
    list.dataset.reorderInit = '1';

    let item = null;        // 正在拖拽的条目
    let active = false;     // 是否已进入拖拽态
    let holdTimer = null;
    let baseTop = 0;        // 拖拽项当前 DOM 位置（用于换算 transform）
    let startY = 0;

    const onHold = () => {
        if (!item) return;
        active = true;
        item.classList.add('fav-dragging');
        list.classList.add('reordering');
        baseTop = item.getBoundingClientRect().top;
        if (navigator.vibrate) navigator.vibrate(10);
    };
    const stopScroll = (e) => {
        if (active) e.preventDefault();   // 拖拽中阻止页面滚动（需 passive:false）
    };
    document.addEventListener('touchmove', stopScroll, { passive: false });

    list.addEventListener('pointerdown', (e) => {
        const it = e.target.closest('.ps-item');
        if (!it || e.target.closest('button')) return;   // 按钮不触发拖拽
        item = it;
        startY = e.clientY;
        holdTimer = setTimeout(onHold, 380);
    });

    list.addEventListener('pointermove', (e) => {
        if (!active || !item) {
            if (Math.abs(e.clientY - startY) > 10) clearTimeout(holdTimer);   // 滚动即取消长按
            return;
        }
        e.preventDefault();
        item.style.transform = `translateY(${e.clientY - baseTop}px)`;

        // 中心越过相邻项 → 让位（DOM 顺序实时重排）
        const others = [...list.querySelectorAll('.ps-item:not(.fav-dragging)')];
        for (const other of others) {
            const r = other.getBoundingClientRect();
            if (e.clientY > r.top && e.clientY < r.bottom) {
                if (e.clientY < r.top + r.height / 2) list.insertBefore(item, other);
                else list.insertBefore(other, item);
                baseTop = item.getBoundingClientRect().top;
                break;
            }
        }
    });

    const finish = () => {
        clearTimeout(holdTimer);
        if (!active) { item = null; return; }
        item.classList.remove('fav-dragging');
        item.style.transform = '';
        list.classList.remove('reordering');
        // 按当前 DOM 顺序持久化
        Store.data.fav = [...list.querySelectorAll('.ps-item')].map(el => el.dataset.id);
        Store.save();
        if (typeof showToast === 'function') showToast('排序已保存 ✓', 'success', 1200);
        active = false;
        item = null;
    };
    list.addEventListener('pointerup', finish);
    list.addEventListener('pointercancel', finish);
}
