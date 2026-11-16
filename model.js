// model.js — ตรรกะล้วนของร้าน (ราคา วันที่ สรุปยอด CSV พร้อมเพย์)
// ไม่ผูกกับ Firebase และไม่แตะหน้าจอ ใช้ร่วมกันทั้งแอปร้าน (app.js) และหน้านักเรียน (student.js)

export const TZ = 'Asia/Bangkok';

// ---------- วันที่และเวลา ----------

/** วันที่แบบ YYYY-MM-DD ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) */
export function thaiDateKey(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}

/** บวก/ลบวันจาก dateKey */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10);
}

export function fmtMoney(n) {
  return '฿' + Math.round(+n || 0).toLocaleString('th-TH');
}

export function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

/** "จ. 2 พ.ย." จาก dateKey */
export function fmtDay(key, withYear = false) {
  const [y, m, d] = key.split('-').map(Number);
  const opt = { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ };
  if (withYear) opt.year = '2-digit';
  return new Date(Date.UTC(y, m - 1, d, 5)).toLocaleDateString('th-TH', opt);
}

/** ชั่วโมง (0-23) ตามเวลาไทย */
export function thaiHour(ms) {
  return new Date(ms + 7 * 3600e3).getUTCHours();
}

export function minutesSince(ms, now = Date.now()) {
  return Math.max(0, Math.floor((now - ms) / 60000));
}

// ---------- รายการในออเดอร์ ----------
// ตัวเลือกของเมนูเก็บเป็นกลุ่ม: { name, key, multi, def, choices: [{ name, price }] }
//   key = แสดงบนใบเสมอแม้เป็นค่าเริ่มต้น (เช่น "เส้น" ที่คนครัวต้องรู้ทุกชาม)
// ตัวเลือกที่ถูกเลือกในรายการเก็บเป็น: [{ group, choice, price, isDefault, show }]

/** ตัวเลือกค่าเริ่มต้นของเมนู (เลือกเมนูแล้วบันทึกได้เลยโดยไม่ต้องกดอะไรเพิ่ม) */
export function defaultOptions(menu) {
  const out = [];
  for (const g of menu.options || []) {
    if (g.multi || !g.choices?.length) continue;
    const i = Math.min(Math.max(+g.def || 0, 0), g.choices.length - 1);
    const c = g.choices[i];
    out.push({ group: g.name, choice: c.name, price: +c.price || 0, isDefault: true, show: !!g.key });
  }
  return out;
}

/** เปลี่ยนตัวเลือกของรายการ (กลุ่มเลือกได้อย่างเดียว = แทนที่, หลายอย่าง = สลับเปิด/ปิด) */
export function setOption(menu, options, gi, ci) {
  const g = menu.options?.[gi];
  const c = g?.choices?.[ci];
  if (!c) return options;
  let next = options.slice();
  const entry = { group: g.name, choice: c.name, price: +c.price || 0, isDefault: !g.multi && ci === (+g.def || 0), show: !!g.key };
  if (g.multi) {
    const has = next.some((o) => o.group === g.name && o.choice === c.name);
    next = has ? next.filter((o) => !(o.group === g.name && o.choice === c.name)) : [...next, entry];
  } else {
    next = next.filter((o) => o.group !== g.name);
    next.push(entry);
  }
  return sortOptions(menu, next);
}

/** เรียงตัวเลือกตามลำดับในเมนู เพื่อให้รายการที่เหมือนกันรวมกันได้ */
export function sortOptions(menu, options) {
  const rank = (o) => {
    const a = (menu.options || []).findIndex((x) => x.name === o.group);
    const b = a < 0 ? 99 : menu.options[a].choices.findIndex((x) => x.name === o.choice);
    return (a < 0 ? 99 : a) * 100 + (b < 0 ? 99 : b);
  };
  return options.slice().sort((x, y) => rank(x) - rank(y));
}

export function isChosen(options, groupName, choiceName) {
  return options.some((o) => o.group === groupName && o.choice === choiceName);
}

/** ราคาต่อที่ = ราคาเมนู + ส่วนเพิ่มของตัวเลือก */
export function unitPrice(line) {
  return (+line.basePrice || 0) + (line.options || []).reduce((s, o) => s + (+o.price || 0), 0);
}

/** กุญแจเทียบว่าสองรายการ "เหมือนกันทุกอย่าง" หรือไม่ */
export function lineKey(line) {
  const opts = (line.options || []).map((o) => o.group + ':' + o.choice).join(',');
  return line.menuId + '|' + opts + '|' + (line.note || '').trim();
}

