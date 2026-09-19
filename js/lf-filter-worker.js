// lf-filter-worker.js — 失物招领列表/标点过滤 Worker（v3.21 性能优化）
// 主线程发 posts + filter，Worker 返回过滤排序后的列表；50+ 标点不卡 UI

self.onmessage = function (e) {
    const { posts, filter, uid } = e.data || {};
    if (!Array.isArray(posts)) {
        self.postMessage({ list: [] });
        return;
    }
    const tab = filter && filter.tab;
    const cat = filter && filter.cat;
    const mineStatus = filter && filter.mineStatus;
    let list = posts;
    if (tab === 'mine') {
        if (!uid) { self.postMessage({ list: [] }); return; }
        list = list.filter(p => p.ownerId === uid);
        // v3.21：我的二级 tab —— 进行中(open) / 已完成(done)
        if (mineStatus === 'done') list = list.filter(p => p.status === 'done');
        else list = list.filter(p => p.status === 'open');
    } else if (tab === 'lost' || tab === 'found') {
        list = list.filter(p => p.type === tab);
    }
    if (cat && cat !== 'all') list = list.filter(p => p.category === cat);
    // 排序：进行中在前，已完成在后，按时间倒序
    const rank = { open: 0, pending: 0, done: 1 };
    list = list.slice().sort((a, b) =>
        (rank[a.status] || 0) - (rank[b.status] || 0) || (b.createdAt - a.createdAt)
    );
    self.postMessage({ list });
};
