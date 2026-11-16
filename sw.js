// sw.js — เก็บไฟล์แอปไว้ในเครื่อง เพื่อให้เปิดแอปร้านได้แม้ไม่มีเน็ต
// อัปเดตไฟล์แอปเมื่อไหร่ ให้เปลี่ยน VERSION ด้วย เครื่องร้านจะโหลดของใหม่เอง (มีผลตอนเปิดแอปครั้งถัดไป)
// ข้อมูลออเดอร์ไม่ได้อยู่ที่นี่ — Firestore เก็บเองใน IndexedDB

const VERSION = 'shop-v4.4.2';
const SDK = '12.19.0'; // ต้องตรงกับ data-firestore.js

const APP_FILES = [
  './', './index.html', './order.html',
  './base.css', './staff.css', './student.css',
  './app.js', './student.js', './data.js', './data-firestore.js', './data-demo.js',
  './model.js', './shops.js', './icons.js', './qr.js', './vendor/qrcode.js',
  './firebase-config.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
const FIREBASE_FILES = ['app', 'auth', 'firestore'].map((n) => `https://www.gstatic.com/firebasejs/${SDK}/firebase-${n}.js`);
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(APP_FILES);
    // ไฟล์ Firebase จาก CDN: ถ้าโหลดไม่ได้ตอนนี้ จะเก็บทีหลังตอนแอปใช้งาน
    await Promise.allSettled(FIREBASE_FILES.map((u) => cache.add(new Request(u, { mode: 'cors' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  const font = FONT_HOSTS.includes(url.hostname);
  // Firestore / Auth / อื่นๆ ปล่อยผ่าน ไม่ยุ่ง
  if (!sameOrigin && !firebaseSdk && !font) return;

  if (req.mode === 'navigate') {
    // เปิดหน้า: ใช้ไฟล์ในเครื่องก่อน (เร็วและใช้ได้ตอนออฟไลน์) แล้วอัปเดตเบื้องหลัง
    // order.html = หน้านักเรียน, หน้าอื่นทั้งหมด = แอปร้าน
    const page = url.pathname.endsWith('/order.html') ? './order.html' : './index.html';
    e.respondWith(staleWhileRevalidate(e, req, page));
  } else if (firebaseSdk) {
    // ไฟล์ SDK ล็อกเวอร์ชันแล้ว ไม่เปลี่ยน: ใช้ของในเครื่องได้เลย
    e.respondWith(cacheFirst(req));
  } else {
    e.respondWith(staleWhileRevalidate(e, req, req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(e, req, key) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(key, { ignoreSearch: true });
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    e.waitUntil(fresh);
    return hit;
  }
  return (await fresh) || new Response('ออฟไลน์และยังไม่มีไฟล์นี้ในเครื่อง', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
