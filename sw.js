// ============================================================
// ToDoList PWA — Service Worker (v16 — Supabase auth: email+parol va
// Google OAuth bilan ro'yxatdan o'tish/kirish qo'shildi, eski mahalliy
// nik/parol tizimi olib tashlandi)
// ============================================================

// MUHIM: har safar index.html (yoki boshqa kod)ni yangilab qayta
// joylashtirganingizda, bu raqamni oshiring (v16 -> v17 -> ...).
// Shunda eski kesh butunlay o'chiriladi va yangi fayllar qayta yuklanadi.
const CACHE_VERSION = 'v17';
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

// Eslatma: admin.html ATAYLAB shu ro'yxatga QO'SHILMAGAN — u faqat
// to'g'ridan-to'g'ri havola orqali ochiladigan alohida (asosiy ilova
// navigatsiyasiga ulanmagan) sahifa, shu sababli har bir oddiy
// foydalanuvchi uchun keraksiz oldindan yuklashning hojati yo'q.
// Baribir ochilganda pastdagi network-first/cache-first oqimi orqali
// avtomatik keshlanadi (agar admin uni ochsa).

// Eslatma 2: Supabase JS SDK (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2)
// ATAYLAB PRECACHE_URLS ro'yxatiga QO'SHILMAGAN — bu tashqi CDN skripti
// pastdagi "cache-first + fon-yangilash" oqimi orqali birinchi so'rovda
// o'zi avtomatik keshlanadi, shuning uchun oldindan sanab o'tirishning
// hojati yo'q (va CDN vaqtincha ishlamay qolsa ham install bosqichi
// buzilib qolmaydi).

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

  // 0. Supabase so'rovlari (auth, REST/PostgREST, realtime): Service
  // Worker BUTUNLAY chetlab o'tadi — bular har doim jonli tarmoqdan
  // ketishi shart (login holati, ma'lumotlar bazasi javoblari va h.k.
  // hech qachon eski keshdan qaytarilmasligi kerak, aks holda
  // autentifikatsiya yoki ma'lumotlar eskirib qolishi mumkin).
  if (url.hostname.endsWith('.supabase.co')) {
    return;
  }

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
//
// MUHIM TUZATISH: ilgari bu yerda oddiy `fetch(request)` chaqirilardi.
// Muammo shundaki, bu faqat Service Worker keshini chetlab o'tardi —
// BRAUZERNING O'ZINING HTTP keshini (disk cache) chetlab o'tmasdi.
// Ba'zi hostinglar HTML uchun ham cache sarlavhalari yuborgani sabab,
// brauzer "tarmoqdan olyapman" deb turib, aslida o'zining eski HTTP
// keshidan javob qaytarib yuborishi mumkin edi — natijada yangilangan
// index.html HECH QACHON ko'rinmasdi, garchi SW "network-first"
// siyosatini to'g'ri bajarayotgan bo'lsa ham. Endi so'rov doim
// `cache: 'no-store'` bilan yuboriladi — bu brauzerni HAR SAFAR
// haqiqiy tarmoqqa murojaat qilishga majbur qiladi.
async function networkFirstFallingBackToCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const freshRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
      credentials: request.credentials,
      redirect: 'follow',
      cache: 'no-store' // <-- brauzer HTTP keshini ham chetlab o'tadi
    });
    const networkResponse = await fetch(freshRequest);
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
    //
    // MUHIM TUZATISH: ilgari cache.put()ning natijasi (Promise) .then()
    // ichida qaytarilmagan (return qilinmagan) edi. Shu sababli, agar
    // tarmoq javobi tugallanmasdan uzilib qolsa (masalan foydalanuvchi
    // sahifani yopib yuborsa yoki ulanish beqaror bo'lsa), cache.put()
    // ichkarida bosh (floating) Promise sifatida qolib ketardi va uning
    // xatoligi HECH QANDAY .catch() bilan ushlanmay, konsolda
    // "Uncaught (in promise) NetworkError" ko'rinishida chiqib turardi
    // — garchi funksionallikka ta'siri bo'lmasa ham. Endi cache.put()
    // ham .then() ichidan qaytariladi, shu bilan u asosiy zanjirga
    // qo'shiladi va pastdagi .catch() uni ham qamrab oladi.
    fetch(request).then((networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        return cache.put(request, networkResponse);
      }
    }).catch(() => {/* Offline yoki tarmoq uzilishi — e'tiborsiz qoldiriladi */});

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
