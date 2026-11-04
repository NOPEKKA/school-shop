// data-firestore.js — เบื้องหลังของจริง: Firebase Auth + Firestore
// - แอปร้าน: ล็อกอินด้วยอีเมล/รหัสผ่าน + persistentLocalCache จดได้แม้เน็ตหลุด ส่งขึ้นเองเมื่อเน็ตกลับมา
//   การเขียนทุกครั้ง "ไม่รอ" เซิร์ฟเวอร์ (ถ้า await ตอนออฟไลน์ ปุ่มจะค้าง) หน้าจออัปเดตจากข้อมูลในเครื่องทันที
// - หน้านักเรียน: ล็อกอินแบบไม่ระบุตัวตน (Anonymous) ให้อัตโนมัติ สั่งได้เฉพาะตอนต่อเน็ต
// ข้อมูลแต่ละร้านอยู่ใต้ shops/{shopId}: ตัวเอกสารร้าน = ตั้งค่า, menu/, orders/, counters/ (เลขคิว Q ของแต่ละวัน)
// เวอร์ชัน SDK ล็อกไว้ที่ 12.19.0 ถ้าจะเปลี่ยน ให้แก้ทั้งในไฟล์นี้และใน sw.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocs, getDocsFromCache,
  writeBatch, Timestamp, arrayUnion, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

let auth, db;
let role = 'staff';
let shop = '';
let syncCb = () => {};
let errCb = () => {};

const shopRef = () => doc(db, 'shops', shop);
const col = (name) => collection(db, 'shops', shop, name);

// ----- ติดตามสถานะซิงก์จาก metadata ของตัวฟังข้อมูล -----
const listeners = new Map(); // ชื่อ -> { fromCache, pending }

function emitSync() {
  let pending = 0;
  let connected = navigator.onLine;
  if (listeners.size) {
    connected = false;
    for (const s of listeners.values()) {
      pending += s.pending;
      if (!s.fromCache) connected = true;
    }
  }
  syncCb({ online: navigator.onLine && connected, pending });
}
addEventListener('online', emitSync);
addEventListener('offline', emitSync);

function track(name, snap, pendingCount) {
  listeners.set(name, { fromCache: snap.metadata.fromCache, pending: pendingCount });
  emitSync();
}
function untrack(name) {
  listeners.delete(name);
  emitSync();
}

// ----- ข้อความผิดพลาดภาษาไทย -----
function thaiError(e) {
  const c = String(e?.code || '');
  if (c.includes('permission-denied')) return 'ไม่มีสิทธิ์ (ลองออกจากระบบแล้วเข้าใหม่ หรือเช็ก firestore.rules)';
  if (c.includes('unauthenticated')) return 'ยังไม่ได้เข้าสู่ระบบ';
  if (c.includes('resource-exhausted')) return 'ใช้เกินโควตาฟรีของวันนี้';
  if (c.includes('unavailable') || c.includes('failed-precondition')) return 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองเช็กอินเทอร์เน็ต';
  return e?.message || c || 'ไม่ทราบสาเหตุ';
}
const fail = (what) => (e) => {
  console.error(what, e);
  errCb(`${what}ไม่สำเร็จ: ${thaiError(e)}`);
};

function authError(e) {
  const c = String(e?.code || '');
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (c.includes('network-request-failed')) return 'ไม่มีอินเทอร์เน็ต — การเข้าสู่ระบบครั้งแรกต้องต่อเน็ต';
  if (c.includes('too-many-requests')) return 'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่';
  if (c.includes('user-disabled')) return 'บัญชีนี้ถูกปิดใช้งาน';
  if (c.includes('operation-not-allowed')) return 'ยังไม่ได้เปิดการล็อกอินแบบนี้ใน Firebase console (ดู README)';
  return 'เข้าสู่ระบบไม่สำเร็จ: ' + (e?.message || c);
}

