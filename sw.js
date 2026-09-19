/* ============================================================
 * sw.js — 校园导览 Service Worker
 * 策略：静态资源 网络优先（始终先取最新），失败回退缓存（离线可用）
 *       /api/  数据接口 网络优先但不写缓存（数据以服务器为准，
 *              离线时由前端 api.js 自动降级本地数据）
 * 防护：只缓存「状态正常且非空」的响应，避免网关偶发的
 *       空 200 响应被缓存后导致白屏
 * ============================================================ */
const CACHE = 'wenxuan-map-v83';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/campus-data.js',
  './js/college-data.js',
  './js/routing.js',
  './js/api.js',
  './js/i18n.js',
  './js/appshell.js',
  './js/permissions.js',
  './js/auth.js',
  './js/app.js',
  './js/lostfound.js',
  './js/chat.js',
  './assets/campus-map.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './manifest.webmanifest',
  // Iconsax Rounded / Linear：入口、索引和本次实际用到的分类。
  './vendor/iconsax/index.js',
  './vendor/iconsax/manifest.json',
  './vendor/iconsax/data/school-learning.json',
  './vendor/iconsax/data/location.json',
  './vendor/iconsax/data/building.json',
  './vendor/iconsax/data/essential.json',
];

/** 响应是否值得缓存：200 且（无 Content-Length 头 或 长度 > 0） */
function isCacheable(res) {
  if (!res || !res.ok) return false;
  const len = res.headers.get('Content-Length');
  if (len !== null && Number(len) === 0) return false;
  return true;
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))  // 单个失败不拖垮整个安装
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/sw.js')) return;   // 关键：不拦截 SW 自身，保证可更新

  // API 接口：直连网络，不写缓存（离线时由前端降级逻辑接管）
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) {
    e.respondWith(fetch(req));
    return;
  }

  // 静态资源：网络优先（始终先取最新），失败回退缓存（离线可用）
  e.respondWith(
    fetch(req).then(res => {
      if (isCacheable(res)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
