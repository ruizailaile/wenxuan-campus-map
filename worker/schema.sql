-- 文轩校园地图 — D1 初始化 schema
-- ============================================================
-- 表结构说明：
--   · db        — 单行轻量 JSON（仅 overrides / deleted / custom，几 KB 量级）
--   · users     — 注册用户（行级存储；id 主键、email 唯一索引）
--   · codes     — 验证码（行级存储；type:email 为复合主键，10 分钟过期）
--   · login_fails — 登录失败计数（行级存储；email 主键）
--   · meta      — 服务元数据（key-value；secret 等不依赖用户数据的小键）
--   · lf_posts  — 失物招领（行级存储，高频独立写入）
--   · user_data — 用户云数据（行级存储，按用户隔离）
--   · messages  — 聊天消息（room + created_at 复合索引，支持 ETag 304）
-- ============================================================

-- 轻量残留 JSON（仅 overrides / deleted / custom；users/codes/loginFails/meta 已拆表）
CREATE TABLE IF NOT EXISTS db (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
);

-- 注册用户（行级；data 存单用户 JSON：passHash/salt/chatStrike/chatBanned 等）
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 验证码（行级；key 形如 'register:foo@bar.com' / 'reset:foo@bar.com'）
CREATE TABLE IF NOT EXISTS codes (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

-- 登录失败计数（行级；email 主键）
CREATE TABLE IF NOT EXISTS login_fails (
    email TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

-- 服务元数据（key-value；secret 等）
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 失物招领：一行一帖（高频独立写入，避免单文档并发覆盖）
CREATE TABLE IF NOT EXISTS lf_posts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lf_created ON lf_posts(created_at DESC);

-- 用户云数据：一行一用户（收藏 / 自定义地标 / 备注 按用户隔离）
CREATE TABLE IF NOT EXISTS user_data (
    uid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 聊天消息：私聊 + 公共大厅（room 区分：'lobby' 为大厅，否则为 'dm:<a>:<b>' 两人房间）
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    sender TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room, created_at DESC);

-- 好友关系（v3.19）：id=sort(from,to) 保证 A→B 与 B→A 命中同一行
CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    from_uid TEXT NOT NULL,
    to_uid TEXT NOT NULL,
    status TEXT NOT NULL,            -- pending / accepted / rejected
    created_at INTEGER NOT NULL,
    responded_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_friends_to ON friends(to_uid, status);    -- 收到的请求（被请求方查 pending）
CREATE INDEX IF NOT EXISTS idx_friends_from ON friends(from_uid, status); -- 发出的请求（发起方查 pending_sent）

-- 地点报错反馈（v3.21）：一行一条反馈，多字段独立列
CREATE TABLE IF NOT EXISTS poi_feedback (
    id         TEXT PRIMARY KEY,              -- 'fb_' + randomHex
    poi_id     TEXT NOT NULL,                 -- 对应地点 id
    type       TEXT NOT NULL,                 -- closed / coords / info / other
    text       TEXT NOT NULL,                 -- 备注，<=100 字
    user_id    TEXT,                          -- 提交者 uid，匿名可为 NULL
    created_at INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new'    -- new / resolved
);
CREATE INDEX IF NOT EXISTS idx_pfb_poi ON poi_feedback(poi_id, created_at DESC);
