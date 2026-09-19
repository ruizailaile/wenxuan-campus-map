/* ============================================
 * lostfound.js — 失物招领模块
 *
 * 职责：
 *   1. 列表双视图（寻物 / 招领 / 我的）+ 类别筛选
 *   2. 地图标点视图（寻物暖色 / 招领青绿 / 已完成灰）
 *   3. 发布表单（验证问答防冒领）
 *   4. 认领闭环：申请 → 发布者确认/拒绝 → 交换联系方式
 *
 * 依赖：api.js（CampusAPI._fetch）、auth.js（AuthCenter）、
 *       app.js（window.MAP 地图实例）、campus-data.js（坐标常量）
 * ============================================ */

const LostFound = {
    posts: [],
    filter: { tab: 'lost', cat: 'all', view: 'list', mineStatus: 'open' },
    mapInstance: null,
    mapLayer: null,
    locPicked: null,        // 发布时选中的 {x, y, locName}
    _locPickMode: false,

    CATS: [
        { k: 'card',  label: '校园卡', icon: '🪪' },
        { k: 'key',   label: '钥匙',   icon: '🔑' },
        { k: 'elec',  label: '电子设备', icon: '📱' },
        { k: 'book',  label: '书籍',   icon: '📚' },
        { k: 'cloth', label: '衣物',   icon: '🧥' },
        { k: 'other', label: '其他',   icon: '📦' },
    ],

    catLabel(k) {
        const c = this.CATS.find(x => x.k === k);
        if (!c) return k;
        const label = (window.I18N && window.I18N.t('lf.cat.' + k)) || c.label;
        return c.icon + ' ' + label;
    },

    catText(k) {
        const c = this.CATS.find(x => x.k === k);
        if (!c) return k;
        return (window.I18N && window.I18N.t('lf.cat.' + k)) || c.label;
    },

    statusLabel(s) {
        const map = { open: '进行中', pending: '待确认', done: '已认领' };
        const base = map[s] || s;
        if (window.I18N) return window.I18N.t('lf.status.' + s) || base;
        return base;
    },

    /** 语言切换后重绘分类与列表 */
    _onLangChange() {
        this.renderCats();
        this.render();
    },

    fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 3600e3) return Math.max(1, Math.floor(diff / 60e3)) + ' 分钟前';
        if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
        if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },

    // ---------- 初始化 ----------
    init() {
        this.renderCats();
        this.bind();
        this.load();
    },

    bind() {
        // 顶部返回（切回地图）
        document.querySelectorAll('#page-lostfound .ap-back').forEach(b => {
            b.addEventListener('click', () => AppShell.switchTab('map'));
        });

        // 发布按钮（v3.35 委托绑定：空状态按钮可能被重渲染重建，直接绑定会失效）
        document.getElementById('page-lostfound').addEventListener('click', (e) => {
            if (e.target.closest('#lfNew, #lfEmptyGo')) this.openPublish();
        });

        // Tab 切换
        document.querySelectorAll('.lf-tab').forEach(t => {
            t.addEventListener('click', () => {
                this.filter.tab = t.dataset.lf;
                document.querySelectorAll('.lf-tab').forEach(x => x.classList.toggle('active', x === t));
                this.render();
            });
        });

        // 视图切换（列表 / 地图）
        document.querySelectorAll('.lf-view').forEach(v => {
            v.addEventListener('click', () => {
                this.filter.view = v.dataset.lfview;
                document.querySelectorAll('.lf-view').forEach(x => x.classList.toggle('active', x === v));
                this.render();
            });
        });

        // v3.21：我的二级 tab（进行中 / 已完成）
        document.querySelectorAll('.lf-mine-tab').forEach(t => {
            t.addEventListener('click', () => {
                this.filter.mineStatus = t.dataset.minestatus;
                document.querySelectorAll('.lf-mine-tab').forEach(x => x.classList.toggle('active', x === t));
                this.render();
            });
        });

        // 发布表单
        document.querySelectorAll('#lfTypeSwitch button').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#lfTypeSwitch button').forEach(x => x.classList.toggle('active', x === b));
            });
        });
        document.getElementById('lfLocPick').addEventListener('click', () => this.pickLocation());
        document.getElementById('lfSubmit').addEventListener('click', () => this.submit());
        document.getElementById('lfSheetClose').addEventListener('click', () => this.closePublish());
        document.getElementById('lfSheetMask').addEventListener('click', () => this.closePublish());

        // 详情
        document.getElementById('lfDetailMask').addEventListener('click', () => this.closeDetail());

        // 认领验证弹窗
        document.getElementById('lfClaimMask').addEventListener('click', () => this.closeClaim());
        document.getElementById('lfClaimClose').addEventListener('click', () => this.closeClaim());
        document.getElementById('lfClaimSubmit').addEventListener('click', () => this.submitClaim());
        document.getElementById('lfClaimA').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitClaim();
        });

        // v3.20：撤回确认 sheet（应用内二次确认，替代原生 confirm）
        const dsMask = document.getElementById('lfDeleteSheetMask');
        const dsClose = document.getElementById('lfDeleteSheetClose');
        const dsCancel = document.getElementById('lfDeleteCancel');
        const dsConfirm = document.getElementById('lfDeleteConfirm');
        if (dsMask) dsMask.addEventListener('click', () => this.closeDelete());
        if (dsClose) dsClose.addEventListener('click', () => this.closeDelete());
        if (dsCancel) dsCancel.addEventListener('click', () => this.closeDelete());
        if (dsConfirm) dsConfirm.addEventListener('click', () => this._confirmDeletePost());
    },

    renderCats() {
        const wrap = document.getElementById('lfCats');
        const allLabel = window.I18N ? window.I18N.t('list.all') : '全部';
        const chips = [{ k: 'all', label: allLabel }].concat(this.CATS);
        wrap.innerHTML = chips.map(c =>
            `<button class="lf-cat${c.k === 'all' ? ' active' : ''}" data-cat="${c.k}">${c.k === 'all' ? allLabel : (c.icon + ' ' + this.catText(c.k))}</button>`
        ).join('');
        wrap.querySelectorAll('.lf-cat').forEach(b => {
            b.addEventListener('click', () => {
                this.filter.cat = b.dataset.cat;
                wrap.querySelectorAll('.lf-cat').forEach(x => x.classList.toggle('active', x === b));
                this.render();
            });
        });

        // 发布表单里的分类选择
        const sel = document.getElementById('lfCatsSelect');
        sel.innerHTML = this.CATS.map(c =>
            `<button class="lf-cat-sel" data-cat="${c.k}">${c.icon} ${this.catText(c.k)}</button>`
        ).join('');
        sel.querySelectorAll('.lf-cat-sel').forEach(b => {
            b.addEventListener('click', () => {
                sel.querySelectorAll('.lf-cat-sel').forEach(x => x.classList.toggle('active', x === b));
            });
        });
    },

    // ---------- 数据加载 ----------
    async load() {
        if (!window.CampusAPI || !CampusAPI.ready) {
            // 云端不可用：显示空态
            this.posts = [];
            this.render();
            return;
        }
        try {
            const data = await CampusAPI._fetch('api/lf');
            this.posts = data.posts || [];
        } catch (e) {
            this.posts = [];
            console.warn('[lf] 加载失败:', e.message);
        }
        this.render();
    },

    // v3.21：标记是否启用 Worker（避免初始化时频繁实例化）
    _worker: null,
    _workerReady: false,

    _ensureWorker() {
        if (this._worker) return this._worker;
        if (typeof Worker === 'undefined') return null;   // 不支持则降级
        try {
            this._worker = new Worker('js/lf-filter-worker.js');
            return this._worker;
        } catch (e) {
            console.warn('[lf] Worker 初始化失败，降级主线程:', e.message);
            return null;
        }
    },

    // 异步过滤：Worker 成功用 Worker，失败/不支持降级主线程
    async visiblePostsAsync() {
        const w = this._ensureWorker();
        const uid = window.AuthCenter ? AuthCenter.user?.id : null;
        if (!w) return this.visiblePosts();   // 降级
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                // Worker 超时（>500ms）降级主线程
                resolve(this.visiblePosts());
            }, 500);
            w.onmessage = (e) => {
                clearTimeout(timer);
                w.onmessage = null;
                resolve(e.data.list || []);
            };
            w.postMessage({ posts: this.posts, filter: this.filter, uid });
        });
    },

    visiblePosts() {
        const { tab, cat } = this.filter;
        const uid = window.AuthCenter ? AuthCenter.user?.id : null;
        let list = this.posts;
        if (tab === 'mine') {
            if (!uid) return [];
            list = list.filter(p => p.ownerId === uid);
            // v3.21：我的二级 tab —— 进行中(open) / 已完成(done)
            if (this.filter.mineStatus === 'done') list = list.filter(p => p.status === 'done');
            else list = list.filter(p => p.status === 'open');
        } else {
            list = list.filter(p => p.type === tab);
        }
        if (cat !== 'all') list = list.filter(p => p.category === cat);
        // 排序：进行中在前，已完成在后，按时间倒序
        const rank = { open: 0, pending: 0, done: 1 };
        return list.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.createdAt - a.createdAt));
    },

    // ---------- 渲染 ----------
    async render() {
        const list = await this.visiblePostsAsync();

        // 计数
        const uid = window.AuthCenter ? AuthCenter.user?.id : null;
        document.getElementById('lfLostCount').textContent = this.posts.filter(p => p.type === 'lost').length;
        document.getElementById('lfFoundCount').textContent = this.posts.filter(p => p.type === 'found').length;
        document.getElementById('lfMineCount').textContent = uid ? this.posts.filter(p => p.ownerId === uid).length : 0;

        // v3.21：我的二级 tab（进行中 / 已完成）显隐与计数
        const mineTabs = document.getElementById('lfMineTabs');
        if (mineTabs) {
            const isMine = this.filter.tab === 'mine';
            mineTabs.classList.toggle('hidden', !isMine);
            if (isMine) {
                const minePosts = uid ? this.posts.filter(p => p.ownerId === uid) : [];
                const counts = {
                    open: minePosts.filter(p => p.status === 'open').length,
                    done: minePosts.filter(p => p.status === 'done').length,
                };
                mineTabs.querySelectorAll('.lf-mine-tab').forEach(b => {
                    b.classList.toggle('active', b.dataset.minestatus === this.filter.mineStatus);
                    const c = b.querySelector('.lf-mine-count');
                    if (c) c.textContent = counts[b.dataset.minestatus] || 0;
                });
            }
        }

        // 视图切换
        document.getElementById('lfMapWrap').classList.toggle('hidden', this.filter.view !== 'map');
        document.getElementById('lfList').classList.toggle('hidden', this.filter.view !== 'list');

        if (this.filter.view === 'map') {
            this.renderMap(list);
            return;
        }

        // 列表视图
        const el = document.getElementById('lfList');
        const empty = document.getElementById('lfEmpty');
        if (!list.length) {
            el.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        el.innerHTML = list.map(p => this.cardHtml(p)).join('');
        el.querySelectorAll('.lf-card').forEach(card => {
            card.addEventListener('click', () => this.openDetail(card.dataset.id));
        });
    },

    cardHtml(p) {
        const isMine = window.AuthCenter && p.mine;
        const cat = this.CATS.find(c => c.k === p.category) || { icon: '📦', label: '其他' };
        const badge = p.type === 'lost'
            ? `<span class="lf-badge lost">寻物</span>`
            : `<span class="lf-badge found">招领</span>`;
        const done = p.status === 'done' ? ' lf-done' : '';
        return `<div class="lf-card${done}" data-id="${p.id}">
            <div class="lf-card-ico" style="--ic:${p.type === 'lost' ? '#F0782E' : '#1d9e75'}">${cat.icon}</div>
            <div class="lf-card-main">
                <div class="lf-card-top">
                    ${badge}
                    <span class="lf-card-title">${this.escape(p.title)}</span>
                    <span class="lf-card-status st-${p.status}">${this.statusLabel(p.status)}</span>
                </div>
                <div class="lf-card-meta">${this.escape(p.locName)}</div>
                <div class="lf-card-foot">
                    <span class="lf-card-time">${this.fmtTime(p.createdAt)}</span>
                    <span class="lf-card-owner">${this.escape(p.ownerName)}${isMine ? ' · 我' : ''}</span>
                </div>
            </div>
        </div>`;
    },

    // ---------- 地图视图 ----------
    renderMap(list) {
        const map = window.MAP?.map;
        const wrap = document.getElementById('lfMap');
        if (!map) return;

        if (!this.mapInstance) {
            this.mapInstance = L.map('lfMap', {
                crs: L.CRS.Simple,
                minZoom: -3,
                maxZoom: 3,
                zoomControl: false,
                attributionControl: false,
            });
            const bounds = [[0, 0], [window.MAP.MAP_HEIGHT, window.MAP.MAP_WIDTH]];
            L.imageOverlay('assets/campus-map.jpg?v=52', bounds).addTo(this.mapInstance);
            this.mapInstance.setMaxBounds([[-80, -40], [window.MAP.MAP_HEIGHT + 80, window.MAP.MAP_WIDTH + 40]]);
            this.mapInstance.fitBounds(bounds);
        }

        if (this.mapLayer) this.mapInstance.removeLayer(this.mapLayer);
        this.mapLayer = L.layerGroup().addTo(this.mapInstance);

        list.forEach(p => {
            const ll = window.MAP.toLatLng(p.x, p.y);
            const color = p.status === 'done' ? '#9e9e9e'
                : (p.type === 'lost' ? '#F0782E' : '#1d9e75');
            const pulse = p.status === 'done' ? '' : ' lf-marker-pulse';
            const icon = L.divIcon({
                className: '',
                html: `<div class="lf-marker" style="--c:${color}">
                    <span class="lf-marker-ring${pulse}"></span>
                    <span class="lf-marker-dot"></span>
                    <span class="lf-marker-label">${this.escape(p.title)}</span>
                </div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });
            const m = L.marker(ll, { icon }).addTo(this.mapLayer);
            m.on('click', () => this.openDetail(p.id));
            // hover 气泡提示
            m.bindTooltip(
                `<div class="lf-tip"><b>${this.escape(p.title)}</b><span>${this.catLabel(p.category)} · ${this.statusLabel(p.status)}</span></div>`,
                { direction: 'top', offset: [0, -18], className: 'lf-tip-wrap' }
            );
        });
    },

    // ---------- 详情 ----------
    async openDetail(id) {
        // 从缓存找；否则重新拉（mine 视图需要认领申请列表）
        let p = this.posts.find(x => x.id === id);
        if (!p) return;
        const uid = window.AuthCenter ? AuthCenter.user?.id : null;
        const card = document.getElementById('lfDetailCard');
        const badge = p.type === 'lost'
            ? `<span class="lf-badge lost">寻物</span>`
            : `<span class="lf-badge found">招领</span>`;
        const done = p.status === 'done' ? ' lf-done' : '';

        const T = window.I18N ? window.I18N.t.bind(window.I18N) : (k) => k;
        let claimArea = '';
        if (p.status === 'open' && uid && p.ownerId !== uid) {
            claimArea = `<button class="btn-primary lf-claim-btn" data-id="${p.id}">这是我丢的 / 我要认领</button>`;
        } else if (p.status === 'open' && !uid) {
            claimArea = `<button class="btn-primary lf-claim-btn" data-login="1">登录后认领</button>`;
        } else if (p.status === 'done') {
            // v3.17: 答对答案即完成认领，无 pending 中间态
            const isOwner = p.mine;
            const isClaimer = p.amIClaimer || (p.claims && p.claims.some(c => c.uid === AuthCenter.user?.id));
            // 认领人私信发布者用 ownerId；发布者私信认领人用 claimUid（后端投影）
            const peerUid = isOwner ? (p.claimUid || '') : p.ownerId;
            const peerName = isOwner
                ? ((p.claims && p.claims[0] && p.claims[0].nickname) || '认领人')
                : p.ownerName;
            // v3.21: 完成认领闭环——已确认显示确认态；未确认给发布者/认领人「完成认领」按钮
            if (p.confirmedAt) {
                claimArea = `<div class="lf-claims-done">✅ ${T('lf.finish.confirmed')}</div>`;
            } else {
                claimArea = `<div class="lf-claims-done">✅ ${T('lf.finish.done')}</div>`;
                if (isOwner || isClaimer) {
                    claimArea += `<button class="btn-primary lf-finish-btn" data-op="finish">✅ ${T('lf.finish')}</button>`;
                }
            }
            if (p.contact) {
                claimArea += `<div class="lf-contact">
                    <span class="lf-contact-label">对方联系方式</span>
                    <b>${this.escape(p.contact)}</b>
                    <button class="lf-contact-copy" data-copy="${this.escape(p.contact)}">复制</button>
                </div>`;
            }
            if (peerUid && window.Chat) {
                claimArea += `<button class="lf-dm-btn" data-dm-uid="${this.escape(peerUid)}" data-dm-name="${this.escape(peerName)}">💬 私信对方</button>`;
            }
        }

        // v3.21：done 状态只保留「撤回帖子」；open 状态保留「编辑 / 撤回」
        const ownerOps = p.mine
            ? (p.status === 'done'
                ? `<div class="lf-owner-ops">
                    <button class="lf-owner-btn danger" data-op="del">🗑 撤回帖子</button>
                  </div>`
                : `<div class="lf-owner-ops">
                    <button class="lf-owner-btn" data-op="edit">✏️ 编辑</button>
                    <button class="lf-owner-btn danger" data-op="del">🗑 撤回（用户将无法再认领）</button>
                  </div>`)
            : '';

        card.innerHTML = `
            <div class="lf-detail-head">
                ${badge}
                <h3>${this.escape(p.title)}</h3>
                <button class="lf-detail-close" id="lfDetailClose">✕</button>
            </div>
            <div class="lf-detail-body">
                <div class="lf-detail-row"><span class="k">分类</span><span class="v">${this.catLabel(p.category)}</span></div>
                <div class="lf-detail-row"><span class="k">位置</span><span class="v">${this.escape(p.locName)}</span></div>
                <div class="lf-detail-row"><span class="k">时间</span><span class="v">${this.escape(p.timeText)}</span></div>
                <div class="lf-detail-row"><span class="k">发布者</span><span class="v">${this.escape(p.ownerName)}</span></div>
                <div class="lf-detail-desc">${this.escape(p.desc)}</div>
                <div class="lf-detail-proof">
                    <span class="lf-proof-tag">🔒 认领需回答验证问题</span>
                </div>
                ${ownerOps}
                ${claimArea}
            </div>
        `;

        document.getElementById('lfDetailClose').addEventListener('click', () => this.closeDetail());
        card.querySelectorAll('.lf-owner-btn[data-op="edit"]').forEach(b => {
            b.addEventListener('click', () => this.editPost(p));
        });
        card.querySelectorAll('.lf-owner-btn[data-op="del"]').forEach(b => {
            b.addEventListener('click', () => this.deletePost(p));
        });
        // v3.21: P0-1 — 完成认领按钮（发布者/认领人可点，确认完成归档）
        card.querySelector('.lf-finish-btn[data-op="finish"]')?.addEventListener('click', (e) => this.finishPost(p, e.currentTarget));
        card.querySelector('[data-login]')?.addEventListener('click', () => {
            if (window.AuthCenter) AuthCenter.requireLogin('登录后才能认领失物');
        });
        card.querySelector('.lf-claim-btn:not([data-login])')?.addEventListener('click', () => this.claim(p));
        // 私信对方（v3.17: 答对答案即 done，双方可私信）
        card.querySelector('.lf-dm-btn')?.addEventListener('click', (e) => {
            const peerUid = e.currentTarget.dataset.dmUid;
            const peerName = e.currentTarget.dataset.dmName;
            if (!peerUid || !window.Chat || !window.AuthCenter || !AuthCenter.user) {
                showToast('暂无法发起私信，请先登录', 'error', 2000);
                return;
            }
            this.closeDetail();
            AppShell.switchTab('chat');
            Chat.openRoom(Chat.dmRoom(AuthCenter.user.id, peerUid), { id: peerUid, nickname: peerName });
        });
        // 复制联系方式
        card.querySelector('[data-copy]')?.addEventListener('click', (e) => {
            const text = e.currentTarget.dataset.copy;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    showToast('已复制联系方式', 'success', 1800);
                }).catch(() => this.fallbackCopy(text));
            } else {
                this.fallbackCopy(text);
            }
        });

        document.getElementById('lfDetail').classList.remove('hidden');
    },

    fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('已复制联系方式', 'success', 1800); }
        catch (_) { showToast('复制失败，请手动复制', 'error'); }
        document.body.removeChild(ta);
    },

    closeDetail() {
        document.getElementById('lfDetail').classList.add('hidden');
    },

    // ---------- 认领闭环 ----------
    // 打开验证问答弹窗（替代原生 prompt）
    openClaim(p) {
        this._claimPost = p;
        document.getElementById('lfClaimQ').textContent = p.proofQ || '请描述该物品特征';
        document.getElementById('lfClaimA').value = '';
        document.getElementById('lfClaimErr').textContent = '';
        document.getElementById('lfClaimErr').className = 'auth-msg lf-claim-err';
        document.getElementById('lfClaim').classList.remove('hidden');
        setTimeout(() => document.getElementById('lfClaimA').focus(), 250);
    },

    closeClaim() {
        document.getElementById('lfClaim').classList.add('hidden');
        this._claimPost = null;
    },

    async submitClaim() {
        const p = this._claimPost;
        if (!p) return;
        const answer = document.getElementById('lfClaimA').value.trim();
        const errEl = document.getElementById('lfClaimErr');
        if (!answer) {
            errEl.textContent = '请输入验证答案';
            errEl.className = 'auth-msg lf-claim-err error';
            return;
        }
        const btn = document.getElementById('lfClaimSubmit');
        btn.disabled = true;
        btn.textContent = '验证中...';
        try {
            const res = await CampusAPI._fetch(`api/lf/${p.id}/claim`, {
                method: 'POST',
                body: JSON.stringify({ answer }),
            });
            // v3.17: 答对答案即完成认领，联系方式已解锁
            showToast(res.message || '答对答案！联系方式已解锁', 'success', 3200);
            this.closeClaim();
            this.closeDetail();
            // 重新拉数据 → "我的" Tab 列表会刷新；详情页自动回到列表（详情已关闭）
            this.load();
        } catch (e) {
            errEl.textContent = e.message || '认领失败';
            errEl.className = 'auth-msg lf-claim-err error';
        } finally {
            btn.disabled = false;
            btn.textContent = '提交认领';
        }
    },

    async claim(p) {
        this.openClaim(p);
    },

    // ---------- 发布 ----------
    openPublish() {
        if (window.AuthCenter && !AuthCenter.requireLogin('发布失物招领需要先登录')) return;
        this._editId = null;   // 退出编辑模式
        document.getElementById('lfSheetTitle').textContent = '发布失物招领';
        document.getElementById('lfSubmit').textContent = '发布';
        // 重置表单
        document.getElementById('lfTitle').value = '';
        document.getElementById('lfTimeText').value = '';
        document.getElementById('lfDesc').value = '';
        document.getElementById('lfProofQ').value = '';
        document.getElementById('lfProofA').value = '';
        // v3.17: 联系方式默认填注册邮箱，用户可改手机/微信
        const defaultContact = (window.AuthCenter && AuthCenter.user && AuthCenter.user.email) || '';
        document.getElementById('lfContact').value = defaultContact;
        document.getElementById('lfContact').placeholder = defaultContact || '邮箱 / 手机号 / 微信号';
        this.locPicked = null;
        document.getElementById('lfLocText').textContent = '点击在地图上选择位置';
        document.querySelectorAll('#lfCatsSelect .lf-cat-sel').forEach(x => x.classList.remove('active'));
        document.getElementById('lfSheet').classList.remove('hidden');
    },

    // 编辑自己发布的帖子（预填表单，提交走 PUT）
    editPost(p) {
        if (window.AuthCenter && !AuthCenter.requireLogin('编辑需要先登录')) return;
        this._editId = p.id;
        document.getElementById('lfSheetTitle').textContent = '编辑帖子';
        document.getElementById('lfSubmit').textContent = '保存修改';
        // 类型切换
        document.querySelectorAll('#lfTypeSwitch button').forEach(b => {
            b.classList.toggle('active', b.dataset.type === p.type);
        });
        document.getElementById('lfTitle').value = p.title || '';
        document.getElementById('lfTimeText').value = p.timeText || '';
        document.getElementById('lfDesc').value = p.desc && p.desc !== '（未填写描述）' ? p.desc : '';
        document.getElementById('lfProofQ').value = p.proofQ || '';
        document.getElementById('lfProofA').value = '';   // 答案不回显，留空则保持原答案
        // v3.17: 回显 ownerContact（发布者视角投影字段）
        document.getElementById('lfContact').value = p.ownerContact || '';
        this.locPicked = { x: p.x, y: p.y, locName: p.locName };
        document.getElementById('lfLocText').textContent = p.locName || '点击在地图上选择位置';
        // 分类选中
        document.querySelectorAll('#lfCatsSelect .lf-cat-sel').forEach(x => {
            x.classList.toggle('active', x.dataset.cat === p.category);
        });
        document.getElementById('lfDetail').classList.add('hidden');   // 关闭详情
        document.getElementById('lfSheet').classList.remove('hidden');
    },

    // 撤回帖子（仅作者）— v3.20：改为应用内 sheet 二次确认，避免原生 confirm 突兀
    // v3.21: P0-2 — done/open 状态区分提示文案
    async deletePost(p) {
        if (!p) return;
        this._pendingDelete = p;
        const msg = document.getElementById('lfDeleteMsg');
        if (msg) {
            if (p.status === 'done') {
                msg.textContent = `「${p.title}」已认领完成，联系方式/对话记录已交换。确认撤回此帖吗？此操作不可恢复。`;
            } else {
                msg.textContent = `「${p.title}」仍在进行中，撤回后用户将无法再认领。确认撤回吗？此操作不可恢复。`;
            }
        }
        document.getElementById('lfDeleteSheet').classList.remove('hidden');
    },

    closeDelete() {
        document.getElementById('lfDeleteSheet').classList.add('hidden');
        this._pendingDelete = null;
    },

    async _confirmDeletePost() {
        const p = this._pendingDelete;
        if (!p) return;
        const btn = document.getElementById('lfDeleteConfirm');
        if (btn) { btn.disabled = true; btn.textContent = '撤回中…'; }
        try {
            await CampusAPI._fetch(`api/lf/${p.id}`, { method: 'DELETE' });
            showToast('已撤回', 'success', 1800);
            this.closeDelete();
            this.closeDetail();
            this.load();
        } catch (e) {
            showToast(e.message || '撤回失败', 'error', 2600);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '确认撤回'; }
        }
    },

    // v3.21: P0-1 — 完成认领（状态保持 done，写入 confirmedAt，不删帖）
    async finishPost(p, btn) {
        if (!p) return;
        const T = window.I18N ? window.I18N.t.bind(window.I18N) : (k) => k;
        if (btn) { btn.disabled = true; btn.textContent = T('lf.finish.confirming'); }
        try {
            const res = await CampusAPI._fetch(`api/lf/${p.id}/finish`, { method: 'POST' });
            // 更新本地缓存并重渲染详情，显示「已由你确认完成」
            if (res && res.post) {
                const idx = this.posts.findIndex(x => x.id === p.id);
                if (idx >= 0) this.posts[idx] = { ...this.posts[idx], ...res.post };
                this.openDetail(p.id);
            } else {
                this.load();
            }
            showToast(T('lf.finish.toast'), 'success', 1800);
        } catch (e) {
            showToast(e.message || T('lf.finish.fail'), 'error', 2600);
            if (btn) { btn.disabled = false; btn.textContent = '✅ ' + T('lf.finish'); }
        }
    },

    closePublish() {
        document.getElementById('lfSheet').classList.add('hidden');
    },

    pickLocation() {
        // 复用主地图选点
        this.closePublish();
        AppShell.switchTab('map');
        if (typeof toggleAddMode !== 'function') return;
        // 临时进入"选位置"模式：监听主地图点击
        const map = window.MAP?.map;
        if (!map) return;
        showToast('点击地图选择位置', 'info', 2000);
        const handler = (e) => {
            map.off('click', handler);
            const x = e.latlng.lng;
            const y = window.MAP.MAP_HEIGHT - e.latlng.lat;
            this.locPicked = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, locName: '校内（自定义位置）' };
            document.getElementById('lfLocText').textContent = `已选位置（${this.locPicked.x}, ${this.locPicked.y}）`;
            this.openPublishKeepState();
        };
        map.on('click', handler);
    },

    openPublishKeepState() {
        // 恢复表单但保留已填内容与选中位置
        document.getElementById('lfSheet').classList.remove('hidden');
        if (this.locPicked) {
            document.getElementById('lfLocText').textContent = `已选位置（${this.locPicked.x}, ${this.locPicked.y}）`;
        }
    },

    async submit() {
        const type = document.querySelector('#lfTypeSwitch button.active').dataset.type;
        const title = document.getElementById('lfTitle').value.trim();
        const cat = document.querySelector('#lfCatsSelect .lf-cat-sel.active')?.dataset.cat;
        const timeText = document.getElementById('lfTimeText').value.trim();
        const desc = document.getElementById('lfDesc').value.trim();
        const proofQ = document.getElementById('lfProofQ').value.trim();
        const proofA = document.getElementById('lfProofA').value.trim();
        const ownerContact = document.getElementById('lfContact').value.trim();   // v3.17: 可编辑联系方式

        if (!title) return showToast('请填写物品名称', 'error');
        if (!cat) return showToast('请选择分类', 'error');
        if (!this.locPicked) return showToast('请在地图上选择位置', 'error');
        if (!proofQ) return showToast('请设置验证问题', 'error');

        const editing = !!this._editId;
        // 编辑模式下，答案留空 = 保持原答案不变；否则需填写新答案
        if (!editing && !proofA) return showToast('请设置验证答案', 'error');

        const body = { type, title, category: cat, desc, timeText, proofQ, x: this.locPicked.x, y: this.locPicked.y, locName: this.locPicked.locName, ownerContact };
        if (proofA) body.proofA = proofA;   // 编辑模式留空则不更新答案

        try {
            if (editing) {
                await CampusAPI._fetch(`api/lf/${this._editId}`, { method: 'PUT', body: JSON.stringify(body) });
                showToast('已保存修改', 'success', 2000);
            } else {
                await CampusAPI._fetch('api/lf', { method: 'POST', body: JSON.stringify(body) });
                showToast('发布成功', 'success', 2000);
            }
            this.closePublish();
            this.load();
        } catch (e) {
            showToast(e.message || (editing ? '保存失败' : '发布失败'), 'error', 2600);
        }
    },

    escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
};

window.LostFound = LostFound;
