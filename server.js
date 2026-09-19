/* ============================================
 * server.js — 文轩遂宁校区地图 后端服务
 *
 * 职责：
 *   1. 静态托管前端（index.html / css / js / assets）
 *   2. REST API：校园 POI 的增删改查 / 恢复 / 统计
 *   3. JSON 文件数据库（data/db.json，首次启动从 seed.json 初始化）
 *
 * 运行：node server.js   （端口取环境变量 PORT，默认 3000）
 * ============================================ */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

// 地图边界（与前端 campus-data.js 一致：1000 × 500）
const MAP_W = 1000;
const MAP_H = 583;   // v3.33 修复：与客户端 MAP_HEIGHT=583 对齐

// ====== 数据层：JSON 文件数据库 ======

/** 首次启动：用种子数据初始化运行库 */
function initDb() {
    if (!fs.existsSync(DB_FILE)) {
        const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
        const db = {
            version: seed.version || 1,
            createdAt: new Date().toISOString(),
            // 内置地点：以种子为准，本地改动存 overrides / deleted
            overrides: {},      // { id: {name?, category?, x?, y?, desc?, hours?, phone?, floors?, updatedAt} }
            deleted: [],        // 被软删除的内置地点 id
            custom: [],         // 用户共建地点（完整记录）
            users: [],          // 注册用户（v3.12）
            meta: {},           // 服务元数据（token 签名密钥等）
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log('[db] 已用种子数据初始化 data/db.json（内置 POI:', seed.pois.length, '个）');
    }
}

function readDb() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

/** 原子写入：先写临时文件再改名，避免中途断电写坏 */
function writeDb(db) {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
}

function readSeed() {
    return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
}

/** 合并视图：种子 + overrides，剔除 deleted，追加 custom */
function listPois(db, { includeDeleted = false } = {}) {
    const seed = readSeed();
    const deletedSet = new Set(db.deleted);
    const builtin = seed.pois
        .filter(p => includeDeleted || !deletedSet.has(p.id))
        .map(p => {
            const ov = db.overrides[p.id];
            const merged = ov ? { ...p, ...stripMeta(ov) } : p;
            return { ...merged, builtin: true, deleted: deletedSet.has(p.id), edited: !!ov };
        });
    const custom = db.custom.map(p => ({ ...p, builtin: false, deleted: false, edited: false }));
    return [...builtin, ...custom];
}

function stripMeta(ov) {
    const { updatedAt, ...rest } = ov;
    return rest;
}

// ====== 输入校验 ======

const EDITABLE_FIELDS = ['name', 'category', 'x', 'y', 'desc', 'hours', 'phone', 'floors'];

function validatePoiInput(body, { partial = false } = {}) {
    const errors = [];
    const out = {};

    if (!partial || body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 30) {
            errors.push('名称必填且不超过 30 字');
        } else out.name = body.name.trim();
    }
    if (body.category !== undefined) {
        if (typeof body.category !== 'string' || !/^[a-z0-9_]{1,20}$/.test(body.category)) {
            errors.push('分类不合法');
        } else out.category = body.category;
    } else if (!partial) {
        errors.push('缺少分类');
    }
    for (const k of ['x', 'y']) {
        if (body[k] !== undefined) {
            const v = Number(body[k]);
            const max = k === 'x' ? MAP_W : MAP_H;
            if (!Number.isFinite(v) || v < 0 || v > max) {
                errors.push(`${k} 坐标需在 0~${max} 之间`);
            } else out[k] = +v.toFixed(1);
        } else if (!partial) {
            errors.push(`缺少坐标 ${k}`);
        }
    }
    for (const k of ['desc', 'hours', 'phone', 'floors']) {
        if (body[k] !== undefined) {
            if (typeof body[k] !== 'string' || body[k].length > 200) {
                errors.push(`${k} 超长或不合法`);
            } else out[k] = body[k].trim();
        }
    }
    return { errors, data: out };
}

// ====== 中间件（须在一切路由之前注册，否则 req.body 为空） ======

app.use(express.json({ limit: '256kb' }));

// 简单请求日志（API 部分）
app.use('/api', (req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
        console.log(`[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)`);
    });
    next();
});

