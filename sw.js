const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const CACHE = 'kg-dash-v13';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/views.js',
  '/utils.js',
  '/manifest.json',
  '/supabase/client.js',
  '/supabase/db.js',
];

self.addEventListener('install', e => {
  if (DEV) { self.skipWaiting(); return; }
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  if (DEV) { e.waitUntil(self.clients.claim()); return; }
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (DEV || e.request.method !== 'GET') return;
  // Network-first: always fetch fresh, cache as offline fallback
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === self.location.origin) {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
  );
});
