/* ============================================================
 * 文轩遂宁校区地图 — Cloudflare Workers API
 *
 * 由 Express 版 server.js 移植：
 *   · 路由：原生 fetch handler（无框架依赖）
 *   · 存储：D1 行级表 + 轻量 JSON 残留表（db 仅存 overrides/deleted/custom）
 *     · users / codes / login_fails / meta 全部拆为独立行级表
 *     · 老 db JSON 中的 users/codes/loginFails/meta 启动时懒迁移到行级表
 *   · 密码：PBKDF2-SHA256（Web Crypto，Workers 原生支持）
 *   · 令牌：HMAC-SHA256 签名 payload（类 JWT，与原版格式兼容）
 *   · 验证码/登录失败计数：行级表持久化（隔离重启不丢）
 *   · 聊天轮询：ETag/304 减负；GET 响应加 Cache-Control 浏览器缓存
 *   · CORS：全开放（Pages 代理为同源调用；workers.dev 直连亦可）
 * ============================================================ */

import seed from '../../data/seed.json';
import { checkMessage, isBanned, scan } from './content-guard.js';

// ====== 院系·专业 固定数据（注册必填，防乱填；与前端 js/college-data.js 保持一致） ======
const WENXUAN_GRADES = ['2026级', '2025级', '2024级'];
const WENXUAN_COLLEGES = {
    '教育学院': ['学前教育', '早期教育', '中文'],
    '体育学院': ['运动训练', '社会体育'],
    '护理一院': ['护理'],
    '护理二院': ['护理'],
    '健康学院': ['口腔医学技术', '康复治疗技术', '药学', '中药学', '应急救援技术', '智慧健康养老服务与管理', '智慧健康养老服务与管理（高级养老机构老年照护）', '智慧健康养老服务与管理（老年养生服务）'],
    '管理学院': ['民航运输服务', '财税大数据应用', '空中乘务', '高速铁路客运服务', '大数据与会计', '金融服务与管理', '电子商务', '市场营销', '智能物流技术', '旅游管理'],
    '城市学院': ['智能建造技术', '建筑设计', '建筑设计（装饰装潢）', '建筑工程技术'],
    '智能制造学院': ['机械制造及自动化', '数控技术', '工业机器人技术', '无人机应用技术', '应用电子技术', '电子信息工程技术'],
    '汽车学院': ['新能源汽车技术', '智能网联汽车技术', '汽车技术服务与营销', '汽车检测与维修技术'],
    '传媒学院': ['融媒体技术与运营', '艺术设计', '网络直播与运营', '游戏艺术设计'],
    '计算机学院': ['智能技术', '大数据技术', '计算机应用技术', '计算机网络技术', '数字媒体技术', '物联网应用技术', '动漫制作技术', '人工智能技术应用'],
};
const WENXUAN_SCHOOL = '四川文轩职业学院';

/** 校验年级/学院/专业是否合法 */
function validStudentInfo(grade, college, major) {
    if (!grade || !WENXUAN_GRADES.includes(grade)) return false;
    if (!college || !WENXUAN_COLLEGES[college]) return false;
    if (!major || !WENXUAN_COLLEGES[college].includes(major)) return false;
    return true;
}

// ====== 常量（与原版一致） ======
const MAP_W = 1000;
const MAP_H = 583;   // v3.33 修复：与客户端 MAP_HEIGHT=583 对齐，此前 y>500 的位置编辑会被 400 拒绝
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL = 30 * 24 * 3600 * 1000;   // 登录态 30 天
const CODE_TTL = 10 * 60 * 1000;           // 验证码 10 分钟
const CODE_COOLDOWN = 60 * 1000;           // 重发冷却 60 秒
const PBKDF2_ITER = 15000;                 // 免费版 CPU 限制内的安全折中

const EDITABLE_FIELDS = ['name', 'category', 'x', 'y', 'desc', 'hours', 'phone', 'floors'];

// ====== Web Crypto 工具 ======

const te = new TextEncoder();

function bufToHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function randomHex(bytes) {
    const b = new Uint8Array(bytes);
    crypto.getRandomValues(b);
    return bufToHex(b);
}

function b64url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str) {
    const b = str.replace(/-/g, '+').replace(/_/g, '/');
    return atob(b + '='.repeat((4 - (b.length % 4)) % 4));
}

/** 常数时间比较（替代 node:crypto timingSafeEqual） */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** PBKDF2-SHA256 密码哈希（替代原 scrypt；新库新算法，无存量用户兼容问题） */
async function hashPassword(password, saltHex) {
    const key = await crypto.subtle.importKey('raw', te.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBuf(saltHex), iterations: PBKDF2_ITER },
        key, 256,
    );
    return bufToHex(bits);
}

async function hmac(payload, secret) {
    const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, te.encode(payload));
    return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(uid, secret) {
    const payload = b64url(JSON.stringify({ uid, exp: Date.now() + TOKEN_TTL }));
    return hmac(payload, secret).then(sig => payload + '.' + sig);
}