/** ข้อความตัวเลือกแบบสั้น: แสดงเฉพาะที่ไม่ใช่ค่าเริ่มต้น + กลุ่มที่ต้องแสดงเสมอ (เช่น เส้น) */
export function optionText(options = []) {
  const legacyKey = options[0]?.group === 'เส้น' ? 'เส้น' : null; // ออเดอร์จากแอปเวอร์ชันแรก
  return options
    .filter((o) => !o.isDefault || o.show || o.group === legacyKey)
    .map((o) => o.choice)
    .join(' · ');
}

/** แปลงรายการในตะกร้าเป็นรายการที่บันทึกลงออเดอร์ */
export function toItem(line) {
  return {
    menuId: line.menuId || '',
    name: line.name,
    qty: line.qty,
    options: (line.options || []).map((o) => ({ group: o.group, choice: o.choice, price: +o.price || 0, isDefault: !!o.isDefault, show: !!o.show })),
    note: (line.note || '').trim(),
    price: unitPrice(line),
    served: !!line.served,
  };
}

/** แปลงรายการในออเดอร์กลับเป็นรายการในตะกร้า (ใช้ตอนแก้ไขออเดอร์) */
export function fromItem(it, key) {
  const extra = (it.options || []).reduce((s, o) => s + (+o.price || 0), 0);
  return { key, menuId: it.menuId, name: it.name, basePrice: (+it.price || 0) - extra, qty: it.qty, options: it.options || [], note: it.note || '', served: !!it.served };
}

/** รวมรายการที่เหมือนกันทุกอย่างให้เป็นบรรทัดเดียว */
export function mergeLines(lines) {
  const map = new Map();
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const k = lineKey(l) + '|' + (l.served ? 1 : 0);
    const prev = map.get(k);
    if (prev) prev.qty += l.qty;
    else map.set(k, { ...l });
  }
  return [...map.values()];
}

export function orderTotal(items) {
  return items.reduce((s, it) => s + (+it.price || 0) * (+it.qty || 0), 0);
}

export function itemCount(items) {
  return items.reduce((s, it) => s + (+it.qty || 0), 0);
}

// ---------- ออเดอร์ ----------
// source: 'staff' = ร้านจดเอง (เลข #1 #2 …), 'qr' = นักเรียนสั่งเอง (เลข Q1 Q2 … แยกชุด)
// type:   'dine' = ทานที่ร้าน, 'takeaway' = กลับบ้าน

export const isQr = (o) => o?.source === 'qr';

export function isDone(order) {
  return !order.cancelled && order.items.length > 0 && order.items.every((it) => it.served);
}

/** เลขออเดอร์ถัดไปของร้าน (นับเฉพาะที่ร้านจดเอง ใช้ได้แม้ออฟไลน์) */
export function nextNumber(orders) {
  return orders.filter((o) => !isQr(o)).reduce((m, o) => Math.max(m, +o.number || 0), 0) + 1;
}

/** ป้ายเลขออเดอร์: Q12 (สั่งผ่าน QR) หรือ #12 (ร้านจด) */
export function orderNo(o) {
  return (isQr(o) ? 'Q' : '#') + (o.number ?? '');
}

/** ป้ายที่ใช้เรียกลูกค้า: ชื่อ/โต๊ะ ถ้ามี ไม่งั้นเลขออเดอร์ */
export function orderLabel(o) {
  if (o.name) return `${orderNo(o)} ${o.name}`;
  if (o.table) return `โต๊ะ ${o.table}`;
  return orderNo(o);
}

/** สถานะการจ่าย: paid = ร้านยืนยันแล้ว, claimed = ลูกค้าแจ้งว่าโอนแล้ว, unpaid */
export function payState(o) {
  if (o.paid) return 'paid';
  if (o.payClaimed) return 'claimed';
  return 'unpaid';
}

/** สถานะที่นักเรียนเห็น */
export function customerStage(o) {
  if (!o) return 'none';
  if (o.cancelled) return 'cancelled';
  if (isDone(o)) return 'ready';
  if (o.items.some((it) => it.served)) return 'cooking';
  return 'queued';
}

/**
 * ตรวจราคาออเดอร์กับเมนูปัจจุบัน (กันคนแก้ราคาในเครื่องตัวเอง)
 * คืนค่า { ok, expected } — expected = ยอดที่ควรเป็นตามเมนูตอนนี้
 */
