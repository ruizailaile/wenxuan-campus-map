/* ============================================================
 * auth.js — 账户中心（v3.12）
 *   1. 邮箱注册（3 步：邮箱密码 → 验证码 → 完善资料）/ 登录 / 忘记密码
 *   2. 登录态管理：token 持久化（记住我=localStorage，否则 sessionStorage）
 *   3. 个人中心账号卡片渲染（未登录引导 / 已登录资料 + 退出）
 *   4. 发布类操作门禁：未登录自动弹登录抽屉（requireLogin）
 *   5. 登录后自动迁移本机共建数据上云并重绘地图
 * UI 遵循液态玻璃设计语言：底部抽屉 + 内嵌玻璃输入条 + 弹簧动效。
 * 依赖：appshell.js（showToast）、api.js（CampusAPI）；CSS 见
 * style.css「账户中心」段落；HTML 见 index.html #authSheet。
 * ============================================================ */
const AuthCenter = (() => {

    const TOKEN_KEY = 'wx_auth_token';
    const REMEMBER_KEY = 'wx_auth_remember';
    const AVATAR_COLORS = ['#FF7A2F', '#3E9E94', '#5B8DEF', '#9B6DFF', '#E15B78', '#34B47C', '#C99A2C', '#607D8B'];
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let token = null;
    let user = null;
    try {
        token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch (e) { /* 隐私模式 */ }

    // 注册 / 重置流程的暂存状态
    const flow = {
        email: '', password: '', avatar: 'preset:0',
        resendTimer: null, resendLeft: 0,
    };

    /* ---------- API ---------- */
    async function api(path, opts = {}) {
        const res = await fetch(path, {
            method: opts.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
            },
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401 && json.code === 'AUTH_REQUIRED' && token) {
            clearSession();   // token 失效（服务重启换密钥等）：静默登出
        }
        if (!res.ok) {
            const err = new Error(json.error || ('请求失败（' + res.status + '）'));
            err.code = json.code; err.status = res.status;
            throw err;
        }
        return json;
    }

    function saveSession(t, remember) {
        token = t;
        try {
            const store = remember ? localStorage : sessionStorage;
            store.setItem(TOKEN_KEY, t);
            (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
            localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
        } catch (e) { /* 隐私模式 */ }
    }

    function clearSession() {
        token = null; user = null;
        try {
            localStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
        } catch (e) { /* 隐私模式 */ }
    }

    /* ---------- 头像 ---------- */
    function avatarHtml(u, cls) {
        const av = u && u.avatar;
        const name = (u && u.nickname) || '游';
        if (av && av.startsWith('data:image/')) {
            return `<span class="acc-avatar ${cls || ''}"><img src="${av}" alt=""></span>`;
        }
        let color;
        if (av && /^preset:[0-7]$/.test(av)) {
            color = AVATAR_COLORS[+av.slice(7)];
        } else {
            // 无头像：按用户 id 稳定取色
            let h = 0;
            const s = (u && u.id) || name;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            color = AVATAR_COLORS[h % AVATAR_COLORS.length];
        }
        return `<span class="acc-avatar ${cls || ''}" style="background:${color}">${name.charAt(0)}</span>`;
    }

    /* ---------- 个人中心账号卡片 ---------- */
    function renderAccount() {
        const box = document.getElementById('accountCard');
        if (!box) return;
        if (!user) {
            box.innerHTML = `
            <div class="acc-card logged-out">
                <div class="acc-text">
                    <b>未登录</b>
                    <span>登录后可发布地标、同步班级共建数据；收藏与设置仍只存本机</span>
                </div>
                <button class="acc-btn primary" data-acc="login">登录 / 注册</button>
            </div>`;
            return;
        }
        box.innerHTML = `
        <div class="acc-card">
            ${avatarHtml(user)}
            <div class="acc-text">
                <b>${escapeHtml(user.nickname)}</b>
                <span>${escapeHtml(user.grade || '')}${user.college ? ' · ' + escapeHtml(user.college) : ''}${user.major ? ' · ' + escapeHtml(user.major) : ''}</span>
                <span class="acc-sub">${escapeHtml(user.email)}</span>
            </div>
            <div class="acc-actions">
                <button class="acc-btn ghost" data-acc="edit">编辑资料</button>
                <button class="acc-btn ghost" data-acc="logout">退出</button>
            </div>
        </div>`;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g,
            c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ---------- 抽屉开关 ---------- */
    const $ = id => document.getElementById(id);
    const VIEWS = ['menu', 'login', 'register', 'reset', 'profile'];

    function open(view, reason) {
        const bd = $('authBackdrop'), sheet = $('authSheet');
        if (!bd || !sheet) return;
        const r = $('authReason');
        if (reason) { r.textContent = reason; r.classList.remove('hidden'); }
        else r.classList.add('hidden');
        showView(view || 'menu');
        bd.classList.remove('hidden');
        sheet.classList.remove('hidden');
        requestAnimationFrame(() => { bd.classList.add('show'); sheet.classList.add('show'); });
    }

    function close() {
        const bd = $('authBackdrop'), sheet = $('authSheet');
        if (!bd || !sheet) return;
        bd.classList.remove('show'); sheet.classList.remove('show');
        stopResendTimer();
        setTimeout(() => { bd.classList.add('hidden'); sheet.classList.add('hidden'); }, 320);
    }

    /** 下拉关闭手势：从抽屉顶部（抓手附近）向下拖超过阈值即关闭 */
    function bindSheetDragClose() {
        const sheet = $('authSheet');
        if (!sheet) return;
        let startY = 0, dragging = false, moved = false, prevY = 0, prevT = 0, vel = 0;
        sheet.addEventListener('pointerdown', (e) => {
            // 仅当按在抽屉顶部抓手/标题空白区（非输入控件）时才启动拖拽
            if (e.target.closest('input, button, .code-box, .av-option')) return;
            const rect = sheet.getBoundingClientRect();
            if (e.clientY - rect.top > 90) return;   // 只允许顶部区域触发
            startY = prevY = e.clientY; prevT = performance.now();
            dragging = true; moved = false; vel = 0;
            sheet.style.transition = 'none';
            try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
        });
        sheet.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dy = e.clientY - startY;
            if (dy > 0) {
                moved = true;
                // v3.28 弹性阻尼：超过 90px 后越拉越"沉"，像拖橡皮筋
                const resist = dy > 90 ? 90 + (dy - 90) * 0.35 : dy;
                sheet.style.transform = `translateY(${resist.toFixed(1)}px)`;
            }
            const now = performance.now();
            if (now > prevT) vel = (e.clientY - prevY) / (now - prevT);   // px/ms
            prevY = e.clientY; prevT = now;
        });
        const release = (e) => {
            if (!dragging) return;
            dragging = false;
            const dy = e.clientY - startY;
            sheet.style.transition = '';
            sheet.style.transform = '';
            try { sheet.releasePointerCapture(e.pointerId); } catch (_) {}
            // 下拉超过 110px，或快速一甩（>40px 且速度 >0.55px/ms）即关闭；否则弹簧回弹
            if (moved && (dy > 110 || (dy > 40 && vel > 0.55))) close();
        };
        sheet.addEventListener('pointerup', release);
        sheet.addEventListener('pointercancel', release);
    }

    function showView(name) {
        VIEWS.forEach(v => $('authView' + v.charAt(0).toUpperCase() + v.slice(1))?.classList.toggle('hidden', v !== name));
        if (name === 'register') showRegStep(1);
        if (name === 'profile' && user) fillProfileForm();
    }

    function showRegStep(n) {
        [1, 2, 3].forEach(i => $('regStep' + i)?.classList.toggle('hidden', i !== n));
        document.querySelectorAll('#regDots i').forEach((d, i) => {
            d.classList.toggle('on', i < n);
        });
    }

    /* ---------- 验证码输入框（6 格，自动跳转） ---------- */
    function bindCodeBoxes(container) {
        const boxes = [...container.querySelectorAll('.code-box')];
        boxes.forEach((box, i) => {
            box.addEventListener('input', () => {
                box.value = box.value.replace(/\D/g, '').slice(0, 1);
                if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
                box.classList.remove('error');
            });
            box.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !box.value && i > 0) {
                    boxes[i - 1].focus();
                    boxes[i - 1].value = '';
                }
            });
            box.addEventListener('paste', (e) => {
                e.preventDefault();
                const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                digits.split('').forEach((ch, j) => { if (boxes[j]) boxes[j].value = ch; });
                boxes[Math.min(digits.length, 5)].focus();
            });
        });
        return {
            getCode: () => boxes.map(b => b.value).join(''),
            clear: () => boxes.forEach(b => { b.value = ''; b.classList.remove('error'); }),
            shakeError: () => {
                boxes.forEach(b => b.classList.add('error'));
                container.classList.remove('shake');
                void container.offsetWidth;   // 重启动画
                container.classList.add('shake');
            },
            focusFirst: () => boxes[0].focus(),
        };
    }

    /* ---------- 重发倒计时 ---------- */
    function startResendTimer(btn, email, type, hintEl) {
        stopResendTimer();
        flow.resendLeft = 60;
        btn.disabled = true;
        btn.textContent = `重新发送（${flow.resendLeft}s）`;
        flow.resendTimer = setInterval(() => {
            flow.resendLeft--;
            if (flow.resendLeft <= 0) {
                stopResendTimer();
                btn.disabled = false;
                btn.textContent = '重新发送验证码';
            } else {
                btn.textContent = `重新发送（${flow.resendLeft}s）`;
            }
        }, 1000);
    }
    function stopResendTimer() {
        if (flow.resendTimer) { clearInterval(flow.resendTimer); flow.resendTimer = null; }
    }

    /* ---------- 发送验证码（含演示模式提示） ---------- */
    async function sendCode(email, type, hintEl, btn) {
        const data = await api('api/auth/send-code', { method: 'POST', body: { email, type } });
        if (data.demo && data.devCode && hintEl) {
            hintEl.innerHTML = `演示模式：验证码是 <b>${data.devCode}</b>（正式版将发送到邮箱）`;
            hintEl.classList.remove('hidden');
        }
        if (btn) startResendTimer(btn, email, type, hintEl);
        return data;
    }

    /* ---------- 注册 ---------- */
    function bindRegister(regCode) {
        const email = $('regEmail'), pw = $('regPw'), pw2 = $('regPw2'), next1 = $('regNext1');

        const syncStep1 = () => {
            const ok = EMAIL_RE.test(email.value.trim())
                && pw.value.length >= 8
                && pw.value === pw2.value;
            next1.disabled = !ok;
        };
        [email, pw, pw2].forEach(el => el.addEventListener('input', syncStep1));

        next1.addEventListener('click', async () => {
            flow.email = email.value.trim();
            flow.password = pw.value;
            next1.disabled = true;
            try {
                await sendCode(flow.email, 'register', $('regDemoHint'), $('regResend'));
                showRegStep(2);
                regCode.clear();
                regCode.focusFirst();
            } catch (e) {
                if (e.code === 'EMAIL_TAKEN') {
                    showError(email, '该邮箱已注册，请直接登录');
                    $('regGoLogin')?.classList.remove('hidden');
                } else {
                    showToast(e.message, 'error');
                }
            } finally {
                next1.disabled = false;
                syncStep1();
            }
        });

        $('regResend').addEventListener('click', async () => {
            try { await sendCode(flow.email, 'register', $('regDemoHint'), $('regResend')); }
            catch (e) { showToast(e.message, 'error'); }
        });

        $('regVerify').addEventListener('click', async () => {
            const code = regCode.getCode();
            if (code.length !== 6) { regCode.shakeError(); return; }
            try {
                await api('api/auth/verify-code', { method: 'POST', body: { email: flow.email, type: 'register', code } });
                showRegStep(3);
            } catch (e) {
                regCode.shakeError();
                showToast(e.message, 'error', 2000);
            }
        });

        // 第 3 步：头像 + 资料
        buildAvatarGrid($('regAvatarGrid'), () => flow.avatar, v => { flow.avatar = v; });
        initGradeCollege('regGrade', 'regCollege', 'regMajor');
        $('regDone').addEventListener('click', async () => {
            const nick = $('regNick').value.trim();
            if (nick.length < 2 || nick.length > 12) {
                showError($('regNick'), '昵称需 2~12 个字符');
                return;
            }
            const grade = $('regGrade').value;
            const college = $('regCollege').value;
            const major = $('regMajor').value;
            if (!grade) { showError($('regGrade'), '请选择年级'); return; }
            if (!college) { showError($('regCollege'), '请选择学院'); return; }
            if (!major) { showError($('regMajor'), '请选择专业'); return; }
            try {
                const data = await api('api/auth/register', {
                    method: 'POST',
                    body: {
                        email: flow.email, password: flow.password, nickname: nick,
                        grade, college, major,
                        studentId: $('regSid').value.trim(),
                        avatar: flow.avatar,
                    },
                });
                user = data.user;
                saveSession(data.token, true);
                renderAccount();
                close();
                showWelcome(`欢迎加入文轩校园导视，${user.nickname}`);
                syncCloud();
                emitAuthChange(true);
            } catch (e) {
                showToast(e.message, 'error');
            }
        });
    }

    /* ---------- 年级/学院/专业 联动下拉（防乱填） ---------- */
    function initGradeCollege(gradeId, collegeId, majorId) {
        const gradeSel = $(gradeId), collegeSel = $(collegeId), majorSel = $(majorId);
        if (!gradeSel || !collegeSel || !majorSel) return;
        const W = window.WENXUAN || {};
        const grades = W.grades || [];
        const colleges = W.colleges || [];

        // 填充年级
        gradeSel.innerHTML = '<option value="">请选择年级</option>' +
            grades.map(g => `<option value="${g}">${g}</option>`).join('');
        // 填充学院
        collegeSel.innerHTML = '<option value="">请选择学院</option>' +
            colleges.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

        // 学院 → 专业联动
        const refreshMajor = (college) => {
            const majors = W.majorsOf ? W.majorsOf(college) : [];
            majorSel.innerHTML = '<option value="">' + (college ? '请选择专业' : '请先选择学院') + '</option>' +
                majors.map(m => `<option value="${m}">${m}</option>`).join('');
        };
        // 幂等绑定：change 只绑一次，refreshMajor 每次调用重新定义并存储
        collegeSel._gcRefresh = refreshMajor;
        if (!collegeSel.dataset.gcBound) {
            collegeSel.dataset.gcBound = '1';
            collegeSel.addEventListener('change', () => {
                if (collegeSel._gcRefresh) collegeSel._gcRefresh(collegeSel.value);
            });
        }
        refreshMajor(collegeSel.value);
    }

    /** 安全回填年级/学院/专业（旧用户数据可能不在新列表里，跳过不合法值） */
    function safeBackfillGC(gradeId, collegeId, majorId, user) {
        const W = window.WENXUAN || {};
        const gradeSel = $(gradeId), collegeSel = $(collegeId), majorSel = $(majorId);
        if (user.grade && W.grades && W.grades.includes(user.grade) && gradeSel) {
            gradeSel.value = user.grade;
        }
        if (user.college && W.colleges && W.colleges.some(c => c.name === user.college) && collegeSel) {
            collegeSel.value = user.college;
            if (collegeSel._gcRefresh) collegeSel._gcRefresh(user.college);
            if (user.major && W.majorsOf && W.majorsOf(user.college).includes(user.major) && majorSel) {
                majorSel.value = user.major;
            }
        }
    }

    /* ---------- 头像选择网格（8 预设 + 上传） ---------- */
    function buildAvatarGrid(grid, getCur, setCur) {
        if (!grid || grid.dataset.built) return;
        grid.dataset.built = '1';
        AVATAR_COLORS.forEach((c, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'av-option';
            b.style.background = c;
            b.dataset.val = 'preset:' + i;
            b.setAttribute('aria-label', '头像颜色 ' + (i + 1));
            b.addEventListener('click', () => {
                setCur('preset:' + i);
                syncAvatarGrid(grid, getCur());
            });
            grid.appendChild(b);
        });
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'av-option av-upload';
        up.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
        up.setAttribute('aria-label', '上传头像');
        up.addEventListener('click', () => {
            const fi = $('avatarFile');
            if (fi) fi.click();
        });
        grid.appendChild(up);
        syncAvatarGrid(grid, getCur());
    }

    function syncAvatarGrid(grid, cur) {
        if (!grid) return;
        grid.querySelectorAll('.av-option').forEach(b => {
            b.classList.toggle('on', b.dataset.val === cur);
        });
    }

    function bindAvatarUpload() {
        const fi = $('avatarFile');
        if (!fi) return;
        fi.addEventListener('change', () => {
            const file = fi.files && fi.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { showToast('图片请小于 2MB', 'error'); return; }
            const img = new Image();
            img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = cv.height = 96;
                const ctx = cv.getContext('2d');
                const s = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
                const dataUrl = cv.toDataURL('image/jpeg', 0.85);
                flow.avatar = dataUrl;
                // 两个网格同步预览 + 选中态（清掉预设的 on）
                document.querySelectorAll('.av-upload').forEach(b => {
                    b.innerHTML = `<img src="${dataUrl}" alt="">`;
                    b.dataset.val = dataUrl;
                });
                [$('regAvatarGrid'), $('pfAvatarGrid')].forEach(g => g && syncAvatarGrid(g, dataUrl));
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(file);
            fi.value = '';
        });
    }

    /* ---------- 登录 ---------- */
    function bindLogin() {
        $('loginSubmit').addEventListener('click', doLogin);
        [$('loginEmail'), $('loginPw')].forEach(el => {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
        });
    }

    async function doLogin() {
        const email = $('loginEmail').value.trim();
        const password = $('loginPw').value;
        if (!EMAIL_RE.test(email) || !password) {
            showToast('请输入邮箱和密码', 'error', 1800);
            return;
        }
        const btn = $('loginSubmit');
        btn.disabled = true;
        try {
            const data = await api('api/auth/login', { method: 'POST', body: { email, password } });
            user = data.user;
            saveSession(data.token, $('loginRemember')?.classList.contains('on') ?? true);
            renderAccount();
            close();
            showToast(`欢迎回来，${user.nickname}`, 'success', 2000);
            syncCloud();
            emitAuthChange(true);
        } catch (e) {
            showToast(e.message, 'error', 2200);
        } finally {
            btn.disabled = false;
        }
    }

    /* ---------- 忘记密码 ---------- */
    function bindReset(rstCode) {
        $('rstSend').addEventListener('click', async () => {
            const email = $('rstEmail').value.trim();
            if (!EMAIL_RE.test(email)) { showError($('rstEmail'), '请输入正确的邮箱'); return; }
            flow.email = email;
            try {
                await sendCode(email, 'reset', $('rstDemoHint'), $('rstSend'));
                $('rstStep2').classList.remove('hidden');
                rstCode.focusFirst();
            } catch (e) {
                showToast(e.message, 'error');
            }
        });

        $('rstDone').addEventListener('click', async () => {
            const code = rstCode.getCode();
            const pw = $('rstNewPw').value;
            if (code.length !== 6) { rstCode.shakeError(); return; }
            if (pw.length < 8) { showError($('rstNewPw'), '新密码至少 8 位'); return; }
            try {
                const data = await api('api/auth/reset', {
                    method: 'POST',
                    body: { email: flow.email, code, password: pw },
                });
                user = data.user;
                saveSession(data.token, true);
                renderAccount();
                close();
                showToast('密码已重置，已自动登录', 'success', 2200);
                syncCloud();
                emitAuthChange(true);
            } catch (e) {
                rstCode.shakeError();
                showToast(e.message, 'error', 2000);
            }
        });
    }

    /* ---------- 编辑资料 ---------- */
    function fillProfileForm() {
        buildAvatarGrid($('pfAvatarGrid'), () => flow.avatar, v => { flow.avatar = v; });
        flow.avatar = user.avatar || 'preset:0';
        syncAvatarGrid($('pfAvatarGrid'), flow.avatar);
        $('pfNick').value = user.nickname || '';
        // 年级/学院/专业：填充下拉并安全回填（旧用户数据可能不在新列表里）
        initGradeCollege('pfGrade', 'pfCollege', 'pfMajor');
        safeBackfillGC('pfGrade', 'pfCollege', 'pfMajor', user);
        $('pfSid').value = user.studentId || '';
    }

    function bindProfile() {
        $('pfSave').addEventListener('click', async () => {
            const nick = $('pfNick').value.trim();
            if (nick.length < 2 || nick.length > 12) { showError($('pfNick'), '昵称需 2~12 个字符'); return; }
            const grade = $('pfGrade').value;
            const college = $('pfCollege').value;
            const major = $('pfMajor').value;
            if (!grade) { showError($('pfGrade'), '请选择年级'); return; }
            if (!college) { showError($('pfCollege'), '请选择学院'); return; }
            if (!major) { showError($('pfMajor'), '请选择专业'); return; }
            try {
                const data = await api('api/auth/me', {
                    method: 'PUT',
                    body: {
                        nickname: nick,
                        grade, college, major,
                        studentId: $('pfSid').value.trim(),
                        avatar: flow.avatar,
                    },
                });
                user = data.user;
                renderAccount();
                close();
                showToast('资料已更新', 'success', 1800);
            } catch (e) {
                showToast(e.message, 'error');
            }
        });
    }

    /* ---------- 欢迎对话框 ---------- */
    function showWelcome(text) {
        const w = $('authWelcome');
        if (!w) { showToast(text, 'success', 2400); return; }
        $('welcomeText').textContent = text;
        w.classList.remove('hidden');
        requestAnimationFrame(() => w.classList.add('show'));
    }

    /* ---------- 错误提示 ---------- */
    function showError(input, msg) {
        input.classList.add('error');
        showToast(msg, 'error', 2000);
        input.addEventListener('input', () => input.classList.remove('error'), { once: true });
    }

    /* ---------- 登录后：迁移本机共建数据上云 + 重绘地图 ---------- */
    async function syncCloud() {
        if (!window.CampusAPI || !CampusAPI.ready) return;
        try {
            await CampusAPI.migrateLocalEdits();
            const data = await CampusAPI._fetch('api/pois');
            CampusAPI.applyServerPois(data.pois);
            if (typeof window.refreshMapData === 'function') window.refreshMapData();
        } catch (e) {
            console.warn('[auth] 云端同步失败（本地数据不受影响）:', e.message);
        }
        // 收藏 / 地标 / 备注上云：登录后先拉取合并，再回推本机（双向对齐）
        await syncUserData();
    }

    /** 登录后：拉取该账号云端收藏/地标/备注，与本地合并（云端为准补齐，本机私有项保留） */
    async function syncUserData() {
        if (!window.CampusAPI || !window.Store) return;
        const cloud = await CampusAPI.pullUserData();
        if (!cloud) return;
        const d = Store.data;

        // 收藏：云端 + 本机并集（云端在前保持原顺序）
        const favSet = [...(cloud.fav || []), ...(d.fav || [])];
        d.fav = [...new Set(favSet)];

        // 自定义地标：以云端为准，本机中云端没有的（未上云的新增）保留追加
        const cloudIds = new Set((cloud.custom || []).map(c => c.id));
        const localExtra = (d.custom || []).filter(c => !cloudIds.has(c.id));
        d.custom = [...(cloud.custom || []), ...localExtra];

        // 备注：云端为准，本机额外的键保留（无冲突覆盖风险，本机优先）
        d.notes = { ...(cloud.notes || {}), ...(d.notes || {}) };

        Store.save();
        // 回推合并结果，确保两端一致
        CampusAPI.pushUserData(true);
        if (typeof AppShell !== 'undefined' && AppShell.renderProfile) AppShell.renderProfile();
        if (typeof window.refreshMapData === 'function') window.refreshMapData();
    }

    /* ---------- 对外：发布类操作门禁 ---------- */
    function requireLogin(reason) {
        if (user) return true;
        open('menu', reason || '该操作需要先登录');
        return false;
    }

    /** 是否已登录（user 已加载且非空） */
    function isLoggedIn() {
        return !!(user && token);
    }

    /** 登录/登出状态变化广播（供聊天等模块重置状态） */
    function emitAuthChange(loggedIn) {
        window.dispatchEvent(new CustomEvent('authchange', { detail: { loggedIn } }));
    }

    /* ---------- 初始化 ---------- */
    async function init() {
        // 视图切换
        $('authGoRegister')?.addEventListener('click', () => showView('register'));
        $('authGoLogin')?.addEventListener('click', () => showView('login'));
        $('authGoReset')?.addEventListener('click', () => showView('reset'));
        $('regGoLogin')?.addEventListener('click', () => showView('login'));
        $('loginGoRegister')?.addEventListener('click', () => showView('register'));
        $('authClose')?.addEventListener('click', close);
        $('authBackdrop')?.addEventListener('click', close);
        $('authBrowseGuest')?.addEventListener('click', close);   // 游客先逛逛：直接关闭登录框
        $('welcomeStart')?.addEventListener('click', () => {
            const w = $('authWelcome');
            w.classList.remove('show');
            setTimeout(() => w.classList.add('hidden'), 260);
        });

        // 密码显示切换
        document.querySelectorAll('.pw-eye').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = $(btn.dataset.for);
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.classList.toggle('on', show);
            });
        });

        // 记住我开关
        const remember = $('loginRemember');
        if (remember) {
            let remembered = true;
            try { remembered = localStorage.getItem(REMEMBER_KEY) !== '0'; } catch (e) { /* */ }
            remember.classList.toggle('on', remembered);
            remember.addEventListener('click', () => remember.classList.toggle('on'));
        }

        // 账号卡片按钮（事件委托）
        document.getElementById('accountCard')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-acc]');
            if (!btn) return;
            if (btn.dataset.acc === 'login') open('menu');
            if (btn.dataset.acc === 'edit') open('profile');
            if (btn.dataset.acc === 'logout') {
                clearSession();
                renderAccount();
                showToast('已退出登录', 'info', 1600);
                emitAuthChange(false);
            }
        });

        bindLogin();
        bindRegister(bindCodeBoxes($('regCodeBoxes')));
        bindReset(bindCodeBoxes($('rstCodeBoxes')));
        bindProfile();
        bindAvatarUpload();
        bindSheetDragClose();
        renderAccount();

        // 已有 token：校验并拉取最新资料
        if (token) {
            try {
                const data = await api('api/auth/me');
                user = data.user;
                renderAccount();
            } catch (e) {
                if (e.status !== 401) console.warn('[auth] 资料拉取失败:', e.message);
            }
        }
    }

    return {
        init,
        requireLogin,
        isLoggedIn,
        renderAccount,
        open,
        close,
        logout: clearSession,
        get token() { return token; },
        get user() { return user; },
    };
})();

window.AuthCenter = AuthCenter;
