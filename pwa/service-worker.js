// Service Worker — تخزين مؤقت للملفات المحلية فقط، بدون تخزين لطلبات API
const CACHE_NAME = 'haraj-search-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // لا نخزن طلبات API أبداً — تمر مباشرة للشبكة
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // cache-first للملفات المحلية فقط (نفس المصدر)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});
