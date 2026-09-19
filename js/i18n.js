/* ============================================================
 * i18n.js — 多语言支持（10 种语言）
 *
 * 默认简体中文（zh-CN），其余：英语(en)、繁体中文(zh-TW)、日语(ja)、
 * 韩语(ko)、泰语(th)、越南语(vi)、马来语(ms)、印尼语(id)、菲律宾语(fil)。
 *
 * 用法：
 *   - 静态 HTML 文案：加 data-i18n="key" 属性，启动时自动替换 textContent；
 *     需要保留子元素结构的地方用 data-i18n-html 或占位符 {{...}}。
 *   - 动态 JS 文案：调用 I18N.t('key') 或 I18N.t('key', {a:1})。
 *   - 地点名/描述：I18N.poi(id) / I18N.poiDesc(id) / I18N.cat(key)。
 *
 * 语言持久化到 localStorage（key: wenxuan_lang），切换后自动刷新界面。
 * ============================================================ */

(function () {
    'use strict';

    // ====== 地点名称 + 描述（10 语言） ======
    // 结构：{ zh: 名称, en: 名称, ... , _desc: { zh, en, ... } }
    const POI = {
        'b_gate_main': {
            zh: '学院大门', en: 'Main Gate', tw: '學院大門', ja: '学院正門', ko: '정문',
            th: 'ประตูหลัก', vi: 'Cổng chính', ms: 'Pintu Utama', id: 'Gerbang Utama', fil: 'Pangunahing Tarangkahan',
            _desc: {
                zh: '四川文轩职业学院遂宁校区主入口，含门卫与车辆道闸。',
                en: 'Main entrance of the Suining campus, with security post and vehicle barrier.',
                tw: '四川文軒職業學院遂寧校區主入口，含門衛與車輛道閘。', ja: '遂寧キャンパスの正門。守衛所と車両ゲートを備える。',
                ko: '쑤이닝 캠퍼스 정문. 경비초소와 차량 차단기가 있습니다.', th: 'ทางเข้าหลักของวิทยาเขตซุยหนิง มีป้อมยามและไม้กั้นรถ',
                vi: 'Cổng chính khu Suining, có chốt bảo vệ và barie xe.', ms: 'Pintu masuk utama kampus Suining, dengan pos pengawal dan palang kenderaan.',
                id: 'Gerbang utama kampus Suining, dengan pos jaga dan palang kendaraan.', fil: 'Pangunahing pasukan ng Suining campus, may guwardya at harang ng sasakyan.',
            },
        },
        'b_gate_vehicle': {
            zh: '车辆出入口', en: 'Vehicle Entrance', tw: '車輛出入口', ja: '車両出入口', ko: '차량 출입구',
            th: 'ทางเข้ารถยนต์', vi: 'Cổng xe', ms: 'Pintu Masuk Kenderaan', id: 'Pintu Masuk Kendaraan', fil: 'Pasukan ng Sasakyan',
            _desc: {
                zh: '校园北侧车辆专用出入口，社会车辆通道。',
                en: 'Vehicle-only entrance on the north side of campus.',
                tw: '校園北側車輛專用出入口，社會車輛通道。', ja: 'キャンパス北側の車両専用出入口。',
                ko: '캠퍼스 북쪽 차량 전용 출입구입니다.', th: 'ทางเข้ารถยนต์เฉพาะด้านเหนือของวิทยาเขต',
                vi: 'Cổng xe riêng phía bắc khuôn viên.', ms: 'Pintu khas kenderaan di sebelah utara kampus.',
                id: 'Pintu khusus kendaraan di sisi utara kampus.', fil: 'Pasukan para sa sasakyan sa hilagang bahagi ng campus.',
            },
        },
        'b_teach1': {
            zh: '1号教学楼', en: 'Teaching Building 1', tw: '1號教學樓', ja: '1号教学棟', ko: '1호 교학동',
            th: 'อาคารเรียน 1', vi: 'Nhà giảng dạy 1', ms: 'Bangunan Kuliah 1', id: 'Gedung Kuliah 1', fil: 'Gusaling Pampagtuturo 1',
            _desc: {
                zh: '靠近主入口，承担公共基础课程。',
                en: 'Near the main entrance; hosts general foundation courses.',
                tw: '靠近主入口，承擔公共基礎課程。', ja: '正門近く。共通基礎科目を担当。',
                ko: '정문 근처. 공통 기초 교과를 담당합니다.', th: 'ใกล้ทางเข้าหลัก ใช้สอนวิชาพื้นฐานทั่วไป',
                vi: 'Gần cổng chính, phụ trách các môn cơ bản.', ms: 'Berhampiran pintu utama, menempatkan kursus asas am.',
                id: 'Dekat gerbang utama, menampung mata kuliah dasar.', fil: 'Malapit sa pangunahing pasukan; dito ginaganap ang mga batayang kurso.',
            },
        },
        'b_teach2': {
            zh: '2号教学楼', en: 'Teaching Building 2', tw: '2號教學樓', ja: '2号教学棟', ko: '2호 교학동',
            th: 'อาคารเรียน 2', vi: 'Nhà giảng dạy 2', ms: 'Bangunan Kuliah 2', id: 'Gedung Kuliah 2', fil: 'Gusaling Pampagtuturo 2',
            _desc: {
                zh: '专业教学楼，配备多媒体教室。',
                en: 'Specialty teaching building with multimedia classrooms.',
                tw: '專業教學樓，配備多媒體教室。', ja: '専門教育棟。マルチメディア教室を備える。',
                ko: '전공 교학동으로 멀티미디어 교실을 갖추고 있습니다.', th: 'อาคารเรียนเฉพาะทาง มีห้องเรียนมัลติมีเดีย',
                vi: 'Nhà giảng dạy chuyên ngành, có phòng học đa phương tiện.', ms: 'Bangunan kuliah khusus dengan bilik multimedia.',
                id: 'Gedung kuliah khusus dengan ruang multimedia.', fil: 'Gusaling pampagtuturo para sa espesyalidad na may silid multimedia.',
            },
        },
        'b_teach4': {
            zh: '4号教学楼', en: 'Teaching Building 4', tw: '4號教學樓', ja: '4号教学棟', ko: '4호 교학동',
            th: 'อาคารเรียน 4', vi: 'Nhà giảng dạy 4', ms: 'Bangunan Kuliah 4', id: 'Gedung Kuliah 4', fil: 'Gusaling Pampagtuturo 4',
            _desc: {
                zh: '综合教学楼，含机房和阶梯教室。',
                en: 'Comprehensive teaching building with computer labs and lecture halls.',
                tw: '綜合教學樓，含機房和階梯教室。', ja: '総合教育棟。コンピュータ室と階段教室を含む。',
                ko: '종합 교학동으로 컴퓨터실과 계단식 강의실이 있습니다.', th: 'อาคารเรียนรวม มีห้องคอมพิวเตอร์และห้องบรรยาย',
                vi: 'Nhà giảng dạy tổng hợp, có phòng máy và giảng đường.', ms: 'Bangunan kuliah komprehensif dengan makmal komputer dan dewan kuliah.',
                id: 'Gedung kuliah lengkap dengan lab komputer dan ruang kuliah bertingkat.', fil: 'Komprehensibong gusaling pampagtuturo na may computer lab at lecture hall.',
            },
        },
        'b_teach5': {
            zh: '5号教学楼', en: 'Teaching Building 5', tw: '5號教學樓', ja: '5号教学棟', ko: '5호 교학동',
            th: 'อาคารเรียน 5', vi: 'Nhà giảng dạy 5', ms: 'Bangunan Kuliah 5', id: 'Gedung Kuliah 5', fil: 'Gusaling Pampagtuturo 5',
            _desc: {
                zh: '教学楼群中靠北的一栋。',
                en: 'One of the northern teaching buildings.',
                tw: '教學樓群中靠北的一棟。', ja: '教育棟群の北寄りの一棟。',
                ko: '교학동 군 중 북쪽에 있는 건물입니다.', th: 'อาคารหนึ่งในกลุ่มอาคารเรียนด้านเหนือ',
                vi: 'Một trong các nhà giảng dạy phía bắc.', ms: 'Salah satu bangunan kuliah di bahagian utara.',
                id: 'Salah satu gedung kuliah di sisi utara.', fil: 'Isa sa mga gusaling pampagtuturo sa hilaga.',
            },
        },
        'b_teach6': {
            zh: '6号教学楼', en: 'Teaching Building 6', tw: '6號教學樓', ja: '6号教学棟', ko: '6호 교학동',
            th: 'อาคารเรียน 6', vi: 'Nhà giảng dạy 6', ms: 'Bangunan Kuliah 6', id: 'Gedung Kuliah 6', fil: 'Gusaling Pampagtuturo 6',
            _desc: {
                zh: '靠南教学楼，靠近中央喷泉。',
                en: 'Southern teaching building, near the central fountain.',
                tw: '靠南教學樓，靠近中央噴泉。', ja: '南側の教育棟。中央噴水の近く。',
                ko: '남쪽 교학동으로 중앙 분수 근처에 있습니다.', th: 'อาคารเรียนด้านใต้ ใกล้กับน้ำพุกลาง',
                vi: 'Nhà giảng dạy phía nam, gần đài phun nước trung tâm.', ms: 'Bangunan kuliah di selatan, berhampiran air pancut tengah.',
                id: 'Gedung kuliah sisi selatan, dekat air mancur pusat.', fil: 'Gusaling pampagtuturo sa timog, malapit sa gitnang fountain.',
            },
        },
        'b_train3': {
            zh: '3号实训楼', en: 'Training Building 3', tw: '3號實訓樓', ja: '3号実訓棟', ko: '3호 실습동',
            th: 'อาคารฝึกปฏิบัติ 3', vi: 'Nhà thực hành 3', ms: 'Bangunan Latihan 3', id: 'Gedung Praktik 3', fil: 'Gusaling Praktikal 3',
            _desc: {
                zh: '实训教学场所，配套实操工坊。',
                en: 'Practical training venue with hands-on workshops.',
                tw: '實訓教學場所，配套實操工坊。', ja: '実習教育の場。実技ワークショップを併設。',
                ko: '실습 교육 장소로 실기 워크숍을 갖추고 있습니다.', th: 'สถานที่ฝึกปฏิบัติ พร้อมเวิร์กช็อป',
                vi: 'Nơi thực hành, có xưởng thực tập.', ms: 'Tempat latihan praktikal dengan bengkel.',
                id: 'Tempat praktik dengan bengkel kerja.', fil: 'Lugar ng praktikal na pagsasanay na may workshop.',
            },
        },
        'b_train8': {
            zh: '8号实训大楼', en: 'Training Building 8', tw: '8號實訓大樓', ja: '8号実訓大楼', ko: '8호 실습빌딩',
            th: 'อาคารฝึกปฏิบัติ 8', vi: 'Nhà thực hành 8', ms: 'Bangunan Latihan 8', id: 'Gedung Praktik 8', fil: 'Gusaling Praktikal 8',
            _desc: {
                zh: '大型实训大楼，含多种专业实训室。',
                en: 'Large training building with various specialty labs.',
                tw: '大型實訓大樓，含多種專業實訓室。', ja: '大型実訓ビル。多様な専門実習室を含む。',
                ko: '대형 실습 빌딩으로 다양한 전공 실습실이 있습니다.', th: 'อาคารฝึกปฏิบัติขนาดใหญ่ มีห้องปฏิบัติการหลายสาขา',
                vi: 'Nhà thực hành lớn với nhiều phòng thí nghiệm chuyên ngành.', ms: 'Bangunan latihan besar dengan pelbagai makmal khusus.',
                id: 'Gedung praktik besar dengan berbagai lab khusus.', fil: 'Malaking gusaling praktikal na may iba\'t ibang lab.',
            },
        },
        'b_fountain': {
            zh: '音乐喷泉', en: 'Music Fountain', tw: '音樂噴泉', ja: '音楽噴水', ko: '음악 분수',
            th: 'น้ำพุดนตรี', vi: 'Đài phun nhạc nước', ms: 'Air Pancut Muzik', id: 'Air Mancur Musik', fil: 'Musical Fountain',
            _desc: {
                zh: '校园中心圆形地标，音乐喷泉景观，是校园打卡点。',
                en: 'Round central landmark with musical fountain; a campus photo spot.',
                tw: '校園中心圓形地標，音樂噴泉景觀，是校園打卡點。', ja: 'キャンパス中央の円形ランドマーク。音楽噴水があり、人気の撮影スポット。',
                ko: '캠퍼스 중앙의 원형 랜드마크로 음악 분수가 있는 인기 사진 명소입니다.', th: 'แลนด์มาร์กทรงกลมกลางวิทยาเขต มีน้ำพุดนตรี เป็นจุดถ่ายรูป',
                vi: 'Điểm nhấn tròn ở trung tâm, có đài phun nhạc nước, là điểm chụp ảnh.', ms: 'Mercu tanda bulat di tengah kampus dengan air pancut muzik.',
                id: 'Landmark bulat di pusat kampus dengan air mancur musik.', fil: 'Bilog na landmark sa gitna na may musical fountain; paboritong lugar ng litrato.',
            },
        },
        'b_academic': {
            zh: '学术中心', en: 'Academic Center', tw: '學術中心', ja: '学術センター', ko: '학술센터',
            th: 'ศูนย์วิชาการ', vi: 'Trung tâm học thuật', ms: 'Pusat Akademik', id: 'Pusat Akademik', fil: 'Sentrong Akademiko',
            _desc: {
                zh: '举办学术报告、研讨会、专家讲座的场所。',
                en: 'Venue for academic reports, seminars and expert lectures.',
                tw: '舉辦學術報告、研討會、專家講座的場所。', ja: '学術報告・セミナー・専門家講演を開催する場。',
                ko: '학술 보고, 세미나, 전문가 강연이 열리는 장소입니다.', th: 'สถานที่จัดรายงานวิชาการ สัมมนา และบรรยายจากผู้เชี่ยวชาญ',
                vi: 'Nơi tổ chức báo cáo học thuật, hội thảo, bài giảng chuyên gia.', ms: 'Tempat laporan akademik, seminar dan ceramah pakar.',
                id: 'Tempat laporan akademik, seminar, dan kuliah pakar.', fil: 'Lugar ng akademikong ulat, seminar at lektyur ng eksperto.',
            },
        },
        'b_yanyi': {
            zh: '演艺中心', en: 'Performance Center', tw: '演藝中心', ja: '演芸センター', ko: '공연센터',
            th: 'ศูนย์การแสดง', vi: 'Trung tâm biểu diễn', ms: 'Pusat Persembahan', id: 'Pusat Pertunjukan', fil: 'Sentrong Pagtatanghal',
            _desc: {
                zh: '校园剧院，承办文艺汇演、晚会、比赛。',
                en: 'Campus theater for cultural shows, galas and competitions.',
                tw: '校園劇院，承辦文藝匯演、晚會、比賽。', ja: 'キャンパス劇場。文芸公演・パーティー・大会を開催。',
                ko: '캠퍼스 극장으로 문예 공연, 축제, 대회가 열립니다.', th: 'โรงละครของวิทยาเขต จัดงานแสดง งานเลี้ยง และการแข่งขัน',
                vi: 'Nhà hát của trường, tổ chức văn nghệ, dạ hội, thi đấu.', ms: 'Teater kampus untuk persembahan budaya, gala dan pertandingan.',
                id: 'Teater kampus untuk pentas seni, gala, dan lomba.', fil: 'Teatro ng campus para sa mga palatuntunan at kompetisyon.',
            },
        },
        'b_basket_main': {
            zh: '篮球主场', en: 'Main Basketball Gym', tw: '籃球主場', ja: 'バスケットメインコート', ko: '농구 메인코트',
            th: 'สนามบาสเกตบอลหลัก', vi: 'Nhà thi đấu bóng rổ chính', ms: 'Gimnasium Bola Keranjang Utama', id: 'GOR Basket Utama', fil: 'Pangunahing Basketball Gym',
            _desc: {
                zh: '主场篮球馆，承办校内重大篮球赛事。',
                en: 'Main basketball gym hosting major campus tournaments.',
                tw: '主場籃球館，承辦校內重大籃球賽事。', ja: 'メインバスケットコート。学内の主要大会を開催。',
                ko: '메인 농구장으로 교내 주요 대회가 열립니다.', th: 'สนามบาสหลัก จัดการแข่งขันสำคัญของวิทยาเขต',
                vi: 'Nhà thi đấu chính, tổ chức các giải bóng rổ lớn của trường.', ms: 'Gimnasium utama untuk kejohanan bola keranjang kampus.',
                id: 'GOR utama untuk turnamen basket besar kampus.', fil: 'Pangunahing gym para sa malalaking torneo ng basketball.',
            },
        },
        'b_basket_outdoor': {
            zh: '室外篮球场', en: 'Outdoor Basketball Courts', tw: '室外籃球場', ja: '屋外バスケットコート', ko: '야외 농구장',
            th: 'สนามบาสกลางแจ้ง', vi: 'Sân bóng rổ ngoài trời', ms: 'Gelanggang Bola Keranjang Luar', id: 'Lapangan Basket Luar Ruangan', fil: 'Panlabas na Basketball Court',
            _desc: {
                zh: '室外篮球场群，多片场地，免费开放。',
                en: 'Cluster of outdoor courts, open to all for free.',
                tw: '室外籃球場群，多片場地，免費開放。', ja: '屋外コート群。複数面あり無料開放。',
                ko: '야외 농구장 여러 면이 무료로 개방됩니다.', th: 'สนามบาสกลางแจ้งหลายสนาม เปิดให้ใช้ฟรี',
                vi: 'Cụm sân ngoài trời, nhiều sân, mở cửa miễn phí.', ms: 'Gugusan gelanggang luar, dibuka percuma.',
                id: 'Beberapa lapangan luar ruangan, gratis.', fil: 'Kumpulan ng panlabas na court, bukas nang libre.',
            },
        },
        'b_basket6': {
            zh: '6号篮球馆', en: 'Basketball Gym 6', tw: '6號籃球館', ja: '6号バスケットコート', ko: '6호 농구장',
            th: 'สนามบาส 6', vi: 'Nhà thi đấu bóng rổ 6', ms: 'Gimnasium Bola Keranjang 6', id: 'GOR Basket 6', fil: 'Basketball Gym 6',
            _desc: {
                zh: '6 号室内篮球馆，配套观众席。',
                en: 'Indoor basketball gym No.6 with spectator seating.',
                tw: '6 號室內籃球館，配套觀眾席。', ja: '6号屋内バスケットコート。観客席付き。',
                ko: '6호 실내 농구장으로 관람석이 있습니다.', th: 'สนามบาสในร่มหมายเลข 6 พร้อมที่นั่งผู้ชม',
                vi: 'Nhà thi đấu trong nhà số 6, có khán đài.', ms: 'Gimnasium dalaman No.6 dengan tempat duduk penonton.',
                id: 'GOR dalam ruangan No.6 dengan tribun penonton.', fil: 'Panloob na basketball gym No.6 na may upuan ng manonood.',
            },
        },
        'b_field1': {
            zh: '第一足球场', en: 'Sports Field 1', tw: '第一足球場', ja: '第一グラウンド', ko: '제1운동장',
            th: 'สนามกีฬา 1', vi: 'Sân vận động 1', ms: 'Padang Sukan 1', id: 'Lapangan Olahraga 1', fil: 'Sports Field 1',
            _desc: {
                zh: '标准田径场 + 足球场，塑胶跑道，承办校运动会。',
                en: 'Standard track and football field with rubber track; hosts sports meets.',
                tw: '標準田徑場 + 足球場，塑膠跑道，承辦校運動會。', ja: '標準トラック兼サッカー場。ゴム走路、学内運動会を開催。',
                ko: '표준 육상 트랙과 축구장으로 교내 체육대회가 열립니다.', th: 'สนามกรีฑามาตรฐานและสนามฟุตบอล จัดงานกีฬาของโรงเรียน',
                vi: 'Sân điền kinh và bóng đá tiêu chuẩn, tổ chức hội thao trường.', ms: 'Padang olahraga dan bola sepak standard, menganjurkan sukan sekolah.',
                id: 'Lapangan atletik dan sepak bola standar, tuan rumah pekan olahraga.', fil: 'Standard na track at football field; pinagdarausan ng sports meet.',
            },
        },
        'b_field2': {
            zh: '第二足球场', en: 'Sports Field 2', tw: '第二足球場', ja: '第二グラウンド', ko: '제2운동장',
            th: 'สนามกีฬา 2', vi: 'Sân vận động 2', ms: 'Padang Sukan 2', id: 'Lapangan Olahraga 2', fil: 'Sports Field 2',
            _desc: {
                zh: '西北侧足球场，配套跑道和看台。',
                en: 'Northwestern football field with track and stands.',
                tw: '西北側足球場，配套跑道和看台。', ja: '北西側のサッカー場。走路とスタンド付き。',
                ko: '북서쪽 축구장으로 트랙과 관람석이 있습니다.', th: 'สนามฟุตบอลตะวันตกเฉียงเหนือ พร้อมลู่และอัฒจันทร์',
                vi: 'Sân bóng phía tây bắc, có đường chạy và khán đài.', ms: 'Padang bola sepak di barat laut dengan trek dan tempat duduk.',
                id: 'Lapangan sepak bola barat laut dengan lintasan dan tribun.', fil: 'Football field sa hilagang-kanluran na may track at stand.',
            },
        },
        'b_dorm13': {
            zh: '学生宿舍13#', en: 'Dormitory 13', tw: '學生宿舍13#', ja: '学生寮13号', ko: '학생기숙사 13호',
            th: 'หอพัก 13', vi: 'Ký túc xá 13', ms: 'Asrama 13', id: 'Asrama 13', fil: 'Dormitoryo 13',
            _desc: {
                zh: '靠近中央喷泉，6 人间，配空调和独卫。',
                en: 'Near the central fountain; 6-person rooms with AC and private bath.',
                tw: '靠近中央噴泉，6 人間，配空調和獨衛。', ja: '中央噴水の近く。6人部屋、エアコン・個別トイレ付き。',
                ko: '중앙 분수 근처. 6인실에 에어컨과 개별 화장실이 있습니다.', th: 'ใกล้กับน้ำพุกลาง ห้องพัก 6 คน พร้อมแอร์และห้องน้ำในตัว',
                vi: 'Gần đài phun trung tâm, phòng 6 người, có điều hòa và nhà vệ sinh riêng.', ms: 'Berhampiran air pancut tengah; bilik 6 orang dengan penyaman udara.',
                id: 'Dekat air mancur pusat; kamar 6 orang dengan AC dan kamar mandi dalam.', fil: 'Malapit sa gitnang fountain; kuwartong pang-6 na may aircon at sariling banyo.',
            },
        },
        'b_dorm15': {
            zh: '学生宿舍15#', en: 'Dormitory 15', tw: '學生宿舍15#', ja: '学生寮15号', ko: '학생기숙사 15호',
            th: 'หอพัก 15', vi: 'Ký túc xá 15', ms: 'Asrama 15', id: 'Asrama 15', fil: 'Dormitoryo 15',
            _desc: {
                zh: '学生公寓，设施齐全。',
                en: 'Student apartment with full amenities.',
                tw: '學生公寓，設施齊全。', ja: '設備の整った学生アパート。',
                ko: '시설이 잘 갖춰진 학생 아파트입니다.', th: 'หอพักนักศึกษา พร้อมสิ่งอำนวยความสะดวก',
                vi: 'Ký túc xá sinh viên, đầy đủ tiện nghi.', ms: 'Apartmen pelajar dengan kemudahan lengkap.',
                id: 'Apartemen mahasiswa dengan fasilitas lengkap.', fil: 'Apartamentong pang-estudyante na kumpleto ang pasilidad.',
            },
        },
        'b_dorm16': {
            zh: '学生宿舍16#', en: 'Dormitory 16', tw: '學生宿舍16#', ja: '学生寮16号', ko: '학생기숙사 16호',
            th: 'หอพัก 16', vi: 'Ký túc xá 16', ms: 'Asrama 16', id: 'Asrama 16', fil: 'Dormitoryo 16',
            _desc: {
                zh: '学生公寓，含公共自习区。',
                en: 'Student apartment with a shared study area.',
                tw: '學生公寓，含公共自習區。', ja: '学生アパート。共有自習スペースあり。',
                ko: '공용 자습 공간이 있는 학생 아파트입니다.', th: 'หอพักนักศึกษา มีพื้นที่อ่านหนังสือส่วนกลาง',
                vi: 'Ký túc xá sinh viên, có khu tự học chung.', ms: 'Apartmen pelajar dengan ruang belajar bersama.',
                id: 'Apartemen mahasiswa dengan area belajar bersama.', fil: 'Apartamentong pang-estudyante na may common study area.',
            },
        },
        'b_dorm18': {
            zh: '学生宿舍18#', en: 'Dormitory 18', tw: '學生宿舍18#', ja: '学生寮18号', ko: '학생기숙사 18호',
            th: 'หอพัก 18', vi: 'Ký túc xá 18', ms: 'Asrama 18', id: 'Asrama 18', fil: 'Dormitoryo 18',
            _desc: {
                zh: '学生公寓。',
                en: 'Student apartment.',
                tw: '學生公寓。', ja: '学生アパート。',
                ko: '학생 아파트입니다.', th: 'หอพักนักศึกษา',
                vi: 'Ký túc xá sinh viên.', ms: 'Apartmen pelajar.',
                id: 'Apartemen mahasiswa.', fil: 'Apartamentong pang-estudyante.',
            },
        },
        'b_dorm23': {
            zh: '学生宿舍23#', en: 'Dormitory 23', tw: '學生宿舍23#', ja: '学生寮23号', ko: '학생기숙사 23호',
            th: 'หอพัก 23', vi: 'Ký túc xá 23', ms: 'Asrama 23', id: 'Asrama 23', fil: 'Dormitoryo 23',
            _desc: {
                zh: '北侧学生宿舍。',
                en: 'North-side student dormitory.',
                tw: '北側學生宿舍。', ja: '北側の学生寮。',
                ko: '북쪽 학생 기숙사입니다.', th: 'หอพักนักศึกษาด้านเหนือ',
                vi: 'Ký túc xá phía bắc.', ms: 'Asrama pelajar di utara.',
                id: 'Asrama mahasiswa sisi utara.', fil: 'Dormitoryong pang-estudyante sa hilaga.',
            },
        },
        'b_dorm24': {
            zh: '学生宿舍24#', en: 'Dormitory 24', tw: '學生宿舍24#', ja: '学生寮24号', ko: '학생기숙사 24호',
            th: 'หอพัก 24', vi: 'Ký túc xá 24', ms: 'Asrama 24', id: 'Asrama 24', fil: 'Dormitoryo 24',
            _desc: {
                zh: '北侧高层宿舍，配电梯和自助洗衣房。',
                en: 'North-side high-rise dorm with elevator and self-service laundry.',
                tw: '北側高層宿舍，配電梯和自助洗衣房。', ja: '北側の高層寮。エレベーターとコインランドリー付き。',
                ko: '북쪽 고층 기숙사로 엘리베이터와 셀프 세탁실이 있습니다.', th: 'หอพักสูงด้านเหนือ มีลิฟต์และห้องซักผ้าหยอดเหรียญ',
                vi: 'Ký túc xá cao tầng phía bắc, có thang máy và phòng giặt tự phục vụ.', ms: 'Asrama tinggi di utara dengan lif dan dobi layan diri.',
                id: 'Asrama tinggi sisi utara dengan lift dan laundry mandiri.', fil: 'Matataas na dormitoryo sa hilaga na may elevator at self-service laundry.',
            },
        },
        'b_dorm35': {
            zh: '学生宿舍35#', en: 'Dormitory 35', tw: '學生宿舍35#', ja: '学生寮35号', ko: '학생기숙사 35호',
            th: 'หอพัก 35', vi: 'Ký túc xá 35', ms: 'Asrama 35', id: 'Asrama 35', fil: 'Dormitoryo 35',
            _desc: {
                zh: '东侧新宿舍区，靠近校园边界。',
                en: 'New dormitory area on the east, near campus boundary.',
                tw: '東側新宿舍區，靠近校園邊界。', ja: '東側の新寮区。キャンパス境界に近い。',
                ko: '동쪽 신축 기숙사 구역으로 캠퍼스 경계 근처입니다.', th: 'เขตหอพักใหม่ด้านตะวันออก ใกล้ขอบวิทยาเขต',
                vi: 'Khu ký túc mới phía đông, gần ranh giới trường.', ms: 'Kawasan asrama baharu di timur, berhampiran sempadan kampus.',
                id: 'Area asrama baru di timur, dekat batas kampus.', fil: 'Bagong dormitoryo sa silangan, malapit sa hangganan ng campus.',
            },
        },
        'b_dorm36': {
            zh: '学生宿舍36#', en: 'Dormitory 36', tw: '學生宿舍36#', ja: '学生寮36号', ko: '학생기숙사 36호',
            th: 'หอพัก 36', vi: 'Ký túc xá 36', ms: 'Asrama 36', id: 'Asrama 36', fil: 'Dormitoryo 36',
            _desc: {
                zh: '东侧新宿舍区。',
                en: 'New dormitory area on the east.',
                tw: '東側新宿舍區。', ja: '東側の新寮区。',
                ko: '동쪽 신축 기숙사 구역입니다.', th: 'เขตหอพักใหม่ด้านตะวันออก',
                vi: 'Khu ký túc mới phía đông.', ms: 'Kawasan asrama baharu di timur.',
                id: 'Area asrama baru di timur.', fil: 'Bagong dormitoryo sa silangan.',
            },
        },
        'b_dorm37': {
            zh: '学生宿舍37#', en: 'Dormitory 37', tw: '學生宿舍37#', ja: '学生寮37号', ko: '학생기숙사 37호',
            th: 'หอพัก 37', vi: 'Ký túc xá 37', ms: 'Asrama 37', id: 'Asrama 37', fil: 'Dormitoryo 37',
            _desc: {
                zh: '东侧新宿舍区。',
                en: 'New dormitory area on the east.',
                tw: '東側新宿舍區。', ja: '東側の新寮区。',
                ko: '동쪽 신축 기숙사 구역입니다.', th: 'เขตหอพักใหม่ด้านตะวันออก',
                vi: 'Khu ký túc mới phía đông.', ms: 'Kawasan asrama baharu di timur.',
                id: 'Area asrama baru di timur.', fil: 'Bagong dormitoryo sa silangan.',
            },
        },
        'b_dorm38': {
            zh: '学生宿舍38#', en: 'Dormitory 38', tw: '學生宿舍38#', ja: '学生寮38号', ko: '학생기숙사 38호',
            th: 'หอพัก 38', vi: 'Ký túc xá 38', ms: 'Asrama 38', id: 'Asrama 38', fil: 'Dormitoryo 38',
            _desc: {
                zh: '东侧新宿舍区。',
                en: 'New dormitory area on the east.',
                tw: '東側新宿舍區。', ja: '東側の新寮区。',
                ko: '동쪽 신축 기숙사 구역입니다.', th: 'เขตหอพักใหม่ด้านตะวันออก',
                vi: 'Khu ký túc mới phía đông.', ms: 'Kawasan asrama baharu di timur.',
                id: 'Area asrama baru di timur.', fil: 'Bagong dormitoryo sa silangan.',
            },
        },
        'b_dorm1': {
            zh: '1栋宿舍', en: 'Dormitory 1', tw: '1棟宿舍', ja: '1号棟寮', ko: '1동 기숙사',
            th: 'หอพัก 1', vi: 'Ký túc xá 1', ms: 'Asrama 1', id: 'Asrama 1', fil: 'Dormitoryo 1',
            _desc: {
                zh: '南侧学生宿舍。',
                en: 'South-side student dormitory.',
                tw: '南側學生宿舍。', ja: '南側の学生寮。',
                ko: '남쪽 학생 기숙사입니다.', th: 'หอพักนักศึกษาด้านใต้',
                vi: 'Ký túc xá phía nam.', ms: 'Asrama pelajar di selatan.',
                id: 'Asrama mahasiswa sisi selatan.', fil: 'Dormitoryong pang-estudyante sa timog.',
            },
        },
        'b_dorm31': {
            zh: '31栋（远景规划）', en: 'Building 31 (Future Plan)', tw: '31棟（遠景規劃）', ja: '31号棟（将来計画）', ko: '31동 (장기 계획)',
            th: 'อาคาร 31 (แผนอนาคต)', vi: 'Nhà 31 (quy hoạch tương lai)', ms: 'Bangunan 31 (Rancangan Masa Depan)', id: 'Gedung 31 (Rencana Masa Depan)', fil: 'Gusali 31 (Plano sa Hinaharap)',
            _desc: {
                zh: '远景规划宿舍楼，目前为规划用地。',
                en: 'Future planned dormitory; currently planned land.',
                tw: '遠景規劃宿舍樓，目前為規劃用地。', ja: '将来計画の寮。現在は計画用地。',
                ko: '장기 계획 기숙사로 현재는 계획 부지입니다.', th: 'อาคารหอพักตามแผนอนาคต ปัจจุบันเป็นที่ดินที่วางแผนไว้',
                vi: 'Nhà ký túc quy hoạch tương lai, hiện là đất quy hoạch.', ms: 'Asrama yang dirancang untuk masa depan; kini tanah perancangan.',
                id: 'Asrama rencana masa depan; kini lahan perencanaan.', fil: 'Nakaplanong dormitoryo sa hinaharap; kasalukuyang planadong lupa.',
            },
        },
        'b_faculty22': {
            zh: '教职工宿舍22#', en: 'Faculty Housing 22', tw: '教職工宿舍22#', ja: '教職員寮22号', ko: '교직원숙소 22호',
            th: 'บ้านพักบุคลากร 22', vi: 'Nhà công vụ 22', ms: 'Rumah Staf 22', id: 'Rumah Dosen 22', fil: 'Pabahay ng Guro 22',
            _desc: {
                zh: '教师公寓。',
                en: 'Faculty apartment.',
                tw: '教師公寓。', ja: '教員アパート。',
                ko: '교직원 아파트입니다.', th: 'แฟลตบุคลากร',
                vi: 'Chung cư giáo viên.', ms: 'Apartmen staf.',
                id: 'Apartemen dosen.', fil: 'Apartamentong pangguro.',
            },
        },
        'b_faculty21': {
            zh: '教职工宿舍21#', en: 'Faculty Housing 21', tw: '教職工宿舍21#', ja: '教職員寮21号', ko: '교직원숙소 21호',
            th: 'บ้านพักบุคลากร 21', vi: 'Nhà công vụ 21', ms: 'Rumah Staf 21', id: 'Rumah Dosen 21', fil: 'Pabahay ng Guro 21',
            _desc: {
                zh: '教师公寓，临近校医院和第三餐厅。',
                en: 'Faculty apartment, near the clinic and Canteen 3.',
                tw: '教師公寓，臨近校醫院和第三餐廳。', ja: '教員アパート。診療所と第三食堂の近く。',
                ko: '교직원 아파트로 보건소와 제3식당 근처입니다.', th: 'แฟลตบุคลากร ใกล้ห้องพยาบาลและโรงอาหาร 3',
                vi: 'Chung cư giáo viên, gần trạm y tế và nhà ăn 3.', ms: 'Apartmen staf, berhampiran klinik dan Kafeteria 3.',
                id: 'Apartemen dosen, dekat klinik dan Kantin 3.', fil: 'Apartamentong pangguro, malapit sa klinika at Canteen 3.',
            },
        },
        'b_canteen1': {
            zh: '第一餐厅', en: 'Canteen 1', tw: '第一餐廳', ja: '第一食堂', ko: '제1식당',
            th: 'โรงอาหาร 1', vi: 'Nhà ăn 1', ms: 'Kafeteria 1', id: 'Kantin 1', fil: 'Kantina 1',
            _desc: {
                zh: '主食堂，提供川、粤、湘等风味餐饮。',
                en: 'Main canteen serving Sichuan, Cantonese and Hunan cuisine.',
                tw: '主食堂，提供川、粵、湘等風味餐飲。', ja: 'メイン食堂。四川・広東・湖南料理を提供。',
                ko: '메인 식당으로 쓰촨·광둥·후난 요리를 제공합니다.', th: 'โรงอาหารหลัก ให้บริการอาหารเสฉวน กวางตุ้ง และหูหนาน',
                vi: 'Nhà ăn chính, phục vụ món Tứ Xuyên, Quảng Đông, Hồ Nam.', ms: 'Kafeteria utama menyajikan masakan Sichuan, Kantonis dan Hunan.',
                id: 'Kantin utama menyajikan masakan Sichuan, Kanton, dan Hunan.', fil: 'Pangunahing kantina na naghahain ng Sichuan, Cantonese at Hunan.',
            },
        },
        'b_canteen2': {
            zh: '第二餐厅', en: 'Canteen 2', tw: '第二餐廳', ja: '第二食堂', ko: '제2식당',
            th: 'โรงอาหาร 2', vi: 'Nhà ăn 2', ms: 'Kafeteria 2', id: 'Kantin 2', fil: 'Kantina 2',
            _desc: {
                zh: '西北侧风味食堂，主营小吃和地方特色。',
                en: 'Northwestern canteen featuring snacks and local specialties.',
                tw: '西北側風味食堂，主營小吃和地方特色。', ja: '北西側の食堂。軽食と郷土料理が中心。',
                ko: '북서쪽 식당으로 분식과 향토 음식을 주로 합니다.', th: 'โรงอาหารตะวันตกเฉียงเหนือ ขายของว่างและอาหารพื้นเมือง',
                vi: 'Nhà ăn tây bắc, chuyên món ăn vặt và đặc sản địa phương.', ms: 'Kafeteria barat laut dengan makanan ringan dan keistimewaan tempatan.',
                id: 'Kantin barat laut dengan camilan dan kuliner khas lokal.', fil: 'Kantina sa hilagang-kanluran na may meryenda at lokal na espesyalidad.',
            },
        },
        'b_canteen3': {
            zh: '第三餐厅', en: 'Canteen 3', tw: '第三餐廳', ja: '第三食堂', ko: '제3식당',
            th: 'โรงอาหาร 3', vi: 'Nhà ăn 3', ms: 'Kafeteria 3', id: 'Kantin 3', fil: 'Kantina 3',
            _desc: {
                zh: '北侧餐厅，靠近教职工宿舍。',
                en: 'North-side canteen, near faculty housing.',
                tw: '北側餐廳，靠近教職工宿舍。', ja: '北側の食堂。教職員寮の近く。',
                ko: '북쪽 식당으로 교직원 숙소 근처입니다.', th: 'โรงอาหารด้านเหนือ ใกล้บ้านพักบุคลากร',
                vi: 'Nhà ăn phía bắc, gần nhà công vụ.', ms: 'Kafeteria di utara, berhampiran rumah staf.',
                id: 'Kantin sisi utara, dekat rumah dosen.', fil: 'Kantina sa hilaga, malapit sa pabahay ng guro.',
            },
        },
        'b_medical': {
            zh: '医务室', en: 'Medical Clinic', tw: '醫務室', ja: '診療所', ko: '보건실',
            th: 'ห้องพยาบาล', vi: 'Trạm y tế', ms: 'Klinik Perubatan', id: 'Klinik Medis', fil: 'Klinikang Medikal',
            _desc: {
                zh: '校园医务室，提供基本医疗和急诊服务。',
                en: 'Campus clinic offering basic medical and emergency services.',
                tw: '校園醫務室，提供基本醫療和急診服務。', ja: 'キャンパス診療所。基本医療・救急サービスを提供。',
                ko: '캠퍼스 보건실로 기본 진료와 응급 서비스를 제공합니다.', th: 'ห้องพยาบาลของวิทยาเขต ให้บริการรักษาเบื้องต้นและฉุกเฉิน',
                vi: 'Trạm y tế trường, cung cấp dịch vụ y tế cơ bản và cấp cứu.', ms: 'Klinik kampus menyediakan perkhidmatan perubatan asas dan kecemasan.',
                id: 'Klinik kampus menyediakan layanan medis dasar dan darurat.', fil: 'Klinika ng campus para sa batayang medikal at emergency.',
            },
        },
        'b_express': {
            zh: '快递服务中心', en: 'Express Delivery Center', tw: '快遞服務中心', ja: '宅配便センター', ko: '택배 서비스센터',
            th: 'ศูนย์รับ-ส่งพัสดุ', vi: 'Trung tâm chuyển phát', ms: 'Pusat Kurier', id: 'Pusat Kurir', fil: 'Sentro ng Paghahatid',
            _desc: {
                zh: '校园快递集中收发点（菜鸟驿站等）。',
                en: 'Central campus parcel pickup point (Cainiao station, etc.).',
                tw: '校園快遞集中收發點（菜鳥驛站等）。', ja: 'キャンパスの宅配集中受取所（菜鳥ステーション等）。',
                ko: '캠퍼스 택배 집중 수령점(차이냐오 스테이션 등)입니다.', th: 'จุดรับ-ส่งพัสดุกลางของวิทยาเขต (Cainiao ฯลฯ)',
                vi: 'Điểm nhận/gửi bưu kiện tập trung của trường (trạm Cainiao...).', ms: 'Titik pengambilan bungkusan berpusat kampus (stesen Cainiao dll).',
                id: 'Titik pengambilan paket terpusat kampus (stasiun Cainiao dll).', fil: 'Sentrong pick-up point ng parcel sa campus (Cainiao station, atbp).',
            },
        },
        'b_supermarket': {
            zh: '校园超市', en: 'Campus Supermarket', tw: '校園超市', ja: 'キャンパススーパー', ko: '캠퍼스 슈퍼',
            th: 'ซูเปอร์มาร์เก็ตในวิทยาเขต', vi: 'Siêu thị trong trường', ms: 'Pasar Raya Kampus', id: 'Supermarket Kampus', fil: 'Supermarket ng Campus',
            _desc: {
                zh: '校园生活超市，文具零食日用品一站式购物。',
                en: 'Campus convenience store for stationery, snacks and daily goods.',
                tw: '校園生活超市，文具零食日用品一站式購物。', ja: 'キャンパス生活スーパー。文具・菓子・日用品をワンストップで。',
                ko: '캠퍼스 생활 슈퍼로 문구, 간식, 생활용품을 한 번에 구매합니다.', th: 'ซูเปอร์มาร์เก็ตในวิทยาเขต ขายเครื่องเขียน ขนม และของใช้',
                vi: 'Siêu thị tiện ích, bán văn phòng phẩm, đồ ăn vặt, đồ dùng hằng ngày.', ms: 'Kedai serbaneka kampus untuk alat tulis, snek dan barangan harian.',
                id: 'Toko serba ada kampus untuk alat tulis, camilan, dan kebutuhan harian.', fil: 'Tindahan ng campus para sa stationery, meryenda at pang-araw-araw na gamit.',
            },
        },
        'b_parking': {
            zh: '社会停车场', en: 'Public Parking', tw: '社會停車場', ja: '公共駐車場', ko: '공용 주차장',
            th: 'ลานจอดรถสาธารณะ', vi: 'Bãi đỗ xe công cộng', ms: 'Tempat Letak Kereta Awam', id: 'Parkir Umum', fil: 'Pampublikong Paradahan',
            _desc: {
                zh: '外来访客车辆停放区（位于主入口内侧）。',
                en: 'Visitor parking area (inside the main entrance).',
                tw: '外來訪客車輛停放區（位於主入口內側）。', ja: '来訪者駐車区（正門内側）。',
                ko: '방문객 주차 구역(정문 안쪽)입니다.', th: 'พื้นที่จอดรถผู้มาเยือน (ด้านในทางเข้าหลัก)',
                vi: 'Khu đỗ xe khách (bên trong cổng chính).', ms: 'Kawasan letak kereta pelawat (dalam pintu utama).',
                id: 'Area parkir pengunjung (di dalam gerbang utama).', fil: 'Paradahan ng bisita (sa loob ng pangunahing pasukan).',
            },
        },
        'b_luggage': {
            zh: '行李发放点', en: 'Luggage Distribution Point', tw: '行李發放點', ja: '荷物配布所', ko: '짐 배부소',
            th: 'จุดจ่ายสัมภาระ', vi: 'Điểm phát hành lý', ms: 'Titik Pengagihan Bagasi', id: 'Titik Distribusi Bagasi', fil: 'Puntong Pamamahagi ng Baggage',
            _desc: {
                zh: '新生入学行李发放处，位于体育馆/运动场片区。',
                en: 'Luggage distribution for new students, near the gym/sports area.',
                tw: '新生入學行李發放處，位於體育館/運動場片區。', ja: '新入生の荷物配布所。体育館・グラウンド地区に位置。',
                ko: '신입생 짐 배부처로 체육관·운동장 구역에 있습니다.', th: 'จุดจ่ายสัมภาระนักศึกษาใหม่ อยู่ใกล้โรงยิม/สนามกีฬา',
                vi: 'Điểm phát hành lý tân sinh viên, gần nhà thi đấu/sân thể thao.', ms: 'Titik pengagihan bagasi pelajar baharu, berhampiran gimnasium.',
                id: 'Titik distribusi bagasi mahasiswa baru, dekat GOR/lapangan olahraga.', fil: 'Pamamahagi ng bagahe para sa bagong estudyante, malapit sa gym.',
            },
        },
        'b_water': {
            zh: '桶装水取水点', en: 'Bottled Water Pickup', tw: '桶裝水取水點', ja: 'ウォーターサーバー取水所', ko: '생수 수령점',
            th: 'จุดรับน้ำดื่ม', vi: 'Điểm lấy nước đóng bình', ms: 'Titik Pengambilan Air Botol', id: 'Titik Pengambilan Air Galon', fil: 'Puntong Kuhanan ng Tubig',
            _desc: {
                zh: '校园桶装水集中取水点。',
                en: 'Central campus bottled-water pickup point.',
                tw: '校園桶裝水集中取水點。', ja: 'キャンパスの桶入り水集中取水所。',
                ko: '캠퍼스 생수 집중 수령점입니다.', th: 'จุดรับน้ำดื่มบรรจุขวดกลางของวิทยาเขต',
                vi: 'Điểm lấy nước đóng bình tập trung của trường.', ms: 'Titik pengambilan air botol berpusat kampus.',
                id: 'Titik pengambilan air galon terpusat kampus.', fil: 'Puntong kuhanan ng binoteng tubig sa campus.',
            },
        },
    };

    // ====== 分类名称（10 语言） ======
    const CAT = {
        gate:     { zh: '校门', en: 'Gate', tw: '校門', ja: '校門', ko: '교문', th: 'ประตูโรงเรียน', vi: 'Cổng trường', ms: 'Pintu', id: 'Gerbang', fil: 'Tarangkahan' },
        teaching: { zh: '教学楼', en: 'Teaching', tw: '教學樓', ja: '教学棟', ko: '교학동', th: 'อาคารเรียน', vi: 'Nhà giảng dạy', ms: 'Kuliah', id: 'Gedung Kuliah', fil: 'Pagtuturo' },
        training: { zh: '实训楼', en: 'Training', tw: '實訓樓', ja: '実訓棟', ko: '실습동', th: 'อาคารฝึกปฏิบัติ', vi: 'Nhà thực hành', ms: 'Latihan', id: 'Gedung Praktik', fil: 'Praktikal' },
        dorm:     { zh: '学生宿舍', en: 'Dormitory', tw: '學生宿舍', ja: '学生寮', ko: '학생기숙사', th: 'หอพัก', vi: 'Ký túc xá', ms: 'Asrama', id: 'Asrama', fil: 'Dormitoryo' },
        faculty:  { zh: '教师宿舍', en: 'Faculty Housing', tw: '教師宿舍', ja: '教員寮', ko: '교직원숙소', th: 'บ้านพักบุคลากร', vi: 'Nhà công vụ', ms: 'Rumah Staf', id: 'Rumah Dosen', fil: 'Pabahay ng Guro' },
        canteen:  { zh: '食堂', en: 'Canteen', tw: '食堂', ja: '食堂', ko: '식당', th: 'โรงอาหาร', vi: 'Nhà ăn', ms: 'Kafeteria', id: 'Kantin', fil: 'Kantina' },
        sports:   { zh: '运动场', en: 'Sports', tw: '運動場', ja: '運動場', ko: '운동장', th: 'สนามกีฬา', vi: 'Sân thể thao', ms: 'Sukan', id: 'Olahraga', fil: 'Palakasan' },
        landmark: { zh: '地标', en: 'Landmark', tw: '地標', ja: 'ランドマーク', ko: '랜드마크', th: 'แลนด์มาร์ก', vi: 'Điểm nhấn', ms: 'Mercu Tanda', id: 'Landmark', fil: 'Landmark' },
        service:  { zh: '生活服务', en: 'Services', tw: '生活服務', ja: '生活サービス', ko: '생활서비스', th: 'บริการ', vi: 'Dịch vụ', ms: 'Perkhidmatan', id: 'Layanan', fil: 'Serbisyo' },
        academic: { zh: '学术/演艺', en: 'Academic & Arts', tw: '學術/演藝', ja: '学術・芸能', ko: '학술/공연', th: 'วิชาการ/การแสดง', vi: 'Học thuật/Biểu diễn', ms: 'Akademik & Seni', id: 'Akademik & Seni', fil: 'Akademiko at Sining' },
    };

    // ====== 通用 UI 文案 ======
    const STR = {
        'app.name': { zh: '校园导览', en: 'Campus Guide', tw: '校園導覽', ja: 'キャンパスガイド', ko: '캠퍼스 안내', th: 'คู่มือวิทยาเขต', vi: 'Hướng dẫn khuôn viên', ms: 'Panduan Kampus', id: 'Panduan Kampus', fil: 'Gabay sa Campus' },
        'school.name': { zh: '四川文轩职业学院', en: 'Sichuan Wenxuan Vocational College', tw: '四川文軒職業學院', ja: '四川文軒職業学院', ko: '쓰촨 원쉬안 직업학원', th: 'วิทยาลัยอาชีวศึกษาเสฉวนเหวินเซวียน', vi: 'Trường Cao đẳng Nghề Tứ Xuyên Văn Hiên', ms: 'Kolej Vokasional Sichuan Wenxuan', id: 'Sekolah Tinggi Vokasi Sichuan Wenxuan', fil: 'Sichuan Wenxuan Vocational College' },
        'school.suining': { zh: '遂宁校区 · 校园导览', en: 'Suining Campus · Guide', tw: '遂寧校區 · 校園導覽', ja: '遂寧キャンパス・ガイド', ko: '쑤이닝 캠퍼스 · 안내', th: 'วิทยาเขตซุยหนิง · คู่มือ', vi: 'Khu Suining · Hướng dẫn', ms: 'Kampus Suining · Panduan', id: 'Kampus Suining · Panduan', fil: 'Suining Campus · Gabay' },

        // 新手引导
        'ob.t1': { zh: '一图览校园', en: 'See the Campus at a Glance', tw: '一圖覽校園', ja: 'キャンパスを一望', ko: '캠퍼스 한눈에 보기', th: 'ชมวิทยาเขตในภาพเดียว', vi: 'Nhìn toàn cảnh trường', ms: 'Lihat Kampus Sekali Pandang', id: 'Lihat Kampus Sekilas', fil: 'Tingnan ang Campus sa Isang Sulyap' },
        'ob.d1': { zh: '官方导视图整图呈现，47 个地点分类圆点，拖动缩放自由查看', en: 'Full official guide map with 47 categorized points. Drag and zoom freely.', tw: '官方導視圖整圖呈現，47 個地點分類圓點，拖動縮放自由查看', ja: '公式ガイド図を全面表示。47地点を分類ドットで。ドラッグ・ズーム自由。', ko: '공식 안내도를 전체 표시. 47개 장소 분류 점. 드래그·확대 자유.', th: 'แผนที่นำทางเต็มรูปแบบ 47 จุดแบ่งหมวด ลากและซูมได้อิสระ', vi: 'Bản đồ chính thức với 47 điểm phân loại, kéo và phóng to thoải mái.', ms: 'Peta panduan penuh dengan 47 titik. Seret dan zum bebas.', id: 'Peta panduan lengkap dengan 47 titik. Seret dan zoom bebas.', fil: 'Buong opisyal na mapa na may 47 punto. I-drag at i-zoom nang malaya.' },
        'ob.t2': { zh: '找地方很快', en: 'Find Places Fast', tw: '找地方很快', ja: '場所をすぐ検索', ko: '빠르게 장소 찾기', th: 'หาสถานที่ได้รวดเร็ว', vi: 'Tìm địa điểm nhanh', ms: 'Cari Tempat Pantas', id: 'Cari Tempat Cepat', fil: 'Mabilis na Paghahanap ng Lugar' },
        'ob.d2': { zh: '按分类筛选或直接搜索，常去的地点一键收藏', en: 'Filter by category or search directly; save favorites in one tap.', tw: '按分類篩選或直接搜索，常去的地點一鍵收藏', ja: '分類で絞り込み、または直接検索。よく行く場所はワンタップで保存。', ko: '분류별 필터 또는 직접 검색. 자주 가는 장소는 원탭 저장.', th: 'กรองตามหมวดหรือค้นหา บันทึกรายการโปรดได้ในคลิกเดียว', vi: 'Lọc theo loại hoặc tìm kiếm, lưu địa điểm yêu thích một chạm.', ms: 'Tapis mengikut kategori atau cari terus; simpan kegemaran sekali ketik.', id: 'Filter per kategori atau cari langsung; simpan favorit sekali ketuk.', fil: 'I-filter ayon sa kategorya o maghanap; i-save ang paborito sa isang tap.' },
        'ob.t3': { zh: '路线随身带', en: 'Routes in Your Pocket', tw: '路線隨身帶', ja: 'ルートを持ち歩く', ko: '경로를 손안에', th: 'เส้นทางติดตัว', vi: 'Lộ trình trong tay', ms: 'Laluan Dalam Poket', id: 'Rute di Saku', fil: 'Ruta sa Iyong Bulsa' },
        'ob.d3': { zh: '选起终点即得步行路线，右上角小地图随时定位全局', en: 'Pick start and end for a walking route; the minimap keeps you oriented.', tw: '選起終點即得步行路線，右上角小地圖隨時定位全局', ja: '出発・到着を選ぶと徒歩ルート。右上ミニマップで常に全体を把握。', ko: '출발·도착 선택 시 도보 경로. 우측 상단 미니맵으로 위치 확인.', th: 'เลือกจุดเริ่มและปลายได้เส้นทางเดิน แผนที่ย่อมุมขวาช่วยระบุตำแหน่ง', vi: 'Chọn điểm đi/đến để có lộ trình đi bộ, bản đồ nhỏ định vị toàn cảnh.', ms: 'Pilih mula dan akhir untuk laluan berjalan; peta mini mengekalkan orientasi.', id: 'Pilih awal dan akhir untuk rute jalan; peta mini menjaga orientasi.', fil: 'Pumili ng simula at dulo para sa rutang lakad; ang minimap ang gagabay.' },
        'ob.next': { zh: '下一步', en: 'Next', tw: '下一步', ja: '次へ', ko: '다음', th: 'ถัดไป', vi: 'Tiếp', ms: 'Seterusnya', id: 'Berikutnya', fil: 'Susunod' },
        'ob.skip': { zh: '跳过', en: 'Skip', tw: '跳過', ja: 'スキップ', ko: '건너뛰기', th: 'ข้าม', vi: 'Bỏ qua', ms: 'Langkau', id: 'Lewati', fil: 'Laktawan' },

        // 地图
        'search.placeholder': { zh: '搜索地点', en: 'Search places', tw: '搜尋地點', ja: '場所を検索', ko: '장소 검색', th: 'ค้นหาสถานที่', vi: 'Tìm địa điểm', ms: 'Cari tempat', id: 'Cari tempat', fil: 'Maghanap ng lugar' },
        'search.input.ph': { zh: '搜索教学楼、食堂、宿舍…', en: 'Search buildings, canteens, dorms…', tw: '搜尋教學樓、食堂、宿舍…', ja: '教学棟・食堂・寮を検索…', ko: '교학동, 식당, 기숙사 검색…', th: 'ค้นหาอาคารเรียน โรงอาหาร หอพัก…', vi: 'Tìm nhà học, nhà ăn, ký túc xá…', ms: 'Cari bangunan, kafeteria, asrama…', id: 'Cari gedung, kantin, asrama…', fil: 'Maghanap ng gusali, kantina, dormitoryo…' },
        'search.go': { zh: '搜索', en: 'Search', tw: '搜尋', ja: '検索', ko: '검색', th: 'ค้นหา', vi: 'Tìm', ms: 'Cari', id: 'Cari', fil: 'Maghanap' },
        'search.cancel': { zh: '取消', en: 'Cancel', tw: '取消', ja: 'キャンセル', ko: '취소', th: 'ยกเลิก', vi: 'Hủy', ms: 'Batal', id: 'Batal', fil: 'Kanselahin' },
        'view.overview': { zh: '全览', en: 'Overview', tw: '全覽', ja: '全体表示', ko: '전체보기', th: 'ภาพรวม', vi: 'Toàn cảnh', ms: 'Gambaran', id: 'Ikhtisar', fil: 'Pangkalahatang-ideya' },
        'view.zoom': { zh: '放大浏览', en: 'Zoom In', tw: '放大瀏覽', ja: '拡大表示', ko: '확대 보기', th: 'ซูมเข้า', vi: 'Phóng to', ms: 'Zum Masuk', id: 'Perbesar', fil: 'Mag-zoom In' },
        'tour.btn': { zh: '新生导览', en: 'Campus Tour', tw: '新生導覽', ja: '新入生ツアー', ko: '신입생 투어', th: 'ทัวร์วิทยาเขต', vi: 'Tham quan trường', ms: 'Lawatan Kampus', id: 'Tur Kampus', fil: 'Campus Tour' },
        'tour.prev': { zh: '上一步', en: 'Prev', tw: '上一步', ja: '前へ', ko: '이전', th: 'ก่อนหน้า', vi: 'Trước', ms: 'Sebelum', id: 'Sebelumnya', fil: 'Nakaraan' },
        'tour.done': { zh: '完成 🎉', en: 'Done 🎉', tw: '完成 🎉', ja: '完了 🎉', ko: '완료 🎉', th: 'เสร็จ 🎉', vi: 'Xong 🎉', ms: 'Selesai 🎉', id: 'Selesai 🎉', fil: 'Tapos 🎉' },
        'tour.next': { zh: '下一步', en: 'Next', tw: '下一步', ja: '次へ', ko: '다음', th: 'ถัดไป', vi: 'Tiếp', ms: 'Seterusnya', id: 'Selanjutnya', fil: 'Susunod' },
        'tour.mode.title': { zh: '选择路线', en: 'Pick a route', tw: '選擇路線', ja: 'ルートを選択', ko: '경로 선택', th: 'เลือกเส้นทาง', vi: 'Chọn lộ trình', ms: 'Pilih laluan', id: 'Pilih rute', fil: 'Pumili ng ruta' },
        'tour.mode.nearest': { zh: '⚡ 最近优先', en: '⚡ Shortest', tw: '⚡ 最近優先', ja: '⚡ 最短', ko: '⚡ 최단', th: '⚡ ใกล้ที่สุด', vi: '⚡ Gần nhất', ms: '⚡ Terdekat', id: '⚡ Terdekat', fil: '⚡ Pinakamalapit' },
        'tour.mode.checkin': { zh: '🏛️ 报到处顺序', en: '🏛️ Check-in Order', tw: '🏛️ 報到順序', ja: '🏛️ 受付順', ko: '🏛️ 접수 순서', th: '🏛️ ลำดับลงทะเบียน', vi: '🏛️ Thứ tự đăng ký', ms: '🏛️ Urutan pendaftaran', id: '🏛️ Urutan check-in', fil: '🏛️ Order ng check-in' },
        'tour.mode.daily': { zh: '🛏️ 生活动线', en: '🛏️ Daily Life', tw: '🛏️ 生活動線', ja: '🛏️ 生活動線', ko: '🛏️ 생활 동선', th: '🛏️ เส้นทางชีวิตประจำวัน', vi: '🛏️ Sinh hoạt hằng ngày', ms: '🛏️ Laluan harian', id: '🛏️ Rute harian', fil: '🛏️ Daily routine' },
        'tour.mode.nearest.tip': { zh: '按校园路网优化，适合初次熟悉校园', en: 'Optimized on the campus paths', tw: '按校園路網優化，適合初次熟悉校園', ja: 'キャンパス内の経路に合わせて最適化', ko: '캠퍼스 경로를 기준으로 최적화', th: 'ปรับตามเส้นทางภายในวิทยาเขต', vi: 'Tối ưu theo lối đi trong trường', ms: 'Dioptimumkan mengikut laluan kampus', id: 'Dioptimalkan berdasarkan jalur kampus', fil: 'In-optimize ayon sa mga daan sa campus' },
        'tour.mode.checkin.tip': { zh: '大门起步，优先宿舍、餐厅与快递服务', en: 'Start at the gate for arrival essentials', tw: '大門起步，優先宿舍、餐廳與快遞服務', ja: '門から始めて入学時に必要な場所へ', ko: '정문에서 시작해 입학 필수 장소를 안내', th: 'เริ่มที่ประตูสู่จุดสำคัญสำหรับรายงานตัว', vi: 'Bắt đầu từ cổng đến các điểm cần thiết', ms: 'Bermula di pintu masuk ke lokasi penting', id: 'Mulai dari gerbang ke lokasi penting', fil: 'Mula sa gate papunta sa mahahalagang lugar' },
        'tour.mode.daily.tip': { zh: '覆盖宿舍、食堂、快递、医务等常用地点', en: 'Dorms, canteens, express and clinic', tw: '覆蓋宿舍、餐廳、快遞、醫務等常用地點', ja: '寮・食堂・配送・医務室などの生活スポット', ko: '기숙사·식당·택배·의무실 등 생활 장소', th: 'หอพัก โรงอาหาร พัสดุ และคลินิก', vi: 'Ký túc xá, căng tin, bưu kiện và y tế', ms: 'Asrama, kantin, ekspres dan klinik', id: 'Asrama, kantin, ekspedisi, dan klinik', fil: 'Dorm, kantin, express at klinika' },
        'tour.summary': { zh: '共 <b>{n}</b> 站 · <b>{d}</b>m · 约 <b>{m}</b> 分钟', en: '<b>{n}</b> stops · <b>{d}</b>m · ~<b>{m}</b> min', tw: '共 <b>{n}</b> 站 · <b>{d}</b>m · 約 <b>{m}</b> 分鐘', ja: '<b>{n}</b> 駅 · <b>{d}</b>m · 約 <b>{m}</b> 分', ko: '<b>{n}</b>개 정거장 · <b>{d}</b>m · 약 <b>{m}</b>분', th: '<b>{n}</b> จุด · <b>{d}</b>m · ~<b>{m}</b> นาที', vi: '<b>{n}</b> điểm · <b>{d}</b>m · ~<b>{m}</b> phút', ms: '<b>{n}</b> hentian · <b>{d}</b>m · ~<b>{m}</b> min', id: '<b>{n}</b> pemberhentian · <b>{d}</b>m · ~<b>{m}</b> mnt', fil: '<b>{n}</b> hinto · <b>{d}</b>m · ~<b>{m}</b> min' },
        'tour.leg': { zh: '→ 下一站 <b>{name}</b> · <b>{d}</b>m · 约 <b>{m}</b> 分钟', en: '→ Next <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> min', tw: '→ 下一站 <b>{name}</b> · <b>{d}</b>m · 約 <b>{m}</b> 分鐘', ja: '→ 次は <b>{name}</b> · <b>{d}</b>m · 約 <b>{m}</b> 分', ko: '→ 다음 <b>{name}</b> · <b>{d}</b>m · 약 <b>{m}</b>분', th: '→ ถัดไป <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> นาที', vi: '→ Tiếp <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> phút', ms: '→ Seterusnya <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> min', id: '→ Lanjut <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> mnt', fil: '→ Susunod <b>{name}</b> · <b>{d}</b>m · ~<b>{m}</b> min' },
        'tour.last.leg': { zh: '→ 这是最后一站', en: '→ Final stop', tw: '→ 這是最後一站', ja: '→ 最終駅', ko: '→ 마지막 정거장', th: '→ จุดสุดท้าย', vi: '→ Điểm cuối', ms: '→ Hentian terakhir', id: '→ Pemberhentian terakhir', fil: '→ Huling hintuan' },
        'tour.start.from.here': { zh: '从「我的位置」开始', en: 'Start from My Location', tw: '從「我的位置」開始', ja: '「マイ位置」から開始', ko: '내 위치에서 시작', th: 'เริ่มจากตำแหน่งของฉัน', vi: 'Bắt đầu từ Vị trí của tôi', ms: 'Mula dari Lokasi Saya', id: 'Mulai dari Lokasi Saya', fil: 'Magsimula sa Aking Lokasyon' },
        'tour.start.from.gate': { zh: '从「学院大门」开始', en: 'Start from Main Gate', tw: '從「學院大門」開始', ja: '「学院正門」から開始', ko: '정문에서 시작', th: 'เริ่มจากประตูหลัก', vi: 'Bắt đầu từ Cổng chính', ms: 'Mula dari Pintu Utama', id: 'Mulai dari Gerbang Utama', fil: 'Magsimula sa Main Gate' },
        'tour.mode.change': { zh: '切换模式', en: 'Change route', tw: '切換模式', ja: 'モード切替', ko: '모드 변경', th: 'เปลี่ยนโหมด', vi: 'Đổi chế độ', ms: 'Tukar mod', id: 'Ganti mode', fil: 'Palitan mode' },
        'tour.legend.active': { zh: '当前段', en: 'Current leg', tw: '當前段', ja: '現在の区間', ko: '현재 구간', th: 'ช่วงปัจจุบัน', vi: 'Đoạn hiện tại', ms: 'Laluan semasa', id: 'Ruas saat ini', fil: 'Kasalukuyang leg' },
        'tour.legend.upcoming': { zh: '未到达', en: 'Upcoming', tw: '未到達', ja: '未到達', ko: '미도착', th: 'ที่ยังไม่ถึง', vi: 'Chưa tới', ms: 'Belum tiba', id: 'Belum tiba', fil: 'Hindi pa nararating' },

        // 热门地点快捷 chips（v3.21）
        'quick.canteen': { zh: '食堂', en: 'Canteen', tw: '食堂', ja: '食堂', ko: '식당', th: 'โรงอาหาร', vi: 'Nhà ăn', ms: 'Kafeteria', id: 'Kantin', fil: 'Kantina' },
        'quick.express': { zh: '快递站', en: 'Express', tw: '快遞站', ja: '宅配便', ko: '택배', th: 'จุดรับส่งพัสดุ', vi: 'Bưu kiện', ms: 'Ekspres', id: 'Ekspres', fil: 'Express' },
        'quick.field': { zh: '运动场', en: 'Sports Field', tw: '運動場', ja: '運動場', ko: '운동장', th: 'สนามกีฬา', vi: 'Sân thể thao', ms: 'Padang Sukan', id: 'Lapangan Olahraga', fil: 'Palaruan' },
        'quick.medical': { zh: '医务室', en: 'Clinic', tw: '醫務室', ja: '医務室', ko: '의무실', th: 'ห้องพยาบาล', vi: 'Phòng y tế', ms: 'Klinik', id: 'Klinik', fil: 'Klinika' },

        // 导航
        'nav.title': { zh: '路线导航', en: 'Route Navigation', tw: '路線導航', ja: 'ルート案内', ko: '경로 안내', th: 'นำทางเส้นทาง', vi: 'Dẫn đường', ms: 'Navigasi Laluan', id: 'Navigasi Rute', fil: 'Nabigasyon ng Ruta' },
        'nav.start': { zh: '起点', en: 'Start', tw: '起點', ja: '出発', ko: '출발', th: 'จุดเริ่ม', vi: 'Điểm đi', ms: 'Mula', id: 'Mulai', fil: 'Simula' },
        'nav.end': { zh: '终点', en: 'Destination', tw: '終點', ja: '到着', ko: '도착', th: 'ปลายทาง', vi: 'Điểm đến', ms: 'Destinasi', id: 'Tujuan', fil: 'Destinasyon' },
        'nav.addway': { zh: '添加途经点', en: 'Add Waypoint', tw: '添加途經點', ja: '経由地を追加', ko: '경유지 추가', th: 'เพิ่มจุดแวะ', vi: 'Thêm điểm đi qua', ms: 'Tambah Titik Laluan', id: 'Tambah Titik Antara', fil: 'Magdagdag ng Waypoint' },
        'nav.go': { zh: '开始导航', en: 'Start Navigation', tw: '開始導航', ja: '案内開始', ko: '안내 시작', th: 'เริ่มนำทาง', vi: 'Bắt đầu dẫn đường', ms: 'Mula Navigasi', id: 'Mulai Navigasi', fil: 'Simulan ang Nabigasyon' },
        'nav.clear': { zh: '清除路线', en: 'Clear Route', tw: '清除路線', ja: 'ルートを消去', ko: '경로 지우기', th: 'ล้างเส้นทาง', vi: 'Xóa lộ trình', ms: 'Kosongkan Laluan', id: 'Hapus Rute', fil: 'I-clear ang Ruta' },
        'nav.way': { zh: '途经', en: 'Via', tw: '途經', ja: '経由', ko: '경유', th: 'ผ่าน', vi: 'Qua', ms: 'Melalui', id: 'Lewat', fil: 'Daan' },
        'nav.alt.diff': { zh: '+{d}m', en: '+{d}m', tw: '+{d}m', ja: '+{d}m', ko: '+{d}m', th: '+{d}m', vi: '+{d}m', ms: '+{d}m', id: '+{d}m', fil: '+{d}m' },
        'nav.straight': { zh: '继续直行 {d}m', en: 'Continue {d}m', tw: '繼續直行 {d}m', ja: 'このまま {d}m 直進', ko: '직진 {d}m', th: 'ตรงไป {d}m', vi: 'Đi thẳng {d}m', ms: 'Terus {d}m', id: 'Lurus {d}m', fil: 'Tuloy {d}m' },
        'nav.turn.right': { zh: '右转', en: 'Turn right', tw: '右轉', ja: '右折', ko: '우회전', th: 'เลี้ยวขวา', vi: 'Rẽ phải', ms: 'Belok kanan', id: 'Belok kanan', fil: 'Kumanan' },
        'nav.turn.left': { zh: '左转', en: 'Turn left', tw: '左轉', ja: '左折', ko: '좌회전', th: 'เลี้ยวซ้าย', vi: 'Rẽ trái', ms: 'Belok kiri', id: 'Belok kiri', fil: 'Kaliwa' },
        'nav.turn.slight.right': { zh: '向右前方', en: 'Bear right', tw: '向右前方', ja: '右方向', ko: '오른쪽 방향', th: 'เลี้ยวขวาเล็กน้อย', vi: 'Chếch phải', ms: 'Condong kanan', id: 'Sedikit kanan', fil: 'Medyo kanan' },
        'nav.turn.slight.left': { zh: '向左前方', en: 'Bear left', tw: '向左前方', ja: '左方向', ko: '왼쪽 방향', th: 'เลี้ยวซ้ายเล็กน้อย', vi: 'Chếch trái', ms: 'Condong kiri', id: 'Sedikit kiri', fil: 'Medyo kaliwa' },
        'nav.steps.title': { zh: '转向指引', en: 'Turn-by-turn', tw: '轉向指引', ja: 'ターン案内', ko: '회전 안내', th: 'คำแนะนำเลี้ยว', vi: 'Hướng dẫn rẽ', ms: 'Panduan belok', id: 'Panduan belok', fil: 'Patnubay sa liko' },
        'nav.crow.fly': { zh: '直线 {d}m', en: 'As the crow flies {d}m', tw: '直線 {d}m', ja: '直線 {d}m', ko: '직선 {d}m', th: 'เส้นตรง {d}m', vi: 'Đường chim bay {d}m', ms: 'Laluan lurus {d}m', id: 'Jarak lurus {d}m', fil: 'Tuluy-tuyoy {d}m' },
        'nav.detour': { zh: '绕路 +{d}m (+{p}%)', en: 'Detour +{d}m (+{p}%)', tw: '繞路 +{d}m (+{p}%)', ja: '遠回り +{d}m (+{p}%)', ko: '우회 +{d}m (+{p}%)', th: 'อ้อม +{d}m (+{p}%)', vi: 'Đường vòng +{d}m (+{p}%)', ms: 'Pusing +{d}m (+{p}%)', id: 'Memutar +{d}m (+{p}%)', fil: 'Ikilo +{d}m (+{p}%)' },
        'nav.alt.nearest': { zh: '最近', en: 'Nearest', tw: '最近', ja: '最短', ko: '최단', th: 'ใกล้ที่สุด', vi: 'Gần nhất', ms: 'Terdekat', id: 'Terdekat', fil: 'Pinakamalapit' },
        'nav.alt.alt': { zh: '备选', en: 'Alt', tw: '備選', ja: '代替', ko: '대체', th: 'ทางเลือก', vi: 'Phụ', ms: 'Alternatif', id: 'Alternatif', fil: 'Alteratibo' },
        'nav.nearest.group': { zh: '最近（按步行距离）', en: 'Nearest (by walking distance)', tw: '最近（按步行距離）', ja: '近い順（徒歩距離）', ko: '가까운 순(도보 거리)', th: 'ใกล้ที่สุด(ระยะเดิน)', vi: 'Gần nhất(theo khoảng đi bộ)', ms: 'Terdekat (jarak jalan)', id: 'Terdekat (jarak jalan kaki)', fil: 'Pinakamalapit (ayon sa nilakad)' },
        'nav.all.places': { zh: '全部地点', en: 'All places', tw: '全部地點', ja: 'すべての場所', ko: '모든 장소', th: 'สถานที่ทั้งหมด', vi: 'Tất cả địa điểm', ms: 'Semua tempat', id: 'Semua tempat', fil: 'Lahat ng lugar' },
        'nav.tour.auto.title': { zh: '🎓 新生导览', en: '🎓 Freshman Tour', tw: '🎓 新生導覽', ja: '🎓 新入生ガイド', ko: '🎓 신입생 투어', th: '🎓 ทัวร์นักศึกษาใหม่', vi: '🎓 Tour tân sinh viên', ms: '🎓 Lawatan Pelajar Baru', id: '🎓 Tur Mahasiswa Baru', fil: '🎓 Tour ng Freshman' },

        // 图例
        'legend.title': { zh: '图例', en: 'Legend', tw: '圖例', ja: '凡例', ko: '범례', th: 'คำอธิบายสัญลักษณ์', vi: 'Chú giải', ms: 'Petunjuk', id: 'Legenda', fil: 'Alamat' },

        // 列表页
        'list.title': { zh: '校园地图', en: 'Campus Map', tw: '校園地圖', ja: 'キャンパスマップ', ko: '캠퍼스 지도', th: 'แผนที่วิทยาเขต', vi: 'Bản đồ trường', ms: 'Peta Kampus', id: 'Peta Kampus', fil: 'Mapa ng Campus' },
        'list.subtitle': { zh: '建筑定位 · 路线导航', en: 'Location · Navigation', tw: '建築定位 · 路線導航', ja: '位置確認・ルート案内', ko: '위치 · 길찾기', th: 'ระบุตำแหน่ง · นำทาง', vi: 'Định vị · Dẫn đường', ms: 'Lokasi · Navigasi', id: 'Lokasi · Navigasi', fil: 'Lokasyon · Nabigasyon' },
        'list.all': { zh: '全部', en: 'All', tw: '全部', ja: 'すべて', ko: '전체', th: 'ทั้งหมด', vi: 'Tất cả', ms: 'Semua', id: 'Semua', fil: 'Lahat' },
        'list.count': { zh: '共 <b>{n}</b> 个地点', en: '<b>{n}</b> places', tw: '共 <b>{n}</b> 個地點', ja: '合計 <b>{n}</b> 地点', ko: '총 <b>{n}</b>개 장소', th: 'รวม <b>{n}</b> สถานที่', vi: 'Tổng <b>{n}</b> địa điểm', ms: 'Jumlah <b>{n}</b> tempat', id: 'Total <b>{n}</b> tempat', fil: 'Kabuuang <b>{n}</b> lugar' },
        'list.found': { zh: '找到 <b>{n}</b> / {total} 个地点', en: 'Found <b>{n}</b> / {total}', tw: '找到 <b>{n}</b> / {total} 個地點', ja: '<b>{n}</b> / {total} 件見つかりました', ko: '<b>{n}</b> / {total}개 찾음', th: 'พบ <b>{n}</b> / {total} สถานที่', vi: 'Tìm thấy <b>{n}</b> / {total}', ms: 'Dijumpai <b>{n}</b> / {total}', id: 'Ditemukan <b>{n}</b> / {total}', fil: 'Nahanap <b>{n}</b> / {total}' },
        'list.empty': { zh: '未找到匹配的建筑', en: 'No matching building found', tw: '未找到匹配的建築', ja: '一致する建物が見つかりません', ko: '일치하는 건물이 없습니다', th: 'ไม่พบอาคารที่ตรงกัน', vi: 'Không tìm thấy tòa nhà phù hợp', ms: 'Tiada bangunan sepadan', id: 'Tidak ada gedung yang cocok', fil: 'Walang nahanap na katugmang gusali' },
        'list.empty.hint': { zh: '试试其他关键词，或点右下角 ➕ 添加新地点', en: 'Try other keywords, or add a new place', tw: '試試其他關鍵詞，或點右下角 ➕ 添加新地點', ja: '別のキーワードを試すか、右下の ➕ で新規追加', ko: '다른 키워드를 시도하거나 ➕ 로 새 장소 추가', th: 'ลองคำอื่น หรือเพิ่มสถานที่ใหม่', vi: 'Thử từ khóa khác hoặc thêm địa điểm mới', ms: 'Cuba kata lain, atau tambah tempat baharu', id: 'Coba kata lain, atau tambah tempat baru', fil: 'Subukan ang ibang keyword, o magdagdag ng bagong lugar' },

        // 地点详情
        'info.hours': { zh: '开放时间', en: 'Hours', tw: '開放時間', ja: '開放時間', ko: '개방 시간', th: 'เวลาเปิด', vi: 'Giờ mở cửa', ms: 'Waktu Buka', id: 'Jam Buka', fil: 'Oras ng Bukas' },
        'info.phone': { zh: '联系电话', en: 'Phone', tw: '聯繫電話', ja: '電話番号', ko: '연락처', th: 'โทรศัพท์', vi: 'Điện thoại', ms: 'Telefon', id: 'Telepon', fil: 'Telepono' },
        'info.floors': { zh: '楼层', en: 'Floors', tw: '樓層', ja: '階数', ko: '층수', th: 'ชั้น', vi: 'Số tầng', ms: 'Tingkat', id: 'Lantai', fil: 'Palapag' },
        'info.meta': { zh: '详细信息', en: 'Details', tw: '詳細資訊', ja: '詳細情報', ko: '상세 정보', th: 'รายละเอียด', vi: 'Chi tiết', ms: 'Butiran', id: 'Detail', fil: 'Mga Detalye' },
        'info.fav': { zh: '收藏', en: 'Favorite', tw: '收藏', ja: 'お気に入り', ko: '즐겨찾기', th: 'รายการโปรด', vi: 'Yêu thích', ms: 'Kegemaran', id: 'Favorit', fil: 'Paborito' },
        'info.faved': { zh: '已收藏「{name}」', en: 'Favorited "{name}"', tw: '已收藏「{name}」', ja: '「{name}」をお気に入りに追加', ko: '「{name}」즐겨찾기 추가', th: 'เพิ่ม "{name}" ในรายการโปรด', vi: 'Đã yêu thích "{name}"', ms: 'Kegemaran "{name}" ditambah', id: 'Favorit "{name}" ditambahkan', fil: 'Idinagdag ang "{name}" sa paborito' },
        'info.unfav': { zh: '已取消收藏', en: 'Removed from favorites', tw: '已取消收藏', ja: 'お気に入り解除', ko: '즐겨찾기 해제', th: 'นำออกจากรายการโปรด', vi: 'Đã bỏ yêu thích', ms: 'Dikeluarkan dari kegemaran', id: 'Dihapus dari favorit', fil: 'Inalis sa paborito' },
        'info.share.title': { zh: '文轩遂宁校区', en: 'Wenxuan Suining Campus', tw: '文軒遂寧校區', ja: '文軒遂寧キャンパス', ko: '원쉬안 쑤이닝 캠퍼스', th: 'วิทยาเขตซุยหนิง', vi: 'Khu Suining', ms: 'Kampus Suining', id: 'Kampus Suining', fil: 'Suining Campus' },
        'info.share.copied': { zh: '链接已复制，发给同学就能直达这里', en: 'Link copied, share it to reach here directly', tw: '連結已複製，發給同學就能直達這裡', ja: 'リンクをコピーしました。共有でここへ直行', ko: '링크 복사됨. 공유하면 바로 여기로', th: 'คัดลอกลิงก์แล้ว แชร์ให้เพื่อนมาถึงที่นี่ได้เลย', vi: 'Đã sao chép liên kết, chia sẻ để đến đây', ms: 'Pautan disalin, kongsi untuk terus ke sini', id: 'Tautan disalin, bagikan untuk langsung ke sini', fil: 'Nakopya ang link, ibahagi para direktang makarating dito' },
        'info.mine': { zh: '我的', en: 'Mine', tw: '我的', ja: 'マイ', ko: '내 것', th: 'ของฉัน', vi: 'Của tôi', ms: 'Saya', id: 'Milik Saya', fil: 'Akin' },
        'info.locate': { zh: '定位', en: 'Locate', tw: '定位', ja: '定位', ko: '위치', th: 'ระบุตำแหน่ง', vi: 'Định vị', ms: 'Cari', id: 'Lokasi', fil: 'Hanapin' },
        'info.from': { zh: '从这里出发', en: 'Start Here', tw: '從這裡出發', ja: 'ここから出発', ko: '여기서 출발', th: 'เริ่มจากที่นี่', vi: 'Đi từ đây', ms: 'Mula Sini', id: 'Mulai dari Sini', fil: 'Simula Dito' },
        'info.to': { zh: '到这里去', en: 'Go Here', tw: '到這裡去', ja: 'ここへ行く', ko: '여기로 이동', th: 'ไปที่นี่', vi: 'Đến đây', ms: 'Pergi Sini', id: 'Ke Sini', fil: 'Pumunta Dito' },
        'info.amap': { zh: '高德导航到这里（校外过来）', en: 'Navigate here via Amap', tw: '高德導航到這裡（校外過來）', ja: '高徳地図でここへ（校外から）', ko: '아맵으로 여기 안내(교외)', th: 'นำทางมาที่นี่ (จากนอกโรงเรียน)', vi: 'Dẫn đường đến đây (từ ngoài trường)', ms: 'Navigasi ke sini (dari luar kampus)', id: 'Navigasi ke sini (dari luar kampus)', fil: 'Mag-navigate dito (mula sa labas)' },
        'info.share': { zh: '分享', en: 'Share', tw: '分享', ja: '共有', ko: '공유', th: 'แชร์', vi: 'Chia sẻ', ms: 'Kongsi', id: 'Bagikan', fil: 'Ibahagi' },
        'info.edit': { zh: '编辑地点', en: 'Edit Place', tw: '編輯地點', ja: '地点を編集', ko: '장소 편집', th: 'แก้ไขสถานที่', vi: 'Sửa địa điểm', ms: 'Edit Tempat', id: 'Edit Tempat', fil: 'I-edit ang Lugar' },
        'info.del': { zh: '删除', en: 'Delete', tw: '刪除', ja: '削除', ko: '삭제', th: 'ลบ', vi: 'Xóa', ms: 'Padam', id: 'Hapus', fil: 'Burahin' },
        'info.del.confirm': { zh: '再点一次确认', en: 'Tap again to confirm', tw: '再點一次確認', ja: 'もう一度タップで確認', ko: '한 번 더 눌러 확인', th: 'แตะอีกครั้งเพื่อยืนยัน', vi: 'Chạm lại để xác nhận', ms: 'Ketik sekali lagi untuk sahkan', id: 'Ketuk lagi untuk konfirmasi', fil: 'I-tap muli upang kumpirmahin' },
        'info.note': { zh: '我的备注', en: 'My Note', tw: '我的備註', ja: 'マイメモ', ko: '내 메모', th: 'บันทึกของฉัน', vi: 'Ghi chú của tôi', ms: 'Nota Saya', id: 'Catatan Saya', fil: 'Aking Tala' },
        'info.note.ph': { zh: '记点备忘，如：期末考试期间开放到 23:00', en: 'Add a note, e.g. open till 23:00 during exams', tw: '記點備忘，如：期末考試期間開放到 23:00', ja: 'メモ例：試験期間中は 23:00 まで開放', ko: '메모 예: 시험 기간 23:00까지 개방', th: 'จดบันทึก เช่น เปิดถึง 23:00 ช่วงสอบ', vi: 'Ghi chú, vd: mở đến 23:00 trong kỳ thi', ms: 'Tambah nota, cth: buka hingga 23:00 musim peperiksaan', id: 'Tambah catatan, mis. buka sampai 23:00 saat ujian', fil: 'Magdagdag ng tala, hal. bukas hanggang 23:00 tuwing eksam' },
        'info.note.saved': { zh: '已保存 ✓', en: 'Saved ✓', tw: '已儲存 ✓', ja: '保存済み ✓', ko: '저장됨 ✓', th: 'บันทึกแล้ว ✓', vi: 'Đã lưu ✓', ms: 'Disimpan ✓', id: 'Tersimpan ✓', fil: 'Na-save ✓' },
        'info.note.local': { zh: '仅保存在本机', en: 'Local only', tw: '僅保存在本機', ja: '端末のみ保存', ko: '기기에만 저장', th: 'บันทึกเฉพาะเครื่อง', vi: 'Chỉ lưu cục bộ', ms: 'Simpanan setempat', id: 'Hanya lokal', fil: 'Lokal lamang' },

        // 地点数据报错反馈（v3.21）
        'poi.feedback.entry': { zh: '数据报错', en: 'Report Error', tw: '資料報錯', ja: 'データ誤り報告', ko: '데이터 오류 신고', th: 'แจ้งข้อมูลผิด', vi: 'Báo lỗi dữ liệu', ms: 'Lapor Ralat', id: 'Laporkan Kesalahan', fil: 'Iulat ang Mali' },
        'poi.feedback.title': { zh: '数据报错', en: 'Report Error', tw: '資料報錯', ja: 'データ誤り報告', ko: '데이터 오류 신고', th: 'แจ้งข้อมูลผิด', vi: 'Báo lỗi dữ liệu', ms: 'Lapor Ralat', id: 'Laporkan Kesalahan', fil: 'Iulat ang Mali' },
        'poi.feedback.type.closed': { zh: '地点关闭', en: 'Place closed', tw: '地點關閉', ja: '場所閉鎖', ko: '장소 폐쇄', th: 'สถานที่ปิด', vi: 'Địa điểm đóng cửa', ms: 'Tempat tutup', id: 'Tempat tutup', fil: 'Sarado ang lugar' },
        'poi.feedback.type.coords': { zh: '坐标错误', en: 'Wrong location', tw: '座標錯誤', ja: '座標誤り', ko: '좌표 오류', th: 'พิกัดผิด', vi: 'Sai tọa độ', ms: 'Koordinat salah', id: 'Koordinat salah', fil: 'Maling lokasyon' },
        'poi.feedback.type.info': { zh: '信息错误', en: 'Wrong info', tw: '資訊錯誤', ja: '情報誤り', ko: '정보 오류', th: 'ข้อมูลผิด', vi: 'Sai thông tin', ms: 'Maklumat salah', id: 'Informasi salah', fil: 'Maling impormasyon' },
        'poi.feedback.type.other': { zh: '其他', en: 'Other', tw: '其他', ja: 'その他', ko: '기타', th: 'อื่นๆ', vi: 'Khác', ms: 'Lain-lain', id: 'Lainnya', fil: 'Iba pa' },
        'poi.feedback.text': { zh: '备注', en: 'Note', tw: '備註', ja: '備考', ko: '비고', th: 'หมายเหตุ', vi: 'Ghi chú', ms: 'Nota', id: 'Catatan', fil: 'Tala' },
        'poi.feedback.text.ph': { zh: '请描述问题（100 字以内）', en: 'Describe the issue (max 100 chars)', tw: '請描述問題（100 字以內）', ja: '問題を記入（100文字以内）', ko: '문제 설명(100자 이내)', th: 'อธิบายปัญหา(ไม่เกิน 100 ตัว)', vi: 'Mô tả vấn đề(tối đa 100 ký tự)', ms: 'Terangkan masalah(maks 100 aksara)', id: 'Jelaskan masalah(maks 100 karakter)', fil: 'Ilarawan ang isyu(max 100 karakter)' },
        'poi.feedback.submit': { zh: '提交反馈', en: 'Submit', tw: '提交反饋', ja: '送信', ko: '제출', th: 'ส่ง', vi: 'Gửi', ms: 'Hantar', id: 'Kirim', fil: 'Isumite' },
        'poi.feedback.done': { zh: '感谢反馈，我们会尽快核实', en: 'Thanks! We will verify soon', tw: '感謝反饋，我們會盡快核實', ja: 'ご報告ありがとうございます。確認します', ko: '감사합니다. 곧 확인하겠습니다', th: 'ขอบคุณ เราจะตรวจสอบเร็วๆ นี้', vi: 'Cảm ơn! Chúng tôi sẽ sớm xác minh', ms: 'Terima kasih! Kami akan semak segera', id: 'Terima kasih! Kami akan segera memverifikasi', fil: 'Salamat! Susuriin namin sa lalong madaling panahon' },

        // 添加/编辑地点
        'add.title': { zh: '添加新地标', en: 'Add New Place', tw: '添加新地標', ja: '新しい地点を追加', ko: '새 장소 추가', th: 'เพิ่มสถานที่ใหม่', vi: 'Thêm địa điểm mới', ms: 'Tambah Tempat Baharu', id: 'Tambah Tempat Baru', fil: 'Magdagdag ng Bagong Lugar' },
        'add.name.ph': { zh: '输入地标名称（如：实验楼）', en: 'Place name (e.g. Lab Building)', tw: '輸入地標名稱（如：實驗樓）', ja: '地点名（例：実験棟）', ko: '장소 이름(예: 실험동)', th: 'ชื่อสถานที่ (เช่น อาคารทดลอง)', vi: 'Tên địa điểm (vd: nhà thí nghiệm)', ms: 'Nama tempat (cth: Bangunan Makmal)', id: 'Nama tempat (mis. Gedung Lab)', fil: 'Pangalan ng lugar (hal. Gusaling Lab)' },
        'add.confirm': { zh: '确认添加', en: 'Add', tw: '確認添加', ja: '追加', ko: '추가', th: 'เพิ่ม', vi: 'Thêm', ms: 'Tambah', id: 'Tambah', fil: 'Idagdag' },
        'edit.title': { zh: '编辑地点', en: 'Edit Place', tw: '編輯地點', ja: '地点を編集', ko: '장소 편집', th: 'แก้ไขสถานที่', vi: 'Sửa địa điểm', ms: 'Edit Tempat', id: 'Edit Tempat', fil: 'I-edit ang Lugar' },
        'edit.name.ph': { zh: '地点名称', en: 'Place name', tw: '地點名稱', ja: '地点名', ko: '장소 이름', th: 'ชื่อสถานที่', vi: 'Tên địa điểm', ms: 'Nama tempat', id: 'Nama tempat', fil: 'Pangalan ng lugar' },
        'edit.desc.ph': { zh: '一句话简介（可选）', en: 'Short description (optional)', tw: '一句話簡介（可選）', ja: '一言紹介（任意）', ko: '한 줄 소개(선택)', th: 'คำอธิบายสั้น (ไม่บังคับ)', vi: 'Mô tả ngắn (tùy chọn)', ms: 'Penerangan ringkas (pilihan)', id: 'Deskripsi singkat (opsional)', fil: 'Maikling deskripsyon (opsyonal)' },
        'edit.move': { zh: '调整位置（点地图或拖圆点）', en: 'Adjust position (tap map or drag)', tw: '調整位置（點地圖或拖圓點）', ja: '位置を調整（地図タップ/ドラッグ）', ko: '위치 조정(지도 탭/드래그)', th: 'ปรับตำแหน่ง (แตะแผนที่หรือลาก)', vi: 'Điều chỉnh vị trí (chạm bản đồ hoặc kéo)', ms: 'Laraskan kedudukan (ketik peta atau seret)', id: 'Sesuaikan posisi (ketuk peta atau seret)', fil: 'Ayusin ang posisyon (i-tap ang mapa o i-drag)' },
        'edit.save': { zh: '保存修改', en: 'Save', tw: '儲存修改', ja: '変更を保存', ko: '저장', th: 'บันทึก', vi: 'Lưu', ms: 'Simpan', id: 'Simpan', fil: 'I-save' },
        'edit.restore': { zh: '恢复默认', en: 'Restore Default', tw: '恢復預設', ja: 'デフォルトに戻す', ko: '기본값 복원', th: 'คืนค่าเริ่มต้น', vi: 'Khôi phục mặc định', ms: 'Pulihkan Asal', id: 'Pulihkan Bawaan', fil: 'Ibalik ang Default' },
        'edit.del': { zh: '删除该地点', en: 'Delete This Place', tw: '刪除該地點', ja: 'この地点を削除', ko: '이 장소 삭제', th: 'ลบสถานที่นี้', vi: 'Xóa địa điểm này', ms: 'Padam Tempat Ini', id: 'Hapus Tempat Ini', fil: 'Burahin ang Lugar na Ito' },

        // 个人中心
        'profile.title': { zh: '个人中心', en: 'Profile', tw: '個人中心', ja: 'マイページ', ko: '마이페이지', th: 'โปรไฟล์', vi: 'Cá nhân', ms: 'Profil', id: 'Profil', fil: 'Profile' },
        'profile.landmarks': { zh: '我的地标', en: 'My Places', tw: '我的地標', ja: 'マイ地点', ko: '내 장소', th: 'สถานที่ของฉัน', vi: 'Địa điểm của tôi', ms: 'Tempat Saya', id: 'Tempat Saya', fil: 'Aking mga Lugar' },
        'profile.fav': { zh: '收藏', en: 'Favorites', tw: '收藏', ja: 'お気に入り', ko: '즐겨찾기', th: 'รายการโปรด', vi: 'Yêu thích', ms: 'Kegemaran', id: 'Favorit', fil: 'Mga Paborito' },
        'profile.history': { zh: '浏览过', en: 'Viewed', tw: '瀏覽過', ja: '閲覧履歴', ko: '본 항목', th: 'เคยดู', vi: 'Đã xem', ms: 'Dilihat', id: 'Dilihat', fil: 'Tiningnan' },
        'profile.add': { zh: '去添加', en: 'Add', tw: '去添加', ja: '追加', ko: '추가', th: 'เพิ่ม', vi: 'Thêm', ms: 'Tambah', id: 'Tambah', fil: 'Magdagdag' },
        'profile.sort.hint': { zh: '长按拖动排序', en: 'Long-press to reorder', tw: '長按拖動排序', ja: '長押しで並べ替え', ko: '길게 눌러 정렬', th: 'กดค้างเพื่อจัดเรียง', vi: 'Nhấn giữ để sắp xếp', ms: 'Tekan lama untuk susun', id: 'Tekan lama untuk urutkan', fil: 'Pindutin nang matagal para ayusin' },
        'profile.recent': { zh: '最近浏览', en: 'Recently Viewed', tw: '最近瀏覽', ja: '最近見た場所', ko: '최근 본 곳', th: 'ดูเมื่อเร็วๆ นี้', vi: 'Xem gần đây', ms: 'Baru Dilihat', id: 'Baru Dilihat', fil: 'Kamakailang Tiningnan' },
        'profile.settings': { zh: '设置', en: 'Settings', tw: '設置', ja: '設定', ko: '설정', th: 'การตั้งค่า', vi: 'Cài đặt', ms: 'Tetapan', id: 'Pengaturan', fil: 'Mga Setting' },
        'profile.sos': { zh: '紧急求助', en: 'Emergency', tw: '緊急求助', ja: '緊急連絡', ko: '긴급 도움', th: 'ขอความช่วยเหลือฉุกเฉิน', vi: 'Khẩn cấp', ms: 'Kecemasan', id: 'Darurat', fil: 'Emergency' },
        'profile.sos.desc': { zh: '一键呼叫校园保卫处', en: 'Call campus security', tw: '一鍵呼叫校園保衛處', ja: '守衛室へワンタップ通話', ko: '캠퍼스 경비실 원탭 통화', th: 'โทรหาหน่วยรักษาความปลอดภัย', vi: 'Gọi bảo vệ trường một chạm', ms: 'Panggil keselamatan kampus', id: 'Panggil keamanan kampus', fil: 'Tawagan ang campus security' },
        'profile.clear.history': { zh: '清空浏览记录', en: 'Clear History', tw: '清空瀏覽記錄', ja: '閲覧履歴を消去', ko: '기록 지우기', th: 'ล้างประวัติ', vi: 'Xóa lịch sử', ms: 'Kosongkan Sejarah', id: 'Hapus Riwayat', fil: 'I-clear ang Kasaysayan' },
        'profile.help': { zh: '帮助与反馈', en: 'Help & Feedback', tw: '幫助與反饋', ja: 'ヘルプ・フィードバック', ko: '도움말 및 피드백', th: 'ช่วยเหลือและติชม', vi: 'Trợ giúp & Góp ý', ms: 'Bantuan & Maklum Balas', id: 'Bantuan & Umpan Balik', fil: 'Tulong at Feedback' },

        // 设置
        'settings.title': { zh: '设置', en: 'Settings', tw: '設置', ja: '設定', ko: '설정', th: 'การตั้งค่า', vi: 'Cài đặt', ms: 'Tetapan', id: 'Pengaturan', fil: 'Mga Setting' },
        'settings.appearance': { zh: '外观', en: 'Appearance', tw: '外觀', ja: '外観', ko: '외관', th: 'รูปลักษณ์', vi: 'Giao diện', ms: 'Penampilan', id: 'Tampilan', fil: 'Hitsura' },
        'settings.location': { zh: '位置', en: 'Location', tw: '位置', ja: '位置', ko: '위치', th: 'ตำแหน่ง', vi: 'Vị trí', ms: 'Lokasi', id: 'Lokasi', fil: 'Lokasyon' },
        'settings.privacy': { zh: '隐私', en: 'Privacy', tw: '隱私', ja: 'プライバシー', ko: '개인정보', th: 'ความเป็นส่วนตัว', vi: 'Quyền riêng tư', ms: 'Privasi', id: 'Privasi', fil: 'Pagkapribado' },
        'settings.general': { zh: '通用', en: 'General', tw: '通用', ja: '一般', ko: '일반', th: 'ทั่วไป', vi: 'Chung', ms: 'Umum', id: 'Umum', fil: 'Pangkalahatan' },
        'settings.about': { zh: '关于', en: 'About', tw: '關於', ja: 'このアプリ', ko: '정보', th: 'เกี่ยวกับ', vi: 'Giới thiệu', ms: 'Perihal', id: 'Tentang', fil: 'Tungkol' },
        'settings.language': { zh: '语言', en: 'Language', tw: '語言', ja: '言語', ko: '언어', th: 'ภาษา', vi: 'Ngôn ngữ', ms: 'Bahasa', id: 'Bahasa', fil: 'Wika' },
        'settings.theme': { zh: '主题模式', en: 'Theme', tw: '主題模式', ja: 'テーマ', ko: '테마', th: 'ธีม', vi: 'Chủ đề', ms: 'Tema', id: 'Tema', fil: 'Tema' },
        'settings.theme.desc': { zh: '深色更护眼，跟随系统会随手机自动切换', en: 'Dark mode eases eyes; system follows your phone', tw: '深色更護眼，跟隨系統會隨手機自動切換', ja: 'ダークは目に優しく、システムに追従', ko: '다크는 눈에 편하고 시스템을 따릅니다', th: 'โหมดมืดถนอมสายตา ตามระบบมือถือ', vi: 'Chế độ tối dịu mắt, theo hệ thống', ms: 'Mod gelap lebih selesa; ikut sistem', id: 'Mode gelap lebih nyaman; ikuti sistem', fil: 'Mas madilim ay mas banayad sa mata; sumusunod sa system' },
        'settings.theme.system': { zh: '跟随系统', en: 'System', tw: '跟隨系統', ja: 'システム', ko: '시스템', th: 'ตามระบบ', vi: 'Theo hệ thống', ms: 'Ikut Sistem', id: 'Ikuti Sistem', fil: 'System' },
        'settings.theme.light': { zh: '浅色', en: 'Light', tw: '淺色', ja: 'ライト', ko: '라이트', th: 'สว่าง', vi: 'Sáng', ms: 'Cerah', id: 'Terang', fil: 'Maliwanag' },
        'settings.theme.dark': { zh: '深色', en: 'Dark', tw: '深色', ja: 'ダーク', ko: '다크', th: 'มืด', vi: 'Tối', ms: 'Gelap', id: 'Gelap', fil: 'Madilim' },
        'settings.alpha': { zh: '透明度', en: 'Opacity', tw: '透明度', ja: '透明度', ko: '투명도', th: 'ความโปร่งใส', vi: 'Độ trong suốt', ms: 'Kelegapan', id: 'Opasitas', fil: 'Opacity' },
        'settings.blur': { zh: '模糊度', en: 'Blur', tw: '模糊度', ja: 'ぼかし', ko: '흐림', th: 'ความเบลอ', vi: 'Độ mờ', ms: 'Kekaburan', id: 'Blur', fil: 'Blur' },
        'settings.geo': { zh: '定位服务', en: 'Location Service', tw: '定位服務', ja: '位置情報サービス', ko: '위치 서비스', th: 'บริการระบุตำแหน่ง', vi: 'Dịch vụ định vị', ms: 'Perkhidmatan Lokasi', id: 'Layanan Lokasi', fil: 'Serbisyo ng Lokasyon' },
        'settings.geo.desc': { zh: '开启后自动获取设备位置，仅本地记录', en: 'On: get device location, stored locally only', tw: '開啟後自動取得裝置位置，僅本地記錄', ja: 'オンにすると端末位置を取得（端末内のみ）', ko: '켜면 기기 위치를 로컬에만 저장', th: 'เมื่อเปิดจะดึงตำแหน่งอุปกรณ์ บันทึกเฉพาะเครื่อง', vi: 'Bật: lấy vị trí thiết bị, chỉ lưu cục bộ', ms: 'Bila aktif: dapat lokasi peranti, simpanan setempat', id: 'Aktif: ambil lokasi perangkat, hanya lokal', fil: 'Kung naka-on: kunin ang lokasyon, lokal lamang' },
        'settings.geo.checking': { zh: '检测中', en: 'Checking', tw: '檢測中', ja: '確認中', ko: '확인 중', th: 'กำลังตรวจ', vi: 'Đang kiểm tra', ms: 'Menyemak', id: 'Memeriksa', fil: 'Sinusuri' },
        'settings.geo.request': { zh: '开启系统定位', en: 'Enable System Location', tw: '開啟系統定位', ja: 'システム位置情報を有効化', ko: '시스템 위치 켜기', th: 'เปิดตำแหน่งระบบ', vi: 'Bật định vị hệ thống', ms: 'Dayakan Lokasi Sistem', id: 'Aktifkan Lokasi Sistem', fil: 'I-enable ang System Location' },
        'geo.granted': { zh: '已授权', en: 'Granted', tw: '已授權', ja: '許可済み', ko: '허용됨', th: 'อนุญาตแล้ว', vi: 'Đã cấp', ms: 'Dibenarkan', id: 'Diizinkan', fil: 'Pinayagan' },
        'geo.denied': { zh: '已拒绝', en: 'Denied', tw: '已拒絕', ja: '拒否済み', ko: '거부됨', th: 'ถูกปฏิเสธ', vi: 'Bị từ chối', ms: 'Ditolak', id: 'Ditolak', fil: 'Tinanggihan' },
        'geo.prompt': { zh: '未开启', en: 'Not enabled', tw: '未開啟', ja: '未許可', ko: '미사용', th: 'ยังไม่เปิด', vi: 'Chưa bật', ms: 'Belum didayakan', id: 'Belum diaktifkan', fil: 'Hindi pa pinagana' },
        'geo.unsupported': { zh: '不支持', en: 'Unsupported', tw: '不支援', ja: '非対応', ko: '지원 안 함', th: 'ไม่รองรับ', vi: 'Không hỗ trợ', ms: 'Tidak disokong', id: 'Tidak didukung', fil: 'Hindi suportado' },
        'geo.unknown': { zh: '未知', en: 'Unknown', tw: '未知', ja: '不明', ko: '알 수 없음', th: 'ไม่ทราบ', vi: 'Không rõ', ms: 'Tidak diketahui', id: 'Tidak diketahui', fil: 'Hindi alam' },
        'geo.desc.granted': { zh: '浏览器定位权限已开启', en: 'Location permission granted', tw: '瀏覽器定位權限已開啟', ja: '位置情報権限は許可されています', ko: '위치 권한이 허용되었습니다', th: 'สิทธิ์ตำแหน่งได้รับอนุญาตแล้ว', vi: 'Quyền định vị đã được cấp', ms: 'Kebenaran lokasi diberikan', id: 'Izin lokasi diberikan', fil: 'Pinayagan ang pahintulot ng lokasyon' },
        'geo.desc.denied': { zh: '定位权限被拒绝，可在浏览器地址栏 🔒 图标中重新允许', en: 'Location denied; allow again via the 🔒 icon in the address bar', tw: '定位權限被拒絕，可在瀏覽器網址列 🔒 圖示中重新允許', ja: '位置情報が拒否されました。アドレスバーの 🔒 から再許可', ko: '위치 권한이 거부되었습니다. 주소창 🔒에서 다시 허용', th: 'ถูกปฏิเสธสิทธิ์ตำแหน่ง อนุญาตใหม่ได้ที่ไอคอน 🔒', vi: 'Định vị bị từ chối, cấp lại qua biểu tượng 🔒 trên thanh địa chỉ', ms: 'Lokasi ditolak; benarkan semula melalui ikon 🔒', id: 'Lokasi ditolak; izinkan lagi lewat ikon 🔒', fil: 'Tinanggihan ang lokasyon; payagan muli sa icon na 🔒' },
        'geo.desc.prompt': { zh: '打开「定位服务」开关即可申请权限', en: 'Toggle Location Service on to request permission', tw: '打開「定位服務」開關即可申請權限', ja: '「位置情報サービス」スイッチをオンにして申請', ko: '「위치 서비스」스위치를 켜면 권한 요청', th: 'เปิดสวิตช์ "บริการระบุตำแหน่ง" เพื่อขอสิทธิ์', vi: 'Bật công tắc "Dịch vụ định vị" để xin quyền', ms: 'Aktifkan suis "Perkhidmatan Lokasi" untuk memohon', id: 'Nyalakan sakelar "Layanan Lokasi" untuk meminta', fil: 'I-on ang switch na "Serbisyo ng Lokasyon" para humingi ng pahintulot' },
        'geo.desc.off': { zh: '定位已关闭，不获取设备位置', en: 'Location is off; device location not used', tw: '定位已關閉，不取得裝置位置', ja: '位置情報はオフです', ko: '위치 서비스가 꺼져 있습니다', th: 'ปิดการระบุตำแหน่งอยู่', vi: 'Định vị đã tắt', ms: 'Lokasi dimatikan', id: 'Lokasi dimatikan', fil: 'Naka-off ang lokasyon' },
        'geo.desc.unsupported': { zh: '当前浏览器不支持权限状态查询', en: 'This browser does not support permission query', tw: '當前瀏覽器不支援權限狀態查詢', ja: 'このブラウザは権限状態の照会に非対応', ko: '이 브라우저는 권한 상태 조회를 지원하지 않습니다', th: 'เบราว์เซอร์นี้ไม่รองรับการตรวจสอบสิทธิ์', vi: 'Trình duyệt này không hỗ trợ truy vấn quyền', ms: 'Pelayar ini tidak menyokong semakan kebenaran', id: 'Browser ini tidak mendukung pemeriksaan izin', fil: 'Hindi sinusuportahan ng browser ang pagsusuri ng pahintulot' },
        'geo.desc.unknown': { zh: '无法查询定位权限状态', en: 'Cannot query location permission', tw: '無法查詢定位權限狀態', ja: '位置情報権限を照会できません', ko: '위치 권한 상태를 조회할 수 없습니다', th: 'ไม่สามารถตรวจสอบสิทธิ์ตำแหน่งได้', vi: 'Không thể truy vấn quyền định vị', ms: 'Tidak dapat menyemak kebenaran lokasi', id: 'Tidak dapat memeriksa izin lokasi', fil: 'Hindi makuha ang pahintulot ng lokasyon' },
        'geo.got': { zh: '已获取设备位置（仅本地记录，不上传）', en: 'Got device location (local only)', tw: '已取得裝置位置（僅本地記錄，不上傳）', ja: '端末位置を取得（端末内のみ、アップロードなし）', ko: '기기 위치 획득(로컬만, 업로드 안 함)', th: 'ได้ตำแหน่งอุปกรณ์แล้ว (บันทึกเฉพาะเครื่อง)', vi: 'Đã lấy vị trí thiết bị (chỉ lưu cục bộ)', ms: 'Dapat lokasi peranti (setempat sahaja)', id: 'Mendapat lokasi perangkat (lokal saja)', fil: 'Nakuha ang lokasyon ng device (lokal lamang)' },
        'settings.myloc': { zh: '我的位置标记', en: 'My Location Marker', tw: '我的位置標記', ja: 'マイ位置マーカー', ko: '내 위치 표시', th: 'เครื่องหมายตำแหน่งของฉัน', vi: 'Đánh dấu vị trí của tôi', ms: 'Penanda Lokasi Saya', id: 'Penanda Lokasi Saya', fil: 'Marker ng Aking Lokasyon' },
        'settings.myloc.desc': { zh: '在地图上显示蓝色定位点，可拖动调整', en: 'Show a blue dot on the map; draggable', tw: '在地圖上顯示藍色定位點，可拖動調整', ja: '地図に青い点を表示。ドラッグで調整可', ko: '지도에 파란 점 표시. 드래그로 조정', th: 'แสดงจุดสีน้ำเงินบนแผนที่ ลากปรับได้', vi: 'Hiện chấm xanh trên bản đồ, kéo để chỉnh', ms: 'Tunjuk titik biru pada peta; boleh diseret', id: 'Tampilkan titik biru di peta; bisa digeser', fil: 'Magpakita ng asul na tuldok sa mapa; maaaring i-drag' },
        'settings.myloc.set': { zh: '在地图上设置位置', en: 'Set Location on Map', tw: '在地圖上設置位置', ja: '地図上で位置を設定', ko: '지도에서 위치 설정', th: 'ตั้งตำแหน่งบนแผนที่', vi: 'Đặt vị trí trên bản đồ', ms: 'Tetapkan Lokasi pada Peta', id: 'Atur Lokasi di Peta', fil: 'Itakda ang Lokasyon sa Mapa' },
        'settings.myloc.remove': { zh: '清除位置标记', en: 'Clear Location Marker', tw: '清除位置標記', ja: '位置マーカーを消去', ko: '위치 표시 지우기', th: 'ล้างเครื่องหมายตำแหน่ง', vi: 'Xóa đánh dấu vị trí', ms: 'Kosongkan Penanda Lokasi', id: 'Hapus Penanda Lokasi', fil: 'I-clear ang Marker ng Lokasyon' },
        'settings.anonymous': { zh: '匿名模式', en: 'Anonymous Mode', tw: '匿名模式', ja: '匿名モード', ko: '익명 모드', th: 'โหมดไม่ระบุชื่อ', vi: 'Chế độ ẩn danh', ms: 'Mod Tanpa Nama', id: 'Mode Anonim', fil: 'Anonymous Mode' },
        'settings.anonymous.desc': { zh: '开启后不记录浏览历史，我的位置仅本地可见', en: 'No history recorded; location stays local', tw: '開啟後不記錄瀏覽歷史，我的位置僅本地可見', ja: '閲覧履歴を記録せず、位置は端末内のみ', ko: '기록하지 않으며 위치는 기기에만 저장', th: 'ไม่บันทึกประวัติ ตำแหน่งเห็นเฉพาะเครื่อง', vi: 'Không ghi lịch sử, vị trí chỉ lưu cục bộ', ms: 'Tiada sejarah direkod; lokasi kekal setempat', id: 'Tidak mencatat riwayat; lokasi tetap lokal', fil: 'Walang nakarekord na kasaysayan; lokal ang lokasyon' },
        'settings.perm': { zh: '隐私与权限', en: 'Privacy & Permissions', tw: '隱私與權限', ja: 'プライバシーと権限', ko: '개인정보 및 권한', th: 'ความเป็นส่วนตัวและสิทธิ์', vi: 'Quyền riêng tư & Quyền', ms: 'Privasi & Kebenaran', id: 'Privasi & Izin', fil: 'Privacy at mga Pahintulot' },
        'settings.storage': { zh: '数据存储说明', en: 'Data Storage Note', tw: '資料儲存說明', ja: 'データ保存について', ko: '데이터 저장 안내', th: 'หมายเหตุการเก็บข้อมูล', vi: 'Lưu ý lưu trữ dữ liệu', ms: 'Nota Simpanan Data', id: 'Catatan Penyimpanan Data', fil: 'Tala sa Pag-iimbak ng Data' },
        'settings.storage.desc': { zh: '昵称、地标、收藏与设置仅保存在本机浏览器（localStorage），不上传任何服务器，清除浏览器数据即删除。', en: 'Nickname, places, favorites and settings are stored only in this browser (localStorage); clearing browser data removes them.', tw: '暱稱、地標、收藏與設置僅保存在本機瀏覽器（localStorage），不上傳任何伺服器，清除瀏覽器資料即刪除。', ja: 'ニックネーム・地点・お気に入り・設定は本ブラウザ（localStorage）にのみ保存され、サーバーには送信されません。ブラウザデータを消すと削除されます。', ko: '닉네임, 장소, 즐겨찾기, 설정은 이 브라우저(localStorage)에만 저장되며 서버에 업로드되지 않습니다.', th: 'ชื่อเล่น สถานที่ รายการโปรดและการตั้งค่าบันทึกเฉพาะในเบราว์เซอร์นี้เท่านั้น', vi: 'Biệt danh, địa điểm, yêu thích và cài đặt chỉ lưu trên trình duyệt này (localStorage).', ms: 'Nama samaran, tempat, kegemaran dan tetapan disimpan hanya dalam pelayar ini.', id: 'Nama, tempat, favorit, dan pengaturan hanya tersimpan di browser ini (localStorage).', fil: 'Ang palayaw, lugar, paborito at setting ay nakaimbak lamang sa browser na ito.' },
        'settings.clear.all': { zh: '清除全部本地数据', en: 'Clear All Local Data', tw: '清除全部本地資料', ja: 'ローカルデータを全消去', ko: '로컬 데이터 모두 삭제', th: 'ล้างข้อมูลในเครื่องทั้งหมด', vi: 'Xóa toàn bộ dữ liệu cục bộ', ms: 'Kosongkan Semua Data Setempat', id: 'Hapus Semua Data Lokal', fil: 'I-clear ang Lahat ng Lokal na Data' },
        'settings.remember.view': { zh: '启动时完整显示全图', en: 'Show Full Map on Launch', tw: '啟動時完整顯示全圖', ja: '起動時に全体表示', ko: '시작 시 전체 지도 표시', th: 'แสดงแผนที่เต็มเมื่อเปิด', vi: 'Hiện toàn bản đồ khi mở', ms: 'Tunjuk Peta Penuh Semasa Lancar', id: 'Tampilkan Peta Penuh saat Buka', fil: 'Ipakita ang Buong Mapa sa Pagbukas' },
        'settings.remember.view.desc': { zh: '每次打开先看到整张校园图（关闭则恢复上次的浏览位置）', en: 'See the full map first (or restore last view)', tw: '每次打開先看到整張校園圖（關閉則恢復上次的瀏覽位置）', ja: '毎回全体図を表示（オフで前回位置を復元）', ko: '매번 전체 지도 표시(끄면 이전 위치 복원)', th: 'เห็นแผนที่เต็มก่อน (ปิดเพื่อคืนตำแหน่งเดิม)', vi: 'Xem toàn bản đồ trước (tắt để khôi phục vị trí cũ)', ms: 'Lihat peta penuh dahulu (atau pulihkan pandangan lalu)', id: 'Lihat peta penuh dulu (atau pulihkan tampilan terakhir)', fil: 'Tingnan muna ang buong mapa (o ibalik ang huling view)' },
        'settings.poi': { zh: '官方地点数据', en: 'Official Place Data', tw: '官方地點資料', ja: '公式地点データ', ko: '공식 장소 데이터', th: 'ข้อมูลสถานที่ทางการ', vi: 'Dữ liệu địa điểm chính thức', ms: 'Data Tempat Rasmi', id: 'Data Tempat Resmi', fil: 'Opisyal na Data ng Lugar' },
        'settings.poi.default': { zh: '未修改过官方地点', en: 'No official places modified', tw: '未修改過官方地點', ja: '公式地点は未変更', ko: '공식 장소 수정 없음', th: 'ยังไม่แก้ไขสถานที่ทางการ', vi: 'Chưa sửa địa điểm chính thức', ms: 'Tiada tempat rasmi diubah', id: 'Belum mengubah tempat resmi', fil: 'Walang binagong opisyal na lugar' },
        'settings.reset': { zh: '恢复默认', en: 'Restore', tw: '恢復預設', ja: '既定に戻す', ko: '기본값 복원', th: 'คืนค่า', vi: 'Khôi phục', ms: 'Pulihkan', id: 'Pulihkan', fil: 'Ibalik' },
        'settings.update': { zh: '检查更新', en: 'Check for Updates', tw: '檢查更新', ja: '更新を確認', ko: '업데이트 확인', th: 'ตรวจสอบอัปเดต', vi: 'Kiểm tra cập nhật', ms: 'Semak Kemas Kini', id: 'Periksa Pembaruan', fil: 'Tingnan ang Update' },
        'settings.update.latest': { zh: '当前为优化版 v3.38', en: 'Design refinement v3.38', tw: '當前為優化版 v3.38', ja: '最適化版 v3.38', ko: '최적화 버전 v3.38', th: 'เวอร์ชันปรับปรุง v3.38', vi: 'Bản tối ưu v3.38', ms: 'Versi dipertingkat v3.38', id: 'Versi penyempurnaan v3.38', fil: 'Pinahusay na bersyon v3.38' },
        'settings.aurora': { zh: '极光灵感主题', en: 'Aurora Themes', tw: '極光靈感主題', ja: 'オーロラテーマ', ko: '오로라 테마', th: 'ธีมออโรรา', vi: 'Chủ đề Aurora', ms: 'Tema Aurora', id: 'Tema Aurora', fil: 'Tema Aurora' },
    'settings.aurora.desc': { zh: '换一组背景光斑配色，轮播每天自动换新', en: 'Recolor the ambient glow; Auto rotates daily', tw: '換一組背景光斑配色，輪播每天自動換新', ja: '背景の光の色を替える。ローテートは毎日自動', ko: '배경 빛무리 색을 바꾸고 순환은 매일 자동', th: 'เปลี่ยนสีแสงพื้นหลัง หมุนเวียนอัตโนมัติทุกวัน', vi: 'Đổi màu vầng sáng nền, tự xoay vòng mỗi ngày', ms: 'Tukar warna cahaya latar; Auto setiap hari', id: 'Ganti warna cahaya latar; Auto tiap hari', fil: 'Palitan ang kulay ng liwanag; Awtomatik araw-araw' },
    'settings.aurora.aurora': { zh: '极光', en: 'Aurora', tw: '極光', ja: 'オーロラ', ko: '오로라', th: 'ออโรรา', vi: 'Aurora', ms: 'Aurora', id: 'Aurora', fil: 'Aurora' },
    'settings.aurora.dawn': { zh: '晨曦', en: 'Dawn', tw: '晨曦', ja: '夜明け', ko: '여명', th: 'รุ่งอรุณ', vi: 'Bình minh', ms: 'Fajar', id: 'Fajar', fil: 'Madaling-araw' },
    'settings.aurora.night': { zh: '夜航', en: 'Night', tw: '夜航', ja: '夜航', ko: '야간', th: 'กลางคืน', vi: 'Đêm', ms: 'Malam', id: 'Malam', fil: 'Gabi' },
    'settings.aurora.amber': { zh: '琥珀', en: 'Amber', tw: '琥珀', ja: '琥珀', ko: '호박', th: 'อำพัน', vi: 'Hổ phách', ms: 'Amber', id: 'Ambar', fil: 'Ambar' },
    'settings.aurora.auto': { zh: '轮播', en: 'Auto', tw: '輪播', ja: 'ローテート', ko: '순환', th: 'หมุนเวียน', vi: 'Tự động', ms: 'Auto', id: 'Auto', fil: 'Auto' },
    'settings.check': { zh: '检查', en: 'Check', tw: '檢查', ja: '確認', ko: '확인', th: 'ตรวจ', vi: 'Kiểm tra', ms: 'Semak', id: 'Periksa', fil: 'Suriin' },
        'settings.source': { zh: '项目源码', en: 'Source Code', tw: '專案原始碼', ja: 'ソースコード', ko: '소스 코드', th: 'ซอร์สโค้ด', vi: 'Mã nguồn', ms: 'Kod Sumber', id: 'Kode Sumber', fil: 'Source Code' },
    'settings.author': { zh: '作者', en: 'Author', tw: '作者', ja: '作者', ko: '제작자', th: 'ผู้จัดทำ', vi: 'Tác giả', ms: 'Pengarang', id: 'Pembuat', fil: 'May-akda' },
        'settings.author.desc': { zh: '锐仔来了 · 独立开发与维护', en: 'Rui Zai · indie developer', tw: '銳仔來了 · 獨立開發與維護', ja: '锐仔来了 · 個人開発・保守', ko: '루이자이 · 개인 개발', th: 'รุยไซ · ผู้พัฒนาอิสระ', vi: 'Rui Zai · phát triển độc lập', ms: 'Rui Zai · pembangun indie', id: 'Rui Zai · pengembang independen', fil: 'Rui Zai · independiyenteng developer' },
        'settings.feedback': { zh: '地图反馈', en: 'Map Feedback', tw: '地圖反饋', ja: '地図フィードバック', ko: '지도 피드백', th: 'ติชมแผนที่', vi: 'Góp ý bản đồ', ms: 'Maklum Balas Peta', id: 'Umpan Balik Peta', fil: 'Feedback sa Mapa' },
        'settings.roadmap': { zh: '更新计划', en: 'Roadmap', tw: '更新計劃', ja: '更新計画', ko: '업데이트 계획', th: 'แผนอัปเดต', vi: 'Kế hoạch cập nhật', ms: 'Pelan Kemas Kini', id: 'Rencana Pembaruan', fil: 'Plano ng Update' },
        'settings.roadmap.desc': { zh: '后续更新：全面优化体验 · 添加地址位置信息', en: 'Upcoming: better experience · address info', tw: '後續更新：全面優化體驗 · 添加地址位置資訊', ja: '今後の更新：体験改善・住所情報追加', ko: '향후: 경험 개선 · 주소 정보 추가', th: 'ถัดไป: ปรับปรุงประสบการณ์ · เพิ่มที่อยู่', vi: 'Sắp tới: cải thiện trải nghiệm · thêm địa chỉ', ms: 'Akan datang: pengalaman lebih baik · maklumat alamat', id: 'Mendatang: pengalaman lebih baik · info alamat', fil: 'Susunod: mas magandang karanasan · impormasyon ng address' },
        'settings.terms': { zh: '用户协议', en: 'Terms of Service', tw: '用戶協議', ja: '利用規約', ko: '이용약관', th: 'ข้อตกลงผู้ใช้', vi: 'Điều khoản', ms: 'Terma Perkhidmatan', id: 'Ketentuan Layanan', fil: 'Mga Tuntunin' },
        'settings.privacy.policy': { zh: '隐私政策', en: 'Privacy Policy', tw: '隱私政策', ja: 'プライバシーポリシー', ko: '개인정보처리방침', th: 'นโยบายความเป็นส่วนตัว', vi: 'Chính sách quyền riêng tư', ms: 'Dasar Privasi', id: 'Kebijakan Privasi', fil: 'Patakaran sa Pagkapribado' },
        'settings.version.desc': { zh: '四川文轩职业学院遂宁校区 · 地图数据仅供参考，以现场指引为准', en: 'Suining campus · map data is for reference only', tw: '四川文軒職業學院遂寧校區 · 地圖資料僅供參考，以現場指引為準', ja: '遂寧キャンパス・地図データは参考用。現地案内を優先。', ko: '쑤이닝 캠퍼스 · 지도 데이터는 참고용입니다', th: 'วิทยาเขตซุยหนิง · ข้อมูลแผนที่เพื่อการอ้างอิง', vi: 'Khu Suining · dữ liệu bản đồ chỉ để tham khảo', ms: 'Kampus Suining · data peta untuk rujukan sahaja', id: 'Kampus Suining · data peta hanya referensi', fil: 'Suining campus · sanggunian lamang ang data ng mapa' },

        // 隐私与权限页
        'perm.title': { zh: '隐私与权限', en: 'Privacy & Permissions', tw: '隱私與權限', ja: 'プライバシーと権限', ko: '개인정보 및 권한', th: 'ความเป็นส่วนตัวและสิทธิ์', vi: 'Quyền riêng tư & Quyền', ms: 'Privasi & Kebenaran', id: 'Privasi & Izin', fil: 'Privacy at mga Pahintulot' },
        'perm.sys': { zh: '系统权限', en: 'System Permissions', tw: '系統權限', ja: 'システム権限', ko: '시스템 권한', th: 'สิทธิ์ระบบ', vi: 'Quyền hệ thống', ms: 'Kebenaran Sistem', id: 'Izin Sistem', fil: 'Mga Pahintulot ng System' },
        'perm.note': { zh: '隐私说明', en: 'Privacy Note', tw: '隱私說明', ja: 'プライバシー説明', ko: '개인정보 안내', th: 'หมายเหตุความเป็นส่วนตัว', vi: 'Lưu ý quyền riêng tư', ms: 'Nota Privasi', id: 'Catatan Privasi', fil: 'Tala sa Pagkapribado' },

        // 聊天
        'chat.title': { zh: '聊天', en: 'Chat', tw: '聊天', ja: 'チャット', ko: '채팅', th: 'แชท', vi: 'Trò chuyện', ms: 'Sembang', id: 'Obrolan', fil: 'Chat' },
        'chat.new': { zh: '添加好友', en: 'Add Friend', tw: '新增好友', ja: 'フレンド追加', ko: '친구 추가', th: 'เพิ่มเพื่อน', vi: 'Thêm bạn', ms: 'Tambah Kawan', id: 'Tambah Teman', fil: 'Magdagdag ng Kaibigan' },
        'chat.lobby': { zh: '大厅', en: 'Lobby', tw: '大廳', ja: 'ロビー', ko: '로비', th: 'ล็อบบี้', vi: 'Sảnh chung', ms: 'Lobi', id: 'Lobi', fil: 'Lobby' },
        'chat.input.ph': { zh: '说点什么…', en: 'Say something…', tw: '說點什麼…', ja: '何か話す…', ko: '할 말…', th: 'พิมพ์ข้อความ…', vi: 'Nói gì đó…', ms: 'Taip sesuatu…', id: 'Ketik sesuatu…', fil: 'Magsabi ng kahit ano…' },
        'chat.send': { zh: '发送', en: 'Send', tw: '發送', ja: '送信', ko: '보내기', th: 'ส่ง', vi: 'Gửi', ms: 'Hantar', id: 'Kirim', fil: 'Ipadala' },
    'chat.search.ph': { zh: '搜索邮箱 / 昵称添加好友', en: 'Search email or nickname to add', tw: '搜尋信箱 / 暱稱新增好友', ja: 'メールかニックネームで検索', ko: '이메일 / 닉네임 검색', th: 'ค้นหาอีเมล / ชื่อเล่น', vi: 'Tìm email / biệt danh', ms: 'Cari emel / nama panggilan', id: 'Cari email / nama panggilan', fil: 'Hanapin ang email / palayaw' },
    'chat.new.dm': { zh: '添加好友', en: 'Add Friend', tw: '新增好友', ja: 'フレンド追加', ko: '친구 추가', th: 'เพิ่มเพื่อน', vi: 'Thêm bạn', ms: 'Tambah Kawan', id: 'Tambah Teman', fil: 'Magdagdag ng Kaibigan' },
        'chat.profile': { zh: '个人资料', en: 'Profile', tw: '個人資料', ja: 'プロフィール', ko: '프로필', th: 'โปรไฟล์', vi: 'Hồ sơ', ms: 'Profil', id: 'Profil', fil: 'Profile' },
        'chat.public.lobby': { zh: '公共大厅', en: 'Public Lobby', tw: '公共大廳', ja: '公共ロビー', ko: '공개 로비', th: 'ล็อบบี้สาธารณะ', vi: 'Sảnh chung', ms: 'Lobi Awam', id: 'Lobi Publik', fil: 'Pampublikong Lobby' },
        'chat.welcome': { zh: '欢迎来到校园大厅', en: 'Welcome to the campus lobby', tw: '歡迎來到校園大廳', ja: 'キャンパスロビーへようこそ', ko: '캠퍼스 로비에 오신 것을 환영합니다', th: 'ยินดีต้อนรับสู่ล็อบบี้', vi: 'Chào mừng đến sảnh chung', ms: 'Selamat datang ke lobi kampus', id: 'Selamat datang di lobi kampus', fil: 'Maligayang pagdating sa lobby' },
        'chat.empty': { zh: '还没有消息，来聊第一句吧 👋', en: 'No messages yet, say hi 👋', tw: '還沒有訊息，來聊第一句吧 👋', ja: 'まだメッセージがありません。最初の一言を 👋', ko: '아직 메시지가 없어요. 먼저 인사해보세요 👋', th: 'ยังไม่มีข้อความ มาทักทายกันก่อน 👋', vi: 'Chưa có tin nhắn, gửi lời chào đầu tiên 👋', ms: 'Belum ada mesej, mari mula 👋', id: 'Belum ada pesan, sapa duluan 👋', fil: 'Wala pang mensahe, mag-hello na 👋' },
        'chat.login.hint': { zh: '登录后即可进入公共大厅<br>和同学们聊天', en: 'Sign in to join the lobby<br>and chat', tw: '登入後即可進入公共大廳<br>和同學們聊天', ja: 'ログインで公共ロビーへ<br>仲間とチャット', ko: '로그인 후 공개 로비에서<br>친구들과 채팅', th: 'เข้าสู่ระบบเพื่อเข้า lobby<br>แชทกับเพื่อน', vi: 'Đăng nhập để vào sảnh chung<br>trò chuyện', ms: 'Log masuk untuk masuk lobi<br>dan bersembang', id: 'Masuk untuk bergabung ke lobi<br>dan mengobrol', fil: 'Mag-sign in para pumasok sa lobby<br>at makipag-chat' },
        'chat.dm.section': { zh: '私聊', en: 'Direct Messages', tw: '私聊', ja: 'DM', ko: 'DM', th: 'ข้อความส่วนตัว', vi: 'Nhắn riêng', ms: 'DM', id: 'DM', fil: 'DM' },
        'chat.no.users': { zh: '暂时还没有其他用户', en: 'No other users yet', tw: '暫時還沒有其他用戶', ja: 'まだ他のユーザーがいません', ko: '아직 다른 사용자가 없습니다', th: 'ยังไม่มีผู้ใช้อื่น', vi: 'Chưa có người dùng khác', ms: 'Belum ada pengguna lain', id: 'Belum ada pengguna lain', fil: 'Wala pang ibang user' },

        // 好友（v3.19）
        'chat.friend.requests': { zh: '好友请求', en: 'Friend Requests', tw: '好友請求', ja: 'フレンド申請', ko: '친구 요청', th: 'คำขอเป็นเพื่อน', vi: 'Yêu cầu kết bạn', ms: 'Permintaan Rakan', id: 'Permintaan Teman', fil: 'Kahilingan ng Kaibigan' },
        'chat.friend.empty': { zh: '还没有好友，点击右上角 + 添加', en: 'No friends yet. Tap + to add', tw: '還沒有好友，點擊右上角 + 添加', ja: 'フレンドがいません。右上の + で追加', ko: '친구가 없어요. 우측 상단 + 로 추가', th: 'ยังไม่มีเพื่อน กด + ที่มุมขวาบนเพื่อเพิ่ม', vi: 'Chưa có bạn bè. Nhấn + để thêm', ms: 'Belum ada rakan. Ketik + untuk tambah', id: 'Belum ada teman. Ketuk + untuk tambah', fil: 'Wala pang kaibigan. Pindutin ang + para magdagdag' },
        'chat.friend.add': { zh: '加好友', en: 'Add Friend', tw: '加好友', ja: 'フレンド追加', ko: '친구 추가', th: 'เพิ่มเพื่อน', vi: 'Kết bạn', ms: 'Tambah Rakan', id: 'Tambah Teman', fil: 'Add Friend' },
        'chat.friend.readd': { zh: '重新发送好友请求', en: 'Resend Friend Request', tw: '重新發送好友請求', ja: 'フレンド申請を再送信', ko: '친구 요청 다시 보내기', th: 'ส่งคำขอเป็นเพื่อนอีกครั้ง', vi: 'Gửi lại yêu cầu kết bạn', ms: 'Hantar semula permintaan rakan', id: 'Kirim ulang permintaan teman', fil: 'Muling ipadala ang hiling' },
        'chat.friend.pending': { zh: '已发送请求，等待同意…', en: 'Request sent, awaiting response…', tw: '已發送請求，等待同意…', ja: '申請を送信済み、返事待ち…', ko: '요청을 보냈습니다. 응답 대기 중…', th: 'ส่งคำขอแล้ว รอการตอบรับ…', vi: 'Đã gửi yêu cầu, đang chờ phản hồi…', ms: 'Permintaan dihantar, menunggu respons…', id: 'Permintaan terkirim, menunggu respons…', fil: 'Naipadala na, hinihintay ang sagot…' },
        'chat.friend.accept': { zh: '同意', en: 'Accept', tw: '同意', ja: '承諾', ko: '수락', th: 'ยอมรับ', vi: 'Chấp nhận', ms: 'Terima', id: 'Terima', fil: 'Tanggapin' },
        'chat.friend.reject': { zh: '拒绝', en: 'Reject', tw: '拒絕', ja: '拒否', ko: '거절', th: 'ปฏิเสธ', vi: 'Từ chối', ms: 'Tolak', id: 'Tolak', fil: 'Tanggihan' },
        'chat.friend.dm': { zh: '私聊', en: 'DM', tw: '私聊', ja: 'DM', ko: 'DM', th: 'ข้อความส่วนตัว', vi: 'Nhắn riêng', ms: 'DM', id: 'DM', fil: 'DM' },
        'chat.friend.dm.hint': { zh: '需先添加对方为好友，对方同意后才能私信', en: 'Add this user as a friend first. DMs unlock after they accept.', tw: '需先添加對方為好友，對方同意後才能私信', ja: 'まずフレンド申請してください。承諾後にDMできます', ko: '먼저 친구로 추가하세요. 상대가 수락해야 DM할 수 있습니다', th: 'ต้องเพิ่มเป็นเพื่อนก่อน ส่งข้อความได้หลังตอบรับ', vi: 'Cần kết bạn trước. Nhắn riêng sau khi được chấp nhận', ms: 'Tambah sebagai rakan dahulu. DM dibuka selepas diterima', id: 'Tambah sebagai teman dulu. DM terbuka setelah diterima', fil: 'Magdagdag muna bilang kaibigan. Mabubuksan ang DM pagkatanggap' },
        'chat.friend.load.fail': { zh: '加载好友失败', en: 'Failed to load friends', tw: '載入好友失敗', ja: 'フレンドの読み込みに失敗', ko: '친구 불러오기 실패', th: 'โหลดเพื่อนไม่สำเร็จ', vi: 'Tải bạn bè thất bại', ms: 'Gagal memuat rakan', id: 'Gagal memuat teman', fil: 'Nabigong i-load ang kaibigan' },

        // 聊天系统消息（v3.21）
        'chat.sys.title': { zh: '来自系统', en: 'From system', tw: '來自系統', ja: 'システムより', ko: '시스템에서', th: 'จากระบบ', vi: 'Từ hệ thống', ms: 'Daripada sistem', id: 'Dari sistem', fil: 'Mula sa system' },
        'chat.sys.section': { zh: '系统通知', en: 'System Notices', tw: '系統通知', ja: 'システム通知', ko: '시스템 알림', th: 'การแจ้งเตือนระบบ', vi: 'Thông báo hệ thống', ms: 'Notis Sistem', id: 'Notifikasi Sistem', fil: 'Abiso ng System' },
        'chat.sys.name': { zh: '系统通知', en: 'System Notice', tw: '系統通知', ja: 'システム通知', ko: '시스템 알림', th: 'การแจ้งเตือนระบบ', vi: 'Thông báo hệ thống', ms: 'Notis Sistem', id: 'Notifikasi Sistem', fil: 'Abiso ng System' },

        // 失物招领
        'lf.title': { zh: '失物招领', en: 'Lost & Found', tw: '失物招領', ja: '落とし物', ko: '분실물', th: 'ของหาย/ของเก็บได้', vi: 'Đồ thất lạc', ms: 'Hilang & Jumpa', id: 'Barang Hilang & Ditemukan', fil: 'Nawala at Natagpuan' },
        'lf.new': { zh: '发布', en: 'Post', tw: '發布', ja: '投稿', ko: '게시', th: 'โพสต์', vi: 'Đăng', ms: 'Siarkan', id: 'Posting', fil: 'I-post' },
        'lf.lost': { zh: '寻物', en: 'Lost', tw: '尋物', ja: '探しています', ko: '찾아요', th: 'ของหาย', vi: 'Đồ mất', ms: 'Hilang', id: 'Hilang', fil: 'Nawala' },
        'lf.found': { zh: '招领', en: 'Found', tw: '招領', ja: '拾得', ko: '주웠어요', th: 'ของเก็บได้', vi: 'Đồ nhặt được', ms: 'Dijumpai', id: 'Ditemukan', fil: 'Natagpuan' },
        'lf.mine': { zh: '我的', en: 'Mine', tw: '我的', ja: 'マイ', ko: '내 글', th: 'ของฉัน', vi: 'Của tôi', ms: 'Saya', id: 'Milik Saya', fil: 'Akin' },
        'lf.mine.open': { zh: '进行中', en: 'Active', tw: '進行中', ja: '進行中', ko: '진행 중', th: 'กำลังดำเนินการ', vi: 'Đang tiến hành', ms: 'Berjalan', id: 'Berlangsung', fil: 'Nagpapatuloy' },
        'lf.mine.done': { zh: '已完成', en: 'Done', tw: '已完成', ja: '完了', ko: '완료', th: 'เสร็จสิ้น', vi: 'Đã xong', ms: 'Selesai', id: 'Selesai', fil: 'Tapos na' },
        'lf.list': { zh: '列表', en: 'List', tw: '列表', ja: 'リスト', ko: '목록', th: 'รายการ', vi: 'Danh sách', ms: 'Senarai', id: 'Daftar', fil: 'Listahan' },
        'lf.map': { zh: '地图', en: 'Map', tw: '地圖', ja: '地図', ko: '지도', th: 'แผนที่', vi: 'Bản đồ', ms: 'Peta', id: 'Peta', fil: 'Mapa' },
        'lf.map.hint': { zh: '点击标点查看详情', en: 'Tap a marker for details', tw: '點擊標點查看詳情', ja: 'マーカーをタップで詳細', ko: '마커를 눌러 상세 보기', th: 'แตะหมุดเพื่อดูรายละเอียด', vi: 'Chạm điểm để xem chi tiết', ms: 'Ketik penanda untuk butiran', id: 'Ketuk penanda untuk detail', fil: 'I-tap ang marker para sa detalye' },
        'lf.empty': { zh: '还没有相关帖子', en: 'No posts yet', tw: '還沒有相關帖子', ja: 'まだ投稿がありません', ko: '아직 게시물이 없습니다', th: 'ยังไม่มีโพสต์', vi: 'Chưa có bài viết', ms: 'Tiada siaran lagi', id: 'Belum ada postingan', fil: 'Wala pang post' },
        'lf.empty.go': { zh: '发布第一帖', en: 'Post the First', tw: '發布第一帖', ja: '最初の投稿', ko: '첫 글 게시', th: 'โพสต์แรก', vi: 'Đăng bài đầu tiên', ms: 'Siaran Pertama', id: 'Posting Pertama', fil: 'Unang Post' },
        'lf.sheet.title': { zh: '发布失物招领', en: 'Post Lost & Found', tw: '發布失物招領', ja: '落とし物を投稿', ko: '분실물 게시', th: 'โพสต์ของหาย/ของเก็บได้', vi: 'Đăng đồ thất lạc', ms: 'Siarkan Hilang & Jumpa', id: 'Posting Barang Hilang', fil: 'Mag-post ng Nawala/Natagpuan' },
        'lf.type.lost': { zh: '我丢了东西', en: 'I lost something', tw: '我丟了東西', ja: '物をなくした', ko: '물건을 잃어버렸어요', th: 'ฉันทำของหาย', vi: 'Tôi làm mất đồ', ms: 'Saya kehilangan barang', id: 'Saya kehilangan barang', fil: 'May nawala ako' },
        'lf.type.found': { zh: '我捡到东西', en: 'I found something', tw: '我撿到東西', ja: '物を拾った', ko: '물건을 주웠어요', th: 'ฉันเก็บของได้', vi: 'Tôi nhặt được đồ', ms: 'Saya jumpa barang', id: 'Saya menemukan barang', fil: 'May nahanap ako' },
        'lf.cat.card': { zh: '校园卡', en: 'Campus Card', tw: '校園卡', ja: '学生証', ko: '학생증', th: 'บัตรนักศึกษา', vi: 'Thẻ sinh viên', ms: 'Kad Kampus', id: 'Kartu Kampus', fil: 'Campus Card' },
        'lf.cat.key': { zh: '钥匙', en: 'Keys', tw: '鑰匙', ja: '鍵', ko: '열쇠', th: 'กุญแจ', vi: 'Chìa khóa', ms: 'Kunci', id: 'Kunci', fil: 'Susi' },
        'lf.cat.elec': { zh: '电子设备', en: 'Electronics', tw: '電子設備', ja: '電子機器', ko: '전자기기', th: 'อุปกรณ์อิเล็กทรอนิกส์', vi: 'Thiết bị điện tử', ms: 'Elektronik', id: 'Elektronik', fil: 'Elektroniko' },
        'lf.cat.book': { zh: '书籍', en: 'Books', tw: '書籍', ja: '書籍', ko: '도서', th: 'หนังสือ', vi: 'Sách', ms: 'Buku', id: 'Buku', fil: 'Aklat' },
        'lf.cat.cloth': { zh: '衣物', en: 'Clothing', tw: '衣物', ja: '衣類', ko: '의류', th: 'เสื้อผ้า', vi: 'Quần áo', ms: 'Pakaian', id: 'Pakaian', fil: 'Damit' },
        'lf.cat.other': { zh: '其他', en: 'Other', tw: '其他', ja: 'その他', ko: '기타', th: 'อื่นๆ', vi: 'Khác', ms: 'Lain-lain', id: 'Lainnya', fil: 'Iba pa' },
        'lf.status.open': { zh: '进行中', en: 'Active', tw: '進行中', ja: '進行中', ko: '진행 중', th: 'กำลังดำเนินการ', vi: 'Đang tiến hành', ms: 'Berjalan', id: 'Berlangsung', fil: 'Nagpapatuloy' },
        'lf.status.pending': { zh: '待确认', en: 'Pending', tw: '待確認', ja: '確認待ち', ko: '확인 대기', th: 'รอยืนยัน', vi: 'Chờ xác nhận', ms: 'Menunggu', id: 'Menunggu', fil: 'Nakabinbin' },
        'lf.status.done': { zh: '已认领', en: 'Claimed', tw: '已認領', ja: '受取済み', ko: '수령 완료', th: 'รับแล้ว', vi: 'Đã nhận', ms: 'Dituntut', id: 'Diklaim', fil: 'Na-claim na' },
        'lf.finish': { zh: '完成认领', en: 'Complete Claim', tw: '完成認領', ja: '受取完了', ko: '수령 완료', th: 'ยืนยันการรับ', vi: 'Hoàn tất nhận', ms: 'Selesaikan Tuntutan', id: 'Selesaikan Klaim', fil: 'Kumpletuhin ang Claim' },
        'lf.finish.confirming': { zh: '确认中…', en: 'Confirming…', tw: '確認中…', ja: '確認中…', ko: '확인 중…', th: 'กำลังยืนยัน…', vi: 'Đang xác nhận…', ms: 'Mengesahkan…', id: 'Mengonfirmasi…', fil: 'Kinukumpirma…' },
        'lf.finish.confirmed': { zh: '已由你确认完成', en: 'Confirmed as complete by you', tw: '已由你確認完成', ja: 'あなたが完了を確認済み', ko: '완료로 확인됨', th: 'คุณยืนยันเสร็จแล้ว', vi: 'Đã xác nhận hoàn tất', ms: 'Disahkan selesai', id: 'Dikonfirmasi selesai', fil: 'Kinumpirma mong tapos na' },
        'lf.finish.done': { zh: '已完成认领', en: 'Claim completed', tw: '已完成認領', ja: '受取完了', ko: '수령 완료', th: 'รับแล้ว', vi: 'Đã nhận', ms: 'Dituntut', id: 'Diklaim', fil: 'Na-claim na' },
        'lf.finish.toast': { zh: '已确认完成', en: 'Marked complete', tw: '已確認完成', ja: '完了を確認しました', ko: '완료 확인됨', th: 'ยืนยันเสร็จแล้ว', vi: 'Đã xác nhận xong', ms: 'Disahkan selesai', id: 'Dikonfirmasi selesai', fil: 'Kinumpirmang tapos' },
        'lf.finish.fail': { zh: '确认失败', en: 'Failed to confirm', tw: '確認失敗', ja: '確認に失敗', ko: '확인 실패', th: 'ยืนยันไม่สำเร็จ', vi: 'Xác nhận thất bại', ms: 'Gagal mengesahkan', id: 'Gagal mengonfirmasi', fil: 'Nabigong kumpirmahin' },
        'lf.field.title': { zh: '物品名称', en: 'Item name', tw: '物品名稱', ja: '品名', ko: '물품명', th: 'ชื่อสิ่งของ', vi: 'Tên đồ vật', ms: 'Nama barang', id: 'Nama barang', fil: 'Pangalan ng bagay' },
        'lf.field.cat': { zh: '分类', en: 'Category', tw: '分類', ja: '分類', ko: '분류', th: 'หมวดหมู่', vi: 'Phân loại', ms: 'Kategori', id: 'Kategori', fil: 'Kategorya' },
        'lf.field.loc': { zh: '位置', en: 'Location', tw: '位置', ja: '場所', ko: '위치', th: 'ตำแหน่ง', vi: 'Vị trí', ms: 'Lokasi', id: 'Lokasi', fil: 'Lokasyon' },
        'lf.field.time': { zh: '时间', en: 'Time', tw: '時間', ja: '時間', ko: '시간', th: 'เวลา', vi: 'Thời gian', ms: 'Masa', id: 'Waktu', fil: 'Oras' },
        'lf.field.desc': { zh: '详细描述', en: 'Description', tw: '詳細描述', ja: '詳細説明', ko: '상세 설명', th: 'คำอธิบาย', vi: 'Mô tả chi tiết', ms: 'Penerangan', id: 'Deskripsi', fil: 'Deskripsyon' },
        'lf.field.proofq': { zh: '验证问题', en: 'Verification question', tw: '驗證問題', ja: '確認質問', ko: '확인 질문', th: 'คำถามยืนยัน', vi: 'Câu hỏi xác minh', ms: 'Soalan pengesahan', id: 'Pertanyaan verifikasi', fil: 'Tanong sa pagpapatunay' },
        'lf.field.proofa': { zh: '验证答案', en: 'Verification answer', tw: '驗證答案', ja: '確認回答', ko: '확인 답변', th: 'คำตอบยืนยัน', vi: 'Câu trả lời xác minh', ms: 'Jawapan pengesahan', id: 'Jawaban verifikasi', fil: 'Sagot sa pagpapatunay' },
        'lf.submit': { zh: '发布', en: 'Post', tw: '發布', ja: '投稿', ko: '게시', th: 'โพสต์', vi: 'Đăng', ms: 'Siarkan', id: 'Posting', fil: 'I-post' },
        'lf.claim.title': { zh: '认领验证', en: 'Claim Verification', tw: '認領驗證', ja: '受取確認', ko: '수령 확인', th: 'ยืนยันการรับ', vi: 'Xác minh nhận', ms: 'Pengesahan Tuntutan', id: 'Verifikasi Klaim', fil: 'Pagpapatunay ng Claim' },
        'lf.claim.submit': { zh: '提交认领', en: 'Submit Claim', tw: '提交認領', ja: '受取申請', ko: '수령 신청', th: 'ส่งคำขอรับ', vi: 'Gửi yêu cầu nhận', ms: 'Hantar Tuntutan', id: 'Kirim Klaim', fil: 'Isumite ang Claim' },
        'lf.field.contact': { zh: '联系方式', en: 'Contact', tw: '聯絡方式', ja: '連絡先', ko: '연락처', th: 'ช่องทางติดต่อ', vi: 'Liên hệ', ms: 'Hubungi', id: 'Kontak', fil: 'Kontak' },
        'lf.field.contact.hint': { zh: '认领后双方互见，可填手机/微信', en: 'Shared after claim; phone/WeChat OK', tw: '認領後雙方互見，可填手機/微信', ja: '受取後双方に公開。電話/微信可', ko: '수령 후 공개, 전화/위챗 가능', th: 'เปิดเผยหลักรับ ใส่เบอร์/วีแชตได้', vi: 'Chia sẻ sau khi nhận; được dùng SĐT/WeChat', ms: 'Kongsi selepas tuntut; telefon/WeChat boleh', id: 'Dibagikan setelah klaim; telepon/WeChat boleh', fil: 'Ibinabahagi pagkatapos claim; phone/WeChat ok' },
        'lf.claim.hint': { zh: '答对答案后立即解锁对方联系方式', en: 'Answer correctly to unlock contact instantly', tw: '答對答案後立即解鎖對方聯絡方式', ja: '正解で連絡先を即時解除', ko: '정답 시 연락처 즉시 잠금해제', th: 'ตอบถูกปลดล็อกติดต่อทันที', vi: 'Trả đúng sẽ mở khóa liên hệ ngay', ms: 'Jawab betul buka kunci serta-merta', id: 'Jawab benar langsung membuka kontak', fil: 'Tamang sagot ay agad na magbubukas ng kontak' },
        'lf.dm.button': { zh: '私信对方', en: 'Message', tw: '私訊對方', ja: 'メッセージ', ko: '메시지', th: 'ส่งข้อความ', vi: 'Nhắn tin', ms: 'Mesej', id: 'Pesan', fil: 'Mensahe' },
        'lf.contact.copy': { zh: '复制', en: 'Copy', tw: '複製', ja: 'コピー', ko: '복사', th: 'คัดลอก', vi: 'Sao chép', ms: 'Salin', id: 'Salin', fil: 'Kopyahin' },
        'lf.claim.success': { zh: '答对答案！联系方式已解锁', en: 'Correct! Contact unlocked', tw: '答對答案！聯絡方式已解鎖', ja: '正解！連絡先解除', ko: '정답! 연락처 잠금해제', th: 'ถูก! ปลดล็อกแล้ว', vi: 'Đúng! Đã mở khóa', ms: 'Betul! Terbuka', id: 'Benar! Terbuka', fil: 'Tama! Na-unlock' },
        'lf.auto.delete.hint': { zh: '已完成认领，可确认完成归档', en: 'Claim completed; mark it done', tw: '已完成認領，可確認完成歸檔', ja: '受取完了。完了を確認できます', ko: '수령 완료, 완료로 확인 가능', th: 'รับแล้ว ยืนยันเสร็จได้', vi: 'Đã nhận, có thể xác nhận hoàn tất', ms: 'Dituntut, boleh sahkan selesai', id: 'Diklaim, bisa dikonfirmasi selesai', fil: 'Na-claim na, maaaring kumpirmahing tapos' },
        'lf.delete.title': { zh: '撤回帖子？', en: 'Withdraw post?', tw: '撤回帖子？', ja: '投稿を取り下げますか？', ko: '게시글을 철회할까요?', th: 'ถอนโพสต์?', vi: 'Rút bài đăng?', ms: 'Tarik balik siaran?', id: 'Tarik postingan?', fil: 'Bawiin ang post?' },
        'lf.delete.cancel': { zh: '取消', en: 'Cancel', tw: '取消', ja: 'キャンセル', ko: '취소', th: 'ยกเลิก', vi: 'Hủy', ms: 'Batal', id: 'Batal', fil: 'Kanselahin' },
        'lf.delete.confirm': { zh: '确认撤回', en: 'Withdraw', tw: '確認撤回', ja: '取り下げる', ko: '철회', th: 'ถอน', vi: 'Rút', ms: 'Tarik balik', id: 'Tarik', fil: 'Bawiin' },

        // 登录/注册
        'auth.login.register': { zh: '登录 / 注册', en: 'Sign In / Up', tw: '登入 / 註冊', ja: 'ログイン / 登録', ko: '로그인 / 가입', th: 'เข้าสู่ระบบ / สมัคร', vi: 'Đăng nhập / Đăng ký', ms: 'Log Masuk / Daftar', id: 'Masuk / Daftar', fil: 'Mag-sign In / Up' },
        'auth.login.sub': { zh: '登录后可发布地标、参与班级共建；收藏与设置仍只保存在本机', en: 'Sign in to post places and collaborate; favorites stay local', tw: '登入後可發佈地標、參與班級共建；收藏與設置仍只保存在本機', ja: 'ログインで地点投稿・クラス共同編集が可能。お気に入りは端末内。', ko: '로그인 시 장소 게시 가능. 즐겨찾기는 기기에만 저장.', th: 'เข้าสู่ระบบเพื่อโพสต์สถานที่ รายการโปรดยังอยู่เครื่อง', vi: 'Đăng nhập để đăng địa điểm; yêu thích vẫn lưu cục bộ', ms: 'Log masuk untuk siar tempat; kegemaran kekal setempat', id: 'Masuk untuk posting tempat; favorit tetap lokal', fil: 'Mag-sign in para mag-post; lokal ang paborito' },
        'auth.register.email': { zh: '使用邮箱注册', en: 'Register with Email', tw: '使用郵箱註冊', ja: 'メールで登録', ko: '이메일로 가입', th: 'สมัครด้วยอีเมล', vi: 'Đăng ký bằng email', ms: 'Daftar dengan E-mel', id: 'Daftar dengan Email', fil: 'Magrehistro gamit ang Email' },
        'auth.login.existing': { zh: '已有账号登录', en: 'Log in with existing account', tw: '已有帳號登入', ja: '既存アカウントでログイン', ko: '기존 계정 로그인', th: 'เข้าสู่ระบบบัญชีเดิม', vi: 'Đăng nhập tài khoản có sẵn', ms: 'Log masuk akaun sedia ada', id: 'Masuk akun yang ada', fil: 'Mag-log in sa umiiral na account' },
        'auth.browse.guest': { zh: '先逛逛，稍后登录', en: 'Browse first, sign in later', tw: '先逛逛，稍後登入', ja: 'まず見る、後でログイン', ko: '먼저 둘러보기', th: 'ดูไปก่อน ค่อยเข้าสู่ระบบ', vi: 'Xem trước, đăng nhập sau', ms: 'Layari dulu, log masuk kemudian', id: 'Jelajah dulu, masuk nanti', fil: 'Mag-browse muna, mag-sign in mamaya' },
        'auth.email.login': { zh: '邮箱登录', en: 'Email Sign In', tw: '郵箱登入', ja: 'メールログイン', ko: '이메일 로그인', th: 'เข้าสู่ระบบด้วยอีเมล', vi: 'Đăng nhập email', ms: 'Log Masuk E-mel', id: 'Masuk Email', fil: 'Email Sign In' },
        'auth.email.ph': { zh: '邮箱地址', en: 'Email address', tw: '郵箱地址', ja: 'メールアドレス', ko: '이메일 주소', th: 'อีเมล', vi: 'Địa chỉ email', ms: 'Alamat e-mel', id: 'Alamat email', fil: 'Email address' },
        'auth.pw.ph': { zh: '密码', en: 'Password', tw: '密碼', ja: 'パスワード', ko: '비밀번호', th: 'รหัสผ่าน', vi: 'Mật khẩu', ms: 'Kata laluan', id: 'Kata sandi', fil: 'Password' },
        'auth.remember': { zh: '记住我', en: 'Remember me', tw: '記住我', ja: '記憶する', ko: '기억하기', th: 'จดจำฉัน', vi: 'Ghi nhớ tôi', ms: 'Ingat saya', id: 'Ingat saya', fil: 'Tandaan ako' },
        'auth.forgot': { zh: '忘记密码？', en: 'Forgot password?', tw: '忘記密碼？', ja: 'パスワードをお忘れ？', ko: '비밀번호 찾기?', th: 'ลืมรหัสผ่าน?', vi: 'Quên mật khẩu?', ms: 'Lupa kata laluan?', id: 'Lupa kata sandi?', fil: 'Nakalimutan ang password?' },
        'auth.login.btn': { zh: '登录', en: 'Sign In', tw: '登入', ja: 'ログイン', ko: '로그인', th: 'เข้าสู่ระบบ', vi: 'Đăng nhập', ms: 'Log Masuk', id: 'Masuk', fil: 'Mag-sign In' },
        'auth.no.account': { zh: '没有账号？去注册', en: 'No account? Register', tw: '沒有帳號？去註冊', ja: 'アカウントなし？登録へ', ko: '계정 없음? 가입', th: 'ยังไม่มีบัญชี? สมัคร', vi: 'Chưa có tài khoản? Đăng ký', ms: 'Tiada akaun? Daftar', id: 'Belum punya akun? Daftar', fil: 'Walang account? Magrehistro' },
        'auth.register.title': { zh: '注册账号', en: 'Create Account', tw: '註冊帳號', ja: 'アカウント登録', ko: '계정 만들기', th: 'สร้างบัญชี', vi: 'Tạo tài khoản', ms: 'Cipta Akaun', id: 'Buat Akun', fil: 'Gumawa ng Account' },
        'auth.pw.min': { zh: '密码（至少 8 位）', en: 'Password (min 8 chars)', tw: '密碼（至少 8 位）', ja: 'パスワード（8文字以上）', ko: '비밀번호(8자 이상)', th: 'รหัสผ่าน (อย่างน้อย 8 ตัว)', vi: 'Mật khẩu (tối thiểu 8 ký tự)', ms: 'Kata laluan (min 8 aksara)', id: 'Kata sandi (min 8 karakter)', fil: 'Password (min 8 karakter)' },
        'auth.pw.confirm': { zh: '确认密码', en: 'Confirm password', tw: '確認密碼', ja: 'パスワード確認', ko: '비밀번호 확인', th: 'ยืนยันรหัสผ่าน', vi: 'Xác nhận mật khẩu', ms: 'Sahkan kata laluan', id: 'Konfirmasi kata sandi', fil: 'Kumpirmahin ang password' },
        'auth.next': { zh: '下一步', en: 'Next', tw: '下一步', ja: '次へ', ko: '다음', th: 'ถัดไป', vi: 'Tiếp', ms: 'Seterusnya', id: 'Berikutnya', fil: 'Susunod' },
        'auth.registered': { zh: '该邮箱已注册？去登录', en: 'Already registered? Sign in', tw: '該郵箱已註冊？去登入', ja: '登録済み？ログインへ', ko: '이미 등록? 로그인', th: 'อีเมลนี้ลงทะเบียนแล้ว? เข้าสู่ระบบ', vi: 'Email đã đăng ký? Đăng nhập', ms: 'Sudah berdaftar? Log masuk', id: 'Sudah terdaftar? Masuk', fil: 'Nakarehistro na? Mag-sign in' },
        'auth.code.hint': { zh: '验证码已生成（演示模式直接显示在下方）', en: 'Verification code shown below (demo)', tw: '驗證碼已生成（演示模式直接顯示在下方）', ja: '認証コード生成（デモは下に表示）', ko: '인증코드 생성(데모는 아래 표시)', th: 'รหัสยืนยันด้านล่าง (โหมดสาธิต)', vi: 'Mã xác minh hiển thị bên dưới (demo)', ms: 'Kod pengesahan di bawah (demo)', id: 'Kode verifikasi di bawah (demo)', fil: 'Verification code sa ibaba (demo)' },
        'auth.verify': { zh: '验证并继续', en: 'Verify & Continue', tw: '驗證並繼續', ja: '確認して続行', ko: '확인 후 계속', th: 'ยืนยันและดำเนินการต่อ', vi: 'Xác minh & tiếp tục', ms: 'Sahkan & Teruskan', id: 'Verifikasi & Lanjut', fil: 'I-verify at Magpatuloy' },
        'auth.resend': { zh: '重新发送验证码', en: 'Resend code', tw: '重新發送驗證碼', ja: 'コードを再送', ko: '코드 재전송', th: 'ส่งรหัสอีกครั้ง', vi: 'Gửi lại mã', ms: 'Hantar semula kod', id: 'Kirim ulang kode', fil: 'Ipadala muli ang code' },
        'auth.profile.hint': { zh: '完善资料（年级、学院、专业为必填，昵称可用网名）', en: 'Complete profile (grade, college, major required)', tw: '完善資料（年級、學院、專業為必填，暱稱可用網名）', ja: 'プロフィール入力（学年・学院・専攻は必須）', ko: '프로필 작성(학년·학과·전공 필수)', th: 'กรอกโปรไฟล์ (ชั้นปี วิทยาลัย สาขาบังคับ)', vi: 'Hoàn thiện hồ sơ (khóa, khoa, ngành bắt buộc)', ms: 'Lengkapkan profil (gred, kolej, jurusan wajib)', id: 'Lengkapi profil (angkatan, jurusan wajib)', fil: 'Kumpletuhin ang profile (antas, kolehiyo, kurso kinakailangan)' },
        'auth.nick.ph': { zh: '昵称（2~12 个字符，可用网名）', en: 'Nickname (2-12 chars)', tw: '暱稱（2~12 個字元，可用網名）', ja: 'ニックネーム（2～12文字）', ko: '닉네임(2~12자)', th: 'ชื่อเล่น (2-12 ตัว)', vi: 'Biệt danh (2-12 ký tự)', ms: 'Nama samaran (2-12 aksara)', id: 'Nama panggilan (2-12 karakter)', fil: 'Palayaw (2-12 karakter)' },
        'auth.school': { zh: '学校', en: 'School', tw: '學校', ja: '学校', ko: '학교', th: 'โรงเรียน', vi: 'Trường', ms: 'Sekolah', id: 'Sekolah', fil: 'Paaralan' },
        'auth.grade': { zh: '年级', en: 'Grade', tw: '年級', ja: '学年', ko: '학년', th: 'ชั้นปี', vi: 'Khóa', ms: 'Tahun', id: 'Angkatan', fil: 'Antas' },
        'auth.college': { zh: '学院', en: 'College', tw: '學院', ja: '学院', ko: '학과', th: 'วิทยาลัย', vi: 'Khoa', ms: 'Kolej', id: 'Fakultas', fil: 'Kolehiyo' },
        'auth.major': { zh: '专业', en: 'Major', tw: '專業', ja: '専攻', ko: '전공', th: 'สาขา', vi: 'Ngành', ms: 'Jurusan', id: 'Jurusan', fil: 'Kurso' },
        'auth.sid.ph': { zh: '学号（选填）', en: 'Student ID (optional)', tw: '學號（選填）', ja: '学籍番号（任意）', ko: '학번(선택)', th: 'รหัสนักศึกษา (ไม่บังคับ)', vi: 'Mã sinh viên (tùy chọn)', ms: 'No. Pelajar (pilihan)', id: 'NIM (opsional)', fil: 'Student ID (opsyonal)' },
        'auth.grade.placeholder': { zh: '请选择年级', en: 'Select grade', tw: '請選擇年級', ja: '学年を選択', ko: '학년 선택', th: 'เลือกชั้นปี', vi: 'Chọn khóa', ms: 'Pilih tahun', id: 'Pilih angkatan', fil: 'Pumili ng antas' },
        'auth.college.placeholder': { zh: '请选择学院', en: 'Select college', tw: '請選擇學院', ja: '学院を選択', ko: '학과 선택', th: 'เลือกวิทยาลัย', vi: 'Chọn khoa', ms: 'Pilih kolej', id: 'Pilih fakultas', fil: 'Pumili ng kolehiyo' },
        'auth.major.placeholder': { zh: '请先选择学院', en: 'Select college first', tw: '請先選擇學院', ja: 'まず学院を選択', ko: '먼저 학과 선택', th: 'เลือกวิทยาลัยก่อน', vi: 'Chọn khoa trước', ms: 'Pilih kolej dahulu', id: 'Pilih fakultas dulu', fil: 'Pumili muna ng kolehiyo' },
        'auth.done': { zh: '完成注册', en: 'Complete Registration', tw: '完成註冊', ja: '登録完了', ko: '가입 완료', th: 'สมัครเสร็จ', vi: 'Hoàn tất đăng ký', ms: 'Selesai Daftar', id: 'Selesai Daftar', fil: 'Kumpletuhin ang Pagrehistro' },
        'auth.reset.title': { zh: '重置密码', en: 'Reset Password', tw: '重置密碼', ja: 'パスワード再設定', ko: '비밀번호 재설정', th: 'รีเซ็ตรหัสผ่าน', vi: 'Đặt lại mật khẩu', ms: 'Tetapkan Semula Kata Laluan', id: 'Atur Ulang Kata Sandi', fil: 'I-reset ang Password' },
        'auth.reset.email': { zh: '注册时使用的邮箱', en: 'Registered email', tw: '註冊時使用的郵箱', ja: '登録時のメール', ko: '가입 이메일', th: 'อีเมลที่ลงทะเบียน', vi: 'Email đã đăng ký', ms: 'E-mel berdaftar', id: 'Email terdaftar', fil: 'Nakarehistrong email' },
        'auth.reset.send': { zh: '发送验证码', en: 'Send Code', tw: '發送驗證碼', ja: 'コード送信', ko: '코드 전송', th: 'ส่งรหัส', vi: 'Gửi mã', ms: 'Hantar Kod', id: 'Kirim Kode', fil: 'Ipadala ang Code' },
        'auth.reset.newpw': { zh: '新密码（至少 8 位）', en: 'New password (min 8 chars)', tw: '新密碼（至少 8 位）', ja: '新パスワード（8文字以上）', ko: '새 비밀번호(8자 이상)', th: 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)', vi: 'Mật khẩu mới (tối thiểu 8 ký tự)', ms: 'Kata laluan baharu (min 8)', id: 'Kata sandi baru (min 8)', fil: 'Bagong password (min 8 karakter)' },
        'auth.reset.done': { zh: '重置并登录', en: 'Reset & Sign In', tw: '重置並登入', ja: '再設定してログイン', ko: '재설정 및 로그인', th: 'รีเซ็ตและเข้าสู่ระบบ', vi: 'Đặt lại & đăng nhập', ms: 'Tetap Semula & Log Masuk', id: 'Reset & Masuk', fil: 'I-reset at Mag-sign In' },
        'auth.profile.edit': { zh: '编辑资料', en: 'Edit Profile', tw: '編輯資料', ja: 'プロフィール編集', ko: '프로필 편집', th: 'แก้ไขโปรไฟล์', vi: 'Sửa hồ sơ', ms: 'Edit Profil', id: 'Edit Profil', fil: 'I-edit ang Profile' },
        'auth.save': { zh: '保存', en: 'Save', tw: '儲存', ja: '保存', ko: '저장', th: 'บันทึก', vi: 'Lưu', ms: 'Simpan', id: 'Simpan', fil: 'I-save' },
        'auth.welcome': { zh: '欢迎加入文轩校园导视', en: 'Welcome to Wenxuan Campus Guide', tw: '歡迎加入文軒校園導視', ja: '文軒キャンパスガイドへようこそ', ko: '원쉬안 캠퍼스 안내에 오신 것을 환영합니다', th: 'ยินดีต้อนรับสู่คู่มือวิทยาเขต', vi: 'Chào mừng đến với hướng dẫn khuôn viên', ms: 'Selamat datang ke Panduan Kampus Wenxuan', id: 'Selamat datang di Panduan Kampus Wenxuan', fil: 'Maligayang pagdating sa Wenxuan Campus Guide' },
        'auth.start': { zh: '开始使用', en: 'Get Started', tw: '開始使用', ja: 'はじめる', ko: '시작하기', th: 'เริ่มใช้งาน', vi: 'Bắt đầu', ms: 'Mula Guna', id: 'Mulai', fil: 'Magsimula' },

        // 标签栏
        'tab.map': { zh: '地图', en: 'Map', tw: '地圖', ja: '地図', ko: '지도', th: 'แผนที่', vi: 'Bản đồ', ms: 'Peta', id: 'Peta', fil: 'Mapa' },
        'tab.places': { zh: '地点', en: 'Places', tw: '地點', ja: '地点', ko: '장소', th: 'สถานที่', vi: 'Địa điểm', ms: 'Tempat', id: 'Tempat', fil: 'Mga Lugar' },
        'tab.lf': { zh: '招领', en: 'Lost & Found', tw: '招領', ja: '落とし物', ko: '분실물', th: 'ของหาย', vi: 'Đồ thất lạc', ms: 'Hilang', id: 'Hilang', fil: 'Nawala' },
        'tab.chat': { zh: '聊天', en: 'Chat', tw: '聊天', ja: 'チャット', ko: '채팅', th: 'แชท', vi: 'Trò chuyện', ms: 'Sembang', id: 'Obrolan', fil: 'Chat' },
        'tab.me': { zh: '我的', en: 'Me', tw: '我的', ja: 'マイ', ko: '나', th: 'ฉัน', vi: 'Tôi', ms: 'Saya', id: 'Saya', fil: 'Ako' },
    };

    // ====== 语言列表 ======
    const LANGS = [
        { code: 'zh',  label: '简体中文', flag: '🇨🇳' },
        { code: 'en',  label: 'English', flag: '🇬🇧' },
        { code: 'tw',  label: '繁體中文', flag: '🇭🇰' },
        { code: 'ja',  label: '日本語', flag: '🇯🇵' },
        { code: 'ko',  label: '한국어', flag: '🇰🇷' },
        { code: 'th',  label: 'ไทย', flag: '🇹🇭' },
        { code: 'vi',  label: 'Tiếng Việt', flag: '🇻🇳' },
        { code: 'ms',  label: 'Bahasa Melayu', flag: '🇲🇾' },
        { code: 'id',  label: 'Bahasa Indonesia', flag: '🇮🇩' },
        { code: 'fil', label: 'Filipino', flag: '🇵🇭' },
    ];

    const STORAGE_KEY = 'wenxuan_lang';
    let current = localStorage.getItem(STORAGE_KEY) || 'zh';
    if (!LANGS.some(l => l.code === current)) current = 'zh';

    function pick(table, code) {
        if (!table) return '';
        const c = code || current;
        return table[c] !== undefined ? table[c] : (table.zh !== undefined ? table.zh : '');
    }

    const I18N = {
        get lang() { return current; },
        get langs() { return LANGS; },

        /** 通用文案：I18N.t('settings.title') */
        t(key, vars) {
            let s = pick(STR[key], current);
            if (vars) {
                for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
            }
            return s;
        },

        /** 地点名：I18N.poi('b_gate_main') */
        poi(id) { return pick(POI[id], current) || id; },

        /** 地点描述：I18N.poiDesc('b_gate_main') */
        poiDesc(id) {
            const p = POI[id];
            if (!p || !p._desc) return '';
            return pick(p._desc, current);
        },

        /** 分类名：I18N.cat('gate') */
        cat(key) { return pick(CAT[key], current) || key; },

        /** 设置/切换语言 */
        setLang(code, persist) {
            if (!LANGS.some(l => l.code === code)) return;
            current = code;
            if (persist !== false) localStorage.setItem(STORAGE_KEY, code);
            document.documentElement.lang = (code === 'zh' ? 'zh-CN' : code === 'tw' ? 'zh-TW' : code);
            applyStatic();
            if (typeof window.__onLangChange === 'function') window.__onLangChange(code);
        },

        /** 应用到所有 data-i18n 元素（静态 HTML 文案） */
        applyStatic() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                el.textContent = key.indexOf('cat.') === 0 ? I18N.cat(key.slice(4)) : I18N.t(key);
            });
            document.querySelectorAll('[data-i18n-ph]').forEach(el => {
                const key = el.getAttribute('data-i18n-ph');
                el.setAttribute('placeholder', I18N.t(key));
            });
        },
    };

    window.I18N = I18N;

    // 首次执行：应用静态文案（DOM 可能尚未就绪，等 DOMContentLoaded 再补一次）
    function boot() {
        I18N.applyStatic();
        document.documentElement.lang = (current === 'zh' ? 'zh-CN' : current === 'tw' ? 'zh-TW' : current);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
