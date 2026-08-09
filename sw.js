// ============================================================
// ToDoList PWA — Service Worker (v13 Optimallashtirilgan)
// ============================================================

const CACHE_VERSION = 'v13';
const CACHE_NAME = `todolist-cache-${CACHE_VERSION}`;

// Pre-cache qilinadigan asosiy fayllar
const PRECACHE_URLS = [
  '/ToDoList/',
  '/ToDoList/index.html',
  '/ToDoList/manifest.json',
  '/ToDoList/icon-180.png',
  '/ToDoList/icon-192.png',
  '/ToDoList/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js'
];

// ---------------- INSTALL ----------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Har bir faylni alohida keshga yuklash
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const request = new Request(url, { cache: 'reload' });
            const response = await fetch(request);
            if (response && (response.ok || response.type === 'opaque')) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('[SW] Pre-cache xatosi:', url, err);
          }
        })
      );
      
      // Yangi SW tayyor bo'lishi bilan kutmasdan ishga tushadi
      self.skipWaiting();
    })()
  );
});

// ---------------- ACTIVATE ----------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Eski versiyadagi keshlar tozalanadi
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Eski kesh o\'chirilmoqda:', name);
            return caches.delete(name);
          })
      );
      // Barcha ochiq oynalarni zudlik bilan nazoratga olish
      await self.clients.claim();
    })()
  );
});

// ---------------- FETCH ----------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Faqat GET so'rovlarini qayta ishlaymiz
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. HTML sahifa so'rovlari (Navigatsiya): Network-First
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    event.respondWith(networkFirstFallingBackToCache(request));
    return;
  }

  // 2. Tashqi rasmlar (masalan, flagcdn.com bayroqlari) va statik fayllar: Cache-First
  event.respondWith(cacheFirstWithNetworkFallbackAndCache(request));
});

// HTML uchun: Network-First (Internet bo'lsa yangi kod, bo'lmasa kesh)
async function networkFirstFallingBackToCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    
    // Offline zaxira sahifasi
    const fallback = await cache.match('/ToDoList/index.html');
    if (fallback) return fallback;

    return new Response('Offline: Sahifa keshda topilmadi.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Statik va dynamic resurslar uchun: Cache-First + Avto-keshlash
async function cacheFirstWithNetworkFallbackAndCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  // Keshda bo'lsa darhol beriladi
  if (cached) {
    // Fonda yangilab qo'yish (Stale-while-revalidate)
    fetch(request).then((networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse);
      }
    }).catch(() => {/* Offline bo'lsa e'tiborsiz qoldiriladi */});

    return cached;
  }

  // Keshda bo'lmasa tarmoqdan olinadi va keshga saqlanadi (masalan, yangi flagcdn rasmlari)
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('Offline: Resurs yuklanmadi.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
