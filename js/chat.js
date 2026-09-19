/* ============================================
 * chat.js — 聊天模块（公共大厅 + 私聊）
 *
 * 职责：
 *   1. 会话列表：大厅（置顶）+ 最近私聊会话
 *   2. 公共大厅：登录后进入，滚动轮询拉取最新消息
 *   3. 私聊：从用户列表发起，双向同房间（服务端 dm:<a>:<b> 排序）
 *   4. 未读红点：大厅/私聊有新消息时底部 Tab 角标提示
 *
 * 依赖：api.js（CampusAPI._fetch）、auth.js（AuthCenter）、
 *       appshell.js（AppShell / Store）
 * ============================================ */

const Chat = {
    user: null,             // 当前登录用户
    rooms: [],              // 最近私聊会话 [{peerId, peerName, avatar, last, unread}]
    activeRoom: null,       // 当前会话 'lobby' | 'dm:xxx'
    pollTimer: null,
    _lastLobbySeen: 0,      // 大厅已读水位（用于未读角标）
    _roomEtas: {},          // 各房间的 ETag 缓存（按 room 名分桶），供 If-None-Match 用
    avCache: {},            // 发送者资料映射 {uid: {name, avatar}}（服务端每页只发一份头像）
    MAX_DOM: 100,           // 消息列表 DOM 节点上限，超出移除顶部最旧的，防止长会话卡顿
    friendReqCount: 0,      // 待处理好友请求数（v3.19：用于底部 Tab 角标 + dmList 红点）

    // ---------- 工具 ----------

    /**
     * ETag 感知的聊天拉取：发 If-None-Match → 命中 304 时直接返回 null（无变化）。
     * 成功时缓存响应里的 ETag 供下次轮询使用。
     * 返回值：200 → {messages:[]}; 304 → null; 其他错误 → 抛出。
     */
    async _fetchWithEtag(room, limit = 30) {
        const etag = this._roomEtas[room];
        const headers = { 'Content-Type': 'application/json' };
        if (window.AuthCenter && AuthCenter.token) headers.Authorization = 'Bearer ' + AuthCenter.token;
        if (etag) headers['If-None-Match'] = etag;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
            const res = await fetch(CampusAPI.base + 'api/chat?room=' + encodeURIComponent(room) + '&limit=' + limit, {
                signal: controller.signal,
                headers,
            });
            clearTimeout(timer);
            if (res.status === 304) return null;
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const err = new Error(body.error || ('HTTP ' + res.status));
                err.code = body.code; err.banned = !!body.banned; err.strike = body.strike;
                throw err;
            }
            // 缓存新 ETag 供下次使用
            const newEtag = res.headers.get('ETag');
            if (newEtag) this._roomEtas[room] = newEtag;
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    },

    fmtTime(ts) {
        const d = new Date(ts);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const pad = n => String(n).padStart(2, '0');
        if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },

    avatarHtml(u, cls) {
        if (!u) return `<span class="chat-av ${cls || ''}">?</span>`;
        const name = u.nickname || u.name || '?';
        if (u.avatar && u.avatar.startsWith('data:image/')) {
            return `<span class="chat-av ${cls || ''}"><img src="${u.avatar}" alt=""></span>`;
        }
        let color;
        const COLORS = ['#FF7A2F', '#3E9E94', '#5B8DEF', '#9B6DFF', '#E15B78', '#34B47C', '#C99A2C', '#607D8B'];
        if (u.avatar && /^preset:[0-7]$/.test(u.avatar)) color = COLORS[+u.avatar.slice(7)];
        else {
            let h = 0; const s = u.id || name;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            color = COLORS[h % COLORS.length];
        }
        return `<span class="chat-av ${cls || ''}" style="background:${color}">${name.charAt(0)}</span>`;
    },

    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    dmRoom(a, b) { return 'dm:' + [a, b].sort().join(':'); },
    dmPeer(room) { const p = room.split(':'); return this.user ? (p[1] === this.user.id ? p[2] : p[1]) : p[1]; },

    // ---------- 登录态 ----------
    loggedIn() {
        return !!(window.AuthCenter && AuthCenter.user);
    },

    // ---------- 初始化 ----------
    init() {
        this.bind();
        window.addEventListener('authchange', (e) => {
            this.user = e.detail.loggedIn && AuthCenter.user ? AuthCenter.user : null;
            this.reset();
            if (this.user) this.enter();
        });
        // 页面已登录（刷新/恢复会话）：进入聊天
        if (this.loggedIn()) {
            this.user = AuthCenter.user;
            this.enter();
        }
    },

    bind() {
        document.querySelectorAll('#page-chat .ap-back').forEach(b => {
            b.addEventListener('click', () => AppShell.switchTab('map'));
        });
        document.getElementById('chatBack').addEventListener('click', () => this.backToRooms());
        document.getElementById('chatNew').addEventListener('click', () => this.openUserPicker());
        document.getElementById('chatSend').addEventListener('click', () => this.send());
        const input = document.getElementById('chatInput');
        input.addEventListener('keydown', e => { if (e.key === 'Enter') this.send(); });

        // 抽屉关闭
        document.getElementById('chatUsersMask').addEventListener('click', () => this.closeUserPicker());
        document.getElementById('chatUsersClose').addEventListener('click', () => this.closeUserPicker());
        const userSearch = document.getElementById('chatUserSearch');
        if (userSearch) userSearch.addEventListener('input', () => this.renderUserList(userSearch.value));

        // 用户资料卡
        document.getElementById('chatProfileMask').addEventListener('click', () => this.closeProfile());
        document.getElementById('chatProfileClose').addEventListener('click', () => this.closeProfile());

        // v3.18 事件委托：点击头像/名字查看资料一次性绑在容器
        // 避免 renderMessages 增量追加后每条消息都要 querySelectorAll 重绑 click
        const msgBox = document.getElementById('chatMsgs');
        if (msgBox && !msgBox._chatDelegated) {
            msgBox._chatDelegated = true;
            msgBox.addEventListener('click', (e) => {
                const el = e.target.closest('.chat-clickable');
                if (!el) return;
                const uid = el.dataset.uid;
                if (uid) this.showProfile(uid);
            });
        }
    },

    reset() {
        this.stopPoll();
        this.rooms = [];
        this.activeRoom = null;
        this.activeIsSystem = false;
        this._lastLobbySeen = 0;
        this.friendReqCount = 0;
        document.getElementById('chatRooms').innerHTML = '';
        document.getElementById('chatMsgs').innerHTML = '';
        this.updateBadge();
        AppShell.closePage('chat');
        AppShell.closePage('chatroom');
    },

    // ---------- 进入（登录后） ----------
    enter() {
        this.renderRooms();
        this.startPoll();
    },

    stopPoll() {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    },

    /** 轮询：大厅 + 各私聊房间的新消息（简单可靠，无需 WebSocket） */
    startPoll() {
        this.stopPoll();
        this.pollTimer = setInterval(() => this.refresh(), 5000);
        this.refresh();
    },

    async refresh() {
        if (!this.loggedIn()) return;
        await this.refreshLobby();
        // v3.19：当前在私聊房间时也轮询该房间的新消息（修复 refresh 只刷 lobby 的遗留）
        if (this.activeRoom && this.activeRoom !== 'lobby') {
            await this.refreshActiveDm();
        }
        // v3.19：每 30 秒（6 次 × 5s）刷新一次好友请求列表，让底部 Tab 角标实时更新
        this._friendPollTick = (this._friendPollTick || 0) + 1;
        if (this._friendPollTick >= 6) {
            this._friendPollTick = 0;
            // 仅在会话列表页（未进入具体房间）时刷新，避免打扰当前聊天
            if (!this.activeRoom) this.loadFriendList();
        }
    },

    /** v3.19：轮询当前私聊房间的新消息 */
    async refreshActiveDm() {
        try {
            const d = await this._fetchWithEtag(this.activeRoom, 30);
            if (d && d.senders) Object.assign(this.avCache, d.senders);
            if (d && d.messages) this.renderMessages(d.messages);
        } catch (e) { /* 网络抖动忽略 */ }
    },

    async refreshLobby() {
        try {
            const data = await this._fetchWithEtag('lobby', 30);
            // 304 = 没有新消息，跳过渲染
            if (!data || !data.messages) return;
            // 未读：大厅有新消息且当前不在大厅
            if (this._lastLobbySeen && data.messages.length) {
                const last = data.messages[data.messages.length - 1];
                if (last && last.createdAt > this._lastLobbySeen && this.activeRoom !== 'lobby') {
                    this.lobbyUnread = true;
                    this.updateBadge();
                }
            }
            if (this.activeRoom === 'lobby') {
                this.renderMessages(data.messages);
                this._lastLobbySeen = data.messages.length ? data.messages[data.messages.length - 1].createdAt : this._lastLobbySeen;
            }
        } catch (e) { /* 网络抖动忽略 */ }
    },

    // ---------- 会话列表 ----------
    renderRooms() {
        const box = document.getElementById('chatRooms');
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        if (!this.loggedIn()) {
            box.innerHTML = `
                <div class="chat-login">
                    <div class="chat-login-ico">💬</div>
                    <p>${T('chat.login.hint')}</p>
                    <button class="btn-primary btn-sm" id="chatGoLogin">${T('auth.login.register')}</button>
                </div>`;
            document.getElementById('chatGoLogin').addEventListener('click', () => AuthCenter.open('menu'));
            return;
        }
        box.innerHTML = `
            <button class="chat-room-item" data-room="lobby">
                <span class="chat-av lobby-av">🏫</span>
                <span class="chat-room-info">
                    <span class="chat-room-name">${T('chat.public.lobby')}</span>
                    <span class="chat-room-preview" id="lobbyPreview">${T('chat.welcome')}</span>
                </span>
                <span class="chat-room-meta"></span>
            </button>
            <div class="chat-room-hd">${T('chat.dm.section')}</div>
            <div id="dmList"></div>`;
        box.querySelector('[data-room="lobby"]').addEventListener('click', () => this.openRoom('lobby'));
        this.loadRoomsPreview();
        this.loadFriendList();   // v3.19：加载好友列表 + 待处理请求进 dmList
    },

    /** 语言切换后重绘会话列表与标题 */
    _onLangChange() {
        this.renderRooms();
        if (this.activeRoom) {
            const T = (k) => (window.I18N ? window.I18N.t(k) : k);
            const title = this.activeRoom === 'lobby'
                ? T('chat.public.lobby')
                : (this.activeIsSystem ? (T('chat.sys.name') || '系统通知') : (this.activePeer ? this.activePeer.nickname : T('chat.new')));
            document.getElementById('chatRoomTitle').textContent = title;
        }
    },

    async loadRoomsPreview() {
        // 拉大厅最新一条作为预览（复用 ETag；304 时保留上次预览，省一次 DB 查询）
        try {
            const d = await this._fetchWithEtag('lobby', 1);
            if (d && d.messages && d.messages.length) {
                const m = d.messages[0];
                const el = document.getElementById('lobbyPreview');
                if (el) el.textContent = m.senderName + '：' + m.text;
            }
        } catch (e) { /* ignore */ }
    },

    /**
     * v3.19：加载好友列表 + 待处理请求，填入 dmList
     * - 待处理请求行内带「同意 / 拒绝」按钮（复用 dmList，不另开抽屉）
     * - 好友列表行点击 → openRoom DM
     * - 同时刷新底部 Tab 角标（请求数 > 0 显示数字红点）
     */
    async loadFriendList() {
        const dmList = document.getElementById('dmList');
        if (!dmList || !this.loggedIn()) return;
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        try {
            const [fr, reqs, sys] = await Promise.all([
                CampusAPI._fetch('api/friends'),
                CampusAPI._fetch('api/friends/requests'),
                CampusAPI._fetch('api/chat/sysrooms'),
            ]);
            this.friendReqCount = (reqs && reqs.count) || 0;
            this.updateBadge();

            const reqList = (reqs && reqs.requests) || [];
            const friends = (fr && fr.friends) || [];
            const sysRooms = (sys && sys.rooms) || [];

            let html = '';
            // v3.21：系统通知区（置顶，如「你认领的帖子被撤回」）
            if (sysRooms.length) {
                html += `<div class="chat-room-hd chat-sys-hd">🛎️ ${T('chat.sys.section') || '系统通知'}</div>`;
                html += sysRooms.map(r => `
                    <button class="chat-room-item chat-sys-item" data-sys-room="${this.esc(r.room)}" data-peer-id="${this.esc(r.peer.id)}" data-peer-name="${this.esc(r.peer.nickname)}">
                        <span class="chat-av sys-av">🛎️</span>
                        <span class="chat-room-info">
                            <span class="chat-room-name">${T('chat.sys.name') || '系统通知'}</span>
                            <span class="chat-room-preview">${this.esc(r.lastText)}</span>
                        </span>
                        <span class="chat-room-meta"></span>
                    </button>`).join('');
            }
            // 待处理好友请求（置顶，行内同意/拒绝）
            if (reqList.length) {
                html += reqList.map(u => `
                    <div class="chat-room-item chat-friend-req-row" data-req-id="${this.esc(u.id)}">
                        ${this.avatarHtml(u)}
                        <span class="chat-room-info">
                            <span class="chat-room-name">${this.esc(u.nickname)}</span>
                            <span class="chat-room-preview">${T('chat.friend.requests') || '好友请求'}</span>
                        </span>
                        <span class="chat-friend-acts">
                            <button class="btn-primary btn-xs" data-act="accept" data-id="${this.esc(u.id)}">${T('chat.friend.accept') || '同意'}</button>
                            <button class="btn-ghost btn-xs" data-act="reject" data-id="${this.esc(u.id)}">${T('chat.friend.reject') || '拒绝'}</button>
                        </span>
                    </div>`).join('');
            }
            // 好友列表
            if (friends.length) {
                html += friends.map(f => `
                    <button class="chat-room-item" data-dm-uid="${this.esc(f.id)}" data-dm-name="${this.esc(f.nickname)}">
                        ${this.avatarHtml(f)}
                        <span class="chat-room-info">
                            <span class="chat-room-name">${this.esc(f.nickname)}</span>
                            <span class="chat-room-preview">${this.esc((f.college || '') + (f.major ? ' · ' + f.major : ''))}</span>
                        </span>
                        <span class="chat-room-meta"></span>
                    </button>`).join('');
            }
            if (!reqList.length && !friends.length) {
                html += `<div class="chat-dm-empty">${T('chat.friend.empty') || '还没有好友，点击右上角 + 添加'}</div>`;
            }
            dmList.innerHTML = html;

            // 同意/拒绝按钮（事件委托到 dmList，避免每次重渲染重复绑定）
            if (!dmList._friendDelegated) {
                dmList._friendDelegated = true;
                dmList.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-act]');
                    if (!btn) return;
                    e.stopPropagation();
                    const action = btn.dataset.act;
                    const id = btn.dataset.id;
                    this._respondFriend(id, action);
                });
                // 好友行点击进 DM
                dmList.addEventListener('click', (e) => {
                    const row = e.target.closest('[data-dm-uid]');
                    if (!row) return;
                    const id = row.dataset.dmUid;
                    const name = row.dataset.dmName;
                    this.openRoom(this.dmRoom(this.user.id, id), { id, nickname: name });
                });
                // v3.21：系统通知行点击 → 打开系统房间（跳过好友校验）
                dmList.addEventListener('click', (e) => {
                    const row = e.target.closest('[data-sys-room]');
                    if (!row) return;
                    const room = row.dataset.sysRoom;
                    const id = row.dataset.peerId;
                    const name = row.dataset.peerName;
                    this.openRoom(room, { id, nickname: name }, true);
                });
            }
        } catch (e) {
            dmList.innerHTML = `<div class="chat-dm-empty">${T('chat.friend.load.fail') || '加载好友失败'}</div>`;
        }
    },

    /** 同意/拒绝好友请求后刷新 dmList */
    async _respondFriend(otherId, action) {
        try {
            const r = await CampusAPI._fetch('api/friends/' + encodeURIComponent(otherId) + '/respond', {
                method: 'POST',
                body: JSON.stringify({ action }),
            });
            showToast(r.message || (action === 'accept' ? '已同意' : '已拒绝'), 'success', 1800);
            this.loadFriendList();
        } catch (e) {
            showToast(e.message || '操作失败', 'error', 2000);
        }
    },

    // ---------- 打开会话 ----------
    /**
     * v3.19：私聊房间先校验好友关系，非好友则引导到资料卡加好友
     * （复用 showProfile 作为好友操作的统一入口，不新增弹窗）
     */
    async openRoom(room, peer, skipFriendCheck) {
        // v3.21：系统通知房间（含系统消息）跳过好友校验；普通私聊仍需先加好友
        if (room.startsWith('dm:') && !skipFriendCheck) {
            const other = this.dmPeer(room);
            if (other === this.user.id) { showToast('不能给自己发私信', 'error', 1800); return; }
            try {
                const fs = await CampusAPI._fetch('api/friends/status/' + encodeURIComponent(other));
                if (fs.status !== 'friends') {
                    const hint = (window.I18N && window.I18N.t('chat.friend.dm.hint')) || '需先添加对方为好友，对方同意后才能私信';
                    showToast(hint, 'error', 2400);
                    this.showProfile(other);
                    return;
                }
            } catch (e) { /* 查询失败放行，让后端再校验 FRIEND_REQUIRED */
                console.warn('[chat] 好友状态查询失败，放行交由后端校验', e && e.message);
            }
        }
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        this.activeRoom = room;
        this.activePeer = peer || null;
        this.activeIsSystem = !!skipFriendCheck;
        const title = room === 'lobby'
            ? T('chat.public.lobby')
            : (skipFriendCheck ? (T('chat.sys.name') || '系统通知') : (peer ? peer.nickname : T('chat.new')));
        document.getElementById('chatRoomTitle').textContent = title;
        AppShell.openPage('chatroom');
        document.getElementById('chatMsgs').innerHTML = '';
        // v3.17 修复: 重进房间时重置该房间的 ETag 缓存，让首次拉取不带 If-None-Match，
        // 必定走 200 分支拿到全部消息。否则 ETag 命中 304 返回 null，加上上面已清空 chatMsgs，
        // 会导致"进房间看不到消息，必须发一条才能看见"的 bug。后续轮询继续用 ETag 无回归。
        if (this._roomEtas && room) delete this._roomEtas[room];
        if (room === 'lobby') this.lobbyUnread = false;
        this.updateBadge();
        this.loadRoom(room);
    },

    async loadRoom(room) {
        try {
            const d = await this._fetchWithEtag(room, 100);
            // 服务端 senders 映射：{uid:{name,avatar}}，合并进本地头像缓存
            if (d && d.senders) Object.assign(this.avCache, d.senders);
            // 304：保留上次的渲染（避免重绘引起闪烁），仅保证滚动到底
            const msgs = (d && d.messages) || [];
            if (msgs.length) this.renderMessages(msgs);
            else if (!d) {
                // 命中 304，但当前房间还没渲染过（首次进入即拿到 304 不太可能，容错）
                const box = document.getElementById('chatMsgs');
                if (box && !box.children.length) {
                    box.innerHTML = `<div class="chat-empty">${window.I18N ? window.I18N.t('chat.empty') : '还没有消息，来聊第一句吧 👋'}</div>`;
                }
            }
            if (room === 'lobby' && msgs.length) {
                this._lastLobbySeen = msgs[msgs.length - 1].createdAt;
            } else if (room === 'lobby' && !d) {
                // 304：保留上次水位
            }
        } catch (e) {
            showToast('加载消息失败', 'error', 1800);
        }
    },

    // 单条消息节点 HTML（供增量追加复用，避免全量 innerHTML 重画）
    _msgNodeHtml(m) {
        // v3.21：系统消息（如撤回通知）走独立气泡样式，不渲染头像/删除操作
        if (m.system) return this._sysMsgNodeHtml(m);
        const me = this.user && this.user.id;
        const mine = m.sender === me;
        const meAv = this.user ? { id: this.user.id, nickname: this.user.nickname, avatar: this.user.avatar } : null;
        const cached = this.avCache[m.sender];
        const u = mine ? meAv : { id: m.sender, nickname: (cached && cached.name) || m.senderName, avatar: cached ? cached.avatar : null };
        const avHtml = `<div class="chat-msg-av chat-clickable" data-uid="${this.esc(m.sender)}">${this.avatarHtml(u)}</div>`;
        const nameHtml = `<div class="chat-msg-name chat-clickable" data-uid="${this.esc(m.sender)}">${this.esc(m.senderName || (meAv && meAv.nickname) || '')}</div>`;
        return `<div class="chat-msg ${mine ? 'mine' : ''}" data-mid="${this.esc(m.id)}">
            ${avHtml}
            <div class="chat-msg-bubble-wrap">
                ${nameHtml}
                <div class="chat-msg-bubble">${this.esc(m.text)}</div>
                <div class="chat-msg-time">${this.fmtTime(m.createdAt)}</div>
            </div>
        </div>`;
    },

    /** v3.21：系统消息气泡 —— 🛎️ 头部 + 居中样式，无头像、无删除操作 */
    _sysMsgNodeHtml(m) {
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        return `<div class="chat-msg chat-msg-sys" data-mid="${this.esc(m.id)}">
            <div class="chat-sys-bubble">
                <div class="chat-sys-head">🛎️ <span>${T('chat.sys.title') || '来自系统'}</span></div>
                <div class="chat-sys-text">${this.esc(m.text)}</div>
                <div class="chat-msg-time">${this.fmtTime(m.createdAt)}</div>
            </div>
        </div>`;
    },

    /**
     * 追加单条消息节点（v3.18 增量渲染核心）
     * - 移除空态占位
     * - 记录追加前是否在底部，追加后智能滚动（原在底部 / 自己的消息 → 滚到底，否则不打断阅读）
     * - DOM 超过 MAX_DOM 条时移除顶部最旧的，防止长会话 DOM 无限堆积卡顿
     */
    _appendMsg(m, forceScroll) {
        const box = document.getElementById('chatMsgs');
        if (!box) return;
        const empty = box.querySelector('.chat-empty');
        if (empty) empty.remove();
        const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        const tpl = document.createElement('template');
        tpl.innerHTML = this._msgNodeHtml(m).trim();
        box.appendChild(tpl.content);
        while (box.children.length > this.MAX_DOM) box.removeChild(box.firstElementChild);
        if (wasAtBottom || forceScroll) box.scrollTop = box.scrollHeight;
    },

    renderMessages(msgs) {
        const box = document.getElementById('chatMsgs');
        if (!this.activeRoom || !box) return;
        // 按 id 去重输入
        const seen = new Set();
        const items = msgs.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
        if (!items.length) {
            if (!box.children.length || box.querySelector('.chat-empty')) {
                box.innerHTML = `<div class="chat-empty">${window.I18N ? window.I18N.t('chat.empty') : '还没有消息，来聊第一句吧 👋'}</div>`;
            }
            return;
        }
        // 增量追加：已渲染的 id 跳过，只 append 新消息（核心：不再全量 innerHTML 重画）
        const existing = new Set();
        box.querySelectorAll('[data-mid]').forEach(el => existing.add(el.dataset.mid));
        const me = this.user && this.user.id;
        items.forEach(m => {
            if (existing.has(m.id)) return;
            this._appendMsg(m, m.sender === me);
        });
    },

    // ---------- 用户资料卡 ----------
    /**
     * v3.19：资料卡按好友关系态渲染操作按钮（复用现有 chatProfile 抽屉，不新增组件）
     *   · friends        → 💬 私聊
     *   · pending_sent   → 已发送请求，等待同意…（禁用）
     *   · pending_recv   → ✓ 同意 / ✕ 拒绝
     *   · none / rejected → ＋ 加好友 / 重新发送请求
     *   · self           → 不显示按钮
     */
    async showProfile(uid) {
        if (!this.loggedIn()) { AuthCenter.open('menu', '请先登录'); return; }
        const sheet = document.getElementById('chatProfile');
        const body = document.getElementById('chatProfileBody');
        sheet.classList.remove('hidden');
        body.innerHTML = `<div class="chat-user-loading">加载中…</div>`;
        try {
            const [d, fs] = await Promise.all([
                CampusAPI._fetch('api/chat/user/' + encodeURIComponent(uid)),
                CampusAPI._fetch('api/friends/status/' + encodeURIComponent(uid)),
            ]);
            const u = d.user;
            const st = fs.status;
            const regDate = u.createdAt ? new Date(u.createdAt) : null;
            const regStr = regDate ? (regDate.getFullYear() + '年' + (regDate.getMonth() + 1) + '月' + regDate.getDate() + '日') : '—';
            body.innerHTML = `
                <div class="chat-profile-hero">
                    ${this.avatarHtml(u, 'chat-av-lg')}
                    <div class="chat-profile-name">${this.esc(u.nickname || '未命名')}</div>
                </div>
                <div class="chat-profile-rows">
                    <div class="chat-profile-row"><span class="k">学校</span><span class="v">${this.esc(u.school || '未填写')}</span></div>
                    <div class="chat-profile-row"><span class="k">年级</span><span class="v">${this.esc(u.grade || '未填写')}</span></div>
                    <div class="chat-profile-row"><span class="k">学院</span><span class="v">${this.esc(u.college || '未填写')}</span></div>
                    <div class="chat-profile-row"><span class="k">专业</span><span class="v">${this.esc(u.major || '未填写')}</span></div>
                    <div class="chat-profile-row"><span class="k">学号</span><span class="v">${this.esc(u.studentId || '未填写')}</span></div>
                    <div class="chat-profile-row"><span class="k">加入时间</span><span class="v">${regStr}</span></div>
                </div>
                ${this._profileActionHtml(u, st)}`;
            this._bindProfileActions(u, st);
        } catch (e) {
            body.innerHTML = `<div class="chat-user-loading">加载失败，请重试</div>`;
        }
    },

    _profileActionHtml(u, st) {
        const T = (k) => (window.I18N ? window.I18N.t(k) : k);
        if (st === 'self') return '';
        if (st === 'friends') {
            return `<button class="btn-primary btn-sm chat-profile-dm" data-uid="${this.esc(u.id)}" data-name="${this.esc(u.nickname || '')}">💬 ${T('chat.friend.dm') || '私聊'}</button>`;
        }
        if (st === 'pending_sent') {
            return `<button class="btn-sm chat-profile-pending" disabled>${T('chat.friend.pending') || '已发送请求，等待同意…'}</button>`;
        }
        if (st === 'pending_recv') {
            return `<div class="chat-profile-acts">
                <button class="btn-primary btn-sm" data-act="accept" data-uid="${this.esc(u.id)}">✓ ${T('chat.friend.accept') || '同意'}</button>
                <button class="btn-ghost btn-sm" data-act="reject" data-uid="${this.esc(u.id)}">✕ ${T('chat.friend.reject') || '拒绝'}</button>
            </div>`;
        }
        // none / rejected
        const label = st === 'rejected' ? (T('chat.friend.readd') || '重新发送好友请求') : ('＋ ' + (T('chat.friend.add') || '加好友'));
        return `<button class="btn-primary btn-sm chat-profile-add" data-uid="${this.esc(u.id)}">${label}</button>`;
    },

    _bindProfileActions(u, st) {
        const body = document.getElementById('chatProfileBody');
        if (!body) return;
        if (st === 'friends') {
            const btn = body.querySelector('.chat-profile-dm');
            if (btn) btn.addEventListener('click', () => {
                this.closeProfile();
                this.openRoom(this.dmRoom(this.user.id, u.id), { id: u.id, nickname: u.nickname });
            });
        } else if (st === 'pending_recv') {
            body.querySelectorAll('[data-act]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.act;
                    try {
                        const r = await CampusAPI._fetch('api/friends/' + encodeURIComponent(u.id) + '/respond', {
                            method: 'POST',
                            body: JSON.stringify({ action }),
                        });
                        showToast(r.message || (action === 'accept' ? '已同意，互为好友' : '已拒绝'), 'success', 1800);
                        this.closeProfile();
                        this.loadFriendList();
                    } catch (e) {
                        showToast(e.message || '操作失败', 'error', 2000);
                    }
                });
            });
        } else if (st === 'none' || st === 'rejected') {
            const btn = body.querySelector('.chat-profile-add');
            if (btn) btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '发送中…';
                try {
                    const r = await CampusAPI._fetch('api/friends/request', {
                        method: 'POST',
                        body: JSON.stringify({ toUid: u.id }),
                    });
                    showToast(r.message || '请求已发送', 'success', 1800);
                    this.closeProfile();
                    this.loadFriendList();
                } catch (e) {
                    showToast(e.message || '发送失败', 'error', 2000);
                    btn.disabled = false;
                    btn.textContent = '＋ ' + ((window.I18N && window.I18N.t('chat.friend.add')) || '加好友');
                }
            });
        }
    },

    closeProfile() {
        document.getElementById('chatProfile').classList.add('hidden');
    },

    // ---------- 发送 ----------
    async send() {
        if (!this.loggedIn()) { AuthCenter.open('menu', '请先登录再发言'); return; }
        if (!this.activeRoom) return;
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;
        try {
            const res = await CampusAPI._fetch('api/chat', {
                method: 'POST',
                body: JSON.stringify({ room: this.activeRoom, text }),
            });
            input.value = '';
            // v3.18: 局部追加自己的消息，不再 loadRoom 全量重拉（避免重画 + 卡顿）
            if (res && res.message) {
                // 合并自己的资料进 avCache 保证头像一致
                this.avCache[this.user.id] = { name: this.user.nickname, avatar: this.user.avatar };
                this._appendMsg(res.message, true);
            }
        } catch (e) {
            // 内容安全拦截：保留输入内容让用户修改
            if (e.code === 'CONTENT_BLOCKED') {
                showToast('消息含违规内容，已拦截（累计多次将被禁止发言）', 'error', 2600);
                input.value = text; // 回填，便于修改
                input.focus();
                return;
            }
            // 被踢出/封禁：清空输入并刷新登录态提示
            if (e.code === 'CHAT_BANNED') {
                showToast('你已被移出聊天并禁止发言', 'error', 3000);
                input.value = '';
                this.backToRooms();
                return;
            }
            input.value = text; // 网络等其它错误也回填，避免丢字
            showToast(e.message || '发送失败', 'error', 2000);
        }
    },

    backToRooms() {
        this.activeRoom = null;
        this.activeIsSystem = false;
        AppShell.closePage('chatroom');
        this.renderRooms();
    },

    // ---------- 私聊用户选择 ----------
    /**
     * v3.19：点击用户行不再直接开 DM（DM 已要求好友），改为打开资料卡。
     * 资料卡按好友关系态显示「加好友 / 同意·拒绝 / 私聊」按钮，作为统一操作入口。
     * （复用 showProfile，避免新增弹窗组件）
     */
    async openUserPicker() {
        if (!this.loggedIn()) { AuthCenter.open('menu', '请先登录'); return; }
        const sheet = document.getElementById('chatUsers');
        sheet.classList.remove('hidden');
        const list = document.getElementById('chatUserList');
        list.innerHTML = `<div class="chat-user-loading">加载中…</div>`;
        try {
            const d = await CampusAPI._fetch('api/chat/users');
            this._usersCache = d.users || [];
            if (!this._usersCache.length) {
                list.innerHTML = `<div class="chat-user-loading">暂时还没有其他用户</div>`;
                return;
            }
            const search = document.getElementById('chatUserSearch');
            if (search) search.value = '';
            this.renderUserList('');
            list.querySelectorAll('.chat-user-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    this.closeUserPicker();
                    this.showProfile(id);  // 改为打开资料卡（加好友/私聊的统一入口）
                });
            });
        } catch (e) {
            list.innerHTML = `<div class="chat-user-loading">加载失败，请重试</div>`;
        }
    },

    /** v3.37：按邮箱 / 昵称过滤渲染用户列表（搜索添加好友） */
    renderUserList(keyword) {
        const list = document.getElementById('chatUserList');
        const kw = (keyword || '').trim().toLowerCase();
        const users = (this._usersCache || []).filter(u =>
            !kw || (u.email || '').toLowerCase().includes(kw) || (u.nickname || '').toLowerCase().includes(kw));
        if (!users.length) {
            list.innerHTML = `<div class="chat-user-loading">没有匹配的用户</div>`;
            return;
        }
        list.innerHTML = users.map(u => `
            <button class="chat-user-item" data-id="${u.id}">
                ${this.avatarHtml(u)}
                <span class="chat-user-main">
                    <span class="chat-user-name">${this.esc(u.nickname)}</span>
                    <span class="chat-user-email">${this.esc(u.email || '')}</span>
                </span>
                <span class="chat-user-school">${this.esc(u.school || '')}</span>
            </button>`).join('');
        list.querySelectorAll('.chat-user-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                this.closeUserPicker();
                this.showProfile(id);
            });
        });
    },

    closeUserPicker() {
        document.getElementById('chatUsers').classList.add('hidden');
    },

    // ---------- 未读角标 ----------
    /**
     * v3.19：角标扩展——大厅未读 OR 好友请求待处理 时显示。
     * 好友请求 > 0 显示数字角标；只有大厅未读时显示红点。
     */
    updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (!badge) return;
        const show = !!(this.lobbyUnread || this.friendReqCount);
        badge.classList.toggle('hidden', !show);
        badge.classList.toggle('badge-num', !!this.friendReqCount);
        badge.textContent = this.friendReqCount ? String(this.friendReqCount) : '';
    },
};

window.Chat = Chat;