// ====== 账户体系（v3.12）：邮箱注册 / 登录 / 验证码 / 数据隔离 ======
//
// 安全设计：
//   · 密码 scrypt 加盐哈希，永不存明文
//   · 登录令牌 = HMAC-SHA256 签名 payload（类 JWT），密钥持久化在 db.meta.secret
//   · 验证码 6 位、10 分钟有效、错 5 次作废、60 秒重发冷却
//   · 登录连续失败 5 次锁定 10 分钟（防暴力破解）
//   · 发布类接口（POI 增/改/删/恢复）必须登录；自定义地点仅作者可改删
//
// 演示模式：未配置 SMTP，验证码通过接口响应 devCode 返回并打印到
// 服务器日志，前端直接展示。接入真实邮件服务时仅需替换发送逻辑。

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL = 30 * 24 * 3600 * 1000;          // 登录态 30 天
const CODE_TTL = 10 * 60 * 1000;                  // 验证码 10 分钟
const CODE_COOLDOWN = 60 * 1000;                  // 重发冷却 60 秒

// 内存态（服务重启即清空，可接受）：验证码 / 登录失败计数
const verifyCodes = new Map();   // `${type}:${email}` -> { code, expires, attempts, lastSent, verified }
const loginFails = new Map();    // email -> { count, lockUntil }

/** 读取/懒生成 token 签名密钥 */
function getSecret(db) {
    db.meta = db.meta || {};
    if (!db.meta.secret) {
        db.meta.secret = crypto.randomBytes(32).toString('hex');
        writeDb(db);
    }
    return db.meta.secret;
}

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function signToken(uid, secret) {
    const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL })).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return payload + '.' + sig;
}

function verifyToken(token, secret) {
    if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
    const dot = token.indexOf('.');
    const payload = token.slice(0, dot), sig = token.slice(dot + 1);
    const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!data.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
        return data.uid;
    } catch (e) { return null; }
}

/** 从请求解析登录用户（未登录返回 null） */
function authUser(req, db) {
    const h = req.headers.authorization || '';
    const uid = h.startsWith('Bearer ') && verifyToken(h.slice(7), getSecret(db));
    if (!uid) return null;
    return (db.users || []).find(u => u.id === uid) || null;
}

function publicProfile(u) {
    return {
        id: u.id, email: u.email, nickname: u.nickname,
        avatar: u.avatar || null, school: u.school || '',
        studentId: u.studentId || '', createdAt: u.createdAt,
    };
}

/** 校验验证码；consume=true 验证通过即作废，false 则标记 verified 供后续步骤使用 */
function checkCode(email, type, input, consume) {
    const key = type + ':' + String(email).toLowerCase();
    const rec = verifyCodes.get(key);
    if (!rec) return '请先获取验证码';
    if (rec.expires < Date.now()) { verifyCodes.delete(key); return '验证码已过期，请重新发送'; }
    if (rec.attempts >= 5) { verifyCodes.delete(key); return '错误次数过多，请重新发送验证码'; }
    rec.attempts++;
    if (rec.code !== String(input || '').trim()) return '验证码不正确';
    if (consume) verifyCodes.delete(key); else rec.verified = true;
    return null;
}

