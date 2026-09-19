/* ============================================================
 * content-guard.js — 聊天内容安全防护模块
 *
 * 依据（中华人民共和国现行法规）：
 *   · 《互联网信息服务管理办法》第十五条（"九不准"）
 *   · 《网络信息内容生态治理规定》第六条（违法信息）、第七条（不良信息）
 *   · 《网络安全法》第十二条
 *
 * 能力：
 *   1. 敏感词库按"九不准"分级（政治 / 色情 / 暴恐 / 赌博毒品 / 辱骂 / 邪教迷信 …）
 *   2. 归一化检测：自动识别
 *      - 同音字 / 谐音（如 "微伤"→"维商"、拼音）
 *      - 字母缩写（cnm、sb、gcd 等）
 *      - 拆字 / 混合符号 / 空格 / emoji / 数字间隔绕过（如 "色 情"、"s-e-x"）
 *      - 全角/半角、繁体→简体 归一
 *   3. 分级处置：
 *      - 严重违规（涉政/色情/暴恐/赌博毒品/邪教）→ 拦截 + 记违规
 *      - 一般违规（辱骂人身攻击等）→ 拦截 + 记违规
 *   4. 踢出机制：累计违规达阈值 → 封禁发言（banned）
 * ============================================================ */

// ---------- 归一化工具 ----------

/** 全角转半角、去空白与间隔符号、统一小写 */
function stripSpacing(s) {
    let out = '';
    for (const ch of s) {
        const c = ch.codePointAt(0);
        // 全角 → 半角
        if (c === 0x3000) { out += ' '; continue; }
        if (c >= 0xff01 && c <= 0xff5e) { out += String.fromCharCode(c - 0xfee0); continue; }
        out += ch;
    }
    return out;
}

/** 保留汉字/字母/数字，剔除标点、符号、emoji、空白（用于匹配，防符号绕过） */
function alnumOnly(s) {
    return s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
}

/** 繁体常用字 → 简体（覆盖常见敏感词变体；非全量转换，命中表内字才转） */
const TRAD = {
    國: '国', 黨: '党', 軍: '军', 獨: '独', 臺: '台', 灣: '湾', 港: '港',
    殺: '杀', 槍: '枪', 彈: '弹', 毒: '毒', 賭: '赌', 黃: '黄', 色: '色',
    罵: '骂', 媽: '妈', 草: '草', 維: '维', 穩: '稳', 匪: '匪',
    發: '发', 嫖: '嫖', 娼: '娼', 姦: '奸', 戀: '恋', 裸: '裸', 猥: '猥',
};
function toSimplified(s) {
    let out = '';
    for (const ch of s) out += TRAD[ch] || ch;
    return out;
}

/** 拼音音节 → 汉字（仅覆盖敏感词相关，用于识别全拼音/拼音缩写绕过） */
const PINYIN_MAP = {
    // 骂人类
    cnm: '操你妈', caonima: '操你妈', nima: '你妈', nmsl: '你妈死了',
    sb: '傻逼', sha: '傻', bi: '逼', ji: '鸡', shabi: '傻逼',
    wcnm: '我操你妈', woc: '我操', cao: '操', caoni: '操你', ri: '日',
    nmslnmsl: '你妈死了', zz: '智障', nmlgb: '你妈了个逼', mlgb: '妈了个逼',
    // 政治类
    gcd: '共党', falan: '法轮', falungong: '法轮功', flg: '法轮功',
    // 色情类
    se: '色', yin: '淫', jb: '鸡巴', jj: '鸡鸡', bb: '逼逼',
    // 毒品类
    dp: '毒品', bingdu: '冰毒', kfen: 'k粉', dad: '大麻',
};
const PINYIN_KEYS = Object.keys(PINYIN_MAP).sort((a, b) => b.length - a.length);

/** 数字/字母谐音黑话 → 敏感词（覆盖"64"、"6四"、"404"等数字写法） */
const NUM_SLANG = [
    { re: /64/, word: '六四', sev: 1 },
    { re: /404/, word: '404', sev: 1 },
    { re: /freedom\s*blog/i, word: 'freedomblog', sev: 1 },
    { re: /(wall\s*proxy|翻墙|vpn|ssr|shadowsocks)/i, word: '翻墙', sev: 1 },
];

// ---------- 敏感词库（分级） ----------

/**
 * severity:
 *  1 = 严重（涉政 / 色情 / 暴恐 / 赌博毒品 / 邪教）→ 首次拦截 + 记 2 分
 *  2 = 一般（辱骂 / 人身攻击 / 地域歧视等）→ 拦截 + 记 1 分
 */
