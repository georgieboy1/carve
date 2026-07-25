/* Jenga Sweeper service worker — KG Studio
   ------------------------------------------------------------
   Every path here is RELATIVE. GitHub Pages serves the app from
   /<repo>/, so an absolute '/index.html' would 404 in production. */

const VERSION = 'v1';
const SHELL_CACHE = `jenga-shell-${VERSION}`;
const RUNTIME_CACHE = `jenga-runtime-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// three.js is served with `access-control-allow-origin: *`, so these are
// real (non-opaque) responses we can cache and actually reuse offline.
const CDN_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch ad traffic: caching it would both break frequency capping
  // and quietly retain third-party responses.
  if (url.origin !== self.location.origin && url.hostname !== CDN_HOST) return;

  // A navigation always resolves to the app shell so a deep link or an
  // offline launch still boots the game.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html')),
    );
    return;
  }

  if (url.hostname === CDN_HOST) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/* Serve the cached copy immediately, refresh it in the background. Keeps
   the pinned three.js build instant on repeat launches without going stale
   if we bump the version. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}
