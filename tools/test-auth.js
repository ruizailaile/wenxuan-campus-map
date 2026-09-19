/* test-auth.js — 账户体系端到端测试（v3.12）
 * 启动真实服务器（端口 3100），跑完整注册/登录/重置/隔离流程。
 * 运行：node tools/test-auth.js
 */
const { spawn } = require('child_process');
const path = require('path');

const BASE = 'http://localhost:3100/api';
let passed = 0, failed = 0;
const t = (name, cond, extra) => {
    cond ? passed++ : failed++;
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !extra ? '' : '  → ' + extra));
};

async function api(p, opts = {}) {
    const res = await fetch(BASE + p, {
        method: opts.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* 空响应 */ }
    return { status: res.status, json };
}

async function main() {
    // 1. 未登录发布 → 401
    let r = await api('/pois', { method: 'POST', body: { name: '测试', category: 'service', x: 1, y: 1 } });
    t('未登录发布地点 → 401 AUTH_REQUIRED', r.status === 401 && r.json.code === 'AUTH_REQUIRED', JSON.stringify(r.json));

    // 2. 发注册验证码（演示模式返回 devCode）
    r = await api('/auth/send-code', { method: 'POST', body: { email: 'test@wx.cn', type: 'register' } });
    t('发送注册验证码 → demo devCode', r.status === 200 && r.json.demo && /^\d{6}$/.test(r.json.devCode), JSON.stringify(r.json));
    const code = r.json && r.json.devCode;

    // 3. 60 秒内重发 → 429
    r = await api('/auth/send-code', { method: 'POST', body: { email: 'test@wx.cn', type: 'register' } });
    t('60 秒内重发 → 429 冷却', r.status === 429, String(r.status));

    // 4. 错码验证 → 400
    r = await api('/auth/verify-code', { method: 'POST', body: { email: 'test@wx.cn', type: 'register', code: '000000' } });
    t('错误验证码 → 400', r.status === 400, String(r.status));

    // 5. 正确验证码
    r = await api('/auth/verify-code', { method: 'POST', body: { email: 'test@wx.cn', type: 'register', code } });
    t('正确验证码 → ok', r.status === 200 && r.json.ok, JSON.stringify(r.json));

    // 6. 注册（资料 + 预设头像）
    r = await api('/auth/register', { method: 'POST', body: {
        email: 'test@wx.cn', password: 'pass12345', nickname: '测试同学',
        school: '四川文轩职业学院', studentId: '2026001', avatar: 'preset:2',
    } });
    t('注册成功 → token + 资料', r.status === 201 && r.json.token && r.json.user.nickname === '测试同学', JSON.stringify(r.json));
    const token = r.json && r.json.token;

    // 7. 重复注册 → 409
    r = await api('/auth/register', { method: 'POST', body: { email: 'test@wx.cn', password: 'pass12345', nickname: '测试同学' } });
    t('重复注册 → 409 EMAIL_TAKEN', r.status === 409 && r.json.code === 'EMAIL_TAKEN', String(r.status));

    // 8. 错密码登录 → 401
    r = await api('/auth/login', { method: 'POST', body: { email: 'test@wx.cn', password: 'wrongpass1' } });
    t('错密码登录 → 401', r.status === 401, String(r.status));

    // 9. 正确登录
    r = await api('/auth/login', { method: 'POST', body: { email: 'test@wx.cn', password: 'pass12345' } });
    t('正确登录 → token', r.status === 200 && !!r.json.token, String(r.status));

    // 10. me
    r = await api('/auth/me', { token });
    t('me → 返回资料', r.status === 200 && r.json.user.email === 'test@wx.cn', JSON.stringify(r.json));

    // 11. 登录后发布地点（记录作者）
    r = await api('/pois', { method: 'POST', token, body: { name: '测试奶茶店', category: 'food', x: 500, y: 250, desc: '测试用' } });
    t('登录发布地点 → 201 + 作者信息', r.status === 201 && r.json.authorName === '测试同学', JSON.stringify(r.json));
    const poiId = r.json && r.json.id;

    // 12. 改资料
    r = await api('/auth/me', { method: 'PUT', token, body: { nickname: '新昵称' } });
    t('改昵称 → 生效', r.status === 200 && r.json.user.nickname === '新昵称', JSON.stringify(r.json));

    // 13. 无 token me → 401
    r = await api('/auth/me');
    t('无 token me → 401', r.status === 401, String(r.status));

    // 14. 篡改 token → 401
    r = await api('/auth/me', { token: token.slice(0, -2) + 'xx' });
    t('篡改 token → 401', r.status === 401, String(r.status));

    // 15. 他人编辑我的地点 → 403（先注册第二个用户）
    r = await api('/auth/send-code', { method: 'POST', body: { email: 'other@wx.cn', type: 'register' } });
    const code2 = r.json.devCode;
    await api('/auth/verify-code', { method: 'POST', body: { email: 'other@wx.cn', type: 'register', code: code2 } });
    r = await api('/auth/register', { method: 'POST', body: { email: 'other@wx.cn', password: 'pass12345', nickname: '路人甲' } });
    const token2 = r.json.token;
    r = await api('/pois/' + poiId, { method: 'PUT', token: token2, body: { name: '恶意改名' } });
    t('他人编辑我的地点 → 403', r.status === 403, String(r.status));
    r = await api('/pois/' + poiId, { method: 'DELETE', token: token2 });
    t('他人删除我的地点 → 403', r.status === 403, String(r.status));

    // 16. 作者本人可编辑/删除
    r = await api('/pois/' + poiId, { method: 'PUT', token, body: { desc: '作者更新' } });
    t('作者编辑 → 200', r.status === 200, String(r.status));
    r = await api('/pois/' + poiId, { method: 'DELETE', token });
    t('作者删除 → 200', r.status === 200, String(r.status));

    // 17. 重置密码全流程
    r = await api('/auth/send-code', { method: 'POST', body: { email: 'test@wx.cn', type: 'reset' } });
    const rc = r.json.devCode;
    r = await api('/auth/reset', { method: 'POST', body: { email: 'test@wx.cn', code: rc, password: 'newpass123' } });
    t('重置密码 → 新 token', r.status === 200 && !!r.json.token, JSON.stringify(r.json));
    r = await api('/auth/login', { method: 'POST', body: { email: 'test@wx.cn', password: 'newpass123' } });
    t('新密码登录 → 200', r.status === 200, String(r.status));

    // 18. 未注册邮箱发重置码 → 404
    r = await api('/auth/send-code', { method: 'POST', body: { email: 'nobody@wx.cn', type: 'reset' } });
    t('未注册邮箱重置 → 404', r.status === 404, String(r.status));

    // 19. 弱密码注册 → 400
    r = await api('/auth/register', { method: 'POST', body: { email: 'weak@wx.cn', password: '123', nickname: '弱密码' } });
    t('弱密码 → 400', r.status === 400, String(r.status));

    // 20. 登录连错 5 次 → 锁定 429
    for (let i = 0; i < 5; i++) {
        await api('/auth/login', { method: 'POST', body: { email: 'other@wx.cn', password: 'bad' + i + 'xxxx' } });
    }
    r = await api('/auth/login', { method: 'POST', body: { email: 'other@wx.cn', password: 'pass12345' } });
    t('连错 5 次后 → 429 锁定', r.status === 429, String(r.status));

    console.log(`\n== ${passed} 过 / ${failed} 挂 ==`);
    process.exit(failed ? 1 : 0);
}

// 启动服务器 → 跑测试 → 关闭
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '3100' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write(d));
const waitUp = async () => {
    for (let i = 0; i < 40; i++) {
        try { const r = await fetch(BASE + '/health'); if (r.ok) return; } catch (e) { /* 未就绪 */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('服务器启动超时');
};
waitUp()
    .then(main)
    .catch(e => { console.error('测试失败:', e.message); process.exit(1); })
    .finally(() => srv.kill());