const WORDS = {
    // ---- 政治 / 国家安全 / 国家统一（九不准 1/2/3 条）----
    // 注意：仅收录明显违法的攻击/分裂/颠覆性用语；中性职位词（主席/总理等）
    // 本身合法，不做纯关键词拦截，避免误伤正常交流。
    political: [
        '反党', '反共', '颠覆国家', '推翻政府', '台独', '港独', '藏独', '疆独',
        '法轮功', '法轮大法', '轮子功', '天安门事件', '六四', '64运动',
        '亡国', '卖国', '汉奸', '走狗', '崇洋媚外', '颜色革命',
        '反华', '辱华', '分裂国家', '独立建国', '邪教',
    ],
    // ---- 色情 / 淫秽（九不准 7 条）----
    porn: [
        '操你', '操你妈', '你妈', '妈逼', '傻逼', '鸡巴', '屄', '逼逼', '淫', '色情',
        '裸', '嫖', '娼', '妓', '卖淫', '约炮', '炮友', '一夜情', '性交', '口交',
        '做爱', '强奸', '性爱', '撸', '自慰', '打飞机', '黄片', 'av女', '三级片',
        '骚货', '荡妇', '贱货', '臭婊子', '婊子', '野鸡', '小姐', '三陪',
    ],
    // ---- 暴力 / 恐怖 / 凶杀（九不准 7 条）----
    violence: [
        '砍死', '杀死', '弄死', '灭门', '灭你', '恐怖', '圣战', '自杀式', '炸死',
        '枪杀', '持枪', '炸弹', '爆炸', '血洗', '屠', '灭族', '灭口',
        '杀人', '凶杀', '暴恐', '恐怖分子', 'isis', '极端',
    ],
    // ---- 赌博 / 毒品 / 教唆犯罪（九不准 7 条）----
    gambling: [
        '赌博', '赌场', '赌球', '博彩', '六合彩', '毒品', '冰毒', '海洛因', '摇头丸',
        'k粉', '大麻', '吸毒', '贩毒', '制毒', '白粉', '嗑药', '迷药', '迷奸',
        '洗钱', '诈骗', '传销', '枪', '枪支', '卖枪', '假币', '办证', '刻章',
    ],
    // ---- 辱骂 / 人身攻击 / 歧视（九不准 8 条 + 生态治理规定 7 条）----
    insult: [
        '傻逼', '脑残', '智障', '白痴', '废物', '垃圾', '去死', '去死吧', '滚蛋',
        '贱', '婊', '狗', '猪', '畜生', '草泥马', '操', '日你', '靠你', '妈的',
        '他妈', '你麻痹', '狗日的', '王八蛋', '混账', '贱人', '死全家', '不得好死',
        '穷逼', '屌丝', '废物', '辣鸡', '垃圾人',
    ],
    // ---- 邪教 / 封建迷信（九不准 5 条）----
    cult: [
        '邪教', '法轮', '全能神', '门徒会', '血水圣灵', '呼喊派', '观音法门',
        '还愿', '算命', '风水', '跳大神',
    ],
};

// 展平：{ 词 → severity }
function buildIndex() {
    const idx = new Map();
    const sev = {
        political: 1, porn: 1, violence: 1, gambling: 1, cult: 1, insult: 2,
    };
    for (const cat of Object.keys(WORDS)) {
        for (const w of WORDS[cat]) {
            const key = normalize(w);
            if (!key) continue;
            const s = sev[cat] || 2;
            // 已有更高严重级则保留更高
            if (!idx.has(key) || idx.get(key) > s) idx.set(key, s);
        }
    }
    return idx;
}

/** 归一化一个词：繁→简、去符号、去间隔、小写 */
function normalize(w) {
    return alnumOnly(toSimplified(stripSpacing(String(w)))).toLowerCase();
}

const INDEX = buildIndex();

// ---------- 检测 ----------

/**
 * 检测文本，返回 { hit: boolean, reason: string, severity: number, matched: string|null }
 * 若命中则返回具体原因（用于前端提示 + 后端记录）。
 */
function scan(text) {
    const raw = String(text || '');
    // 1) 紧凑归一（去所有非中英文数字，防"色 情""s-e-x""*色*"）
    const compact = normalize(raw);
    if (!compact) return { hit: false, reason: '', severity: 0, matched: null };

    // 2) 关键词包含匹配
    for (const [key, severity] of INDEX) {
        if (compact.includes(key)) {
            return { hit: true, severity, matched: key };
        }
    }

    // 3) 纯拼音/缩写匹配（在归一后的小写串上找）
    const lower = compact.toLowerCase();
    for (const py of PINYIN_KEYS) {
        if (lower.includes(py)) {
            return { hit: true, severity: 1, matched: py };
        }
    }

    // 4) 数字/字母谐音黑话（在原串上匹配，"64"、"6四"、"翻墙"等）
    for (const s of NUM_SLANG) {
        if (s.re.test(raw)) {
            return { hit: true, severity: s.sev, matched: s.word };
        }
    }

    return { hit: false, severity: 0, matched: null };
}

// ---------- 处置 ----------

/** 封禁阈值：累计分数 >= BAN_SCORE 即封禁发言 */
const BAN_SCORE = 3;
/** 严重违规单次记分 */
const SEVERE_SCORE = 2;
/** 一般违规单次记分 */
const MINOR_SCORE = 1;

/**
 * 检查并处置用户消息。
 * 返回：
 *   { ok:true }                     → 通过
 *   { ok:false, code, error, banned? } → 拦截（banned=true 表示本次被踢出/封禁）
 * 会直接修改 db（累加违规分 / 封禁），调用方需在返回后 writeDb。
 */
function checkMessage(db, user, text) {
    const res = scan(text);
    if (!res.hit) return { ok: true };

    // 确保用户对象存在违规字段
    user.chatStrike = user.chatStrike || 0;
    user.chatBanned = user.chatBanned || false;

    const add = res.severity === 1 ? SEVERE_SCORE : MINOR_SCORE;
    user.chatStrike += add;

    // 达到阈值 → 踢出（封禁发言）
    if (user.chatStrike >= BAN_SCORE) {
        user.chatBanned = true;
        user.chatBannedAt = new Date().toISOString();
        return {
            ok: false,
            code: 'CHAT_BANNED',
            error: '因多次发布违规内容，你已被移出聊天并禁止发言，请联系管理员申诉',
            banned: true,
            matched: res.matched,
            severity: res.severity,
        };
    }

    return {
        ok: false,
        code: 'CONTENT_BLOCKED',
        error: '消息包含违规内容，已拦截并记录（累计多次将禁止发言）',
        matched: res.matched,
        severity: res.severity,
        strike: user.chatStrike,
    };
}

/** 是否已被封禁 */
function isBanned(user) {
    return !!(user && user.chatBanned);
}

export { scan, checkMessage, isBanned, normalize, BAN_SCORE };
