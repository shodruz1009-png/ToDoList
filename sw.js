// ============================================================
// ToDoList PWA — Service Worker
// Har bir deploy'da CACHE_VERSION'ni oshiring (masalan v9 -> v10),
// shunda eski kesh avtomatik "activate" bosqichida o'chib, yangi
// fayllar bilan almashtiriladi.
// MUHIM: index.html'ga yangi o'zgarish kiritilganda, foydalanuvchi
// eski keshlangan versiyani ko'rmasligi uchun bu versiya raqami
// albatta oshirilishi shart — aks holda Service Worker eski faylni
// keshdan qaytaraverib, yangi kod hech qachon ishga tushmaydi.
// To'liq offline (LocalStorage asosidagi) ilova uchun.
// Supabase olib tashlangan, SortableJS CDN orqali ulanadi.
// ============================================================

// v10: Ushbu deployda kiritilgan o'zgarishlar:
//  - Sirli joy: "KECHA" yorlig'iga aniq sana qo'shildi (masalan "KECHA (18.07)")
//  - Reward ishlatilganda (0 tangalik) tarixga endi yozuv qo'shilmaydi
//  - Reward Statistics endi XARID emas, ISHLATISH (usage) tarixini ko'rsatadi
//    (yangi doimiy todolist_usage_history kaliti orqali)
//  - Minecraft Steve: HP formulasi tuzatildi (tiklanish endi 0.5x/tanga,
//    jazo bilan bir xil 2x emas)
//  - Minecraft Steve: oyoqlar orasiga bo'shliq va konturlar qo'shildi
//    (yassi/"qog'oz" ko'rinish muammosi)
//  - Ko'p oyna/tab holatida IELTS natijalar va boshqa umumiy holat
//    ba'zan yo'qolib qolish xatosi tuzatildi (visibilitychange orqali
//    diskdagi so'nggi holat bilan sinxronlash)
//  - "Top Task" statistikasi: Undone bosilganda taskDoneCount endi
//    to'g'ri kamayadi + eskirgan sonlar bir martalik tuzatiladi
//  - IELTS Detailed analysis: "i" tugmasi qo'shildi — Listening/Reading
//    uchun rasmiy ball jadvalini ko'rsatadi
//  - Reward tahrirlashda (Edit) endi vaqtli mukofotning haqiqiy
//    daqiqasi (amount) ham nomga mos yangilanadi
//  - Instagram bloklanish muddati endi qat'iy 30 kun emas — oxirgi
//    ban tugagan kundan (yoki ilovani boshlagan kundan) hisoblanadi
const CACHE_VERSION = 'v10';
const CACHE_NAME = `todolist-cache-${CACHE_VERSION}`;

// Ilova offline'da ishlashi uchun oldindan keshlanadigan fayllar.
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
// Barcha zarur fayllarni keshga oldindan yuklaydi va darhol
// yangi Service Worker versiyasini faollashtirishga tayyorlanadi.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Har bir faylni alohida qo'shamiz — birortasi (masalan tashqi
      // CDN vaqtincha ishlamay qolsa) butun pre-cache jarayonini
      // to'xtatib qo'ymasligi uchun.
      await Promise.all(
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
      // Eski SW hali faol bo'lsa ham, yangisini kutmasdan ishga tushiramiz.
      self.skipWaiting();
    })()
  );
});

// ---------------- ACTIVATE ----------------
// Eski versiyadagi barcha keshlarni avtomatik o'chirib tashlaydi
// va Service Worker'ni darhol barcha ochiq oynalar ustidan nazoratga oladi.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Eski kesh o\'chirilmoqda:', name);
            return caches.delete(name);
          })
      );
      await self.clients.claim();
    })()
  );
});

// ---------------- FETCH ----------------
// Strategiya:
//  - HTML sahifa so'rovlari (navigatsiya): Network-First, keshga zaxira
//    bilan — internet bo'lsa eng yangi versiya, bo'lmasa keshdan offline
//    ishlaydi.
//  - Qolgan barcha resurslar (JS/CSS/rasm/CDN va h.k.): Cache-First,
//    tarmoqqa tezkor zaxira bilan — imkon qadar tezroq yuklanadi va
//    fon rejimida keshni yangilab boradi (stale-while-revalidate uslubida).
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Faqat GET so'rovlarini keshlaymiz — POST/PUT va h.k. tegilmaydi.
  if (request.method !== 'GET') return;

  const isNavigation =
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));

  if (isNavigation) {
    event.respondWith(networkFirstFallingBackToCache(request));
  } else {
    event.respondWith(cacheFirstWithBackgroundUpdate(request));
  }
});

// Network-First, Falling Back to Cache — asosan HTML navigatsiya uchun.
async function networkFirstFallingBackToCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Internet yo'q — keshdan qaytaramiz.
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // So'nggi chora: asosiy sahifani beramiz (offline fallback).
    const fallback = await cache.match('/ToDoList/index.html');
    if (fallback) return fallback;
    return new Response('Offline: sahifa keshda topilmadi.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache-First + fon rejimida yangilash — statik resurslar (JS, CSS,
// rasmlar, tashqi CDN kutubxonalari) uchun eng tezkor strategiya.
async function cacheFirstWithBackgroundUpdate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  // Fonda tarmoqdan yangi versiyani olib, keshni yangilab qo'yamiz
  // (keyingi safar ochilganda eng so'nggi fayl ishlatiladi).
  const networkFetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // Keshda bo'lsa — darhol shuni qaytaramiz (eng tez javob).
  if (cached) {
    networkFetchPromise; // fon rejimida yangilanishda davom etadi
    return cached;
  }

  // Keshda yo'q bo'lsa — tarmoqdan kutamiz, u ham bo'lmasa xatolik.
  const networkResponse = await networkFetchPromise;
  if (networkResponse) return networkResponse;

  return new Response('Offline: resurs keshda topilmadi.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