// ----- เริ่มต้น -----
export async function init({ config, emulator, role: r = 'staff' }) {
  role = r;
  const app = initializeApp(config);
  auth = getAuth(app); // จำการล็อกอินไว้ใน IndexedDB (ไม่ต้องล็อกอินซ้ำทุกวัน)
  // แอปร้านเก็บข้อมูลไว้ในเครื่อง (จดตอนออฟไลน์ได้) หน้านักเรียนไม่ต้อง
  db = initializeFirestore(app, role === 'staff'
    ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true }
    : { ignoreUndefinedProperties: true });
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

export function useShop(id) { shop = id; }
export function onSync(cb) { syncCb = cb; emitSync(); }
export function onError(cb) { errCb = cb; }

// ----- การเข้าใช้งาน -----
// แอปร้านไม่มีอีเมล/รหัสผ่าน: เปิดลิงก์แล้วเข้าเลย (ล็อกอินแบบไม่ระบุตัวตนให้เองเบื้องหลัง)
// ถ้าร้านตั้ง "รหัสร้าน" ไว้ (config/access) เครื่องที่ยังไม่เคยใส่รหัสจะเห็นหน้ากรอกรหัส 1 ครั้ง แล้วเครื่องนั้นจำไว้
let authCb = null;
const userInfo = (u) => (u ? { uid: u.uid, email: '', anonymous: u.isAnonymous } : null);
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// เครื่องนี้เป็นพนักงานไหม: ลองอ่าน config/probe — กฎอนุญาตเฉพาะพนักงาน (หรือทุกคนถ้ายังไม่ตั้งรหัส)
async function checkAccess() {
  try {
    await getDoc(doc(db, 'config', 'probe'));
    return true;
  } catch (e) {
    if (String(e?.code || '').includes('permission-denied')) return false;
    return true; // ออฟไลน์/ติดต่อไม่ได้: ใช้ข้อมูลในเครื่องต่อไปก่อน (เซิร์ฟเวอร์ยังเช็กกฎทุกครั้งที่ส่งข้อมูล)
  }
}

export function onAuth(cb) {
  authCb = cb;
  return onAuthStateChanged(auth, async (u) => {
    if (!u) {
      signInAnonymously(auth).catch((e) => {
        console.error(e);
        errCb(authError(e));
        if (role === 'staff') cb(null); // ขึ้นหน้ากรอกรหัส (ลองใหม่ได้เมื่อมีเน็ต)
      });
      return;
    }
    if (role === 'customer') { cb(userInfo(u)); return; }
    cb((await checkAccess()) ? userInfo(u) : null);
  });
}

export async function login(code) {
  code = String(code || '').trim();
  if (!code) throw new Error('ใส่รหัสร้านก่อน');
  try {
    if (!auth.currentUser) await withTimeout(signInAnonymously(auth), 15000, 'ไม่มีอินเทอร์เน็ต — เข้าครั้งแรกต้องต่อเน็ต');
  } catch (e) {
    throw new Error(e?.code ? authError(e) : e.message);
  }
  try {
    await withTimeout(setDoc(doc(db, 'staff', auth.currentUser.uid), { code, at: serverTimestamp() }), 15000, 'ไม่มีอินเทอร์เน็ต — เข้าครั้งแรกต้องต่อเน็ต');
  } catch (e) {
    if (String(e?.code || '').includes('permission-denied')) throw new Error('รหัสร้านไม่ถูกต้อง');
    throw new Error(e?.code ? thaiError(e) : e.message);
  }
  if (!(await checkAccess())) throw new Error('รหัสร้านไม่ถูกต้อง');
  authCb?.(userInfo(auth.currentUser));
}

// ออกจากเครื่องนี้ (ใช้ได้เมื่อร้านตั้งรหัสไว้): ลบสิทธิ์ของเครื่องนี้ ต้องใส่รหัสใหม่ถึงเข้าได้
export async function logout() {
  const u = auth.currentUser;
  try { if (u) await withTimeout(deleteDoc(doc(db, 'staff', u.uid)), 8000, 'timeout'); } catch (e) { console.warn('logout', e); }
  authCb?.(null);
}