/** 发送验证码（注册 / 重置密码共用） */
app.post('/api/auth/send-code', (req, res) => {
    const { email, type } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (!['register', 'reset'].includes(type)) {
        return res.status(400).json({ error: '验证码类型不合法' });
    }
    const em = email.toLowerCase();
    const db = readDb();
    const exists = (db.users || []).some(u => u.email === em);
    if (type === 'register' && exists) {
        return res.status(409).json({ error: '该邮箱已注册，请直接登录', code: 'EMAIL_TAKEN' });
    }
    if (type === 'reset' && !exists) {
        return res.status(404).json({ error: '该邮箱尚未注册' });
    }
    const key = type + ':' + em;
    const prev = verifyCodes.get(key);
    if (prev && Date.now() - prev.lastSent < CODE_COOLDOWN) {
        const wait = Math.ceil((CODE_COOLDOWN - (Date.now() - prev.lastSent)) / 1000);
        return res.status(429).json({ error: `发送太频繁，请 ${wait} 秒后再试`, retryAfter: wait });
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    verifyCodes.set(key, { code, expires: Date.now() + CODE_TTL, attempts: 0, lastSent: Date.now(), verified: false });
    // 演示模式：无 SMTP，验证码随响应返回并打印日志
    console.log(`[auth] 演示验证码 ${em} (${type}): ${code}`);
    res.json({ ok: true, demo: true, devCode: code, expiresIn: CODE_TTL / 1000 });
});

/** 预校验验证码（注册第二步「验证并继续」，通过后标记 verified） */
app.post('/api/auth/verify-code', (req, res) => {
    const { email, type, code } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (!['register', 'reset'].includes(type)) {
        return res.status(400).json({ error: '验证码类型不合法' });
    }
    const err = checkCode(email, type, code, false);
    if (err) return res.status(400).json({ error: err });
    res.json({ ok: true });
});

/** 注册：邮箱 + 密码 + 已验证的验证码 + 资料 */
app.post('/api/auth/register', (req, res) => {
    const { email, password, nickname, school, studentId, avatar } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return res.status(400).json({ error: '密码需 8~72 位' });
    }
    const nick = typeof nickname === 'string' ? nickname.trim() : '';
    if (nick.length < 2 || nick.length > 12) {
        return res.status(400).json({ error: '昵称需 2~12 个字符' });
    }
    if (avatar !== undefined && avatar !== null
        && !(typeof avatar === 'string' && (/^preset:[0-7]$/.test(avatar)
            || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length < 150000)))) {
        return res.status(400).json({ error: '头像格式不支持' });
    }
    const em = email.toLowerCase();
    const db = readDb();
    db.users = db.users || [];
    if (db.users.some(u => u.email === em)) {
        return res.status(409).json({ error: '该邮箱已注册，请直接登录', code: 'EMAIL_TAKEN' });
    }
    // 必须已通过 verify-code（10 分钟内）
    const key = 'register:' + em;
    const rec = verifyCodes.get(key);
    if (!rec || !rec.verified || rec.expires < Date.now()) {
        return res.status(400).json({ error: '邮箱验证已失效，请重新验证' });
    }
    verifyCodes.delete(key);

    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
        id: 'u_' + crypto.randomBytes(6).toString('hex'),
        email: em,
        salt,
        passHash: hashPassword(password, salt),
        nickname: nick,
        avatar: avatar || null,
        school: typeof school === 'string' ? school.trim().slice(0, 30) : '',
        studentId: typeof studentId === 'string' ? studentId.trim().slice(0, 20) : '',
        createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeDb(db);
    console.log(`[auth] 新注册用户 ${em} (${nick})`);
    res.status(201).json({ token: signToken(user.id, getSecret(db)), user: publicProfile(user) });
});

/** 登录：邮箱 + 密码（连续失败 5 次锁 10 分钟） */
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: '请输入邮箱和密码' });
    }
    const em = email.toLowerCase();
    const fail = loginFails.get(em);
    if (fail && fail.lockUntil && fail.lockUntil > Date.now()) {
        const mins = Math.ceil((fail.lockUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `失败次数过多，已锁定，请 ${mins} 分钟后再试` });
    }
    const db = readDb();
    const user = (db.users || []).find(u => u.email === em);
    let ok = false;
    if (user) {
        const a = Buffer.from(hashPassword(password, user.salt), 'hex');
        const b = Buffer.from(user.passHash, 'hex');
        ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    if (!ok) {
        const rec = loginFails.get(em) || { count: 0, lockUntil: 0 };
        rec.count++;
        if (rec.count >= 5) { rec.count = 0; rec.lockUntil = Date.now() + 10 * 60 * 1000; }
        loginFails.set(em, rec);
        return res.status(401).json({ error: '邮箱或密码不正确' });
    }
    loginFails.delete(em);
    res.json({ token: signToken(user.id, getSecret(db)), user: publicProfile(user) });
});

