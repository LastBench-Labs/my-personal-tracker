
const CACHE_PREFIX = 'mpt-cache-';
const CACHE_VERSION = 'v3';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

// Install: download the new app shell before activating this worker.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        await Promise.all(
          APP_FILES.map(async (file) => {
            const response = await fetch(file, {
              cache: 'reload'
            });

            if (!response.ok) {
              throw new Error(
                `Failed to cache ${file}: HTTP ${response.status}`
              );
            }

            await cache.put(file, response);
          })
        );

        await self.skipWaiting();
      } catch (error) {
        // Remove an incomplete new cache; preserve older working caches.
        await caches.delete(CACHE_NAME);
        throw error;
      }
    })()
  );
});

// Activate: remove outdated app caches and control open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();

      await Promise.all(
        cacheKeys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// Handle same-origin GET requests only.
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // HTML/navigation: prefer fresh content, fall back to the cached app.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document'
  ) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);

          return (
            await cache.match(request, { ignoreSearch: true }) ||
            await cache.match('./index.html') ||
            Response.error()
          );
        }
      })()
    );

    return;
  }

  // Other app files: use the cache first for reliable offline access.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      const cachedResponse = await cache.match(request, {
        ignoreSearch: true
      });

      if (cachedResponse) return cachedResponse;

      try {
        return await fetch(request);
      } catch (error) {
        return Response.error();
      }
    })()
  );
});