// ----- รหัสร้าน -----
export function watchAccess(cb) {
  return onSnapshot(doc(db, 'config', 'access'), (snap) => cb(snap.exists() ? snap.data().code : null), (e) => {
    console.warn('access', e);
  });
}
// ตั้ง/เปลี่ยนรหัส: เครื่องนี้ยังเข้าได้ต่อ ส่วนเครื่องอื่นต้องใส่รหัสใหม่
export async function setAccessCode(code) {
  code = String(code || '').trim();
  if (code.length < 4) throw new Error('รหัสร้านต้องยาวอย่างน้อย 4 ตัว');
  if (code.length > 40) throw new Error('รหัสร้านยาวเกินไป');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'access'), { code, at: serverTimestamp() });
  b.set(doc(db, 'staff', uid), { code, at: serverTimestamp() });
  try {
    await withTimeout(b.commit(), 15000, 'ไม่มีอินเทอร์เน็ต — ตั้งรหัสต้องต่อเน็ต');
  } catch (e) {
    throw new Error(e?.code ? thaiError(e) : e.message);
  }
}
// เอารหัสออก: กลับไปเป็นแบบเปิดลิงก์แล้วเข้าได้เลย
export async function clearAccessCode() {
  try {
    await withTimeout(deleteDoc(doc(db, 'config', 'access')), 15000, 'ไม่มีอินเทอร์เน็ต — ต้องต่อเน็ต');
  } catch (e) {
    throw new Error(e?.code ? thaiError(e) : e.message);
  }
}

// ----- ตั้งค่าร้าน -----
export function watchShop(cb) {
  const unsub = onSnapshot(shopRef(), { includeMetadataChanges: true }, (snap) => {
    track('shop', snap, snap.metadata.hasPendingWrites ? 1 : 0);
    cb(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache });
  }, fail('โหลดข้อมูลร้าน'));
  return () => { unsub(); untrack('shop'); };
}
export function saveShop(patch) {
  setDoc(shopRef(), patch, { merge: true }).catch(fail('บันทึกตั้งค่า'));
}
export function seedShop(settings, menu) {
  const b = writeBatch(db);
  b.set(shopRef(), settings, { merge: true });
  for (const { id, ...m } of menu) b.set(doc(col('menu'), id), m);
  b.commit().catch(fail('สร้างเมนูตั้งต้น'));
}

// ----- เมนู -----
export function watchMenu(cb) {
  const unsub = onSnapshot(col('menu'), { includeMetadataChanges: true }, (snap) => {
    track('menu', snap, snap.docs.filter((d) => d.metadata.hasPendingWrites).length);
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, fail('โหลดเมนู'));
  return () => { unsub(); untrack('menu'); };
}
export function saveMenuItem(item) {
  const { id, ...rest } = item;
  const ref = id ? doc(col('menu'), id) : doc(col('menu'));
  setDoc(ref, rest).catch(fail('บันทึกเมนู'));
  return ref.id;
}
export function deleteMenuItem(id) {
  deleteDoc(doc(col('menu'), id)).catch(fail('ลบเมนู'));
}
export function reorderMenu(list) {
  const b = writeBatch(db);
  for (const { id, sortOrder } of list) b.update(doc(col('menu'), id), { sortOrder });
  b.commit().catch(fail('จัดลำดับเมนู'));
}

// ----- ออเดอร์ (ร้าน) -----
const millis = (t) => (t?.toMillis ? t.toMillis() : +t || 0);
function toOrder(d) {
  const x = d.data({ serverTimestamps: 'estimate' });
  return {
    ...x,
    id: d.id,
    createdAt: millis(x.createdAt),
    payClaimedAt: x.payClaimedAt ? millis(x.payClaimedAt) : null,
    _pending: d.metadata.hasPendingWrites,
  };
}

export function watchOrdersOfDay(dateKey, cb) {
  const q = query(col('orders'), where('dateKey', '==', dateKey));
  const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    track('orders', snap, snap.docs.filter((d) => d.metadata.hasPendingWrites).length);
    cb(snap.docs.map(toOrder));
  }, fail('โหลดออเดอร์'));
  return () => { unsub(); untrack('orders'); };
}