/** 重置密码：邮箱 + 验证码 + 新密码（成功即登录） */
app.post('/api/auth/reset', (req, res) => {
    const { email, code, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return res.status(400).json({ error: '新密码需 8~72 位' });
    }
    const em = email.toLowerCase();
    const db = readDb();
    const user = (db.users || []).find(u => u.email === em);
    if (!user) return res.status(404).json({ error: '该邮箱尚未注册' });
    const err = checkCode(em, 'reset', code, true);
    if (err) return res.status(400).json({ error: err });

    user.salt = crypto.randomBytes(16).toString('hex');
    user.passHash = hashPassword(password, user.salt);
    writeDb(db);
    console.log(`[auth] ${em} 已重置密码`);
    res.json({ token: signToken(user.id, getSecret(db)), user: publicProfile(user) });
});

/** 当前登录用户资料 */
app.get('/api/auth/me', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '登录已失效，请重新登录', code: 'AUTH_REQUIRED' });
    res.json({ user: publicProfile(user) });
});

/** 更新资料（昵称 / 头像 / 学校 / 学号） */
app.put('/api/auth/me', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '登录已失效，请重新登录', code: 'AUTH_REQUIRED' });
    const { nickname, avatar, school, studentId } = req.body || {};
    if (nickname !== undefined) {
        const nick = String(nickname).trim();
        if (nick.length < 2 || nick.length > 12) return res.status(400).json({ error: '昵称需 2~12 个字符' });
        user.nickname = nick;
    }
    if (avatar !== undefined) {
        if (avatar !== null && !(typeof avatar === 'string' && (/^preset:[0-7]$/.test(avatar)
            || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length < 150000)))) {
            return res.status(400).json({ error: '头像格式不支持' });
        }
        user.avatar = avatar;
    }
    if (school !== undefined) user.school = String(school).trim().slice(0, 30);
    if (studentId !== undefined) user.studentId = String(studentId).trim().slice(0, 20);
    writeDb(db);
    res.json({ user: publicProfile(user) });
});

// ====== REST API ======

/** 健康检查 */
app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'wenxuan-campus-map', time: new Date().toISOString() });
});

/** POI 列表（?includeDeleted=1 含已删除的内置地点，用于恢复界面） */
app.get('/api/pois', (req, res) => {
    const db = readDb();
    const includeDeleted = req.query.includeDeleted === '1';
    res.json({ pois: listPois(db, { includeDeleted }), total: listPois(db).length });
});

/** 单个 POI */
app.get('/api/pois/:id', (req, res) => {
    const db = readDb();
    const poi = listPois(db, { includeDeleted: true }).find(p => p.id === req.params.id);
    if (!poi) return res.status(404).json({ error: '地点不存在' });
    res.json(poi);
});

/** 新建自定义地点（用户共建，需登录） */
app.post('/api/pois', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '请先登录后再发布地点', code: 'AUTH_REQUIRED' });

    const { errors, data } = validatePoiInput(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join('；') });

    // 允许客户端自带 id（本机迁移/前端预生成），需符合规范且不与现有冲突
    let id = 'b_user_' + Date.now().toString(36);
    if (typeof req.body.id === 'string' && /^b_user_[a-z0-9]{4,20}$/.test(req.body.id)) {
        const exists = db.custom.some(p => p.id === req.body.id)
            || readSeed().pois.some(p => p.id === req.body.id);
        if (exists) {
            // 幂等：同 id 重复提交直接返回已有记录（迁移重试安全）
            const dup = db.custom.find(p => p.id === req.body.id);
            if (dup) return res.status(200).json({ ...dup, builtin: false, deleted: false, edited: false });
            return res.status(409).json({ error: 'id 已被占用' });
        }
        id = req.body.id;
    }
    const poi = {
        id,
        name: data.name,
        category: data.category,
        x: data.x,
        y: data.y,
        desc: data.desc || '同学共建的地点。',
        hours: data.hours || '—',
        phone: data.phone || '—',
        floors: data.floors || '—',
        authorId: user.id,
        authorName: user.nickname,
        createdAt: new Date().toISOString(),
    };
    db.custom.push(poi);
    writeDb(db);
    res.status(201).json({ ...poi, builtin: false, deleted: false, edited: false });
});

