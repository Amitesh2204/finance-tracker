const CACHE_NAME = 'finance-v1';
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
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request).catch(() => caches.match('/')))
  );
});