async function verifyToken(token, secret) {
    if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
    const dot = token.indexOf('.');
    const payload = token.slice(0, dot), sig = token.slice(dot + 1);
    const expect = await hmac(payload, secret);
    if (!timingSafeEqual(sig, expect)) return null;
    try {
        const data = JSON.parse(unb64url(payload));
        if (!data.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
        return data.uid;
    } catch { return null; }
}

// ============================================================
// 数据层：行级表 + 轻量残留 JSON
// ============================================================

// ---- db 表（仅 overrides / deleted / custom；轻量，无并发风险） ----

function freshDb() {
    return {
        version: seed.version || 1,
        createdAt: new Date().toISOString(),
        overrides: {},   // { id: {name?, category?, x?, y?, desc?, ...} }
        deleted: [],     // 被软删除的内置地点 id
        custom: [],      // 用户共建地点
    };
}

async function readDb(env) {
    const row = await env.DB.prepare('SELECT data FROM db WHERE id = 1').first();
    if (row) {
        const db = JSON.parse(row.data);
        const base = freshDb();
        for (const k of Object.keys(base)) {
            if (db[k] === undefined) db[k] = base[k];
        }
        return db;
    }
    await env.DB.prepare('INSERT INTO db (id, data) VALUES (1, ?) ON CONFLICT(id) DO NOTHING')
        .bind(JSON.stringify(freshDb())).run();
    const again = await env.DB.prepare('SELECT data FROM db WHERE id = 1').first();
    return JSON.parse(again.data);
}

async function writeDb(env, db) {
    await env.DB.prepare('INSERT INTO db (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
        .bind(JSON.stringify(db)).run();
}

// ---- users 表（行级；data 存单用户 JSON） ----

async function findUserById(env, id) {
    if (!id) return null;
    const row = await env.DB.prepare('SELECT data FROM users WHERE id = ?').bind(id).first();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

async function findUserByEmail(env, email) {
    if (!email) return null;
    const row = await env.DB.prepare('SELECT data FROM users WHERE email = ?').bind(email).first();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

async function saveUser(env, user) {
    await env.DB.prepare(
        'INSERT INTO users (id, email, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, email = excluded.email, created_at = excluded.created_at'
    ).bind(user.id, user.email, JSON.stringify(user), user.createdAt).run();
}

/**
 * 列出可私聊用户（除指定用户外），轻量投影（不取 passHash 等敏感字段）。
 * 用 SQL 直接投影 nickname/avatar/school 等公共字段，避免全表 data 反序列化。
 */
async function listUsersBrief(env, exceptId, limit = 500) {
    const { results } = await env.DB.prepare(
        `SELECT id, email, data, created_at FROM users WHERE id != ? LIMIT ?`
    ).bind(exceptId, limit).all();
    return results.map(r => {
        try {
            const u = JSON.parse(r.data);
            return publicProfile(u);
        } catch { return null; }
    }).filter(Boolean);
}

async function countUsers(env) {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return (row && row.n) || 0;
}

// ---- codes 表（行级；key 形如 'register:foo@bar.com'） ----

async function getCode(env, key) {
    const row = await env.DB.prepare('SELECT data FROM codes WHERE key = ?').bind(key).first();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

async function saveCode(env, key, data) {
    await env.DB.prepare(
        'INSERT INTO codes (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data'
    ).bind(key, JSON.stringify(data)).run();
}

async function delCode(env, key) {
    await env.DB.prepare('DELETE FROM codes WHERE key = ?').bind(key).run();
}

/** 检查并清除过期验证码（轻量；登录/注册路径顺便调用） */
async function sweepCodes(env) {
    try {
        // D1 不支持跨行 JSON 字段比较，扫一遍最近活跃的码
        const { results } = await env.DB.prepare('SELECT key, data FROM codes LIMIT 200').all();
        const now = Date.now();
        const dead = [];
        for (const r of results) {
            try {
                const d = JSON.parse(r.data);
                if (d.expires && d.expires < now) dead.push(r.key);
            } catch { dead.push(r.key); }
        }
        if (dead.length) {
            const stmt = env.DB.prepare('DELETE FROM codes WHERE key = ?');
            await env.DB.batch(dead.map(k => stmt.bind(k)));
        }
    } catch { /* 不影响主流程 */ }
}

// ---- login_fails 表（行级；email 主键） ----

async function getLoginFails(env, email) {
    const row = await env.DB.prepare('SELECT data FROM login_fails WHERE email = ?').bind(email).first();
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
}

async function saveLoginFails(env, email, data) {
    await env.DB.prepare(
        'INSERT INTO login_fails (email, data) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET data = excluded.data'
    ).bind(email, JSON.stringify(data)).run();
}

async function delLoginFails(env, email) {
    await env.DB.prepare('DELETE FROM login_fails WHERE email = ?').bind(email).run();
}

// ---- meta 表（key-value；secret 等） ----

async function getMeta(env, key) {
    const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
    return row ? row.value : null;
}

async function setMeta(env, key, value) {
    await env.DB.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).bind(key, value).run();
}

// ---- 懒迁移：把老 db JSON 中的 users/codes/loginFails/meta 搬到行级表 ----

// 模块级（isolate 级）迁移缓存：单次 isolate 生命周期内只跑一次实迁移检查；
// 配合 meta.legacyMigrated 持久化标记，跨 isolate 重启也跳过
let _migratedCheckedThisIsolate = false;

async function isMigrated(env) {
    // 持久化标记：成功迁移过就不再走 readDb 全量
    const flag = await getMeta(env, 'legacyMigrated');
    return flag === '1';
}

/** 检测并迁移老数据；幂等可重复执行；isolate 级缓存避免重复读 */
async function migrateLegacyDb(env) {
    if (_migratedCheckedThisIsolate) return;
    if (await isMigrated(env)) {
        _migratedCheckedThisIsolate = true;
        return;
    }
    _migratedCheckedThisIsolate = true;
    try {
        const row = await env.DB.prepare('SELECT data FROM db WHERE id = 1').first();
        if (!row) return; // db 还未初始化，readDb 会负责
        let db;
        try { db = JSON.parse(row.data); } catch { return; }

        let dirty = false;

        // users 数组 → users 表
        if (Array.isArray(db.users) && db.users.length) {
            const stmt = env.DB.prepare(
                'INSERT INTO users (id, email, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
            );
            const tasks = db.users.map(u => stmt.bind(u.id, u.email, JSON.stringify(u), u.createdAt || new Date().toISOString()));
            // 分批执行避免单次 batch 过大
            for (let i = 0; i < tasks.length; i += 50) {
                await env.DB.batch(tasks.slice(i, i + 50));
            }
            db.users = [];
            dirty = true;
            console.log(`[migrate] users: ${tasks.length} 行迁移完成`);
        }

        // codes 对象 → codes 表
        if (db.codes && typeof db.codes === 'object' && Object.keys(db.codes).length) {
            const stmt = env.DB.prepare(
                'INSERT INTO codes (key, data) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
            );
            const entries = Object.entries(db.codes);
            const tasks = entries.map(([k, v]) => stmt.bind(k, JSON.stringify(v)));
            for (let i = 0; i < tasks.length; i += 50) {
                await env.DB.batch(tasks.slice(i, i + 50));
            }
            db.codes = {};
            dirty = true;
            console.log(`[migrate] codes: ${entries.length} 行迁移完成`);
        }

        // loginFails 对象 → login_fails 表
        if (db.loginFails && typeof db.loginFails === 'object' && Object.keys(db.loginFails).length) {
            const stmt = env.DB.prepare(
                'INSERT INTO login_fails (email, data) VALUES (?, ?) ON CONFLICT(email) DO NOTHING'
            );
            const entries = Object.entries(db.loginFails);
            const tasks = entries.map(([k, v]) => stmt.bind(k, JSON.stringify(v)));
            for (let i = 0; i < tasks.length; i += 50) {
                await env.DB.batch(tasks.slice(i, i + 50));
            }
            db.loginFails = {};
            dirty = true;
            console.log(`[migrate] login_fails: ${entries.length} 行迁移完成`);
        }

        // meta 对象 → meta 表（保留 secret 不变）
        if (db.meta && typeof db.meta === 'object' && Object.keys(db.meta).length) {
            const stmt = env.DB.prepare(
                'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
            );
            const entries = Object.entries(db.meta);
            const tasks = entries.map(([k, v]) => stmt.bind(k, typeof v === 'string' ? v : JSON.stringify(v)));
            for (let i = 0; i < tasks.length; i += 50) {
                await env.DB.batch(tasks.slice(i, i + 50));
            }
            db.meta = {};
            dirty = true;
            console.log(`[migrate] meta: ${entries.length} 行迁移完成`);
        }

        if (dirty) {
            // 删掉已迁移的字段，写回 db 表（仅留 overrides/deleted/custom）
            delete db.users;
            delete db.codes;
            delete db.loginFails;
            delete db.meta;
            await writeDb(env, db);
            console.log('[migrate] db 表瘦身完成');
        }
        // 标记持久化完成（无论本次是否真正搬过数据，均认为已检查迁移完毕）
        await setMeta(env, 'legacyMigrated', '1');
        console.log('[migrate] 持久化标记 legacyMigrated=1 已写入');
    } catch (e) {
        // 失败则下次启动重试
        _migratedCheckedThisIsolate = false;
        console.error('[migrate] 失败:', e && e.message);
    }
}

// ---- 好友关系（v3.19）----

// isolate 级缓存：单次 isolate 生命周期内只建一次 friends 表
let _friendsSchemaEnsured = false;

/** 幂等建表：首次调用 friends 相关 API 时执行 CREATE TABLE IF NOT EXISTS */
async function ensureFriendsSchema(env) {
    if (_friendsSchemaEnsured) return;
    _friendsSchemaEnsured = true;
    try {
        await env.DB.batch([
            env.DB.prepare(
                `CREATE TABLE IF NOT EXISTS friends (
                    id TEXT PRIMARY KEY,
                    from_uid TEXT NOT NULL,
                    to_uid TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    responded_at INTEGER
                )`
            ),
            env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friends_to ON friends(to_uid, status)'),
            env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_friends_from ON friends(from_uid, status)'),
        ]);
    } catch (e) {
        _friendsSchemaEnsured = false;
        console.error('[friends] 建表失败:', e && e.message);
        throw e;
    }
}

/** 好友关系行 id：双向排序保证 A→B 与 B→A 命中同一行 */
function friendId(a, b) { return [a, b].sort().join(':'); }

/**
 * 取当前用户对 other 的关系状态。
 * 返回:
 *   'none'         —— 无任何请求（陌生人）
 *   'pending_sent' —— 我向对方发过请求（待对方响应）
 *   'pending_recv' —— 对方发给我请求（待我响应）
 *   'friends'      —— 已互为好友
 *   'rejected'     —— 对方拒绝过我（可重新发起）
 *   'self'         —— 自己
 */
async function friendStatus(env, myId, otherId) {
    if (myId === otherId) return 'self';
    const row = await env.DB.prepare(
        'SELECT from_uid, to_uid, status FROM friends WHERE id = ?'
    ).bind(friendId(myId, otherId)).first();
    if (!row) return 'none';
    if (row.status === 'accepted') return 'friends';
    if (row.status === 'rejected') return 'rejected';
    // pending：方向决定谁该响应
    return row.from_uid === myId ? 'pending_sent' : 'pending_recv';
}

/** 校验两人是否已是好友（chat 私聊权限用） */
async function areFriends(env, a, b) {
    if (a === b) return false;
    const row = await env.DB.prepare(
        "SELECT 1 FROM friends WHERE id = ? AND status = 'accepted'"
    ).bind(friendId(a, b)).first();
    return !!row;
}

// ---- 地点报错反馈（v3.21）----

// isolate 级缓存：单次 isolate 生命周期内只建一次 poi_feedback 表
let _poiFeedbackSchemaEnsured = false;

/** 幂等建表：首次调用 feedback 相关 API 时执行 CREATE TABLE IF NOT EXISTS */
async function ensurePoiFeedbackSchema(env) {
    if (_poiFeedbackSchemaEnsured) return;
    _poiFeedbackSchemaEnsured = true;
    try {
        await env.DB.batch([
            env.DB.prepare(
                `CREATE TABLE IF NOT EXISTS poi_feedback (
                    id         TEXT PRIMARY KEY,
                    poi_id     TEXT NOT NULL,
                    type       TEXT NOT NULL,
                    text       TEXT NOT NULL,
                    user_id    TEXT,
                    created_at INTEGER NOT NULL,
                    status     TEXT NOT NULL DEFAULT 'new'
                )`
            ),
            env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pfb_poi ON poi_feedback(poi_id, created_at DESC)'),
        ]);
    } catch (e) {
        _poiFeedbackSchemaEnsured = false;
        console.error('[poi_feedback] 建表失败:', e && e.message);
        throw e;
    }
}

// ---- 业务视图：合并种子 + overrides/deleted/custom ----

/** 合并视图：种子 + overrides，剔除 deleted，追加 custom */
function listPois(db, { includeDeleted = false } = {}) {
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

// ====== 输入校验（与原版一致） ======

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

// ====== 账户体系辅助（不再依赖 db 全量 JSON） ======

async function getSecret(env) {
    let secret = await getMeta(env, 'secret');
    if (!secret) {
        secret = randomHex(32);
        await setMeta(env, 'secret', secret);
    }
    return secret;
}

/** 从请求解析登录用户（未登录返回 null） */
async function authUser(env, request) {
    const h = request.headers.get('authorization') || '';
    if (!h.startsWith('Bearer ')) return null;
    const uid = await verifyToken(h.slice(7), await getSecret(env));
    if (!uid) return null;
    return await findUserById(env, uid);
}

function publicProfile(u) {
    return {
        id: u.id, email: u.email, nickname: u.nickname,
        avatar: u.avatar || null, school: u.school || '',
        grade: u.grade || '', college: u.college || '', major: u.major || '',
        studentId: u.studentId || '', createdAt: u.createdAt,
    };
}

/** 校验验证码；consume=true 验证通过即作废，false 则标记 verified 供后续步骤使用 */
async function checkCode(env, email, type, input, consume) {
    const key = type + ':' + String(email).toLowerCase();
    const rec = await getCode(env, key);
    if (!rec) return '请先获取验证码';
    if (rec.expires < Date.now()) { await delCode(env, key); return '验证码已过期，请重新发送'; }
    if (rec.attempts >= 5) { await delCode(env, key); return '错误次数过多，请重新发送验证码'; }
    rec.attempts++;
    if (rec.code !== String(input || '').trim()) {
        await saveCode(env, key, rec);
        return '验证码不正确';
    }
    if (consume) await delCode(env, key);
    else { rec.verified = true; await saveCode(env, key, rec); }
    return null;
}

// ====== 路由 ======

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extraHeaders },
    });
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

/** 注册路由表：method + path 正则 → handler(request, env, 参数) */
const routes = [];
function route(method, pattern, handler) {
    const names = [];
    const rx = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, m => {
        names.push(m.slice(1));
        return '([^/]+)';
    }) + '$');
    routes.push({ method, rx, names, handler });
}

