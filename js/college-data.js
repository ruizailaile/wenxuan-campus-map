/* ============================================================
 * college-data.js — 四川文轩职业学院 遂宁校区 院系·专业 数据
 *
 * 用于注册/完善资料的「年级 + 学院 + 专业」固定选择，
 * 防止用户乱填。学院为二级学院，专业随学院联动。
 * 数据来源：学校官网 / 招生信息（截至 2026 年）。
 * ============================================================ */

const WENXUAN = {
    // 学校固定名
    school: '四川文轩职业学院',

    // 年级（入学年份，固定选项；当前仅 2026～2024 三个年级）
    grades: ['2026级', '2025级', '2024级'],

    // 学院 → 专业（联动）
    colleges: [
        {
            name: '教育学院',
            majors: ['学前教育', '早期教育', '中文'],
        },
        {
            name: '体育学院',
            majors: ['运动训练', '社会体育'],
        },
        {
            name: '护理一院',
            majors: ['护理'],
        },
        {
            name: '护理二院',
            majors: ['护理'],
        },
        {
            name: '健康学院',
            majors: [
                '口腔医学技术', '康复治疗技术', '药学', '中药学', '应急救援技术',
                '智慧健康养老服务与管理', '智慧健康养老服务与管理（高级养老机构老年照护）',
                '智慧健康养老服务与管理（老年养生服务）',
            ],
        },
        {
            name: '管理学院',
            majors: [
                '民航运输服务', '财税大数据应用', '空中乘务', '高速铁路客运服务',
                '大数据与会计', '金融服务与管理', '电子商务', '市场营销',
                '智能物流技术', '旅游管理',
            ],
        },
        {
            name: '城市学院',
            majors: [
                '智能建造技术', '建筑设计', '建筑设计（装饰装潢）', '建筑工程技术',
            ],
        },
        {
            name: '智能制造学院',
            majors: [
                '机械制造及自动化', '数控技术', '工业机器人技术', '无人机应用技术',
                '应用电子技术', '电子信息工程技术',
            ],
        },
        {
            name: '汽车学院',
            majors: [
                '新能源汽车技术', '智能网联汽车技术', '汽车技术服务与营销',
                '汽车检测与维修技术',
            ],
        },
        {
            name: '传媒学院',
            majors: [
                '融媒体技术与运营', '艺术设计', '网络直播与运营', '游戏艺术设计',
            ],
        },
        {
            name: '计算机学院',
            majors: [
                '智能技术', '大数据技术', '计算机应用技术', '计算机网络技术',
                '数字媒体技术', '物联网应用技术', '动漫制作技术', '人工智能技术应用',
            ],
        },
    ],

    /** 根据学院名取专业列表 */
    majorsOf(college) {
        const c = this.colleges.find(x => x.name === college);
        return c ? c.majors : [];
    },

    /** 校验年级/学院/专业是否在合法范围内 */
    valid(grade, college, major) {
        if (!grade || !this.grades.includes(grade)) return false;
        if (!college || !this.colleges.some(c => c.name === college)) return false;
        if (!major) return false;
        return this.majorsOf(college).includes(major);
    },
};

// 浏览器环境显式挂到 window：顶层 const 不会自动成为 window 属性，
// 而 auth.js 等消费方通过 window.WENXUAN 读取（缺失会导致下拉为空、无法选择）
if (typeof window !== 'undefined') window.WENXUAN = WENXUAN;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WENXUAN;
}
