// Service worker: app offline + cache das capas.
const VERSION = 'setlist-v9';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=9',
  './cloud.js?v=9',
  './app.js?v=9',
  './seed.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png'
];
const IMG_CACHE = 'setlist-covers';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ficheiros da app: rede primeiro (para apanhar atualizações), cache se offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: false }).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Capas (Wikimedia e outras imagens): cache primeiro.
  if (req.destination === 'image') {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          cache.put(req, res.clone());
          return res;
        }))
      )
    );
  }
});
