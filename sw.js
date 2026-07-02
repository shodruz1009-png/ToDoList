// ============================================================
// ToDoList — Service Worker
// MUHIM: Login/Auth oynasi butunlay olib tashlangan versiyaga
// o'tish uchun CACHE_NAME o'zgartirildi. Bu barcha eski
// brauzer keshlarini avtomatik bekor qiladi va foydalanuvchilar
// keyingi ochishda yangi (login oynasiz) versiyani oladi.
// ============================================================

const CACHE_NAME = 'todolist-cache-v2-no-auth-' + '20260702';

// Kesh qilinadigan asosiy fayllar. Agar loyihangizda boshqa nomlar
// bo'lsa (masalan, index.html o'rniga boshqa fayl), shu ro'yxatni
// moslashtiring.
const CORE_ASSETS = [
  './',
  './index.html'
];

// ---------------- O'RNATISH (INSTALL) ----------------
// Yangi service worker darhol faollashishi uchun skipWaiting chaqiriladi —
// foydalanuvchi eski tabni yopmasa ham, yangi versiya tezroq ishga tushadi.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {
        // Agar ba'zi fayllar topilmasa ham, install jarayoni to'xtab qolmasin
        return Promise.resolve();
      });
    })
  );
});

// ---------------- FAOLLASHTIRISH (ACTIVATE) ----------------
// Bu yerda ESKI barcha keshlar (nomidan qat'iy nazar) o'chiriladi —
// shu bilan eski login-oynali versiya butunlay yo'q qilinadi.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ---------------- FETCH (Network-first strategiya) ----------------
// HTML/asosiy fayllar uchun avval tarmoqdan (network-first) urinamiz,
// shunda foydalanuvchi doim eng yangi versiyani ko'radi. Faqat tarmoq
// mavjud bo'lmaganda keshdan qaytariladi (offline fallback).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone).catch(() => {});
        });
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
