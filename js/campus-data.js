/* ============================================
 * campus-data.js — 四川文轩职业学院遂宁校区（总平面渲染图版）
 *
 * 底图：校园总平面渲染图（1642×958，整幅映射）
 *   data_x = px * 1000/1642
 *   data_y = py * 583/958
 *   1 数据单位约等于 1 米
 *
 * 坐标标定：以环岛中心与南北两个田径场中心为锚点建立仿射，
 *   将此前逐栋核对的地点坐标整体映射到本图，并经四分区叠加逐点核对。
 *   个别建筑在新图中无对应（7号篮球场、教师工作场地），已暂缓收录。
 * ============================================ */

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 583;
const WALK_SPEED = 75;   // 步行速度 m/min

// ====== 分类配置 ======
const CATEGORIES = {
    gate:     { label: '校门',     icon: '🚪', color: '#F06292', cssClass: 'gate'     },
    teaching: { label: '教学楼',   icon: '🏢', color: '#5C6BC0', cssClass: 'teaching' },
    training: { label: '实训楼',   icon: '🛠️', color: '#3949AB', cssClass: 'training' },
    dorm:     { label: '学生宿舍', icon: '🏠', color: '#9575CD', cssClass: 'dorm'     },
    faculty:  { label: '教师宿舍', icon: '🛏️', color: '#F48FB1', cssClass: 'faculty'  },
    canteen:  { label: '食堂',     icon: '🍴', color: '#FFB74D', cssClass: 'canteen'  },
    sports:   { label: '运动场',   icon: '⚽', color: '#81C784', cssClass: 'sports'   },
    landmark: { label: '地标',     icon: '⛲', color: '#4DD0E1', cssClass: 'landmark' },
    service:  { label: '生活服务', icon: '🏪', color: '#90A4AE', cssClass: 'service'  },
    academic: { label: '学术/演艺', icon: '🎭', color: '#EF5350', cssClass: 'academic' },
};

