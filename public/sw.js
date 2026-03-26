// public/sw.js
// ─────────────────────────────────────────────────────────────────────────────
// Service Worker v3 — покращена стратегія кешування
//
// Стратегії:
//   • Статика (html, js, css, jpg, png, svg, woff) → Cache First (миттєво)
//   • Supabase API (hprzwzqfdnryysqutenc.supabase.co) → Network First (актуальні дані)
//   • CDN скрипти (jquery, moment, daterangepicker) → Cache First
//   • Все інше → Network Only
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'sto-v6';
const CACHE_CDN = 'sto-cdn-v6';

// Статика яку кешуємо при встановленні
const PRECACHE_ASSETS = [
  './index.html',
  './main.html',
  './planyvannya.html',
  './bukhhalteriya.html',
  './logo.jpg',
  './vite.svg',
];

// CDN ресурси які кешуємо при першому завантаженні
const CDN_DOMAINS = [
  'cdn.jsdelivr.net',
  'code.jquery.com',
];

// ── Install: кешуємо критичні ресурси ────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll з помилками — не лупімо весь SW якщо один файл недоступний
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch(() => { }))
      );
    })
  );
});

// ── Activate: видаляємо старі кеші ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== CACHE_CDN)
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// ── Fetch: стратегії кешування ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 0) Пропускаємо все крім GET — POST/PUT/DELETE не кешуються
  if (event.request.method !== 'GET') return;

  // 1) Supabase Realtime → пропускаємо (WebSocket fallback, long-polling)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/realtime/')) {
    return;
  }

  // 2) Supabase REST API → Network First (актуальні дані)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 2) CDN → Cache First (рідко змінюються)
  if (CDN_DOMAINS.some((d) => url.hostname.includes(d))) {
    event.respondWith(cacheFirst(event.request, CACHE_CDN));
    return;
  }

  // 3) HTML сторінки → Network First (завжди свіжий контент)
  if (/\.html$/i.test(url.pathname) && url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 3.1) Manifest → Network First, щоб браузер бачив актуальні PWA-параметри.
  if (/\/manifest\.json$/i.test(url.pathname) && url.origin === self.location.origin) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 4) Статичні assets (JS, CSS, images) → Cache First (мають хеші у назвах)
  const isStaticAsset = /\.(js|css|jpg|jpeg|png|svg|woff2?|ico|json)$/i.test(url.pathname);
  if (isStaticAsset && url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // 5) Все інше → просто fetch (не кешуємо)
});

// ── Стратегія: Cache First ────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Офлайн: ресурс недоступний', { status: 503 });
  }
}

// ── Стратегія: Network First ──────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    // Мережа недоступна — повертаємо кеш якщо є
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