/** 编辑地点：内置地点写入 overrides，自定义地点直接改（需登录；自定义仅作者） */
app.put('/api/pois/:id', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '请先登录后再编辑地点', code: 'AUTH_REQUIRED' });

    const { errors, data } = validatePoiInput(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('；') });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: '没有可更新的字段' });

    const id = req.params.id;

    const custom = db.custom.find(p => p.id === id);
    if (custom) {
        // 数据隔离：有作者的共建地点仅作者可改（早期无作者的遗留数据任意登录用户可改）
        if (custom.authorId && custom.authorId !== user.id) {
            return res.status(403).json({ error: '只能编辑自己发布的地点' });
        }
        Object.assign(custom, data);
        writeDb(db);
        return res.json({ ...custom, builtin: false, deleted: false, edited: false });
    }

    const seed = readSeed();
    const base = seed.pois.find(p => p.id === id);
    if (!base) return res.status(404).json({ error: '地点不存在' });
    if (db.deleted.includes(id)) return res.status(409).json({ error: '地点已被删除，请先恢复' });

    db.overrides[id] = { ...(db.overrides[id] || {}), ...data, updatedAt: new Date().toISOString() };
    writeDb(db);
    res.json({ ...base, ...data, builtin: true, deleted: false, edited: true });
});

/** 删除地点：自定义=硬删，内置=软删（需登录；自定义仅作者） */
app.delete('/api/pois/:id', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '请先登录后再删除地点', code: 'AUTH_REQUIRED' });

    const id = req.params.id;

    const ci = db.custom.findIndex(p => p.id === id);
    if (ci >= 0) {
        if (db.custom[ci].authorId && db.custom[ci].authorId !== user.id) {
            return res.status(403).json({ error: '只能删除自己发布的地点' });
        }
        const [removed] = db.custom.splice(ci, 1);
        writeDb(db);
        return res.json({ ok: true, removed: removed.id, hard: true });
    }

    const seed = readSeed();
    if (!seed.pois.some(p => p.id === id)) return res.status(404).json({ error: '地点不存在' });
    if (!db.deleted.includes(id)) {
        db.deleted.push(id);
        writeDb(db);
    }
    res.json({ ok: true, removed: id, hard: false });
});

/** 恢复内置地点到官方数据（撤销删除 + 撤销修改，需登录） */
app.post('/api/pois/:id/restore', (req, res) => {
    const db = readDb();
    const user = authUser(req, db);
    if (!user) return res.status(401).json({ error: '请先登录后再恢复地点', code: 'AUTH_REQUIRED' });

    const id = req.params.id;
    const seed = readSeed();
    const base = seed.pois.find(p => p.id === id);
    if (!base) return res.status(404).json({ error: '仅内置地点支持恢复' });

    db.deleted = db.deleted.filter(d => d !== id);
    delete db.overrides[id];
    writeDb(db);
    res.json({ ...base, builtin: true, deleted: false, edited: false });
});

/** 统计 */
app.get('/api/stats', (req, res) => {
    const db = readDb();
    const seed = readSeed();
    res.json({
        builtinTotal: seed.pois.length,
        customTotal: db.custom.length,
        editedTotal: Object.keys(db.overrides).length,
        deletedTotal: db.deleted.length,
        visibleTotal: listPois(db).length,
        usersTotal: (db.users || []).length,
        dbCreatedAt: db.createdAt,
    });
});

// API 404 与错误处理
// ====== v3.37 好友体系（本地镜像 worker 路由；storage: db.friends 数组） ======
function friendPairId(a, b) { return [a, b].sort().join(':'); }
function friendState(db, myId, otherId) {
    const row = (db.friends || []).find(f => f.id === friendPairId(myId, otherId));
    if (!row) return 'none';
    if (row.status === 'accepted') return 'friends';
    return row.from_uid === myId ? 'requested' : 'incoming';
}
function friendBrief(db, uid) {
    const u = (db.users || []).find(x => x.id === uid);
    return u ? publicProfile(u) : null;
}

// 用户列表（q = 按邮箱 / 昵称模糊搜索）
app.get('/api/chat/users', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    const q = (req.query.q || '').trim().toLowerCase();
    dbData.users = dbData.users || [];
    let users = dbData.users.filter(u => u.id !== user.id).map(u => publicProfile(u));
    if (q) users = users.filter(u =>
        (u.email || '').toLowerCase().includes(q) || (u.nickname || '').toLowerCase().includes(q));
    res.json({ users });
});

