// Force reset cache
const CACHE = 'v3-live-update-' + Date.now();
self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  // Always network-first so changes appear instantly
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});