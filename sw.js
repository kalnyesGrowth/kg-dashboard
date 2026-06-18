const DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const CACHE = 'kg-dash-v19';
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

self.addEventListener('push', e => {
  let data = { title: 'New Lead!', body: 'Someone just submitted a quote request.', url: '/' };
  try { data = Object.assign(data, e.data.json()); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [300, 100, 300, 100, 300, 100, 500],
      tag: 'new-lead',
      renotify: true,
      requireInteraction: true,
      data: { url: data.url }
    }).then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        for (const c of clients) c.postMessage({ type: 'cha-ching', lead: data.title });
      })
    )
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        c.postMessage({ type: 'cha-ching', lead: 'notification-tap' });
        if (new URL(c.url).pathname === url && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url + '?cha-ching=1');
    })
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