export function checkPrices(order, menu) {
  const byId = new Map(menu.map((m) => [m.id, m]));
  let expected = 0;
  let ok = true;
  for (const it of order.items || []) {
    const m = byId.get(it.menuId);
    if (!m) { expected += (+it.price || 0) * (+it.qty || 0); continue; }
    let unit = +m.price || 0;
    for (const o of it.options || []) {
      const g = (m.options || []).find((x) => x.name === o.group);
      const c = g?.choices?.find((x) => x.name === o.choice);
      unit += c ? +c.price || 0 : +o.price || 0;
    }
    if (unit !== +it.price) ok = false;
    expected += unit * (+it.qty || 0);
  }
  if (Math.round(expected) !== Math.round(+order.total || 0)) ok = false;
  return { ok, expected };
}

// ---------- พร้อมเพย์ (มาตรฐาน EMVCo / Thai QR Payment) ----------

const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;

/** แยกชนิดเลขพร้อมเพย์: เบอร์มือถือ 10 หลัก, เลขบัตร/ผู้เสียภาษี 13 หลัก, e-Wallet 15 หลัก */
export function promptpayTarget(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('66')) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('0')) return { tag: '01', value: '0066' + d.slice(1), kind: 'phone', digits: d };
  if (d.length === 13) return { tag: '02', value: d, kind: 'id', digits: d };
  if (d.length === 15) return { tag: '03', value: d, kind: 'ewallet', digits: d };
  return null;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, เริ่ม 0xFFFF) เป็นเลขฐาน 16 ตัวใหญ่ 4 หลัก */
export function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** ข้อความใน QR พร้อมเพย์ (ใส่ยอดเงิน = QR ครั้งเดียว) คืนค่า '' ถ้าเลขพร้อมเพย์ไม่ถูกต้อง */
export function promptpayPayload(raw, amount) {
  const t = promptpayTarget(raw);
  if (!t) return '';
  const merchant = tlv('00', 'A000000677010111') + tlv(t.tag, t.value);
  let s = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('29', merchant) + tlv('58', 'TH') + tlv('53', '764');
  if (amount) s += tlv('54', (+amount).toFixed(2));
  s += '6304';
  return s + crc16(s);
}

/** แสดงเลขพร้อมเพย์แบบซ่อนบางส่วน เช่น 081-xxx-5678 */
export function maskPromptpay(raw) {
  const t = promptpayTarget(raw);
  if (!t) return '';
  const d = t.digits;
  if (t.kind === 'phone') return `${d.slice(0, 3)}-xxx-${d.slice(6)}`;
  return `${d.slice(0, 1)}-xxxx-xxxxx-${d.slice(-3, -1)}-${d.slice(-1)}`;
}

// ---------- สรุปยอด ----------