// ---- 健康检查 ----
route('GET', '/api/health', async (req, env) => {
    return json({ ok: true, service: 'wenxuan-campus-map', time: new Date().toISOString() });
});

// ---- POI 列表（加浏览器缓存减负） ----
route('GET', '/api/pois', async (req, env) => {
    const db = await readDb(env);
    const url = new URL(req.url);
    const includeDeleted = url.searchParams.get('includeDeleted') === '1';
    const pois = listPois(db, { includeDeleted });
    const visible = listPois(db);
    return json({ pois, total: visible.length }, 200, { 'Cache-Control': 'public, max-age=10' });
});

route('GET', '/api/pois/:id', async (req, env, p) => {
    const db = await readDb(env);
    const poi = listPois(db, { includeDeleted: true }).find(x => x.id === p.id);
    if (!poi) return json({ error: '地点不存在' }, 404);
    return json(poi, 200, { 'Cache-Control': 'public, max-age=30' });
});

// ---- 地点报错反馈（v3.21：公开，可选登录） ----
route('POST', '/api/pois/:id/feedback', async (req, env, p) => {
    await ensurePoiFeedbackSchema(env);

    const body = await req.json().catch(() => ({}));
    const type = typeof body.type === 'string' ? body.type : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const FB_TYPES = ['closed', 'coords', 'info', 'other'];
    if (!FB_TYPES.includes(type)) return json({ error: '问题类型不合法' }, 400);
    if (!text || text.length > 100) return json({ error: '备注需 1~100 字' }, 400);

    // 校验地点存在（含已删除地点，避免误报无意义）
    const db = await readDb(env);
    const poi = listPois(db, { includeDeleted: true }).find(x => x.id === p.id);
    if (!poi) return json({ error: '地点不存在' }, 404);

    const user = await authUser(env, req);   // 可选登录：已登录记录 uid，匿名置 NULL
    const fb = {
        id: 'fb_' + randomHex(8),
        poi_id: p.id,
        type,
        text,
        user_id: user ? user.id : null,
        created_at: Date.now(),
        status: 'new',
    };
    await env.DB.prepare(
        `INSERT INTO poi_feedback (id, poi_id, type, text, user_id, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(fb.id, fb.poi_id, fb.type, fb.text, fb.user_id, fb.created_at, fb.status).run();
    return json({ ok: true, id: fb.id }, 201);
});

// ---- 新建自定义地点（需登录） ----
route('POST', '/api/pois', async (req, env) => {
    const db = await readDb(env);
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再发布地点', code: 'AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => ({}));
    const { errors, data } = validatePoiInput(body);
    if (errors.length) return json({ error: errors.join('；') }, 400);

    let id = 'b_user_' + Date.now().toString(36);
    if (typeof body.id === 'string' && /^b_user_[a-z0-9]{4,20}$/.test(body.id)) {
        const exists = db.custom.some(x => x.id === body.id) || seed.pois.some(x => x.id === body.id);
        if (exists) {
            const dup = db.custom.find(x => x.id === body.id);
            if (dup) return json({ ...dup, builtin: false, deleted: false, edited: false });
            return json({ error: 'id 已被占用' }, 409);
        }
        id = body.id;
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
    await writeDb(env, db);
    return json({ ...poi, builtin: false, deleted: false, edited: false }, 201);
});

// ---- 编辑地点（需登录；自定义仅作者） ----
route('PUT', '/api/pois/:id', async (req, env, p) => {
    const db = await readDb(env);
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再编辑地点', code: 'AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => ({}));
    const { errors, data } = validatePoiInput(body, { partial: true });
    if (errors.length) return json({ error: errors.join('；') }, 400);
    if (Object.keys(data).length === 0) return json({ error: '没有可更新的字段' }, 400);

    const custom = db.custom.find(x => x.id === p.id);
    if (custom) {
        if (custom.authorId && custom.authorId !== user.id) {
            return json({ error: '只能编辑自己发布的地点' }, 403);
        }
        Object.assign(custom, data);
        await writeDb(env, db);
        return json({ ...custom, builtin: false, deleted: false, edited: false });
    }

    const base = seed.pois.find(x => x.id === p.id);
    if (!base) return json({ error: '地点不存在' }, 404);
    if (db.deleted.includes(p.id)) return json({ error: '地点已被删除，请先恢复' }, 409);

    db.overrides[p.id] = { ...(db.overrides[p.id] || {}), ...data, updatedAt: new Date().toISOString() };
    await writeDb(env, db);
    return json({ ...base, ...data, builtin: true, deleted: false, edited: true });
});

// ---- 删除地点（需登录；自定义仅作者） ----
route('DELETE', '/api/pois/:id', async (req, env, p) => {
    const db = await readDb(env);
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再删除地点', code: 'AUTH_REQUIRED' }, 401);

    const ci = db.custom.findIndex(x => x.id === p.id);
    if (ci >= 0) {
        if (db.custom[ci].authorId && db.custom[ci].authorId !== user.id) {
            return json({ error: '只能删除自己发布的地点' }, 403);
        }
        const removed = db.custom.splice(ci, 1)[0];
        await writeDb(env, db);
        return json({ ok: true, removed: removed.id, hard: true });
    }

    if (!seed.pois.some(x => x.id === p.id)) return json({ error: '地点不存在' }, 404);
    if (!db.deleted.includes(p.id)) {
        db.deleted.push(p.id);
        await writeDb(env, db);
    }
    return json({ ok: true, removed: p.id, hard: false });
});

// ---- 恢复内置地点（需登录） ----
route('POST', '/api/pois/:id/restore', async (req, env, p) => {
    const db = await readDb(env);
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再恢复地点', code: 'AUTH_REQUIRED' }, 401);

    const base = seed.pois.find(x => x.id === p.id);
    if (!base) return json({ error: '仅内置地点支持恢复' }, 404);

    db.deleted = db.deleted.filter(d => d !== p.id);
    delete db.overrides[p.id];
    await writeDb(env, db);
    return json({ ...base, builtin: true, deleted: false, edited: false });
});

// ---- 统计（加缓存） ----
route('GET', '/api/stats', async (req, env) => {
    const db = await readDb(env);
    const usersTotal = await countUsers(env);
    return json({
        builtinTotal: seed.pois.length,
        customTotal: db.custom.length,
        editedTotal: Object.keys(db.overrides).length,
        deletedTotal: db.deleted.length,
        visibleTotal: listPois(db).length,
        usersTotal,
        dbCreatedAt: db.createdAt,
    }, 200, { 'Cache-Control': 'public, max-age=30' });
});

// ---- 发送验证码（注册/重置共用；演示模式：验证码随响应返回） ----
route('POST', '/api/auth/send-code', async (req, env) => {
    const body = await req.json().catch(() => ({}));
    const { email, type } = body;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return json({ error: '邮箱格式不正确' }, 400);
    }
    if (!['register', 'reset'].includes(type)) {
        return json({ error: '验证码类型不合法' }, 400);
    }
    const em = email.toLowerCase();
    const exists = !!(await findUserByEmail(env, em));
    if (type === 'register' && exists) {
        return json({ error: '该邮箱已注册，请直接登录', code: 'EMAIL_TAKEN' }, 409);
    }
    if (type === 'reset' && !exists) {
        return json({ error: '该邮箱尚未注册' }, 404);
    }
    const key = type + ':' + em;
    const prev = await getCode(env, key);
    if (prev && Date.now() - prev.lastSent < CODE_COOLDOWN) {
        const wait = Math.ceil((CODE_COOLDOWN - (Date.now() - prev.lastSent)) / 1000);
        return json({ error: `发送太频繁，请 ${wait} 秒后再试`, retryAfter: wait }, 429);
    }
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const code = String(n[0] % 1000000).padStart(6, '0');
    await saveCode(env, key, { code, expires: Date.now() + CODE_TTL, attempts: 0, lastSent: Date.now(), verified: false });
    // 顺便清理过期码（不影响主流程）
    env.sweepPending = true;
    console.log(`[auth] 演示验证码 ${em} (${type}): ${code}`);
    return json({ ok: true, demo: true, devCode: code, expiresIn: CODE_TTL / 1000 });
});

// ---- 预校验验证码 ----
route('POST', '/api/auth/verify-code', async (req, env) => {
    const body = await req.json().catch(() => ({}));
    const { email, type, code } = body;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return json({ error: '邮箱格式不正确' }, 400);
    }
    if (!['register', 'reset'].includes(type)) {
        return json({ error: '验证码类型不合法' }, 400);
    }
    const err = await checkCode(env, email, type, code, false);
    if (err) return json({ error: err }, 400);
    return json({ ok: true });
});

// ---- 注册 ----
route('POST', '/api/auth/register', async (req, env) => {
    const body = await req.json().catch(() => ({}));
    const { email, password, nickname, school, studentId, avatar, grade, college, major } = body;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return json({ error: '邮箱格式不正确' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return json({ error: '密码需 8~72 位' }, 400);
    }
    const nick = typeof nickname === 'string' ? nickname.trim() : '';
    if (nick.length < 2 || nick.length > 12) {
        return json({ error: '昵称需 2~12 个字符' }, 400);
    }
    // 昵称内容安全：网名可随意，但不能违规（敏感词/辱骂等）
    if (scan(nick).hit) {
        return json({ error: '昵称包含违规内容，请更换' }, 400);
    }
    // 年级/学院/专业必填且必须在固定范围内（防乱填）
    if (!validStudentInfo(
        typeof grade === 'string' ? grade.trim() : '',
        typeof college === 'string' ? college.trim() : '',
        typeof major === 'string' ? major.trim() : '',
    )) {
        return json({ error: '请选择正确的年级、学院与专业' }, 400);
    }
    if (avatar !== undefined && avatar !== null
        && !(typeof avatar === 'string' && (/^preset:[0-7]$/.test(avatar)
            || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length < 150000)))) {
        return json({ error: '头像格式不支持' }, 400);
    }
    const em = email.toLowerCase();
    if (await findUserByEmail(env, em)) {
        return json({ error: '该邮箱已注册，请直接登录', code: 'EMAIL_TAKEN' }, 409);
    }
    // 必须已通过 verify-code（10 分钟内）
    const key = 'register:' + em;
    const rec = await getCode(env, key);
    if (!rec || !rec.verified || rec.expires < Date.now()) {
        return json({ error: '邮箱验证已失效，请重新验证' }, 400);
    }
    await delCode(env, key);

    const salt = randomHex(16);
    const user = {
        id: 'u_' + randomHex(6),
        email: em,
        salt,
        passHash: await hashPassword(password, salt),
        nickname: nick,
        avatar: avatar || null,
        school: WENXUAN_SCHOOL,   // 学校固定，不可改
        grade: grade.trim(),       // 年级（入学年份）
        college: college.trim(),   // 学院
        major: major.trim(),       // 专业
        studentId: typeof studentId === 'string' ? studentId.trim().slice(0, 20) : '',
        createdAt: new Date().toISOString(),
    };
    await saveUser(env, user);
    const secret = await getSecret(env);
    return json({ token: await signToken(user.id, secret), user: publicProfile(user) }, 201);
});

// ---- 登录（连续失败 5 次锁 10 分钟） ----
route('POST', '/api/auth/login', async (req, env) => {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || typeof password !== 'string' || !password) {
        return json({ error: '请输入邮箱和密码' }, 400);
    }
    const em = email.toLowerCase();
    const fail = await getLoginFails(env, em);
    if (fail && fail.lockUntil && fail.lockUntil > Date.now()) {
        const mins = Math.ceil((fail.lockUntil - Date.now()) / 60000);
        return json({ error: `失败次数过多，已锁定，请 ${mins} 分钟后再试` }, 429);
    }
    const user = await findUserByEmail(env, em);
    let ok = false;
    if (user) {
        const a = await hashPassword(password, user.salt);
        ok = timingSafeEqual(a, user.passHash);
    }
    if (!ok) {
        const rec = fail || { count: 0, lockUntil: 0 };
        rec.count++;
        if (rec.count >= 5) { rec.count = 0; rec.lockUntil = Date.now() + 10 * 60 * 1000; }
        await saveLoginFails(env, em, rec);
        return json({ error: '邮箱或密码不正确' }, 401);
    }
    await delLoginFails(env, em);
    const secret = await getSecret(env);
    return json({ token: await signToken(user.id, secret), user: publicProfile(user) });
});

// ---- 重置密码（成功即登录） ----
route('POST', '/api/auth/reset', async (req, env) => {
    const body = await req.json().catch(() => ({}));
    const { email, code, password } = body;
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return json({ error: '邮箱格式不正确' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        return json({ error: '新密码需 8~72 位' }, 400);
    }
    const em = email.toLowerCase();
    const user = await findUserByEmail(env, em);
    if (!user) return json({ error: '该邮箱尚未注册' }, 404);
    const err = await checkCode(env, em, 'reset', code, true);
    if (err) return json({ error: err }, 400);

    user.salt = randomHex(16);
    user.passHash = await hashPassword(password, user.salt);
    await saveUser(env, user);
    const secret = await getSecret(env);
    return json({ token: await signToken(user.id, secret), user: publicProfile(user) });
});

// ---- 当前用户资料 ----
route('GET', '/api/auth/me', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '登录已失效，请重新登录', code: 'AUTH_REQUIRED' }, 401);
    return json({ user: publicProfile(user) });
});

route('PUT', '/api/auth/me', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '登录已失效，请重新登录', code: 'AUTH_REQUIRED' }, 401);
    const body = await req.json().catch(() => ({}));
    const { nickname, avatar, school, studentId, grade, college, major } = body;
    if (nickname !== undefined) {
        const nick = String(nickname).trim();
        if (nick.length < 2 || nick.length > 12) return json({ error: '昵称需 2~12 个字符' }, 400);
        if (scan(nick).hit) return json({ error: '昵称包含违规内容，请更换' }, 400);
        user.nickname = nick;
    }
    if (avatar !== undefined) {
        if (avatar !== null && !(typeof avatar === 'string' && (/^preset:[0-7]$/.test(avatar)
            || (/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && avatar.length < 150000)))) {
            return json({ error: '头像格式不支持' }, 400);
        }
        user.avatar = avatar;
    }
    // 年级/学院/专业：三者需同时提供且合法（防止单独乱改）
    if (grade !== undefined || college !== undefined || major !== undefined) {
        const g = grade !== undefined ? String(grade).trim() : (user.grade || '');
        const c = college !== undefined ? String(college).trim() : (user.college || '');
        const m = major !== undefined ? String(major).trim() : (user.major || '');
        if (!validStudentInfo(g, c, m)) return json({ error: '请选择正确的年级、学院与专业' }, 400);
        user.grade = g; user.college = c; user.major = m;
    }
    if (school !== undefined) user.school = WENXUAN_SCHOOL; // 学校固定，忽略前端传值
    if (studentId !== undefined) user.studentId = String(studentId).trim().slice(0, 20);
    await saveUser(env, user);
    return json({ user: publicProfile(user) });
});

// ====== 失物招领（独立行级表，避免单文档并发覆盖） ======

const LF_TTL = 30 * 24 * 3600 * 1000;          // 帖子 30 天过期
const LF_GRACE = 7 * 24 * 3600 * 1000;         // 过期后保留 7 天供作者查看，随后清理
const LF_CATS = ['card', 'key', 'elec', 'book', 'cloth', 'other'];
const LF_MAX_ATTEMPTS = 5;                     // 验证答案最多尝试次数

/** 读取全部帖子（含过期；清理超期保留期的死数据） */
async function lfReadAll(env) {
    const { results } = await env.DB.prepare('SELECT id, data, created_at FROM lf_posts ORDER BY created_at DESC LIMIT 300').all();
    const now = Date.now();
    const posts = [];
    const deadIds = [];
    for (const row of results) {
        try {
            const p = JSON.parse(row.data);
            // 过期保留期已过 → 物理删除
            if (p.expiresAt + LF_GRACE < now) { deadIds.push(row.id); continue; }
            posts.push(p);
        } catch { deadIds.push(row.id); }
    }
    if (deadIds.length) {
        const stmt = env.DB.prepare('DELETE FROM lf_posts WHERE id = ?');
        await env.DB.batch(deadIds.map(id => stmt.bind(id)));
    }
    return posts;
}

async function lfWrite(env, post) {
    await env.DB.prepare(
        'INSERT INTO lf_posts (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
    ).bind(post.id, JSON.stringify(post), post.createdAt).run();
}

/** 对外投影：隐藏验证答案与尝试计数；claims 仅发布者可见 */
function lfPublic(p, { isOwner = false, viewerId = null } = {}) {
    const out = {
        id: p.id, type: p.type, title: p.title, category: p.category,
        desc: p.desc, timeText: p.timeText, x: p.x, y: p.y, locName: p.locName,
        status: p.status, ownerId: p.ownerId, ownerName: p.ownerName,
        proofQ: p.proofQ, createdAt: p.createdAt, expiresAt: p.expiresAt,
        resolvedAt: p.resolvedAt || null,
        autoDeleteAt: p.autoDeleteAt || null,
        confirmedAt: p.confirmedAt || null,
        mine: viewerId ? p.ownerId === viewerId : false,
        amIClaimer: viewerId ? (p.claims || []).some(c => c.uid === viewerId) : false,
    };
    if (isOwner) {
        out.claims = p.claims || [];
        out.ownerContact = p.ownerContact || null;   // 发布者编辑时可看到自己填写的联系方式
    }
    // 已完成且查看者是发布者或被确认的认领人 → 交换联系方式
    // 发布者看到 contact（认领人提交时的邮箱）；认领人看到 ownerContact（发布者填写的联系方式）
    if (p.status === 'done' && viewerId) {
        if (p.ownerId === viewerId) {
            out.contact = p.contact || null;           // 认领人联系方式
            // 给发布者下发被确认认领人的 uid，方便私信
            const confirmed = (p.claims || [])[0];
            if (confirmed) out.claimUid = confirmed.uid;
        } else if ((p.claims || []).some(c => c.uid === viewerId)) {
            out.contact = p.ownerContact || null;       // 发布者联系方式
        }
    }
    return out;
}

/** 校验发布输入 */
function validateLfInput(body) {
    const errors = [];
    const out = {};
    if (!['lost', 'found'].includes(body.type)) errors.push('类型必须是 lost 或 found');
    else out.type = body.type;
    const t = typeof body.title === 'string' ? body.title.trim() : '';
    if (!t || t.length > 30) errors.push('标题必填且不超过 30 字');
    else out.title = t;
    if (!LF_CATS.includes(body.category)) errors.push('物品分类不合法');
    else out.category = body.category;
    const d = typeof body.desc === 'string' ? body.desc.trim() : '';
    if (d.length > 200) errors.push('描述不超过 200 字');
    else out.desc = d || '（未填写描述）';
    const tt = typeof body.timeText === 'string' ? body.timeText.trim() : '';
    if (tt.length > 30) errors.push('时间描述不超过 30 字');
    else out.timeText = tt || '时间不详';
    for (const k of ['x', 'y']) {
        const v = Number(body[k]);
        const max = k === 'x' ? MAP_W : MAP_H;
        if (!Number.isFinite(v) || v < 0 || v > max) errors.push(`${k} 坐标需在 0~${max} 之间`);
        else out[k] = +v.toFixed(1);
    }
    const ln = typeof body.locName === 'string' ? body.locName.trim() : '';
    if (ln.length > 30) errors.push('地点名称不超过 30 字');
    else out.locName = ln || '校内';
    const q = typeof body.proofQ === 'string' ? body.proofQ.trim() : '';
    if (!q || q.length > 60) errors.push('验证问题必填且不超过 60 字');
    else out.proofQ = q;
    const a = typeof body.proofA === 'string' ? body.proofA.trim() : '';
    if (a.length < 1 || a.length > 40) errors.push('验证答案需 1~40 字');
    else out.proofA = a;
    // 联系方式：可选字段，留空则由调用方回退到注册邮箱；最多 60 字
    const ct = typeof body.ownerContact === 'string' ? body.ownerContact.trim() : '';
    if (ct.length > 60) errors.push('联系方式不超过 60 字');
    else out.ownerContact = ct;   // 空字符串表示"用默认邮箱"
    return { errors, data: out };
}

function lfNorm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
}

// ---- 招领列表（公开；?mine=1 附带自己帖子的认领申请） ----
route('GET', '/api/lf', async (req, env) => {
    const user = await authUser(env, req);   // 可匿名
    const url = new URL(req.url);
    const mineOnly = url.searchParams.get('mine') === '1';
    const now = Date.now();
    let posts = await lfReadAll(env);
    posts = posts.filter(p => !(p.status === 'open' && p.expiresAt < now));   // 过期开放帖不下发
    if (mineOnly) {
        if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
        posts = posts.filter(p => p.ownerId === user.id);
    }
    return json({
        posts: posts.map(p => lfPublic(p, {
            isOwner: !!user && p.ownerId === user.id,
            viewerId: user ? user.id : null,
        })),
        total: posts.length,
    });
});

// ---- 发布招领/寻物帖（需登录） ----
route('POST', '/api/lf', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再发布', code: 'AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => ({}));
    const { errors, data } = validateLfInput(body);
    if (errors.length) return json({ error: errors.join('；') }, 400);

    const now = Date.now();
    const post = {
        id: 'lf_' + randomHex(5),
        ...data,
        status: 'open',
        ownerId: user.id,
        ownerName: user.nickname,
        ownerContact: data.ownerContact || user.email,   // 优先用前端填写的联系方式，留空则用注册邮箱
        contact: null,                      // 认领人联系方式，认领完成时填入
        claims: [],
        attempts: {},
        createdAt: now,
        expiresAt: now + LF_TTL,
        resolvedAt: null,
        autoDeleteAt: null,                // 保留字段但不再赋值（v3.21 取消 5 分钟兜底清理）
        confirmedAt: null,                 // 人工确认完成时间戳；认领时 null，完成认领后 = Date.now()
    };
    await lfWrite(env, post);
    return json(lfPublic(post, { isOwner: true, viewerId: user.id }), 201);
});

// ---- 申请认领（需登录；答对验证问题才记录申请） ----
route('POST', '/api/lf/:id/claim', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录后再认领', code: 'AUTH_REQUIRED' }, 401);

    const posts = await lfReadAll(env);
    const post = posts.find(x => x.id === p.id);
    if (!post) return json({ error: '帖子不存在或已过期' }, 404);
    if (post.ownerId === user.id) return json({ error: '不能认领自己发布的帖子' }, 400);
    if (post.status !== 'open') return json({ error: '该帖子当前不可认领' }, 409);
    if ((post.claims || []).some(c => c.uid === user.id)) return json({ error: '你已提交过认领申请' }, 409);

    // 防爆破：每人对同一帖最多尝试 5 次
    post.attempts = post.attempts || {};
    const tried = post.attempts[user.id] || 0;
    if (tried >= LF_MAX_ATTEMPTS) return json({ error: '尝试次数过多，请联系发布者或放弃' }, 429);

    const body = await req.json().catch(() => ({}));
    const answer = lfNorm(body.answer);
    if (!answer) return json({ error: '请回答验证问题' }, 400);
    post.attempts[user.id] = tried + 1;
    if (answer !== lfNorm(post.proofA)) {
        const left = LF_MAX_ATTEMPTS - post.attempts[user.id];
        await lfWrite(env, post);
        return json({ error: `验证答案不正确（还可尝试 ${left} 次）` }, 403);
    }

    post.claims = post.claims || [];
    post.claims.push({ uid: user.id, nickname: user.nickname, at: Date.now() });
    // v3.17: 答对答案即视为认领完成，跳过发布者确认环节，立即交换联系方式
    // v3.21: 不再写 autoDeleteAt（取消 5 分钟兜底清理），改由双方主动「确认完成」
    post.status = 'done';
    post.resolvedAt = Date.now();
    post.confirmedAt = null;
    post.autoDeleteAt = null;
    post.contact = user.email || '';   // 认领人联系方式（发布者可见）
    post.claims = [post.claims.find(c => c.uid === user.id)];   // 只保留本次认领人
    await lfWrite(env, post);
    return json({ ok: true, message: '答对答案！联系方式已互相解锁' });
});

// ---- 发布者确认认领（v3.17 已废弃：答对答案即完成认领，无需发布者确认） ----
// 路由保留以兼容旧前端缓存，直接返回 410 提示流程已简化
route('POST', '/api/lf/:id/confirm', async (req, env, p) => {
    return json({ error: '该流程已简化：答对验证答案即完成认领，无需发布者确认', code: 'LF_FLOW_DEPRECATED' }, 410);
});

// ---- 发布者拒绝认领申请（v3.17 已废弃） ----
route('POST', '/api/lf/:id/reject', async (req, env, p) => {
    return json({ error: '该流程已简化：答对验证答案即完成认领，无需发布者拒绝', code: 'LF_FLOW_DEPRECATED' }, 410);
});

// ---- 编辑帖子（需登录，仅作者；可改标题/描述/分类/时间/验证问答，认领完成或待确认后仍可改问答） ----
route('PUT', '/api/lf/:id', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    const row = await env.DB.prepare('SELECT data FROM lf_posts WHERE id = ?').bind(p.id).first();
    if (!row) return json({ error: '帖子不存在' }, 404);
    const post = JSON.parse(row.data);
    if (post.ownerId !== user.id) return json({ error: '只能编辑自己发布的帖子' }, 403);
    if (post.status === 'done') return json({ error: '已完成的帖子不可编辑' }, 409);

    const body = await req.json().catch(() => ({}));
    // 仅更新提供的字段；验证问答整体成对更新（改了问题通常也要改答案）
    const patch = {};
    if (body.title !== undefined) patch.title = typeof body.title === 'string' ? body.title.trim() : '';
    if (body.desc !== undefined) patch.desc = typeof body.desc === 'string' ? body.desc.trim() : '';
    if (body.timeText !== undefined) patch.timeText = typeof body.timeText === 'string' ? body.timeText.trim() : '';
    if (body.category !== undefined) patch.category = body.category;
    if (body.proofQ !== undefined) patch.proofQ = typeof body.proofQ === 'string' ? body.proofQ.trim() : '';
    if (body.proofA !== undefined) patch.proofA = typeof body.proofA === 'string' ? body.proofA.trim() : '';
    // v3.17: 允许编辑自己发布的联系方式
    if (body.ownerContact !== undefined) {
        const ct = typeof body.ownerContact === 'string' ? body.ownerContact.trim() : '';
        patch.ownerContact = ct;   // 空字符串校验时会被赋值，调用方应理解为"用默认邮箱"
    }

    // 校验（复用发布校验逻辑：构造合并后的完整对象再校验）
    const merged = { ...post, ...patch };
    const { errors, data } = validateLfInput(merged);
    if (errors.length) return json({ error: errors.join('；') }, 400);

    // 写回：仅更新校验后的字段，保留 status/claims/attempts 等
    Object.assign(post, data);
    await lfWrite(env, post);
    return json(lfPublic(post, { isOwner: true, viewerId: user.id }));
});

// ---- 发布者/认领人主动「确认完成」（v3.21：状态保持 done，写 confirmedAt，不删帖） ----
route('POST', '/api/lf/:id/finish', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    const row = await env.DB.prepare('SELECT data FROM lf_posts WHERE id = ?').bind(p.id).first();
    if (!row) return json({ error: '帖子不存在' }, 404);
    const post = JSON.parse(row.data);

    // 仅发布者或认领人可确认完成
    const isOwner = post.ownerId === user.id;
    const isClaimer = (post.claims || []).some(c => c.uid === user.id);
    if (!isOwner && !isClaimer) return json({ error: '只有发布者或认领人可以确认完成' }, 403);

    // 仅 done 状态可确认完成（open/pending 没有"确认完成"语义）
    if (post.status !== 'done') return json({ error: '帖子尚未认领完成' }, 409);

    // v3.21: 确认完成——状态保持 done，写入 confirmedAt、清除 autoDeleteAt，不删除帖子
    post.confirmedAt = Date.now();
    post.autoDeleteAt = null;
    await lfWrite(env, post);
    return json({ ok: true, post: lfPublic(post, { isOwner, viewerId: user.id }) });
});

// ---- 撤回帖子（需登录，仅作者；v3.21：撤回 done 帖时通知认领人） ----
route('DELETE', '/api/lf/:id', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    const row = await env.DB.prepare('SELECT data FROM lf_posts WHERE id = ?').bind(p.id).first();
    if (!row) return json({ error: '帖子不存在' }, 404);
    const post = JSON.parse(row.data);
    if (post.ownerId !== user.id) return json({ error: '只能撤回自己发布的帖子' }, 403);

    // v3.21: 撤回已完成（done）且已有认领人的帖子时，向认领人写一条系统私信
    let notified = false;
    const claimer = post.claims && post.claims[0] && post.claims[0].uid;
    if (post.status === 'done' && claimer) {
        await writeSystemMessage(env, user.id, claimer, `你认领的「${post.title || '失物招领'}」已被发布者撤回`);
        notified = true;
    }

    await env.DB.prepare('DELETE FROM lf_posts WHERE id = ?').bind(p.id).run();
    return json({ ok: true, notified });
});

// ==================== 用户云数据（收藏/地标/备注，按用户隔离） ====================

/** 读取某用户的云数据；无记录返回默认结构 */
async function udRead(env, uid) {
    const row = await env.DB.prepare('SELECT data FROM user_data WHERE uid = ?').bind(uid).first();
    if (row) {
        try {
            return JSON.parse(row.data);
        } catch { /* 损坏则重建 */ }
    }
    return { fav: [], custom: [], notes: {} };
}

/** 写入某用户的云数据 */
async function udWrite(env, uid, data) {
    await env.DB.prepare(
        'INSERT INTO user_data (uid, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(uid, JSON.stringify(data), Date.now()).run();
}

// GET /api/userdata —— 拉取当前用户云数据（需登录）
route('GET', '/api/userdata', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    return json({ data: await udRead(env, user.id) });
});

// PUT /api/userdata —— 全量覆盖当前用户云数据（需登录；前端本地为准整体同步）
route('PUT', '/api/userdata', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => ({}));
    const fav = Array.isArray(body.fav) ? body.fav.filter(x => typeof x === 'string').slice(0, 500) : [];
    const custom = Array.isArray(body.custom) ? body.custom.slice(0, 500) : [];
    const notes = (body.notes && typeof body.notes === 'object') ? body.notes : {};

    const data = { fav, custom, notes };
    await udWrite(env, user.id, data);
    return json({ ok: true, data });
});

// ==================== 聊天（公共大厅 + 私聊） ====================

const CHAT_LIMIT = 200;          // 单房间最多拉取条数
const CHAT_MSG_MAX = 500;        // 消息最大长度
const LOBBY_TTL = 24 * 3600e3;   // 大厅消息保留 24 小时

/** 房间 id：私聊统一排序保证 a/b 双向同房间 */
function dmRoom(a, b) { return 'dm:' + [a, b].sort().join(':'); }

/** 从消息行投影出对外结构（v3.14 瘦身：头像不再逐条携带，由 senders 映射统一下发） */
function msgPublic(row) {
    try {
        const d = JSON.parse(row.data);
        return {
            id: row.id,
            room: row.room,
            sender: row.sender,
            senderName: d.senderName || '',
            text: d.text || '',
            createdAt: row.created_at,
            system: !!(d.system),   // v3.21：系统消息标记（sender='system' + data.system=1）
        };
    } catch {
        return null;
    }
}

/**
 * 批量取发送者公开资料（昵称/头像）：一次 IN 查询 + 每人只发一份头像。
 * 修复：此前头像 base64 存进每条消息行，30 条轮询要把同一头像重复传 30 遍。
 * users 表全量资料在 data JSON 里，按 50 个一箱分批查询（D1 绑定参数上限保护）。
 */
async function senderProfiles(env, uids) {
    const map = {};
    const list = [...new Set(uids)].filter(Boolean);
    for (let i = 0; i < list.length; i += 50) {
        const chunk = list.slice(i, i + 50);
        const ph = chunk.map(() => '?').join(',');
        const rows = (await env.DB.prepare(
            `SELECT id, data FROM users WHERE id IN (${ph})`
        ).bind(...chunk).all()).results;
        for (const r of rows) {
            try {
                const u = JSON.parse(r.data);
                map[r.id] = { name: u.nickname || '', avatar: u.avatar || null };
            } catch { /* 资料损坏的行跳过，前端走首字符色块兜底 */ }
        }
    }
    return map;
}

/**
 * 计算房间的 ETag：基于 room 最新消息的 createdAt。
 * 客户端 If-None-Match 命中则返回 304，否则返回完整消息。
 */
async function roomEtag(env, room) {
    const row = await env.DB.prepare(
        'SELECT created_at FROM messages WHERE room = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(room).first();
    if (!row) return 'empty';   // 房间无消息
    return 'm' + row.created_at;
}

/** 判房间是否含系统消息（v3.21：非好友认领人读取系统通知时放行） */
async function roomHasSystem(env, room) {
    const row = await env.DB.prepare(
        "SELECT 1 FROM messages WHERE room = ? AND sender = 'system' LIMIT 1"
    ).bind(room).first();
    return !!row;
}

/**
 * 写一条系统私信到两人房间（v3.21）。
 * 不经好友校验、不参与内容安全扫描；sender='system'，data 打 system:1。
 */
async function writeSystemMessage(env, fromUid, toUid, text) {
    const room = dmRoom(fromUid, toUid);
    const id = 'm_' + randomHex(8);
    const createdAt = Date.now();
    // v3.21：data 里附带 fromUid，便于 sysrooms 侧排除「我发出的撤回通知」
    const data = JSON.stringify({ text, senderName: '系统通知', system: 1, fromUid });
    await env.DB.prepare(
        'INSERT INTO messages (id, room, sender, data, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, room, 'system', data, createdAt).run();
    return msgPublic({ id, room, sender: 'system', data, created_at: createdAt });
}

// GET /api/chat?room=lobby|dm:xxx&before=<id>&limit=<n> —— 拉消息（支持 ETag/304）
route('GET', '/api/chat', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    const url = new URL(req.url);
    let room = url.searchParams.get('room') || 'lobby';
    const before = url.searchParams.get('before') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, CHAT_LIMIT);

    // 私聊房间：校验当前用户是否参与；读取门槛 = 互为好友 或 房间含系统消息（v3.21 放宽）
    if (room.startsWith('dm:')) {
        const parts = room.split(':');
        if (parts.length !== 3 || !parts.includes(user.id)) {
            return json({ error: '无权查看该会话' }, 403);
        }
        const other = parts[1] === user.id ? parts[2] : parts[1];
        const friends = await areFriends(env, user.id, other);
        if (!friends && !(await roomHasSystem(env, room))) {
            return json({ error: '需先添加对方为好友，对方同意后才能私信', code: 'FRIEND_REQUIRED' }, 403);
        }
    }

    // ETag/304：仅在非分页请求（不带 before）且客户端带 If-None-Match 时启用
    // 否则直接走消息查询（避免多余 SELECT latest createdAt）
    if (!before) {
        // 归一化 If-None-Match：浏览器/客户端按规范带引号（"tag"），可能带弱校验前缀 W/
        // 修复：此前直接与裸 tag 严格比较永远不相等，304 永不命中
        const inm = (req.headers.get('if-none-match') || '')
            .trim().replace(/^W\//, '').replace(/"/g, '');
        if (inm) {
            const tag = await roomEtag(env, room);
            if (inm === tag) {
                return new Response(null, {
                    status: 304,
                    headers: { 'ETag': '"' + tag + '"', ...CORS },
                });
            }
            // 不命中 → 正常下发，附带 ETag 供下次轮询使用
            const rows = (await env.DB.prepare(
                'SELECT id, room, sender, data, created_at FROM messages WHERE room = ? ORDER BY created_at DESC LIMIT ?'
            ).bind(room, limit).all()).results;
            const msgs = rows.map(msgPublic).filter(Boolean).reverse();
            const senders = await senderProfiles(env, rows.map(r => r.sender));
            return json({ room, messages: msgs, senders }, 200, {
                'ETag': '"' + tag + '"',
                'Cache-Control': 'no-cache',
            });
        }
        // 客户端未带 If-None-Match（首次拉取或非轮询调用）→ 只查一次消息
        const rows = (await env.DB.prepare(
            'SELECT id, room, sender, data, created_at FROM messages WHERE room = ? ORDER BY created_at DESC LIMIT ?'
        ).bind(room, limit).all()).results;
        // 顺便带 ETag 给客户端用作下次轮询的 If-None-Match
        const tag = rows.length ? 'm' + rows[0].created_at : 'empty';
        const msgs = rows.map(msgPublic).filter(Boolean).reverse();
        const senders = await senderProfiles(env, rows.map(r => r.sender));
        return json({ room, messages: msgs, senders }, 200, {
            'ETag': '"' + tag + '"',
            'Cache-Control': 'no-cache',
        });
    }

    // 分页请求（before=createdAt）不参与 ETag
    const rows = (await env.DB.prepare(
        'SELECT id, room, sender, data, created_at FROM messages WHERE room = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).bind(room, Number(before) || 0, limit).all()).results;
    const msgs = rows.map(msgPublic).filter(Boolean).reverse();
    return json({ room, messages: msgs });
});

// POST /api/chat —— 发消息 {room, text}
route('POST', '/api/chat', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    // 已被封禁的用户直接拒绝发言
    if (isBanned(user)) return json({ error: '你已被移出聊天并禁止发言，请联系管理员申诉', code: 'CHAT_BANNED' }, 403);

    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return json({ error: '消息不能为空' }, 400);
    if (text.length > CHAT_MSG_MAX) return json({ error: '消息过长' }, 400);

    // 内容安全检测（敏感词 / 同音字 / 拼音 / 字母缩写 / 符号绕过）
    const guard = checkMessage(null, user, text);  // db 参数不再需要，传入 null
    if (!guard.ok) {
        // 违规分/封禁状态写入用户行（行级 UPSERT，无并发风险）
        await saveUser(env, user);
        return json(
            { error: guard.error, code: guard.code, banned: !!guard.banned, strike: guard.strike },
            guard.banned ? 403 : 400,
        );
    }

    let room = String(body.room || 'lobby');
    // 私聊：不允许给自己发，且必须指定对方，且双方必须互为好友
    if (room.startsWith('dm:')) {
        const parts = room.split(':');
        if (parts.length !== 3) return json({ error: '会话格式不正确' }, 400);
        const [a, b] = [parts[1], parts[2]];
        if (![a, b].includes(user.id)) return json({ error: '无权在该会话发言' }, 403);
        const other = a === user.id ? b : a;
        if (!(await findUserById(env, other))) return json({ error: '对方用户不存在' }, 404);
        if (other === user.id) return json({ error: '不能给自己发私信' }, 400);
        if (!(await areFriends(env, user.id, other))) {
            return json({ error: '需先添加对方为好友，对方同意后才能私信', code: 'FRIEND_REQUIRED' }, 403);
        }
        room = dmRoom(a, b); // 规范化房间 id
    } else if (room !== 'lobby') {
        return json({ error: '会话类型不合法' }, 400);
    }

    const id = 'm_' + randomHex(8);
    const createdAt = Date.now();
    // v3.14 瘦身：消息行不再存头像 base64（头像在 GET 时由 senders 映射统一附带）
    const slim = JSON.stringify({ text, senderName: user.nickname });
    await env.DB.prepare(
        'INSERT INTO messages (id, room, sender, data, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, room, user.id, slim, createdAt).run();

    return json({ message: msgPublic({ id, room, sender: user.id, data: slim, created_at: createdAt }) }, 201);
});

// GET /api/chat/users —— 可私聊的用户列表（除自己外的注册用户；加浏览器缓存减负）
route('GET', '/api/chat/users', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    // v3.37：q = 按邮箱 / 昵称模糊搜索（添加好友入口）
    const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase();
    let users = await listUsersBrief(env, user.id, 500);
    if (q) users = users.filter(u =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q));
    return json({ users }, 200, { 'Cache-Control': 'private, max-age=60' });
});

// GET /api/chat/sysrooms —— 系统通知入口（v3.21：非好友认领人也能在会话列表看到）
route('GET', '/api/chat/sysrooms', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);

    // 取所有含系统消息的私聊房间，再在内存里过滤出当前用户参与的
    const rows = (await env.DB.prepare(
        `SELECT room, MAX(created_at) AS lastAt
         FROM messages
         WHERE sender = 'system' AND room LIKE 'dm:%'
         GROUP BY room
         ORDER BY lastAt DESC
         LIMIT 200`
    ).all()).results || [];

    const rooms = [];
    for (const r of rows) {
        const parts = r.room.split(':');
        if (parts.length !== 3 || !parts.includes(user.id)) continue;
        const otherUid = parts[1] === user.id ? parts[2] : parts[1];
        const peer = await findUserById(env, otherUid);
        if (!peer) continue;

        // 最新一条系统消息文本作为预览
        const last = await env.DB.prepare(
            'SELECT data FROM messages WHERE room = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(r.room).first();
        let lastText = '';
        let lastData = null;
        if (last) { try { lastData = JSON.parse(last.data); lastText = lastData.text || ''; } catch { /* 忽略损坏行 */ } }

        // v3.21：排除「我发出的撤回通知」——发布者撤回自己帖子时也会落进共享房间，
        // 但那条系统消息的操作者(fromUid)就是当前用户，不应出现在「我收到的通知」里。
        if (lastData && lastData.fromUid === user.id) continue;

        rooms.push({
            room: r.room,
            peer: { id: peer.id, nickname: peer.nickname, avatar: peer.avatar || null },
            lastText,
            createdAt: r.lastAt,
        });
    }
    return json({ rooms });
});

// GET /api/chat/user/:id —— 查看单个用户公开资料（头像/昵称/学校/学号/注册时间；需登录）
route('GET', '/api/chat/user/:id', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    const target = await findUserById(env, p.id);
    if (!target) return json({ error: '用户不存在' }, 404);
    return json({ user: publicProfile(target) }, 200, { 'Cache-Control': 'private, max-age=30' });
});

// ==================== 好友（v3.19） ====================

// POST /api/friends/request —— 发起加好友请求 {toUid}
route('POST', '/api/friends/request', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    await ensureFriendsSchema(env);

    const body = await req.json().catch(() => ({}));
    const toUid = String(body.toUid || '').trim();
    if (!toUid) return json({ error: '缺少对方用户' }, 400);
    if (toUid === user.id) return json({ error: '不能添加自己为好友' }, 400);

    const target = await findUserById(env, toUid);
    if (!target) return json({ error: '对方用户不存在' }, 404);

    const status = await friendStatus(env, user.id, toUid);
    if (status === 'friends') return json({ error: '你们已是好友', code: 'ALREADY_FRIENDS' }, 409);
    if (status === 'pending_sent') return json({ error: '已发送过请求，等待对方同意', code: 'ALREADY_REQUESTED' }, 409);
    // pending_recv：对方先发给我，我这边直接同意（互为好友）
    if (status === 'pending_recv') {
        await env.DB.prepare(
            "UPDATE friends SET status='accepted', responded_at=? WHERE id=?"
        ).bind(Date.now(), friendId(user.id, toUid)).run();
        return json({ ok: true, message: '对方已先向你发起请求，现已互为好友', status: 'friends' });
    }
    // none / rejected：发起（或重新发起）请求，覆盖同一行
    const id = friendId(user.id, toUid);
    await env.DB.prepare(
        `INSERT INTO friends (id, from_uid, to_uid, status, created_at, responded_at)
         VALUES (?, ?, ?, 'pending', ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
            from_uid=excluded.from_uid,
            to_uid=excluded.to_uid,
            status='pending',
            created_at=excluded.created_at,
            responded_at=NULL`
    ).bind(id, user.id, toUid, Date.now()).run();
    return json({ ok: true, message: '好友请求已发送', status: 'pending_sent' });
});

// POST /api/friends/:id/respond —— 同意/拒绝请求 {action: 'accept'|'reject'}
route('POST', '/api/friends/:id/respond', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    await ensureFriendsSchema(env);

    const otherUid = p.id;
    if (!otherUid || otherUid === user.id) return json({ error: '请求无效' }, 400);

    const body = await req.json().catch(() => ({}));
    const action = body.action === 'reject' ? 'reject' : 'accept';
    const id = friendId(user.id, otherUid);

    const row = await env.DB.prepare(
        "SELECT from_uid, status FROM friends WHERE id = ?"
    ).bind(id).first();
    if (!row) return json({ error: '没有该好友请求', code: 'NO_REQUEST' }, 404);
    if (row.status === 'accepted') return json({ ok: true, status: 'friends', message: '已是好友' });

    // 只有被请求方（to_uid === 我）能响应
    if (row.from_uid === user.id) {
        return json({ error: '请等待对方响应', code: 'NOT_YOUR_REQUEST' }, 400);
    }
    if (action === 'reject') {
        await env.DB.prepare(
            "UPDATE friends SET status='rejected', responded_at=? WHERE id=?"
        ).bind(Date.now(), id).run();
        return json({ ok: true, status: 'rejected', message: '已拒绝' });
    }
    await env.DB.prepare(
        "UPDATE friends SET status='accepted', responded_at=? WHERE id=?"
    ).bind(Date.now(), id).run();
    return json({ ok: true, status: 'friends', message: '已同意，你们互为好友' });
});

// GET /api/friends —— 我的好友列表（status=accepted）
route('GET', '/api/friends', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    await ensureFriendsSchema(env);

    const rows = (await env.DB.prepare(
        `SELECT from_uid, to_uid, responded_at
         FROM friends
         WHERE status='accepted'
           AND (from_uid=? OR to_uid=?)
         ORDER BY responded_at DESC`
    ).bind(user.id, user.id).all()).results || [];

    const friends = [];
    for (const r of rows) {
        const otherUid = r.from_uid === user.id ? r.to_uid : r.from_uid;
        const u = await findUserById(env, otherUid);
        if (u) friends.push({
            id: u.id, nickname: u.nickname,
            avatar: u.avatar || null, college: u.college || '', major: u.major || '',
            friendsAt: r.responded_at,
        });
    }
    return json({ friends });
});

// GET /api/friends/requests —— 我收到的好友请求（status=pending，to_uid=我）
route('GET', '/api/friends/requests', async (req, env) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    await ensureFriendsSchema(env);

    const rows = (await env.DB.prepare(
        `SELECT from_uid, created_at
         FROM friends
         WHERE to_uid=? AND status='pending'
         ORDER BY created_at DESC`
    ).bind(user.id).all()).results || [];

    const requests = [];
    for (const r of rows) {
        const u = await findUserById(env, r.from_uid);
        if (u) requests.push({
            id: u.id, nickname: u.nickname,
            avatar: u.avatar || null, college: u.college || '', major: u.major || '',
            at: r.created_at,
        });
    }
    return json({ requests, count: requests.length });
});

// GET /api/friends/status/:uid —— 查询我与某用户的关系态（资料卡按钮用）
route('GET', '/api/friends/status/:uid', async (req, env, p) => {
    const user = await authUser(env, req);
    if (!user) return json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401);
    await ensureFriendsSchema(env);
    const status = await friendStatus(env, user.id, p.uid);
    return json({ status, uid: p.uid });
});

// ====== 入口 ======

export default {
    async fetch(request, env, ctx) {
        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS });
        }

        const url = new URL(request.url);
        const pathname = url.pathname.replace(/\/+$/, '') || '/';

        if (!pathname.startsWith('/api/')) {
            return new Response('Not Found', { status: 404 });
        }

        // 懒迁移：首次进入 isolate 时同步执行（避免首个请求读到空 users 表）。
        // 模块级 _migratedCheckedThisIsolate 缓存 + meta.legacyMigrated 持久化标记，
        // 后续所有请求都直接跳过此 if 块（O(1) 字符串比较，不查 DB）。
        if (!_migratedCheckedThisIsolate) {
            try { await migrateLegacyDb(env); } catch (e) {
                console.error('[migrate] 失败:', e && e.message);
            }
        }

        for (const r of routes) {
            if (r.method !== request.method) continue;
            const m = pathname.match(r.rx);
            if (!m) continue;
            const params = {};
            r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
            try {
                const res = await r.handler(request, env, params);
                // 异步清理过期验证码（不阻塞响应）
                if (env.sweepPending && ctx && ctx.waitUntil) {
                    ctx.waitUntil(sweepCodes(env).catch(() => {}));
                }
                return res;
            } catch (e) {
                console.error('[worker] 错误:', e && e.message, e && e.stack);
                return json({ error: '服务器内部错误' }, 500);
            }
        }
        return json({ error: '接口不存在' }, 404);
    },
};
