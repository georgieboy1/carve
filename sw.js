/* Carve service worker — KG Studio
   ------------------------------------------------------------
   Every path here is RELATIVE. GitHub Pages serves the app from
   /<repo>/, so an absolute '/index.html' would 404 in production.

   Carried over from the Jenga build, which is why it is network-first
   rather than cache-first — see networkFirst() below for why that
   distinction cost us once already. */

/* BUMP THIS ON EVERY RELEASE THAT CHANGES ANY MODULE.

   The ?v= query on carve.js in index.html busts carve.js and nothing else.
   Its imports - themes.js, shapes.js, thumbs.js - carry no version, so a
   returning player can get a NEW carve.js paired with an OLD themes.js. That
   is not a subtle degradation: ES modules fail hard on a missing export, the
   import throws, and the game renders a blank page.

   Caught exactly that way after the wood finish added themes.finishOf.
   Bumping VERSION drops the whole shell cache, so the set stays consistent. */
const VERSION = 'v2';
const SHELL_CACHE = `carve-shell-${VERSION}`;
const RUNTIME_CACHE = `carve-runtime-${VERSION}`;

/* The whole game, including the Collection. Gallery and catalogue are real
   pages a player can land on, so they belong in the shell — not just the
   root document. */
const SHELL = [
  './',
  './index.html',
  './carve.css',
  './carve.js',
  './shapes.js',
  './themes.js',
  './thumbs.js',
  './gallery.html',
  './gallery.js',
  './privacy.html',
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

  /* A navigation resolves to the page itself when we have it — gallery.html
     is a real destination, and falling every navigation back to index.html
     would strand an offline player on the game screen when they asked for
     their Collection. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || caches.match('./index.html');
      }),
    );
    return;
  }

  if (url.hostname === CDN_HOST) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

/* Network-first for our own files, cache as the offline fallback.
   Cache-first looked right for an "offline app shell" and was actively
   wrong: it pinned every visitor to whatever HTML/CSS/JS they first
   downloaded until VERSION changed. A shipped fix would never reach anyone
   still holding a warm cache. This way the app is always current when
   online and still fully playable when not. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    /* Assets carry ?v= cache-busting queries, so an exact match misses once
       a version bumps while offline. Fall back to the versionless copy
       rather than failing the whole boot over a query string. */
    const cached = await cache.match(request)
      || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
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