export function summarize(orders) {
  const live = orders.filter((o) => !o.cancelled);
  const byMenu = new Map();
  const byDay = new Map();
  const byHour = new Map();
  let sales = 0, items = 0, cash = 0, transfer = 0, unpaid = 0, qrCount = 0, qrSales = 0, takeaway = 0;
  for (const o of live) {
    const t = +o.total || orderTotal(o.items);
    sales += t;
    if (isQr(o)) { qrCount += 1; qrSales += t; }
    if (o.type === 'takeaway') takeaway += 1;
    if (!o.paid) unpaid += t;
    else if (o.payMethod === 'transfer') transfer += t;
    else cash += t;
    const d = byDay.get(o.dateKey) || { key: o.dateKey, sales: 0, orders: 0 };
    d.sales += t;
    d.orders += 1;
    byDay.set(o.dateKey, d);
    const h = thaiHour(o.createdAt);
    const hh = byHour.get(h) || { hour: h, sales: 0, orders: 0 };
    hh.sales += t;
    hh.orders += 1;
    byHour.set(h, hh);
    for (const it of o.items) {
      items += +it.qty || 0;
      const k = it.menuId || it.name;
      const m = byMenu.get(k) || { menuId: it.menuId || '', name: it.name, qty: 0, revenue: 0 };
      m.qty += +it.qty || 0;
      m.revenue += (+it.price || 0) * (+it.qty || 0);
      byMenu.set(k, m);
    }
  }
  return {
    sales, items, cash, transfer, unpaid, qrCount, qrSales, takeaway,
    orderCount: live.length,
    cancelledCount: orders.length - live.length,
    byMenu: [...byMenu.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    byDay: [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    byHour: [...byHour.values()].sort((a, b) => a.hour - b.hour),
  };
}

// ---------- ยอดรายวัน (ใช้ทำสรุปรายเดือน/รายปี โดยไม่ต้องโหลดออเดอร์ทั้งปี) ----------
// เครื่องร้านคำนวณจากออเดอร์ของวันแล้วเก็บไว้ที่ shops/{id}/days/{YYYY-MM-DD}

/** ยอดของวันเดียว แบบกะทัดรัด เก็บลงฐานข้อมูลได้ */
export function daySummary(orders) {
  const s = summarize(orders);
  return {
    sales: s.sales, orders: s.orderCount, items: s.items,
    cash: s.cash, transfer: s.transfer, unpaid: s.unpaid,
    qrCount: s.qrCount, qrSales: s.qrSales, cancelled: s.cancelledCount,
    byMenu: Object.fromEntries(s.byMenu.map((m) => [m.menuId || m.name, { name: m.name, qty: m.qty, revenue: m.revenue }])),
  };
}

/** รวมยอดหลายวัน (รูปแบบเดียวกับ summarize เพื่อใช้หน้าจอเดียวกัน) */
export function combineDays(days) {
  const out = { sales: 0, items: 0, cash: 0, transfer: 0, unpaid: 0, qrCount: 0, qrSales: 0, orderCount: 0, cancelledCount: 0, activeDays: 0 };
  const byMenu = new Map();
  const byDay = [];
  for (const d of days) {
    out.sales += +d.sales || 0;
    out.items += +d.items || 0;
    out.cash += +d.cash || 0;
    out.transfer += +d.transfer || 0;
    out.unpaid += +d.unpaid || 0;
    out.qrCount += +d.qrCount || 0;
    out.qrSales += +d.qrSales || 0;
    out.orderCount += +d.orders || 0;
    out.cancelledCount += +d.cancelled || 0;
    if (+d.sales > 0) out.activeDays += 1;
    byDay.push({ key: d.dateKey, sales: +d.sales || 0, orders: +d.orders || 0 });
    for (const [k, m] of Object.entries(d.byMenu || {})) {
      const x = byMenu.get(k) || { menuId: k, name: m.name, qty: 0, revenue: 0 };
      x.qty += +m.qty || 0;
      x.revenue += +m.revenue || 0;
      x.name = m.name || x.name;
      byMenu.set(k, x);
    }
  }
  out.byMenu = [...byMenu.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
  out.byDay = byDay.sort((a, b) => (a.key < b.key ? -1 : 1));
  out.byHour = [];
  return out;
}

/** CSV สรุปรายวัน: 1 แถว = 1 วัน พร้อมจำนวนที่ขายได้ของแต่ละเมนู */
export function daysToCSV(days) {
  const menuNames = new Map();
  for (const d of days) for (const [k, m] of Object.entries(d.byMenu || {})) if (!menuNames.has(k)) menuNames.set(k, m.name);
  const keys = [...menuNames.keys()];
  const head = ['วันที่', 'บิล', 'จำนวนจาน', 'ยอดขาย', 'เงินสด', 'โอน', 'ยังไม่จ่าย', ...keys.map((k) => menuNames.get(k))];
  const rows = [head];
  const sorted = [...days].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  for (const d of sorted) {
    rows.push([d.dateKey, +d.orders || 0, +d.items || 0, +d.sales || 0, +d.cash || 0, +d.transfer || 0, +d.unpaid || 0,
      ...keys.map((k) => +d.byMenu?.[k]?.qty || 0)]);
  }
  const t = combineDays(days);
  rows.push(['รวม', t.orderCount, t.items, t.sales, t.cash, t.transfer, t.unpaid, ...keys.map((k) => t.byMenu.find((m) => m.menuId === k)?.qty || 0)]);
  return '﻿' + rows.map((r) => r.map((v) => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\r\n');
}

// ---------- เดือน / ปี ----------
export function monthStart(key) { return key.slice(0, 7) + '-01'; }
export function monthEnd(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** เลื่อนเดือน คืนค่าวันที่ 1 ของเดือนนั้น */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}
/** "พฤศจิกายน 2569" */
export function fmtMonth(key, style = 'long') {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('th-TH', { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: TZ });
}
/** "พ.ศ. 2569" */
export function fmtYear(key) {
  return 'พ.ศ. ' + (+key.slice(0, 4) + 543);
}

/** ส่งออก CSV แบบหนึ่งแถวต่อหนึ่งรายการ (มี BOM ให้ Excel อ่านภาษาไทยถูก) */
export function ordersToCSV(orders) {
  const head = ['วันที่', 'เวลา', 'เลขออเดอร์', 'ช่องทาง', 'ทาน/กลับ', 'ชื่อ/โต๊ะ', 'สถานะ', 'การจ่าย', 'เมนู', 'ตัวเลือก', 'หมายเหตุ', 'จำนวน', 'ราคาต่อหน่วย', 'รวม'];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // กันสูตรแปลกๆ ใน Excel
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const pay = (o) => (!o.paid ? 'ยังไม่จ่าย' : o.payMethod === 'transfer' ? 'โอน' : 'เงินสด');
  const rows = [head];
  const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
  for (const o of sorted) {
    for (const it of o.items) {
      rows.push([
        o.dateKey, fmtTime(o.createdAt), orderNo(o), isQr(o) ? 'QR' : 'หน้าร้าน', o.type === 'takeaway' ? 'กลับบ้าน' : 'ทานที่ร้าน',
        o.name || o.table || '', o.cancelled ? 'ยกเลิก' : 'ปกติ', pay(o),
        it.name, (it.options || []).map((x) => x.choice).join(' / '), it.note || '', it.qty, it.price, it.price * it.qty,
      ]);
    }
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

// ---------- สีประจำเมนู ----------
// สีทึบสดๆ ต่างโทนกันชัดเจน เพื่อให้แยกปุ่มได้ในพริบตา (สีตัวอักษรเลือกให้อัตโนมัติจากความสว่าง: tileInk)

export const TILE_COLORS = [
  { id: 'red', name: 'แดง', hex: '#D93A20' },
  { id: 'orange', name: 'ส้ม', hex: '#FF8A00' },
  { id: 'yellow', name: 'เหลือง', hex: '#FFC400' },
  { id: 'green', name: 'เขียว', hex: '#1FA34A' },
  { id: 'cyan', name: 'ฟ้าเขียว', hex: '#00A3B8' },
  { id: 'blue', name: 'น้ำเงิน', hex: '#2563EB' },
  { id: 'purple', name: 'ม่วง', hex: '#8B3DFF' },
  { id: 'pink', name: 'ชมพู', hex: '#FF3D8B' },
  { id: 'brown', name: 'น้ำตาล', hex: '#8A4B1F' },
  { id: 'slate', name: 'เทา', hex: '#475569' },
];
// รหัสสีรุ่นเก่า (เมนูที่บันทึกไว้ก่อนเปลี่ยนชุดสี) -> สีใหม่ที่ใกล้เคียง
const LEGACY_COLOR = { amber: 'orange', gold: 'yellow', maroon: 'red', tomato: 'orange', coffee: 'brown' };

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** สีตัวอักษรบนพื้นสีนี้: ขาวหรือเกือบดำ แล้วแต่แบบไหนคอนทราสต์มากกว่า */
export function inkFor(hex) {
  const L = lum(hex);
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.056) ? '#FFFFFF' : '#14110A';
}

/** สีของเมนู: ใช้ที่ตั้งไว้ ถ้าไม่มีเดาจากชื่อ/หมวด */
export function tileColor(menu) {
  const pick = (id) => TILE_COLORS.find((c) => c.id === id).hex;
  const id = LEGACY_COLOR[menu?.color] || menu?.color;
  const set = TILE_COLORS.find((c) => c.id === id);
  if (set) return set.hex;
  const n = String(menu?.name || '');
  if (/ขาหมู|พะโล้/.test(n)) return pick('brown');
  if (/หมูแดง/.test(n)) return pick('red');
  if (/หมูกรอบ/.test(n)) return pick('orange');
  if (/ไก่ทอด|มะขาม/.test(n)) return pick('blue');
  if (/ไก่ย่าง/.test(n)) return pick('green');
  if (/น้ำเปล่า|น้ำแข็ง|โซดา/.test(n)) return pick('cyan');
  if (/กาแฟ|โอเลี้ยง|โกโก้/.test(n)) return pick('brown');
  if (/ชา/.test(n)) return pick('yellow');
  return pick('slate');
}
export const tileInk = (menu) => inkFor(tileColor(menu));

export function groupByCategory(list, bySort) {
  const map = new Map();
  for (const m of [...list].sort(bySort)) {
    const c = m.category || 'อื่นๆ';
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(m);
  }
  return [...map.entries()];
}

export const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'th');
