/* LifeOS service worker (generated at build time) */
const CACHE = 'lifeos-cache-e897e7c60e';
const FILES = ["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./assets/index-DoBfU6bX.css","./assets/index-9QV6zGXu.js"];
self.addEventListener('install', (e) => {
  // No skipWaiting here: a new version waits until the person chooses to update, so a session is never swapped mid-edit.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(FILES.map(async (f) => { const r = await fetch(f, { cache: 'reload' }); if (!r.ok) throw new Error('Failed to cache ' + f); await c.put(f, r); }));
  })());
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('lifeos-cache-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const q = e.request; if (q.method !== 'GET') return;
  const u = new URL(q.url); if (u.origin !== location.origin) return;
  if (q.mode === 'navigate') {
    e.respondWith((async () => { try { return await fetch(q); } catch (_) { const c = await caches.open(CACHE); return (await c.match('./index.html')) || Response.error(); } })());
    return;
  }
  e.respondWith((async () => { const c = await caches.open(CACHE); return (await c.match(q, { ignoreSearch: true })) || fetch(q).catch(() => Response.error()); })());
});
