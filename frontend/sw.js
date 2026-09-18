const CACHE_NAME = 'finance-v2';
const FILES = [
  '/',
  '/index.html',
  '/frontend/app.js',
  '/frontend/style.css',
  '/frontend/manifest.json',
  '/frontend/assets/logo.svg'
];

self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET' || new URL(evt.request.url).origin !== self.location.origin) return;
  evt.respondWith(
    fetch(evt.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(evt.request, copy));
        return response;
      })
      .catch(() => caches.match(evt.request).then(resp => resp || caches.match('/')))
  );
});