// 发起好友请求 {toUid}（对方若已先请求我 → 直接互为好友）
app.post('/api/friends/request', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    dbData.friends = dbData.friends || [];
    const { toUid } = req.body || {};
    if (!toUid || toUid === user.id) return res.status(400).json({ error: '目标用户不合法' });
    if (!friendBrief(dbData, toUid)) return res.status(404).json({ error: '用户不存在' });
    const state = friendState(dbData, user.id, toUid);
    if (state === 'friends') return res.status(409).json({ error: '你们已是好友', code: 'ALREADY_FRIENDS' });
    if (state === 'incoming') {
        const row = dbData.friends.find(f => f.id === friendPairId(user.id, toUid));
        row.status = 'accepted'; row.responded_at = Date.now();
        writeDb(dbData);
        return res.json({ ok: true, message: '对方已先向你发起请求，现已互为好友', status: 'friends' });
    }
    if (state === 'requested') return res.status(409).json({ error: '已发送过好友请求' });
    dbData.friends.push({ id: friendPairId(user.id, toUid), from_uid: user.id, to_uid: toUid, status: 'pending', created_at: Date.now(), responded_at: null });
    writeDb(dbData);
    res.status(201).json({ ok: true, status: 'pending' });
});

// 我的好友列表
app.get('/api/friends', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    dbData.friends = dbData.friends || [];
    const friends = dbData.friends
        .filter(f => f.status === 'accepted' && (f.from_uid === user.id || f.to_uid === user.id))
        .map(f => {
            const other = friendBrief(dbData, f.from_uid === user.id ? f.to_uid : f.from_uid);
            return other ? { ...other, friendsAt: f.responded_at } : null;
        }).filter(Boolean);
    res.json({ friends });
});

// 我收到的好友请求（pending）
app.get('/api/friends/requests', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    dbData.friends = dbData.friends || [];
    const requests = dbData.friends
        .filter(f => f.status === 'pending' && f.to_uid === user.id)
        .map(f => {
            const from = friendBrief(dbData, f.from_uid);
            return from ? { id: f.id, from: from, created_at: f.created_at } : null;
        }).filter(Boolean);
    res.json({ requests });
});

// 同意 / 拒绝 {action}
app.post('/api/friends/:pairId/respond', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    dbData.friends = dbData.friends || [];
    const row = dbData.friends.find(f => f.id === req.params.pairId);
    if (!row || row.to_uid !== user.id) return res.status(404).json({ error: '请求不存在' });
    const { action } = req.body || {};
    if (action === 'reject') { row.status = 'rejected'; row.responded_at = Date.now(); writeDb(dbData); return res.json({ ok: true, status: 'rejected' }); }
    if (action !== 'accept') return res.status(400).json({ error: 'action 不合法' });
    row.status = 'accepted'; row.responded_at = Date.now();
    writeDb(dbData);
    res.json({ ok: true, status: 'friends', message: '已同意，你们互为好友' });
});

// 与某用户的关系态
app.get('/api/friends/status/:uid', (req, res) => {
    const dbData = readDb();
    const user = authUser(req, dbData);
    if (!user) return res.status(401).json({ error: '请先登录', code: 'AUTH_REQUIRED' });
    dbData.friends = dbData.friends || [];
    const row = dbData.friends.find(f => f.id === friendPairId(user.id, req.params.uid));
    const status = !row ? 'none' : row.status === 'accepted' ? 'friends' : (row.from_uid === user.id ? 'requested' : 'incoming');
    res.json({ status });
});
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
app.use((err, req, res, next) => {
    console.error('[server] 错误:', err.message);
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    res.status(500).json({ error: '服务器内部错误' });
});

// ====== 静态托管前端 ======
// Iconsax 免费组件库：只暴露运行所需的 dist，图标按类别懒加载。
app.use('/vendor/iconsax', express.static(path.join(__dirname, 'node_modules', 'iconsax', 'dist')));
app.use(express.static(__dirname, {
    index: 'index.html',
    setHeaders(res, filePath) {
        // SW 与 html 不缓存，保证发版即生效；其余静态资源短缓存
        if (/sw\.js$|index\.html$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
    },
}));

// ====== 启动 ======
initDb();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] 文轩遂宁校区地图已启动: http://0.0.0.0:${PORT}`);
});