// ====== 建筑数据 ======
const BUILDINGS = [

    { id: 'b_gate_main', name: '学院大门', category: 'gate', x: 13.4, y: 343.8,
      info: { desc: '四川文轩职业学院遂宁校区主入口，含门卫与车辆道闸。', hours: '全天', phone: '0825-8888888', floors: '—' } },
    { id: 'b_gate_vehicle', name: '车辆出入口', category: 'gate', x: 8, y: 375.5,
      info: { desc: '校园北侧车辆专用出入口，社会车辆通道。', hours: '06:00 - 22:00', phone: '—', floors: '—' } },
    { id: 'b_teach1', name: '1号教学楼', category: 'teaching', x: 94.4, y: 311.6,
      info: { desc: '靠近主入口，承担公共基础课程。', hours: '07:00 - 22:00', phone: '0825-8888201', floors: '5层' } },
    { id: 'b_teach2', name: '2号教学楼', category: 'teaching', x: 46.9, y: 325.6,
      info: { desc: '专业教学楼，配备多媒体教室。', hours: '07:00 - 22:00', phone: '0825-8888202', floors: '5层' } },
    { id: 'b_teach4', name: '4号教学楼', category: 'teaching', x: 89.5, y: 404.7,
      info: { desc: '综合教学楼，含机房和阶梯教室。', hours: '07:00 - 22:00', phone: '0825-8888204', floors: '6层' } },
    { id: 'b_teach5', name: '5号教学楼', category: 'teaching', x: 188.8, y: 292.1,
      info: { desc: '教学楼群中靠北的一栋。', hours: '07:00 - 22:00', phone: '0825-8888205', floors: '5层' } },
    { id: 'b_teach6', name: '6号教学楼', category: 'teaching', x: 137.0, y: 396.8,
      info: { desc: '靠南教学楼，靠近中央喷泉。', hours: '07:00 - 22:00', phone: '0825-8888206', floors: '5层' } },
    { id: 'b_train3', name: '3号实训楼', category: 'training', x: 143.1, y: 298.2,
      info: { desc: '实训教学场所，配套实操工坊。', hours: '07:30 - 21:30', phone: '0825-8888301', floors: '4层' } },
    { id: 'b_train8', name: '8号实训大楼', category: 'training', x: 201.0, y: 401.6,
      info: { desc: '大型实训大楼，含多种专业实训室。', hours: '07:30 - 21:30', phone: '0825-8888308', floors: '6层' } },
    { id: 'b_fountain', name: '音乐喷泉', category: 'landmark', x: 182.7, y: 374.3,
      info: { desc: '校园中心圆形地标，音乐喷泉景观，是校园打卡点。', hours: '全天观赏 / 喷泉表演周末晚间', phone: '—', floors: '—' } },
    { id: 'b_academic', name: '学术中心', category: 'academic', x: 223.5, y: 314.6,
      info: { desc: '举办学术报告、研讨会、专家讲座的场所。', hours: '08:00 - 22:00', phone: '0825-8888400', floors: '5层' } },
    { id: 'b_yanyi', name: '演艺中心', category: 'academic', x: 261.9, y: 419.9,
      info: { desc: '校园剧院，承办文艺汇演、晚会、比赛。', hours: '按活动安排', phone: '0825-8888401', floors: '3层' } },
    { id: 'b_basket_main', name: '篮球主场', category: 'sports', x: 222.3, y: 340.8,
      info: { desc: '主场篮球馆，承办校内重大篮球赛事。', hours: '07:00 - 22:00', phone: '0825-8888501', floors: '2层' } },
    { id: 'b_basket_outdoor', name: '室外篮球场', category: 'sports', x: 326.4, y: 264.1,
      info: { desc: '室外篮球场群，多片场地，免费开放。', hours: '06:00 - 22:30', phone: '—', floors: '—' } },
    { id: 'b_basket6', name: '6号篮球馆', category: 'sports', x: 560.9, y: 75.5,
      info: { desc: '6 号室内篮球馆，配套观众席。', hours: '07:00 - 22:00', phone: '0825-8888506', floors: '2层' } },
    { id: 'b_field1', name: '第一足球场', category: 'sports', x: 417.2, y: 455.8,
      info: { desc: '标准田径场 + 足球场，塑胶跑道，承办校运动会。', hours: '06:00 - 22:00', phone: '0825-8888510', floors: '—' } },
    { id: 'b_field2', name: '第二足球场', category: 'sports', x: 408.6, y: 203.9,
      info: { desc: '西北侧足球场，配套跑道和看台。', hours: '06:00 - 22:00', phone: '0825-8888511', floors: '—' } },
    { id: 'b_dorm13', name: '学生宿舍13#', category: 'dorm', x: 410.5, y: 395.6,
      info: { desc: '靠近中央喷泉，6 人间，配空调和独卫。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm15', name: '学生宿舍15#', category: 'dorm', x: 473.8, y: 395.6,
      info: { desc: '学生公寓，设施齐全。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm16', name: '学生宿舍16#', category: 'dorm', x: 534.1, y: 371.2,
      info: { desc: '学生公寓，含公共自习区。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm18', name: '学生宿舍18#', category: 'dorm', x: 551.2, y: 410.8,
      info: { desc: '学生公寓。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm23', name: '学生宿舍23#', category: 'dorm', x: 560.9, y: 110.8,
      info: { desc: '北侧学生宿舍。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm24', name: '学生宿舍24#', category: 'dorm', x: 610.8, y: 85.2,
      info: { desc: '北侧高层宿舍，配电梯和自助洗衣房。', hours: '全天', phone: '—', floors: '高层' } },
    { id: 'b_dorm35', name: '学生宿舍35#', category: 'dorm', x: 785.6, y: 237.3,
      info: { desc: '东侧新宿舍区，靠近校园边界。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm36', name: '学生宿舍36#', category: 'dorm', x: 822.2, y: 200.8,
      info: { desc: '东侧新宿舍区。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm37', name: '学生宿舍37#', category: 'dorm', x: 864.8, y: 164.3,
      info: { desc: '东侧新宿舍区。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm38', name: '学生宿舍38#', category: 'dorm', x: 907.4, y: 115.6,
      info: { desc: '东侧新宿舍区。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm1', name: '1栋宿舍', category: 'dorm', x: 606.0, y: 419.9,
      info: { desc: '南侧学生宿舍。', hours: '全天', phone: '—', floors: '6层' } },
    { id: 'b_dorm31', name: '31栋（远景规划）', category: 'dorm', x: 931.8, y: 48.7,
      info: { desc: '远景规划宿舍楼，目前为规划用地。', hours: '—', phone: '—', floors: '—' } },
    { id: 'b_faculty22', name: '教职工宿舍22#', category: 'faculty', x: 462.9, y: 60.9,
      info: { desc: '教师公寓。', hours: '—', phone: '—', floors: '6层' } },
    { id: 'b_faculty21', name: '教职工宿舍21#', category: 'faculty', x: 471.4, y: 71.8,
      info: { desc: '教师公寓，临近校医院和第三餐厅。', hours: '—', phone: '—', floors: '6层' } },
    { id: 'b_canteen1', name: '第一餐厅', category: 'canteen', x: 366.1, y: 419.9,
      info: { desc: '主食堂，提供川、粤、湘等风味餐饮。', hours: '06:30 - 21:00', phone: '0825-8888601', floors: '2层' } },
    { id: 'b_canteen2', name: '第二餐厅', category: 'canteen', x: 454.9, y: 303.1,
      info: { desc: '西北侧风味食堂，主营小吃和地方特色。', hours: '07:00 - 21:00', phone: '0825-8888602', floors: '2层' } },
    { id: 'b_canteen3', name: '第三餐厅', category: 'canteen', x: 517.7, y: 74.2,
      info: { desc: '北侧餐厅，靠近教职工宿舍。', hours: '07:00 - 21:00', phone: '0825-8888603', floors: '2层' } },
    { id: 'b_medical', name: '医务室', category: 'service', x: 606.6, y: 157.0,
      info: { desc: '校园医务室，提供基本医疗和急诊服务。', hours: '24小时急诊', phone: '0825-8888700', floors: '1层' } },
    { id: 'b_express', name: '快递服务中心', category: 'service', x: 531.7, y: 155.2,
      info: { desc: '校园快递集中收发点（菜鸟驿站等）。', hours: '09:00 - 20:00', phone: '—', floors: '1层' } },
    { id: 'b_supermarket', name: '校园超市', category: 'service', x: 572.5, y: 154.0,
      info: { desc: '校园生活超市，文具零食日用品一站式购物。', hours: '07:00 - 23:00', phone: '0825-8888701', floors: '1层' } },
    { id: 'b_parking', name: '社会停车场', category: 'service', x: 18.3, y: 389.5,
      info: { desc: '外来访客车辆停放区（位于主入口内侧）。', hours: '全天', phone: '—', floors: '—' } },
    { id: 'b_luggage', name: '行李发放点', category: 'service', x: 467.1, y: 457.6,
      info: { desc: '新生入学行李发放处，位于体育馆/运动场片区。', hours: '入学季开放', phone: '—', floors: '—' } },
    { id: 'b_water', name: '桶装水取水点', category: 'service', x: 478.1, y: 461.3,
      info: { desc: '校园桶装水集中取水点。', hours: '全天', phone: '—', floors: '—' } },
];

// ====== 道路节点（导航图顶点，随底图变换） ======
const PATH_NODES = {
    'b_gate_main': [13.4, 343.8],
    'b_gate_vehicle': [8, 375.5],
    'gate_w1': [8, 292.7],
    'gate_w2': [8, 308.8],
    'gate_w3': [64.8, 325.0],
    'gate_w4': [141.6, 337.2],
    'gate_s1': [149.9, 435.9],
    'gate_s2': [134.8, 255.3],
    'gate_n1': [131.2, 213.0],
    'gate_n2': [54.3, 200.9],
    'gate_n3': [8, 184.7],
    'fountain_c': [182.7, 374.3],
    'm1': [239.7, 450.1],
    'm2': [329.4, 464.2],
    'm3': [431.9, 480.4],
    'm4': [585.7, 504.7],
    'm5': [315.4, 297.7],
    'm6': [346.7, 219.2],
    'm7': [365.2, 138.5],
    'dorm_e1': [720.7, 306.0],
    'dorm_e2': [823.2, 322.2],
    'dorm_e3': [868.8, 412.9],
    'dorm_e4': [872.4, 455.2],
    'dorm_e5': [879.5, 539.9],
    'dorm_e6': [731.4, 433.0],
    'n_faculty_1': [452.3, 8],
    'n_faculty_2': [548.4, 8],
    'n_faculty_3': [464.2, 112.4],
    'n_faculty_4': [560.3, 127.6],
    'n_court_6': [610.3, 44.9],
    'far_e1': [779.1, 398.8],
    'far_e2': [787.4, 497.5],


    // 建筑 POI 本身即路网节点（坐标与 BUILDINGS 一致）
    ...Object.fromEntries(BUILDINGS.filter(b => !['b_gate_main', 'b_gate_vehicle'].includes(b.id))
        .map(b => [b.id, [b.x, b.y]])),
};

// ====== 道路连线 ======
const PATH_EDGES = [
    ['b_gate_main', 'b_gate_vehicle'],
    ['b_gate_main', 'gate_w1'],
    ['b_gate_vehicle', 'b_gate_main'],
    ['gate_w1', 'gate_w2'],
    ['gate_w2', 'gate_w3'],
    ['gate_w3', 'gate_w4'],
    ['gate_w4', 'gate_s1'],
    ['gate_s1', 'm1'],
    ['gate_w4', 'gate_s2'],
    ['gate_s2', 'gate_n1'],
    ['gate_n1', 'gate_n2'],
    ['gate_n2', 'gate_n3'],
    ['gate_n3', 'gate_w3'],
    ['b_teach1', 'gate_n3'],
    ['b_fountain', 'gate_w4'],
    ['b_fountain', 'gate_s2'],
    ['b_fountain', 'gate_n2'],
    ['m1', 'm2'],
    ['m2', 'm3'],
    ['m3', 'm4'],
    ['gate_w2', 'm5'],
    ['m5', 'm6'],
    ['m6', 'm7'],
    ['m5', 'm2'],
    ['m6', 'm3'],
    ['m7', 'n_faculty_4'],
    ['n_faculty_1', 'n_faculty_2'],
    ['n_faculty_2', 'n_faculty_4'],
    ['n_faculty_4', 'n_faculty_3'],
    ['n_faculty_3', 'n_faculty_1'],
    ['n_faculty_2', 'b_canteen3'],
    ['n_faculty_3', 'b_faculty22'],
    ['n_faculty_2', 'n_court_6'],
    ['n_court_6', 'b_basket6'],
    ['n_court_6', 'dorm_e1'],
    ['dorm_e1', 'dorm_e2'],
    ['dorm_e2', 'dorm_e3'],
    ['dorm_e3', 'dorm_e4'],
    ['dorm_e2', 'dorm_e6'],
    ['dorm_e6', 'dorm_e5'],
    ['dorm_e5', 'dorm_e1'],
    ['dorm_e4', 'm4'],
    ['dorm_e3', 'far_e1'],
    ['far_e1', 'far_e2'],
    ['far_e2', 'dorm_e5'],
    ['b_teach2', 'gate_w2'],
    ['b_teach4', 'gate_w3'],
    ['b_teach5', 'gate_n2'],
    ['b_teach6', 'gate_w4'],
    ['b_train3', 'gate_n2'],
    ['b_train8', 'gate_w4'],
    ['b_academic', 'gate_s2'],
    ['b_yanyi', 'gate_s1'],
    ['b_basket_main', 'gate_n1'],
    ['b_basket_outdoor', 'gate_n1'],
    ['b_basket6', 'n_court_6'],
    ['b_field1', 'm2'],
    ['b_field2', 'gate_n1'],
    ['b_dorm13', 'm1'],
    ['b_dorm15', 'm2'],
    ['b_dorm16', 'm3'],
    ['b_dorm18', 'm3'],
    ['b_dorm23', 'far_e1'],
    ['b_dorm24', 'n_faculty_4'],
    ['b_dorm35', 'dorm_e4'],
    ['b_dorm36', 'dorm_e4'],
    ['b_dorm37', 'dorm_e4'],
    ['b_dorm38', 'dorm_e4'],
    ['b_dorm27', 'm5'],
    ['b_dorm1', 'm5'],
    ['b_dorm31', 'dorm_e3'],
    ['b_dorm32', 'far_e2'],
    ['b_dorm33', 'far_e1'],
    ['b_faculty21', 'n_faculty_1'],
    ['b_faculty22', 'n_faculty_3'],
    ['b_canteen1', 'm1'],
    ['b_canteen2', 'm6'],
    ['b_canteen3', 'n_faculty_2'],
    ['b_medical', 'n_faculty_4'],
    ['b_express', 'n_court_6'],
    ['b_supermarket', 'n_court_6'],
    ['b_parking', 'gate_w3'],
    ['b_gym', 'm3'],
    ['b_physique', 'm3'],
    ['b_sports_office', 'm2'],
    ['b_luggage', 'm2'],
    ['b_water', 'm3'],
    ['b_office27', 'b_water'],
    ['b_park_fac', 'b_office27'],
    ['b_wc3', 'b_office27'],
    ['b_canteen4', 'b_wc3'],
    ['b_dorm29', 'b_canteen4'],
    ['b_reception', 'm4'],
];

// ====== 高德导航：平面坐标 → GCJ-02 经纬度 ======
// 锚点：学院大门 b_gate_main(13.4, 343.8) ↔ 腾讯/高德 POI「四川文轩职业学院(遂宁校区)」
//   (105.244254, 30.611013)（GCJ-02 火星坐标，高德可直接使用）
// 比例：1 数据单位 ≈ 1 米（见文件头注释）。校内楼栋为近似坐标，校门精确。
const GEO_ANCHOR = { px: 13.4, py: 343.8, lng: 105.244254, lat: 30.611013 };
const GEO_M_PER_UNIT = 1.0;

function toGeo(x, y) {
    const mPerLng = 111320 * Math.cos(GEO_ANCHOR.lat * Math.PI / 180);   // 30.61°N 经度 1°≈95.77km
    const mPerLat = 110940;                                              // 纬度 1°≈110.94km
    const lng = GEO_ANCHOR.lng + (x - GEO_ANCHOR.px) * GEO_M_PER_UNIT / mPerLng;
    const lat = GEO_ANCHOR.lat + (GEO_ANCHOR.py - y) * GEO_M_PER_UNIT / mPerLat;   // y 向南为正
    return { lng: +lng.toFixed(6), lat: +lat.toFixed(6) };
}

/** 拉起高德步行导航到指定校园地点（URI API，免费、无需 key；装了高德 App 会直接拉起） */
function amapNavUrl(b) {
    const g = toGeo(b.x, b.y);
    const name = encodeURIComponent('文轩遂宁校区·' + b.name);
    return `https://uri.amap.com/navigation?to=${g.lng},${g.lat},${name}&mode=walk&coordinate=gaode&callnative=1&src=wenxuan.campusmap`;
}
