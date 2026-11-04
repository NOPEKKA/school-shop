// data-demo.js — โหมดทดลอง: ฟังก์ชันชุดเดียวกับ data-firestore.js แต่เก็บใน localStorage ของเครื่องนี้
// ใช้ตอนยังไม่ได้ใส่ firebase-config.js หรือเปิดด้วย ?demo=1 (ไม่มีล็อกอิน ไม่มีซิงก์ข้ามเครื่อง)
// หน้าร้านกับหน้านักเรียนที่เปิดในเบราว์เซอร์เดียวกัน (แท็บหรือกรอบเดียวกัน) เห็นข้อมูลชุดเดียวกันทันที

const PREFIX = 'so.demo.';
let shop = 'khaomoo';
const key = (kind) => `${PREFIX}${shop}.${kind}`;
const mem = {}; // สำรองไว้ถ้าเบราว์เซอร์ไม่ให้ใช้ localStorage
const subs = { menu: new Set(), orders: new Set(), shop: new Set() };
let errCb = () => {};
let role = 'staff';

function read(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    if (v != null) return JSON.parse(v);
  } catch { /* ใช้หน่วยความจำแทน */ }
  return k in mem ? JSON.parse(mem[k]) : fallback;
}
function write(k, v) {
  const s = JSON.stringify(v);
  mem[k] = s;
  try { localStorage.setItem(k, s); } catch { /* ใช้หน่วยความจำแทน */ }
}
function emit(kind) {
  for (const f of subs[kind]) setTimeout(f, 0);
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// แท็บ/กรอบอื่นของเครื่องเดียวกันแก้ข้อมูล -> อัปเดตหน้าจอ
addEventListener('storage', (e) => {
  if (!e.key) { emit('menu'); emit('orders'); emit('shop'); return; }
  if (e.key === key('menu')) emit('menu');
  if (e.key === key('orders')) emit('orders');
  if (e.key === key('shop')) emit('shop');
});

export async function init(opts = {}) { role = opts.role || 'staff'; }
export function useShop(id) {
  shop = id;
  emit('shop');
  emit('menu');
  emit('orders');
}
export function onSync(cb) { cb({ online: true, pending: 0, demo: true }); }
export function onError(cb) { errCb = cb; }

export function onAuth(cb) {
  const uid = role === 'customer' ? customerUid() : 'demo-staff';
  setTimeout(() => cb({ uid, email: '', anonymous: role === 'customer' }), 0);
  return () => {};
}
function customerUid() {
  let id = read(PREFIX + 'uid', null);
  if (!id) { id = 'c' + newId(); write(PREFIX + 'uid', id); }
  return id;
}
export async function login() {}
export function logout() {}
export function watchAccess(cb) { setTimeout(() => cb(null), 0); return () => {}; }
export async function setAccessCode() {}
export async function clearAccessCode() {}

// ----- ตั้งค่าร้าน -----
export function watchShop(cb) {
  const f = () => cb(read(key('shop'), null), { fromCache: false });
  subs.shop.add(f);
  setTimeout(f, 0);
  return () => subs.shop.delete(f);
}
export function saveShop(patch) {
  write(key('shop'), { ...read(key('shop'), {}), ...patch });
  emit('shop');
}
export function seedShop(settings, menu) {
  write(key('shop'), { ...read(key('shop'), {}), ...settings });
  const m = read(key('menu'), {});
  for (const { id, ...rest } of menu) m[id] = rest;
  write(key('menu'), m);
  emit('shop');
  emit('menu');
}

// ----- เมนู -----
export function watchMenu(cb) {
  const f = () => cb(Object.entries(read(key('menu'), {})).map(([id, m]) => ({ id, ...m })));
  subs.menu.add(f);
  setTimeout(f, 0);
  return () => subs.menu.delete(f);
}
export function saveMenuItem(item) {
  const { id: given, ...rest } = item;
  const id = given || 'm' + newId();
  const m = read(key('menu'), {});
  m[id] = rest;
  write(key('menu'), m);
  emit('menu');
  return id;
}
export function deleteMenuItem(id) {
  const m = read(key('menu'), {});
  delete m[id];
  write(key('menu'), m);
  emit('menu');
}
export function reorderMenu(list) {
  const m = read(key('menu'), {});
  for (const { id, sortOrder } of list) if (m[id]) m[id].sortOrder = sortOrder;
  write(key('menu'), m);
  emit('menu');
}

// ----- ออเดอร์ (ร้าน) -----
const allOrders = () => Object.entries(read(key('orders'), {})).map(([id, o]) => ({ ...o, id }));

export function watchOrdersOfDay(dateKey, cb) {
  const f = () => cb(allOrders().filter((o) => o.dateKey === dateKey));
  subs.orders.add(f);
  setTimeout(f, 0);
  return () => subs.orders.delete(f);
}
export function addOrder(order) {
  const id = newId();
  const all = read(key('orders'), {});
  const { id: _i, _pending, ...data } = order;
  all[id] = data;
  write(key('orders'), all);
  emit('orders');
  return id;
}
export function updateOrder(id, patch, historyEntry) {
  const all = read(key('orders'), {});
  const o = all[id];
  if (!o) return errCb('ไม่พบออเดอร์นี้');
  Object.assign(o, patch, { updatedAt: Date.now() });
  if (historyEntry) o.history = [...(o.history || []), historyEntry];
  write(key('orders'), all);
  emit('orders');
}
export async function fetchOrdersRange(startKey, endKey) {
  return allOrders().filter((o) => o.dateKey >= startKey && o.dateKey <= endKey);
}

// ----- ยอดรายวัน -----
export function saveDay(dateKey, summary) {
  const all = read(key('days'), {});
  all[dateKey] = { ...summary, dateKey, updatedAt: Date.now() };
  write(key('days'), all);
}
export async function fetchDays(startKey, endKey) {
  return Object.values(read(key('days'), {})).filter((d) => d.dateKey >= startKey && d.dateKey <= endKey);
}

// ----- ออเดอร์ (นักเรียน) -----
export async function placeQrOrder(order) {
  await wait(450); // จำลองเวลาส่งขึ้นเซิร์ฟเวอร์
  const s = read(key('shop'), null);
  if (!s) throw new Error('ร้านนี้ยังไม่เปิดระบบสั่งอาหาร');
  if (s.qrOrdering === false) throw new Error('ร้านนี้สั่งที่หน้าร้านเท่านั้น');
  if (s.qrOpen === false) throw new Error('ร้านปิดรับออเดอร์ทางมือถือชั่วคราว สั่งที่หน้าร้านได้เลย');
  const counters = read(key('counter'), {});
  const number = (counters[order.dateKey] || 0) + 1;
  counters[order.dateKey] = number;
  write(key('counter'), counters);
  const id = addOrder({ ...order, number, qnum: number, uid: customerUid(), createdAt: Date.now() });
  return { id, number };
}
export function watchMyOrder(id, cb) {
  const f = () => {
    const o = read(key('orders'), {})[id];
    cb(o ? { ...o, id } : null);
  };
  subs.orders.add(f);
  setTimeout(f, 0);
  return () => subs.orders.delete(f);
}
export function claimPaid(id) {
  updateOrder(id, { payClaimed: true, payClaimedAt: Date.now() });
}

export function resetDemo() {
  for (const k of ['menu', 'orders', 'shop', 'counter', 'days']) {
    delete mem[key(k)];
    try { localStorage.removeItem(key(k)); } catch { /* ไม่เป็นไร */ }
  }
  emit('shop');
  emit('menu');
  emit('orders');
}
