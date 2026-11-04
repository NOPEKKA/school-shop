// data.js — ชั้นข้อมูล (data layer)
// หน้าจอทุกหน้าเรียกข้อมูลผ่านไฟล์นี้เท่านั้น ไม่เรียก Firebase ตรงๆ
// เบื้องหลังมี 2 แบบที่หน้าตาฟังก์ชันเหมือนกัน:
//   - data-firestore.js : ของจริง (Firebase Auth + Firestore + ออฟไลน์)
//   - data-demo.js      : โหมดทดลอง เก็บใน localStorage ของเครื่องนี้
// ทุกร้านแยกข้อมูลกันที่ shops/{shopId} — เรียก useShop(id) ก่อนอ่าน/เขียนอะไร

import { firebaseConfig } from './firebase-config.js';

let be = null;
export let mode = 'demo';
export let projectId = '';
export let shopId = '';

// ค่าสำหรับทดสอบกับ Firebase Emulator ในเครื่อง (เปิดด้วย ?emulator=1 บน localhost เท่านั้น)
const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-shop.firebaseapp.com', projectId: 'demo-shop', appId: 'demo-app' };

function isConfigured(c) {
  return !!(c && c.apiKey && c.projectId && !String(c.apiKey).startsWith('ใส่'));
}

/**
 * เลือกเบื้องหลังแล้วเริ่มทำงาน คืนค่า 'firebase' หรือ 'demo'
 * role: 'staff' (แอปร้าน ล็อกอินด้วยอีเมล) หรือ 'customer' (หน้านักเรียน ล็อกอินแบบไม่ระบุตัวตนให้เอง)
 */
export async function init({ role = 'staff' } = {}) {
  const qs = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const emulator = local && qs.has('emulator');
  const useDemo = qs.has('demo') || (!emulator && !isConfigured(firebaseConfig));
  if (useDemo) {
    be = await import('./data-demo.js');
    mode = 'demo';
  } else {
    be = await import('./data-firestore.js');
    mode = 'firebase';
  }
  const config = emulator ? EMULATOR_CONFIG : firebaseConfig;
  projectId = useDemo ? '' : config.projectId + (emulator ? ' (emulator)' : '');
  await be.init({ config, emulator, role });
  return mode;
}

/** เลือกร้านที่จะอ่าน/เขียน */
export function useShop(id) {
  shopId = id;
  be.useShop(id);
}

// ----- บัญชีผู้ใช้ -----
/** cb(user | null) — user = { uid, email, anonymous } */
export const onAuth = (cb) => be.onAuth(cb);
export const login = (email, password) => be.login(email, password);
export const logout = () => be.logout();

// ----- สถานะซิงก์ / ข้อผิดพลาด -----
/** cb({ online, pending }) — pending = จำนวนเอกสารที่ยังส่งไม่ถึงเซิร์ฟเวอร์ */
export const onSync = (cb) => be.onSync(cb);
/** cb(ข้อความภาษาไทย) เมื่อบันทึก/อ่านไม่สำเร็จ */
export const onError = (cb) => be.onError(cb);

// ----- ตั้งค่าร้าน (shops/{id}) — นักเรียนอ่านได้ เพราะต้องเห็นชื่อร้าน สถานะเปิดรับ และเลขพร้อมเพย์ -----
/** cb(settings | null, { fromCache }) — null = ร้านนี้ยังไม่เคยเปิดใช้ */
export const watchShop = (cb) => be.watchShop(cb);
export const saveShop = (patch) => be.saveShop(patch);
/** ร้านใหม่: ใส่ตั้งค่าเริ่มต้น + เมนูตั้งต้นในครั้งเดียว */
export const seedShop = (settings, menu) => be.seedShop(settings, menu);

// ----- เมนู -----
export const watchMenu = (cb) => be.watchMenu(cb);
/** บันทึกเมนู (ไม่มี id = เพิ่มใหม่) คืนค่า id */
export const saveMenuItem = (item) => be.saveMenuItem(item);
export const deleteMenuItem = (id) => be.deleteMenuItem(id);
/** อัปเดต sortOrder หลายเมนูพร้อมกัน: [{ id, sortOrder }] */
export const reorderMenu = (list) => be.reorderMenu(list);

// ----- ออเดอร์ (ฝั่งร้าน) -----
/** ฟังออเดอร์ของวันเดียวแบบสด cb(orders) */
export const watchOrdersOfDay = (dateKey, cb) => be.watchOrdersOfDay(dateKey, cb);
/** เพิ่มออเดอร์ (ไม่ต้องรอเน็ต บันทึกลงเครื่องทันทีแล้วซิงก์ทีหลัง) คืนค่า id */
export const addOrder = (order) => be.addOrder(order);
/** แก้ออเดอร์บางช่อง พร้อมเก็บประวัติ (historyEntry) ถ้ามี */
export const updateOrder = (id, patch, historyEntry) => be.updateOrder(id, patch, historyEntry);
/** ดึงออเดอร์ช่วงวันที่ (รวมที่ยกเลิก) สำหรับหน้าสรุปยอด */
export const fetchOrdersRange = (startKey, endKey) => be.fetchOrdersRange(startKey, endKey);

// ----- ยอดรายวัน (สำหรับสรุป 7 วัน / รายเดือน / รายปี) -----
/** บันทึกยอดของวันหนึ่ง (เครื่องร้านคำนวณจากออเดอร์ของวันนั้น) */
export const saveDay = (dateKey, summary) => be.saveDay(dateKey, summary);
/** ดึงยอดรายวันช่วงวันที่ คืนค่า [{ dateKey, sales, orders, items, cash, transfer, unpaid, byMenu, ... }] */
export const fetchDays = (startKey, endKey) => be.fetchDays(startKey, endKey);

// ----- ออเดอร์ (ฝั่งนักเรียน) -----
/** ส่งออเดอร์จาก QR (ต้องต่อเน็ต) คืนค่า Promise<{ id, number }> — number = เลขคิว Q */
export const placeQrOrder = (order) => be.placeQrOrder(order);
/** ฟังออเดอร์ของตัวเองใบเดียว cb(order | null) */
export const watchMyOrder = (id, cb) => be.watchMyOrder(id, cb);
/** นักเรียนกด "ฉันโอนแล้ว" */
export const claimPaid = (id) => be.claimPaid(id);

/** สำหรับโหมดทดลอง: ล้างข้อมูลทั้งหมดของร้านนี้ในเครื่อง */
export const resetDemo = () => be.resetDemo?.();
