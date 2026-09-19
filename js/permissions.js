/* ============================================================
 * permissions.js — 权限中心（v3.11）
 *   1. 预授权引导卡片：首次进入地图时先弹液态玻璃卡片说明用途，
 *      用户点「允许」后再触发系统权限弹窗（先引导，后弹窗）
 *   2. 隐私与权限页：定位/通知/相机/相册/麦克风五项状态总览，
 *      可点击重新请求或查看开启指引，回到页面自动刷新状态
 *   3. 拒绝后引导：权限被浏览器拒绝时，在触发点旁弹出锚定气泡，
 *      给出「如何去设置开启」的分步指引（Web 无法直达系统设置，
 *      用指引气泡替代）
 * 依赖：appshell.js（AppShell.requestGeo / showToast），CSS 见
 * style.css「权限中心」段落。
 * ============================================================ */
const PermCenter = (() => {

    const PRIME_FLAG = 'wx_perm_primed_v1';

    const ICONS = {
        geo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
        bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
        camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
        photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3"/></svg>',
    };

    /** 查询定位权限状态：granted / denied / prompt / unsupported */
    async function geoState() {
        if (!navigator.geolocation) return 'unsupported';
        if (!navigator.permissions || !navigator.permissions.query) return 'prompt';
        try { return (await navigator.permissions.query({ name: 'geolocation' })).state; }
        catch (e) { return 'prompt'; }
    }

    /** 通知权限状态：granted / denied / default / unsupported */
    function notifState() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;   // granted / denied / default
    }

    /* ============================================================
     * 一、预授权引导卡片（首次进入地图）
     * ============================================================ */
    async function maybePrime() {
        try { if (localStorage.getItem(PRIME_FLAG)) return; } catch (e) { return; }
        if (!navigator.geolocation) return;
        // 已授权或已被拒：无需引导（被拒场景由权限页/气泡承担）
        if ((await geoState()) !== 'prompt') { markPrimed(); return; }

        const backdrop = document.createElement('div');
        backdrop.className = 'perm-prime-backdrop';
        const card = document.createElement('div');
        card.className = 'perm-prime-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', '开启定位');
        card.innerHTML = `
            <div class="perm-prime-icon">${ICONS.geo}</div>
            <div class="perm-prime-title">开启定位</div>
            <div class="perm-prime-desc">用于显示你在校园中的位置，并规划导航路线。位置信息仅在本机使用，不会上传。</div>
            <div class="perm-prime-actions">
                <button class="perm-prime-btn primary" data-act="allow">允许</button>
                <button class="perm-prime-btn ghost" data-act="later">暂不</button>
            </div>`;
        document.body.appendChild(backdrop);
        document.body.appendChild(card);

        makeDraggable(card);

        card.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const allow = btn.dataset.act === 'allow';
            dismiss(backdrop, card, () => {
                if (allow && window.AppShell) AppShell.requestGeo();
            });
        });
        backdrop.addEventListener('click', () => dismiss(backdrop, card));
    }

    function markPrimed() {
        try { localStorage.setItem(PRIME_FLAG, '1'); } catch (e) { /* 隐私模式下静默 */ }
    }

    function dismiss(backdrop, card, after) {
        markPrimed();
        card.classList.add('closing');
        backdrop.classList.add('closing');
        setTimeout(() => {
            card.remove(); backdrop.remove();
            if (after) after();
        }, 240);
    }

    /** 卡片可轻微拖动，松手后弹簧回中（大阻尼，模拟玻璃重量） */
    function makeDraggable(card) {
        let pid = null, sx = 0, sy = 0, dx = 0, dy = 0;
        const DAMP = 0.35;   // 手指位移 → 卡片位移的衰减系数（越小越"重"）

        card.addEventListener('pointerdown', (e) => {
            if (e.target.closest('[data-act]')) return;   // 按钮上不触发拖动
            pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; dy = 0;
            card.setPointerCapture(pid);
            card.classList.add('dragging');
        });
        card.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pid) return;
            dx = (e.clientX - sx) * DAMP;
            dy = (e.clientY - sy) * DAMP;
            card.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.02)`;
        });
        const release = (e) => {
            if (e.pointerId !== pid) return;
            pid = null;
            card.classList.remove('dragging');
            card.style.transform = '';   // CSS 弹簧过渡带回中心
        };
        card.addEventListener('pointerup', release);
        card.addEventListener('pointercancel', release);
    }

    /* ============================================================
     * 二、隐私与权限页
     * ============================================================ */
    const BADGE = {
        granted:     ['已开启',   'granted'],
        denied:      ['已关闭',   'denied'],
        prompt:      ['未请求',   'prompt'],
        default:     ['未请求',   'prompt'],
        system:      ['系统级',   'granted'],
        unused:      ['未使用',   'prompt'],
        unsupported: ['不支持',   'denied'],
    };

    async function renderPage() {
        const list = document.getElementById('permList');
        if (!list) return;
        const geo = await geoState();
        const notif = notifState();

        const items = [
            { key: 'geo',   icon: ICONS.geo,    name: '定位服务', state: geo,
              desc: '用于地图定位、路线规划和打卡' },
            { key: 'notif', icon: ICONS.bell,   name: '通知',     state: notif,
              desc: '用于地点更新提醒和活动通知' },
            { key: 'camera', icon: ICONS.camera, name: '相机',    state: 'system',
              desc: '用于拍摄失物照片（由系统相机调起，无需单独授权）' },
            { key: 'photo', icon: ICONS.photo,  name: '相册',     state: 'system',
              desc: '用于上传照片和头像（由系统文件选择器调起）' },
            { key: 'mic',   icon: ICONS.mic,    name: '麦克风',   state: 'unused',
              desc: '语音输入目的地（功能未上线，不会请求）' },
        ];

        list.innerHTML = items.map(it => {
            const [label, cls] = BADGE[it.state] || BADGE.prompt;
            return `
            <button class="perm-card" data-perm="${it.key}" data-state="${it.state}">
                <span class="perm-card-icon">${it.icon}</span>
                <span class="perm-card-text">
                    <span class="perm-card-name">${it.name}</span>
                    <span class="perm-card-desc">${it.desc}</span>
                </span>
                <span class="perm-badge ${cls}">${label}</span>
            </button>`;
        }).join('');
    }

    function refreshIfOpen() {
        const page = document.getElementById('page-permissions');
        if (page && page.classList.contains('open')) renderPage();
    }

    /** 权限卡片点击：未请求→发起请求；已拒绝→锚定气泡指引 */
    function bindPage() {
        const list = document.getElementById('permList');
        if (!list) return;
        list.addEventListener('click', async (e) => {
            const card = e.target.closest('.perm-card');
            if (!card) return;
            const key = card.dataset.perm, state = card.dataset.state;

            if (key === 'geo') {
                if (state === 'prompt') { AppShell.requestGeo(); }
                else if (state === 'denied') { showGuide(card, 'geo'); }
                else if (state === 'granted' && typeof showToast === 'function') {
                    showToast('定位已开启，可在地图上设置我的位置', 'info', 2000);
                }
            } else if (key === 'notif') {
                if (state === 'default') {
                    try {
                        await Notification.requestPermission();
                    } catch (err) { /* 旧浏览器 Promise 形态差异 */ }
                    renderPage();
                } else if (state === 'denied') { showGuide(card, 'notif'); }
                else if (state === 'granted' && typeof showToast === 'function') {
                    showToast('通知已开启', 'info', 1500);
                } else if (state === 'unsupported' && typeof showToast === 'function') {
                    showToast('当前浏览器不支持网页通知', 'error', 2000);
                }
            } else if (key === 'camera' || key === 'photo') {
                if (typeof showToast === 'function') {
                    showToast('由系统调起，无需单独授权', 'info', 1800);
                }
            } else if (key === 'mic') {
                if (typeof showToast === 'function') {
                    showToast('语音功能未上线，不会请求麦克风', 'info', 1800);
                }
            }
        });

        // 从系统设置返回时刷新状态
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshIfOpen();
        });
        window.addEventListener('focus', refreshIfOpen);
    }

    /* ============================================================
     * 三、拒绝后的锚定气泡指引（去设置开启）
     * ============================================================ */
    let guideEl = null;

    function showGuide(anchor, type) {
        closeGuide();
        const isGeo = type === 'geo';
        const name = isGeo ? '定位' : '通知';
        guideEl = document.createElement('div');
        guideEl.className = 'perm-pop';
        guideEl.setAttribute('role', 'dialog');
        guideEl.innerHTML = `
            <div class="perm-pop-title">${name}权限已被浏览器关闭</div>
            <div class="perm-pop-steps">${isGeo
                ? '手机：点地址栏左侧 🔒 或 ⋮ →「网站设置」→「定位」→ 允许<br>电脑：点地址栏左侧锁形图标 →「网站设置」→ 定位改为允许'
                : '手机：点地址栏左侧 🔒 或 ⋮ →「网站设置」→「通知」→ 允许<br>电脑：点地址栏左侧锁形图标 →「网站设置」→ 通知改为允许'}</div>
            <button class="perm-pop-btn">我知道了</button>
            <span class="perm-pop-arrow" aria-hidden="true"></span>`;
        document.body.appendChild(guideEl);

        // 锚定到卡片：优先上方，靠顶则翻转到下方
        const r = anchor.getBoundingClientRect();
        const pw = guideEl.offsetWidth, ph = guideEl.offsetHeight;
        let left = Math.min(Math.max(r.left + r.width / 2, pw / 2 + 10), window.innerWidth - pw / 2 - 10);
        let top = r.top - ph - 10;
        let below = false;
        if (top < 10) { top = r.bottom + 10; below = true; }
        guideEl.style.left = left + 'px';
        guideEl.style.top = top + 'px';
        guideEl.classList.toggle('below', below);

        guideEl.querySelector('.perm-pop-btn').addEventListener('click', closeGuide);
        setTimeout(() => {
            document.addEventListener('pointerdown', (e) => {
                if (guideEl && !guideEl.contains(e.target)) closeGuide();
            }, { once: true });
        }, 0);
    }

    function closeGuide() {
        if (guideEl) { guideEl.remove(); guideEl = null; }
    }

    /* ---------- 初始化 ---------- */
    function init() {
        bindPage();
    }

    return { init, maybePrime, renderPage, refreshIfOpen, geoState };
})();