export function addOrder(order) {
  const ref = doc(col('orders')); // สร้าง id ในเครื่องได้เลย ไม่ต้องรอเน็ต
  const { id, _pending, ...data } = order;
  setDoc(ref, { ...data, createdAt: Timestamp.fromMillis(order.createdAt) }).catch(fail('บันทึกออเดอร์'));
  return ref.id;
}

export function updateOrder(id, patch, historyEntry) {
  const data = { ...patch, updatedAt: Date.now() };
  if (historyEntry) data.history = arrayUnion(historyEntry);
  updateDoc(doc(col('orders'), id), data).catch(fail('แก้ไขออเดอร์'));
}

export async function fetchOrdersRange(startKey, endKey) {
  const q = query(col('orders'), where('dateKey', '>=', startKey), where('dateKey', '<=', endKey));
  try {
    return (await getDocs(q)).docs.map(toOrder);
  } catch {
    // ออฟไลน์: ใช้เท่าที่มีในเครื่อง
    return (await getDocsFromCache(q)).docs.map(toOrder);
  }
}

// ----- ยอดรายวัน -----
export function saveDay(dateKey, summary) {
  setDoc(doc(col('days'), dateKey), { ...summary, dateKey, updatedAt: Date.now() }).catch(fail('บันทึกยอดรายวัน'));
}
export async function fetchDays(startKey, endKey) {
  const q = query(col('days'), where('dateKey', '>=', startKey), where('dateKey', '<=', endKey));
  try {
    return (await getDocs(q)).docs.map((d) => d.data());
  } catch {
    return (await getDocsFromCache(q)).docs.map((d) => d.data());
  }
}

// ----- ออเดอร์ (นักเรียน) -----
// เลขคิว Q ได้จากตัวนับของวัน (counters/{dateKey}) ใน transaction เดียวกับการสร้างออเดอร์ เลขจึงไม่ซ้ำกัน
export async function placeQrOrder(order) {
  const user = auth.currentUser;
  if (!user) throw new Error('กำลังเชื่อมต่อ ลองกดอีกครั้ง');
  if (!navigator.onLine) throw new Error('ไม่มีอินเทอร์เน็ต ส่งออเดอร์ไม่ได้');
  const oRef = doc(col('orders'));
  const cRef = doc(col('counters'), order.dateKey);
  try {
    const number = await runTransaction(db, async (tx) => {
      const s = await tx.get(shopRef());
      if (!s.exists()) throw new Error('ร้านนี้ยังไม่เปิดระบบสั่งอาหาร');
      if (s.data().qrOrdering === false) throw new Error('ร้านนี้สั่งที่หน้าร้านเท่านั้น');
      if (s.data().qrOpen === false) throw new Error('ร้านปิดรับออเดอร์ทางมือถือชั่วคราว สั่งที่หน้าร้านได้เลย');
      const c = await tx.get(cRef);
      const n = (c.exists() ? +c.data().n || 0 : 0) + 1;
      tx.set(cRef, { n });
      const { id, _pending, createdAt, ...data } = order;
      tx.set(oRef, { ...data, number: n, qnum: n, uid: user.uid, createdAt: serverTimestamp() });
      return n;
    });
    return { id: oRef.id, number };
  } catch (e) {
    if (!e.code) throw e; // ข้อความภาษาไทยของเราเอง
    console.error(e);
    throw new Error('ส่งออเดอร์ไม่สำเร็จ: ' + thaiError(e));
  }
}

export function watchMyOrder(id, cb) {
  return onSnapshot(doc(col('orders'), id), (snap) => cb(snap.exists() ? toOrder(snap) : null), (e) => {
    console.error(e);
    cb(null);
  });
}

export function claimPaid(id) {
  updateDoc(doc(col('orders'), id), { payClaimed: true, payClaimedAt: serverTimestamp() }).catch(fail('แจ้งโอน'));
}
