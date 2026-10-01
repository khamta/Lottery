/**
 * Service worker ของแอป (PWA) — ดู docs/PWA.md
 *
 * หลักการ: ข้อมูลต้องสดเสมอ จึง "ไม่" cache หน้าเพจหรือ API
 * - เปิดหน้า (navigate)      → ไปเน็ตก่อน ถ้าออฟไลน์ค่อยแสดง /offline ที่เก็บไว้
 * - /_next/static/*          → cache-first (ชื่อไฟล์มี hash อยู่แล้ว ไม่มีวันเปลี่ยน)
 * - ไอคอน / ฟอนต์ / รูปใน public → stale-while-revalidate
 * - อย่างอื่น (API, server action, RSC) → ปล่อยผ่านเบราว์เซอร์ตามปกติ
 *
 * แก้ไฟล์นี้เมื่อไหร่ ให้เพิ่ม VERSION ด้วย เพื่อให้ cache เก่าถูกล้าง
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = [STATIC_CACHE, PAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// หน้า /offline ใช้ภาษาจาก cookie — แอปส่งข้อความมาให้โหลดใหม่เมื่อเปิดแอป/เปลี่ยนภาษา
self.addEventListener("message", (event) => {
  if (event.data?.type === "refresh-offline") {
    event.waitUntil(
      caches.open(PAGE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: PAGE_CACHE }).then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (/^\/(icons|fonts|img)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());

  return cached ?? network;
}
