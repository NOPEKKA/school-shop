// app.js — แอปของร้าน: จดออเดอร์ / คิว / สรุปยอด / ตั้งค่า
// ไฟล์นี้ดูแลแค่หน้าจอและการกดปุ่ม ข้อมูลทุกอย่างอ่าน/เขียนผ่าน data.js ตรรกะราคา/สรุปยอดอยู่ใน model.js

import * as data from './data.js';
import * as M from './model.js';
import { SHOPS, shopById, seedFor, presetGroups, OPTION_PRESETS } from './shops.js';
import { injectSprite, icon } from './icons.js';
import { qrSVG } from './qr.js';

const APP_VERSION = '4.2.0';

// ---------- ตัวช่วยเล็กๆ ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* ไม่รองรับ */ } };
const isTyping = (root) => root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
const pref = (k, def) => { try { const v = localStorage.getItem('so.' + k); return v == null ? def : v; } catch { return def; } };
const setPref = (k, v) => { try { localStorage.setItem('so.' + k, v); } catch { /* ไม่เป็นไร */ } };
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

// ---------- สถานะของแอป ----------
const S = {
  mode: 'demo',
  user: null,
  shop: '',
  screen: 'order',
  settings: {},
  shopLoaded: false,
  menu: [],
  menuLoaded: false,
  today: M.thaiDateKey(),
  orders: [],
  sync: { online: navigator.onLine, pending: 0 },
  cart: null,            // ใบที่กำลังจด { lines, sel, name, type, editId, editNumber, editSource }
  stash: null,           // ใบที่จดค้างไว้ ระหว่างไปแก้ไขออเดอร์เก่า
  undo: [],
  moreOpen: false,
  nameEdit: false,
  confirm: null,         // ปุ่มที่ต้องแตะซ้ำเพื่อยืนยัน { key, until }
  openDone: new Set(),
  showCancelled: false,
  sum: { range: 'day', at: M.thaiDateKey(), past: null, days: null, loading: false, req: 0 },
  menuDraft: null,
  seeded: false,
  toastAction: null,
  seenQr: null,          // id ออเดอร์ QR ที่เห็นแล้ว (ไว้รู้ว่าอันไหนเพิ่งเข้ามา)
  seenClaim: null,
  fresh: new Set(),
};

// ---------- ใบที่กำลังจด เก็บไว้ในเครื่อง (กันหายถ้าเผลอปิดแอป) แยกตามร้าน ----------
const emptyCart = () => ({ lines: [], sel: null, name: '', type: 'dine', editId: null, editNumber: null, editSource: null });
const cartKey = () => 'so.cart.' + S.shop;
function loadCart() {
  try {
    const v = JSON.parse(localStorage.getItem(cartKey()));
    if (v?.cart?.lines) return { cart: { ...emptyCart(), ...v.cart }, stash: v.stash || null };
  } catch { /* ไม่มีข้อมูล */ }
  return { cart: emptyCart(), stash: null };
}
function persistCart() {
  try { localStorage.setItem(cartKey(), JSON.stringify({ cart: S.cart, stash: S.stash })); } catch { /* เต็ม */ }
}
S.cart = emptyCart();

// ---------- แบบของร้าน ----------
// record = จดเฉยๆ (กดเมนู → เงินสด/โอน = บันทึกยอดขายทันที) · kitchen = จดเพื่อทำ (มีคิว แตะเสร็จ)
const isRecord = () => S.settings.mode === 'record';
const qrOn = () => !isRecord() && S.settings.qrOrdering !== false;
const takeawayOn = () => !isRecord() && S.settings.takeaway !== false;

// =====================================================================
// เริ่มแอป
// =====================================================================
async function boot() {
  injectSprite();
  applyTheme();
  bindEvents();
  registerSW();
  try {
    S.mode = await data.init({ role: 'staff' });
  } catch (e) {
    console.error(e);
    $('#bootMsg').innerHTML = 'เปิดแอปไม่สำเร็จ<br><small>ครั้งแรกต้องต่ออินเทอร์เน็ต</small><br><br><button class="btn primary" type="button" onclick="location.reload()">ลองใหม่</button>';
    return;
  }
  data.onSync((s) => { S.sync = s; renderSync(); });
  data.onError((msg) => toast(msg, 'bad'));
  data.onAuth((user) => {
    S.user = user;
    $('#boot').hidden = true;
    if (user) {
      $('#login').hidden = true;
      const want = new URLSearchParams(location.search).get('shop') || decodeURIComponent(location.hash.slice(1)) || pref('shop', '');
      if (shopById(want)) openShop(want);
      else showPicker();
    } else {
      stopSession();
      $('#shell').hidden = true;
      $('#picker').hidden = true;
      $('#login').hidden = false;
    }
  });
  setInterval(tick, 20000);
  // เปลี่ยนร้านจากลิงก์ (#khaomoo / #noodle) โดยไม่ต้องโหลดหน้าใหม่
  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (S.user && shopById(id) && id !== S.shop) openShop(id);
  });
}

// ---------- เลือกร้าน ----------
function showPicker() {
  stopSession();
  $('#shell').hidden = true;
  const el = $('#picker');
  el.hidden = false;
  el.innerHTML = `<div class="picker">
    <div class="picker-head">
      <img src="icons/icon.svg" alt="" width="40" height="40">
      <div><h1>เครื่องนี้ใช้กับร้านไหน</h1><p class="muted">เลือกครั้งเดียว เปลี่ยนทีหลังได้ในหน้าตั้งค่า</p></div>
    </div>
    <div class="picker-list">${SHOPS.map((s) => `
      <button class="shop-opt card" type="button" data-act="pick-shop" data-id="${s.id}">
        <span class="mark lg" style="--mark:${s.color}">${esc(s.mark)}</span>
        <span class="shop-opt-txt"><b>${esc(s.name)}</b>${s.note ? `<span class="badge primary">${esc(s.note)}</span>` : ''}</span>
        ${icon('next')}
      </button>`).join('')}
    </div>
  </div>`;
}

function openShop(id) {
  stopSession();
  S.shop = id;
  setPref('shop', id);
  data.useShop(id);
  const seed = seedFor(id).settings;
  S.settings = { ...seed, quickNotes: seedFor(id).settings.quickNotes };
  S.shopLoaded = false;
  S.menu = [];
  S.menuLoaded = false;
  S.orders = [];
  S.seenQr = null;
  S.seenClaim = null;
  S.seeded = false;
  S.menuDraft = null;
  S.sum = { range: 'day', at: M.thaiDateKey(), past: null, days: null, loading: false, req: 0 };
  S.openDone = new Set();
  ({ cart: S.cart, stash: S.stash } = loadCart());
  S.undo = [];
  S.moreOpen = false;
  $('#picker').hidden = true;
  $('#shell').hidden = false;
  startSession();
  go('order'); // เปลี่ยนร้านแล้วเริ่มที่หน้าจดเสมอ
}

// ---------- ฟังข้อมูลของร้าน ----------
let unsubs = [];
let unsubOrders = null;
function startSession() {
  unsubs.push(data.watchShop((s, meta) => {
    if (s) {
      S.settings = { ...seedFor(S.shop).settings, ...s };
      S.shopLoaded = true;
    } else if (!meta.fromCache && !S.seeded) {
      // ร้านใหม่ (เซิร์ฟเวอร์ยืนยันว่ายังไม่มีข้อมูล) -> ใส่ตั้งค่าและเมนูตั้งต้น
      S.seeded = true;
      const seed = seedFor(S.shop);
      data.seedShop({ ...seed.settings, createdAt: Date.now() }, seed.menu);
    }
    renderAll();
  }));
  unsubs.push(data.watchMenu((list) => {
    S.menu = list.sort(M.bySort);
    S.menuLoaded = true;
    renderAll();
  }));
  subscribeToday();
}
function subscribeToday() {
  unsubOrders?.();
  S.today = M.thaiDateKey();
  unsubOrders = data.watchOrdersOfDay(S.today, (orders) => {
    noticeArrivals(orders);
    S.orders = orders;
    publishQueue();
    publishDay();
    renderAll();
  });
  healDay(M.addDays(S.today, -1));
}
function stopSession() {
  unsubs.forEach((f) => f());
  unsubs = [];
  unsubOrders?.();
  unsubOrders = null;
}

// ออเดอร์ QR ใหม่ / ลูกค้าแจ้งโอน -> เสียง + แจ้งเตือน (ไม่เตือนตอนโหลดครั้งแรก)
function noticeArrivals(orders) {
  const qr = orders.filter((o) => M.isQr(o) && !o.cancelled);
  if (!S.seenQr) {
    S.seenQr = new Set(qr.map((o) => o.id));
    S.seenClaim = new Set(qr.filter((o) => o.payClaimed).map((o) => o.id));
    return;
  }
  const fresh = qr.filter((o) => !S.seenQr.has(o.id));
  for (const o of fresh) {
    S.seenQr.add(o.id);
    S.fresh.add(o.id);
    setTimeout(() => { S.fresh.delete(o.id); if (S.screen === 'queue') renderQueue(); }, 9000);
  }
  const claims = qr.filter((o) => o.payClaimed && !o.paid && !S.seenClaim.has(o.id));
  for (const o of qr) if (o.payClaimed) S.seenClaim.add(o.id);
  if (fresh.length) {
    chime('new');
    buzz([40, 60, 40]);
    const o = fresh[fresh.length - 1];
    const msg = fresh.length > 1 ? `ออเดอร์ QR ใหม่ ${fresh.length} ใบ` : `ออเดอร์ QR ใหม่ ${M.orderNo(o)}${o.name ? ' · ' + o.name : ''} · ${M.fmtMoney(o.total)}`;
    toast(msg, 'info', S.screen === 'queue' ? null : { label: 'ดูคิว', fn: () => go('queue') });
  } else if (claims.length) {
    chime('claim');
    const o = claims[0];
    toast(`${M.orderNo(o)} แจ้งโอนแล้ว ${M.fmtMoney(o.total)} — เช็คยอดในแอปธนาคาร`, 'info', S.screen === 'queue' ? null : { label: 'ดู', fn: () => go('queue') });
  }
}

// บอกนักเรียนว่าตอนนี้มีกี่คิว (เขียนลงเอกสารร้าน เฉพาะตอนจำนวนเปลี่ยน)
let queueTimer;
function publishQueue() {
  if (!S.shopLoaded || !qrOn()) return;
  const n = pendingOrders().length;
  if (n === +S.settings.queue) return;
  clearTimeout(queueTimer);
  queueTimer = setTimeout(() => {
    if (pendingOrders().length !== +S.settings.queue) data.saveShop({ queue: pendingOrders().length });
  }, 2500);
}

// ยอดของวันนี้ -> shops/{id}/days/{วันที่} (ใช้ทำสรุปรายเดือน/รายปี) เขียนเฉพาะตอนตัวเลขเปลี่ยน
let dayTimer;
let lastDay = '';
function publishDay() {
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => {
    if (!S.orders.length) return;
    const sum = M.daySummary(S.orders);
    const sig = S.today + JSON.stringify(sum);
    if (sig === lastDay) return;
    lastDay = sig;
    data.saveDay(S.today, sum);
  }, 2500);
}
// คำนวณยอดของวันที่ผ่านมาใหม่จากออเดอร์จริง (เผื่อมีออเดอร์จากอีกเครื่องซิงก์เข้ามาทีหลัง)
async function healDay(dateKey) {
  try {
    const orders = await data.fetchOrdersRange(dateKey, dateKey);
    if (orders.length) data.saveDay(dateKey, M.daySummary(orders));
  } catch (e) { console.warn('healDay', e); }
}

// ทุก 20 วินาที: อัปเดตเวลาค้าง และเปลี่ยนวันตอนเที่ยงคืน
function tick() {
  if (!S.user || !S.shop) return;
  if (M.thaiDateKey() !== S.today) {
    subscribeToday();
    S.sum.at = S.today;
  }
  renderBadge();
  if (S.screen === 'queue') renderQueue();
}

// =====================================================================
// โครงหน้าจอ
// =====================================================================
const TITLES = { order: 'จดออเดอร์', queue: 'คิว', summary: 'สรุปยอด', settings: 'ตั้งค่า', poster: 'โปสเตอร์ QR' };
const title = (sc) => (isRecord() && sc === 'order' ? 'จดการขาย' : isRecord() && sc === 'queue' ? 'ขายวันนี้' : TITLES[sc]);

function go(to) {
  if (to !== 'settings') S.menuDraft = null;
  S.screen = to;
  for (const sc of $$('.screen')) sc.hidden = sc.dataset.screen !== to;
  for (const t of $$('.tab')) {
    const on = t.dataset.to === to;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  $('.tabbar').hidden = to === 'poster';
  if (to === 'summary') loadSummary();
  const sc = $('#scr-' + to);
  if (sc?.classList.contains('scroll')) sc.scrollTop = 0;
  renderAll();
  updateWake();
}

function renderAll() {
  if (!S.user || !S.shop) return;
  renderTopbar();
  renderBadge();
  if (S.screen === 'order') renderOrder();
  else if (S.screen === 'queue') renderQueue();
  else if (S.screen === 'summary') renderSummary();
  else if (S.screen === 'settings') renderSettings();
  else if (S.screen === 'poster') renderPoster();
}

function renderTopbar() {
  const el = $('#topbar');
  const st = S.settings;
  const sub = S.screen === 'settings' || S.screen === 'poster';
  el.innerHTML = `
    ${sub
      ? `<button class="iconbtn" type="button" data-act="go" data-to="${S.screen === 'poster' ? 'settings' : 'order'}" aria-label="กลับ">${icon('back')}</button>`
      : `<span class="mark" style="--mark:${esc(st.color || '#1D5BD8')}" aria-hidden="true">${esc(st.mark || 'ร')}</span>`}
    <div class="tb-txt"><small>${esc(st.short || st.name || '')}</small><b>${title(S.screen)}</b></div>
    <button class="sync" id="sync" type="button" data-act="sync-info"></button>
    ${sub ? '' : `<button class="iconbtn" type="button" data-act="go" data-to="settings" aria-label="ตั้งค่า">${icon('gear')}</button>`}`;
  renderSync();
}

function syncState() {
  const s = S.sync;
  if (S.mode === 'demo') return { cls: 'demo', ic: 'phone', text: 'ทดลอง', info: 'โหมดทดลอง: ข้อมูลเก็บในเครื่องนี้เท่านั้น ใส่ค่า Firebase เพื่อใช้จริง' };
  if (!s.online && s.pending) return { cls: 'off', ic: 'cloud-off', text: `รอส่ง ${s.pending}`, info: `ออฟไลน์ — ${s.pending} รายการเก็บในเครื่องแล้ว จะส่งขึ้นเองเมื่อเน็ตกลับมา` };
  if (!s.online) return { cls: 'off', ic: 'cloud-off', text: 'ออฟไลน์', info: 'ออฟไลน์ — จดต่อได้ตามปกติ ข้อมูลเก็บในเครื่องก่อน (ออเดอร์ QR จะเข้าเมื่อเน็ตกลับมา)' };
  if (s.pending) return { cls: 'busy', ic: 'cloud-up', text: `กำลังส่ง ${s.pending}`, info: 'กำลังส่งข้อมูลขึ้นเซิร์ฟเวอร์…' };
  return { cls: 'ok', ic: 'cloud-ok', text: 'ซิงก์แล้ว', info: 'ข้อมูลทั้งหมดอยู่บนเซิร์ฟเวอร์แล้ว' };
}
function renderSync() {
  const b = $('#sync');
  if (!b) return;
  const st = syncState();
  b.className = 'sync ' + st.cls;
  b.innerHTML = icon(st.ic) + `<span>${st.text}</span>`;
  b.setAttribute('aria-label', st.info);
}

const pendingOrders = () => S.orders.filter((o) => !o.cancelled && !M.isDone(o));
const isLate = (o) => M.minutesSince(o.createdAt) >= (+S.settings.overdueMin || 10);
function renderBadge() {
  $('#tabOrder').textContent = title('order');
  $('#tabQueue').textContent = title('queue');
  const p = isRecord() ? [] : pendingOrders();
  const b = $('#badge');
  b.hidden = !p.length;
  b.textContent = p.length;
  b.classList.toggle('late', p.some(isLate));
}

// ---------- toast ----------
let toastTimer;
function toast(msg, kind = 'ok', action) {
  const t = $('#toast');
  t.className = 'toast show ' + kind;
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" data-act="toast-action">${esc(action.label)}</button>` : '');
  S.toastAction = action?.fn || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + kind; }, action ? 5500 : 2800);
}

// ---------- ปุ่มที่ต้องแตะ 2 ครั้ง (แทน popup ยืนยัน) ----------
let confirmTimer;
function confirmTap(key) {
  if (S.confirm?.key === key && Date.now() < S.confirm.until) {
    S.confirm = null;
    return true;
  }
  S.confirm = { key, until: Date.now() + 3000 };
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => { S.confirm = null; renderAll(); }, 3000);
  renderAll();
  return false;
}
function confirmBtn(key, label, armedLabel, cls, act, id = '') {
  const armed = S.confirm?.key === key && Date.now() < S.confirm.until;
  return `<button type="button" class="btn ${cls}${armed ? ' armed' : ''}" data-act="${act}" data-id="${esc(id)}">${armed ? armedLabel : label}</button>`;
}

// ---------- เสียงเตือน (เริ่มได้หลังแตะจอครั้งแรก) ----------
let actx = null;
function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* ไม่รองรับ */ }
}
function chime(kind = 'new') {
  if (pref('sound', '1') !== '1' || !actx) return;
  const t0 = actx.currentTime + 0.02;
  const notes = kind === 'new' ? [880, 1174.7, 1568] : [988, 1318.5];
  notes.forEach((f, i) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    const t = t0 + i * 0.13;
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + 0.65);
  });
}

// =====================================================================
// หน้าจดออเดอร์
// =====================================================================
function renderOrder() {
  $('#scr-order').classList.toggle('x', S.moreOpen && !!selLine());
  renderEditBanner();
  renderTicket();
  renderDeck();
  renderMenuGrid();
  renderSaveBar();
  keepSelVisible();
}

// ให้รายการที่กำลังแก้อยู่ในจอเสมอ (เรียกหลังวาดครบทุกส่วน เพราะความสูงของใบสั่งเปลี่ยนตามส่วนอื่น)
function keepSelVisible() {
  const box = $('#tLines');
  const sel = box?.querySelector('.tl.sel');
  if (!sel) return;
  const top = sel.offsetTop - 6;
  const bottom = sel.offsetTop + sel.offsetHeight + 6;
  if (top < box.scrollTop) box.scrollTop = top;
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
}

/** ชื่อเมนู: ตัดบรรทัดที่ช่องว่างก่อน (เช่น "ข้าวขาหมู หมูกรอบ") ไม่ตัดกลางคำถ้าไม่จำเป็น */
const nameHtml = (s) => esc(s).split(' ').filter(Boolean).map((w) => `<span class="w">${w}</span>`).join(' ');

const selLine = () => S.cart.lines.find((l) => l.key === S.cart.sel);
const menuOf = (l) => S.menu.find((m) => m.id === l?.menuId);
const lineExtra = (l) => [M.optionText(l.options), l.note].filter(Boolean).join(' · ');
const hasNote = (note, q) => (note || '').split(/\s*,\s*/).includes(q);

/**
 * จัดกลุ่มตัวเลือกเป็นแถว: แถบตัวเลือกมีที่ 2 แถวตายตัว (ปุ่มจะได้ไม่เลื่อนตำแหน่ง)
 * กลุ่มที่มีมากกว่า 2 ตัวเลือกได้แถวของตัวเอง กลุ่มสั้นจับคู่แถวละ 2 กลุ่ม ที่เหลือไปอยู่ใน "เพิ่มเติม"
 */
function deckLayout(menu) {
  const groups = (menu?.options || []).map((g, gi) => [g, gi]).filter(([g]) => g.choices?.length);
  const singles = groups.filter(([g]) => !g.multi);
  const rows = [];
  let pair = null;
  for (const gg of singles) {
    if (gg[0].choices.length > 2) { rows.push([gg]); pair = null; }
    else if (pair && pair.length < 2) pair.push(gg);
    else { pair = [gg]; rows.push(pair); }
  }
  // มีแค่แถวเดียวที่จับคู่ 2 กลุ่ม: แยกเป็น 2 แถว ปุ่มจะกว้างขึ้น (ที่ว่างมี 2 แถวอยู่แล้ว)
  if (rows.length === 1 && rows[0].length === 2) rows.splice(0, 1, [rows[0][0]], [rows[0][1]]);
  return { rows: rows.slice(0, 2), overflow: rows.slice(2).flat(), multis: groups.filter(([g]) => g.multi) };
}

function renderDeck() {
  const el = $('#deck');
  const l = selLine();
  if (!l) {
    el.innerHTML = `<div class="deck-idle">${icon('info')}<span>${S.cart.lines.length
      ? 'แตะรายการในใบด้านบน เพื่อเปลี่ยนตัวเลือก (เช่น พิเศษ)'
      : isRecord()
        ? 'แตะเมนู 1 ครั้ง = 1 จาน แตะซ้ำ = เพิ่มจาน<br>แล้วกด <b>เงินสด</b> หรือ <b>โอน</b> = บันทึกการขาย'
        : 'แตะเมนู 1 ครั้ง = 1 ที่ ได้ตัวเลือกปกติทันที<br>แตะซ้ำ = เพิ่มจำนวน'}</span></div>`;
    return;
  }
  const menu = menuOf(l);
  const { rows, overflow, multis } = deckLayout(menu);
  const extraNames = new Set([...overflow, ...multis].map(([g]) => g.name));
  const moreCount = l.options.filter((o) => extraNames.has(o.group) && !o.isDefault).length + (l.note ? 1 : 0);
  const chip = (g, gi, c, ci) => {
    const on = M.isChosen(l.options, g.name, c.name);
    return `<button class="${on ? 'on' : ''}" type="button" aria-pressed="${on}" data-act="opt" data-g="${gi}" data-c="${ci}">${esc(c.name)}${+c.price ? `<small>+${+c.price}</small>` : ''}</button>`;
  };
  const seg = ([g, gi]) => `<div class="seg strong" role="group" aria-label="${esc(g.name)}">${g.choices.map((c, ci) => chip(g, gi, c, ci)).join('')}</div>`;
  const more = `<button class="more-btn${S.moreOpen ? ' on' : ''}" type="button" data-act="more" aria-pressed="${S.moreOpen}">${icon(S.moreOpen ? 'x' : 'plus')}<span>${S.moreOpen ? 'ปิด' : 'เพิ่มเติม'}</span>${moreCount ? `<b class="count-dot">${moreCount}</b>` : ''}</button>`;
  if (!rows.length) {
    el.innerHTML = `<div class="deck-row"><div class="deck-note">${esc(l.name)} ไม่มีตัวเลือก</div>${more}</div>`;
    return;
  }
  el.innerHTML = rows.map((row, i) => `<div class="deck-row">${row.map(seg).join('')}${i === rows.length - 1 ? more : ''}</div>`).join('');
}

function renderEditBanner() {
  const b = $('#editBanner');
  b.hidden = !S.cart.editId;
  if (S.cart.editId) {
    b.innerHTML = `<span>${icon('edit')} กำลังแก้ไขออเดอร์ ${S.cart.editSource === 'qr' ? 'Q' : '#'}${S.cart.editNumber}</span>
      <button class="btn sm" type="button" data-act="edit-cancel">ไม่แก้แล้ว</button>`;
  }
}

function renderMenuGrid() {
  const g = $('#menuGrid');
  if (isTyping(g)) return;
  const l = selLine();
  if (S.moreOpen && l) {
    g.classList.add('extras-open');
    g.innerHTML = extrasPanel(l);
    return;
  }
  S.moreOpen = false;
  g.classList.remove('extras-open');
  if (!S.menuLoaded) { g.innerHTML = '<p class="hint">กำลังโหลดเมนู…</p>'; return; }
  const items = M.groupByCategory(S.menu.filter((m) => m.active !== false), M.bySort).flatMap(([, list]) => list);
  if (!items.length) {
    g.innerHTML = `<p class="hint">ยังไม่มีเมนู <button class="btn sm" type="button" data-act="go" data-to="settings">ไปเพิ่มเมนู</button></p>`;
    return;
  }
  const qty = {};
  for (const x of S.cart.lines) qty[x.menuId] = (qty[x.menuId] || 0) + x.qty;
  g.innerHTML = '<div class="tiles">' + items.map((m) => `
    <button class="mbtn${qty[m.id] ? ' in' : ''}" type="button" data-act="add" data-id="${esc(m.id)}" style="--tile:${M.tileColor(m)}">
      <span class="mname">${nameHtml(m.name)}</span>
      <span class="mprice tnum">${M.fmtMoney(m.price)}</span>
      ${qty[m.id] ? `<span class="mqty">${qty[m.id]}</span>` : ''}
    </button>`).join('') + '</div>';
}

// ตัวเลือกที่เหลือ / ของเพิ่ม / หมายเหตุ: ใช้พื้นที่เดียวกับปุ่มเมนู กด "เสร็จ" แล้วกลับไปที่เมนู
function extrasPanel(l) {
  const menu = menuOf(l);
  const { overflow, multis } = deckLayout(menu);
  const quick = S.settings.quickNotes || [];
  const singleRow = ([g, gi]) => `<div class="x-label">${esc(g.name)}</div><div class="seg strong" role="group" aria-label="${esc(g.name)}">${g.choices.map((c, ci) => {
    const on = M.isChosen(l.options, g.name, c.name);
    return `<button class="${on ? 'on' : ''}" type="button" aria-pressed="${on}" data-act="opt" data-g="${gi}" data-c="${ci}">${esc(c.name)}${+c.price ? `<small>+${+c.price}</small>` : ''}</button>`;
  }).join('')}</div>`;
  return `<div class="extras" id="extras">
    <div class="extras-head"><b>${esc(l.name)}</b><button class="btn primary" type="button" data-act="more">${icon('check')}เสร็จ</button></div>
    ${overflow.map(singleRow).join('')}
    ${multis.map(([g, gi]) => `<div class="x-label">${esc(g.name)}</div><div class="x-grid">${g.choices.map((c, ci) => {
      const on = M.isChosen(l.options, g.name, c.name);
      return `<button class="chip${on ? ' on' : ''}" type="button" aria-pressed="${on}" data-act="opt" data-g="${gi}" data-c="${ci}"><span>${esc(c.name)}</span>${+c.price ? `<small>+${+c.price}</small>` : ''}</button>`;
    }).join('')}</div>`).join('')}
    ${quick.length ? `<div class="x-label">หมายเหตุด่วน</div><div class="x-grid">${quick.map((q, qi) =>
      `<button class="chip qn${hasNote(l.note, q) ? ' on' : ''}" type="button" data-act="qnote" data-i="${qi}" aria-pressed="${hasNote(l.note, q)}">${esc(q)}</button>`).join('')}</div>` : ''}
    <input class="input note-input" id="noteInput" type="text" maxlength="80" enterkeyhint="done" autocomplete="off" placeholder="หมายเหตุอื่นๆ (ไม่บังคับ)" value="${esc(l.note)}" aria-label="หมายเหตุ">
  </div>`;
}

function renderTicket() {
  const t = $('#ticket');
  if (isTyping(t)) return;
  const c = S.cart;
  const num = c.editId ? (c.editSource === 'qr' ? 'Q' : '#') + c.editNumber : '#' + M.nextNumber(S.orders);
  const todaySales = S.orders.filter((o) => !o.cancelled).reduce((a, o) => a + (+o.total || 0), 0);
  const head = isRecord() ? `<div class="t-head">
    <div class="ordno${c.editId ? ' editing' : ''}"><small>${c.editId ? 'แก้ไขบิล' : 'บิลถัดไป'}</small><b class="tnum">${num}</b></div>
    <span class="grow"></span>
    <button class="today-chip" type="button" data-act="go" data-to="queue"><small>ขายวันนี้</small><b class="tnum">${M.fmtMoney(todaySales)}</b></button>
  </div>` : `<div class="t-head">
    <div class="ordno${c.editId ? ' editing' : ''}"><small>${c.editId ? 'แก้ไข' : 'ออเดอร์ถัดไป'}</small><b class="tnum">${num}</b></div>
    ${takeawayOn() ? `<div class="seg type" role="group" aria-label="ทานที่ร้านหรือกลับบ้าน">
      <button class="${c.type !== 'takeaway' ? 'on' : ''}" type="button" data-act="otype" data-v="dine" aria-pressed="${c.type !== 'takeaway'}">${icon('dine', 'sm')}ทานที่ร้าน</button>
      <button class="${c.type === 'takeaway' ? 'on' : ''}" type="button" data-act="otype" data-v="takeaway" aria-pressed="${c.type === 'takeaway'}">${icon('bag', 'sm')}กลับบ้าน</button>
    </div>` : '<span class="grow"></span>'}
    ${S.nameEdit
      ? `<label class="name-input"><span class="sr">ชื่อลูกค้าหรือโต๊ะ</span><input id="nameInput" type="text" maxlength="12" autocomplete="off" enterkeyhint="done" placeholder="ชื่อ/โต๊ะ" value="${esc(c.name)}"></label>`
      : `<button class="name-btn${c.name ? ' set' : ''}" type="button" data-act="name">${c.name ? esc(c.name) : icon('user', 'sm') + 'ชื่อ'}</button>`}
  </div>`;
  if (!c.lines.length) {
    t.innerHTML = head + `<div class="t-empty">ยังไม่มีรายการ · แตะเมนูด้านล่างเพื่อเริ่ม</div>`;
    return;
  }
  t.innerHTML = head + `<div class="t-lines" id="tLines">${c.lines.map((l) => (l.key === c.sel ? lineOpen(l) : lineRow(l))).join('')}
    <div class="t-tools">${confirmBtn('clear', icon('trash') + 'ล้างทั้งใบ', 'แตะอีกครั้งเพื่อล้าง', 'ghost sm', 'clear')}</div></div>`;
}

function lineRow(l) {
  const extra = lineExtra(l);
  return `<button class="tl" type="button" data-act="sel" data-key="${l.key}">
    <span class="tl-q tnum">${l.qty}</span>
    <span class="tl-main"><b>${esc(l.name)}${l.served ? ' <i class="badge ok">เสร็จแล้ว</i>' : ''}</b>${extra ? `<small>${esc(extra)}</small>` : ''}</span>
    <span class="tl-price tnum">${M.fmtMoney(M.unitPrice(l) * l.qty)}</span>
  </button>`;
}

function lineOpen(l) {
  const extra = lineExtra(l);
  return `<div class="tl sel" data-key="${l.key}">
    <span class="tl-main"><b>${esc(l.name)}${l.served ? ' <i class="badge ok">เสร็จแล้ว</i>' : ''}</b><small>${esc(extra || 'ตัวเลือกปกติ')} · ${M.fmtMoney(M.unitPrice(l))}/ที่</small></span>
    <div class="stepper">
      <button type="button" data-act="qty" data-d="-1" aria-label="${l.qty > 1 ? 'ลดจำนวน' : 'ลบรายการ'}">${icon(l.qty > 1 ? 'minus' : 'trash')}</button>
      <output aria-live="polite">${l.qty}</output>
      <button type="button" data-act="qty" data-d="1" aria-label="เพิ่มจำนวน">${icon('plus')}</button>
    </div>
  </div>`;
}

function renderSaveBar() {
  const c = S.cart;
  const n = M.itemCount(c.lines);
  const total = c.lines.reduce((s, l) => s + M.unitPrice(l) * l.qty, 0);
  const summary = c.lines.map((l) => `${l.name}×${l.qty}`).join(', ');
  if (isRecord()) {
    const extra = c.editId ? 'บันทึกแก้ไข' : n ? `${n} จาน` : 'ยังไม่มีรายการ';
    $('#saveBar').innerHTML = `
    <button class="undo" type="button" data-act="undo" ${S.undo.length ? '' : 'disabled'} aria-label="ย้อนกลับขั้นล่าสุด">${icon('undo')}<span>ย้อน</span></button>
    <button class="save pay-btn cash" type="button" data-act="save" data-pm="cash" ${n ? '' : 'disabled'}>
      <span class="pay-l"><b>เงินสด</b><small>${extra}</small></span><span class="save-t tnum">${M.fmtMoney(total)}</span>
    </button>
    <button class="save pay-btn transfer" type="button" data-act="save" data-pm="transfer" ${n ? '' : 'disabled'}>
      <span class="pay-l"><b>โอน</b><small>สแกนป้ายร้าน</small></span><span class="save-t tnum">${M.fmtMoney(total)}</span>
    </button>`;
    return;
  }
  $('#saveBar').innerHTML = `
    <button class="undo" type="button" data-act="undo" ${S.undo.length ? '' : 'disabled'} aria-label="ย้อนกลับขั้นล่าสุด">${icon('undo')}<span>ย้อน</span></button>
    <button class="save" type="button" data-act="save" ${n ? '' : 'disabled'}>
      <span class="save-l"><b>${c.editId ? 'บันทึกการแก้ไข' : 'บันทึกออเดอร์'}</b><small>${n ? `${n} ที่ · ${esc(summary)}` : 'ยังไม่มีรายการ'}</small></span>
      <span class="save-t tnum">${M.fmtMoney(total)}</span>
    </button>`;
}

// ---------- แก้ใบที่กำลังจด ----------
function pushUndo() {
  S.undo.push(JSON.stringify(S.cart));
  if (S.undo.length > 40) S.undo.shift();
}
function commitCart() {
  persistCart();
  renderOrder();
}

function addMenu(id) {
  const m = S.menu.find((x) => x.id === id);
  if (!m) return;
  pushUndo();
  const line = { key: uid(), menuId: m.id, name: m.name, basePrice: +m.price || 0, qty: 1, options: M.defaultOptions(m), note: '', served: false };
  const k = M.lineKey(line);
  // กดเมนูเดิมซ้ำ (ตัวเลือกเหมือนกัน) = เพิ่มจำนวน
  const same = S.cart.lines.find((l) => !l.served && M.lineKey(l) === k);
  if (same) { same.qty += 1; S.cart.sel = same.key; }
  else { S.cart.lines.push(line); S.cart.sel = line.key; }
  buzz();
  commitCart();
  const b = $(`.mbtn[data-id="${CSS.escape(id)}"]`);
  b?.classList.add('pop');
  setTimeout(() => b?.classList.remove('pop'), 260);
}

function changeQty(d) {
  const l = selLine();
  if (!l) return;
  pushUndo();
  if (d > 0 && l.served) {
    // เพิ่มจากรายการที่เสร็จแล้ว = ที่ใหม่ที่ยังไม่ได้ทำ
    const twin = S.cart.lines.find((x) => !x.served && M.lineKey(x) === M.lineKey(l));
    if (twin) { twin.qty += 1; S.cart.sel = twin.key; }
    else {
      const n = { ...l, key: uid(), qty: 1, served: false };
      S.cart.lines.splice(S.cart.lines.indexOf(l) + 1, 0, n);
      S.cart.sel = n.key;
    }
  } else {
    l.qty += d;
    if (l.qty <= 0) {
      const i = S.cart.lines.indexOf(l);
      S.cart.lines.splice(i, 1);
      S.cart.sel = S.cart.lines[Math.min(i, S.cart.lines.length - 1)]?.key ?? null;
    }
  }
  buzz();
  commitCart();
}

function setOpt(gi, ci) {
  const l = selLine();
  const menu = menuOf(l);
  if (!menu) return;
  pushUndo();
  l.options = M.setOption(menu, l.options, gi, ci);
  l.served = false;
  commitCart();
}

function toggleQuickNote(i) {
  const l = selLine();
  const q = (S.settings.quickNotes || [])[i];
  if (!l || !q) return;
  pushUndo();
  const parts = (l.note || '').split(/\s*,\s*/).filter(Boolean);
  l.note = (parts.includes(q) ? parts.filter((p) => p !== q) : [...parts, q]).join(', ');
  commitCart();
}

function undo() {
  const s = S.undo.pop();
  if (!s) return;
  S.cart = JSON.parse(s);
  commitCart();
}

function saveOrder(pm) {
  const c = S.cart;
  if (!c.lines.length) return;
  const rec = isRecord();
  let items = M.mergeLines(c.lines).map(M.toItem);
  if (rec) items = items.map((it) => ({ ...it, served: true })); // จดเฉยๆ = ขายแล้ว ไม่มีคิว
  const total = M.orderTotal(items);
  const name = rec ? '' : (c.name || '').trim();
  const type = takeawayOn() && c.type === 'takeaway' ? 'takeaway' : 'dine';
  const payPatch = rec ? { paid: true, payMethod: pm === 'transfer' ? 'transfer' : 'cash', paidAt: Date.now() } : {};

  if (c.editId) {
    const old = S.orders.find((o) => o.id === c.editId);
    if (!old) { toast('ไม่พบออเดอร์เดิม (อาจเป็นของวันก่อน)', 'bad'); return; }
    // เก็บของเดิมไว้ในประวัติ ไม่ลบทิ้ง
    data.updateOrder(old.id, { items, total, name, type, ...payPatch }, { at: Date.now(), type: 'edit', items: old.items, total: old.total, name: old.name || '', payMethod: old.payMethod || null });
    finishEdit();
    toast(`แก้ไข ${M.orderNo(old)} แล้ว`);
    go('queue');
    return;
  }

  const number = M.nextNumber(S.orders);
  const newId = data.addOrder({
    number, name, type, dateKey: M.thaiDateKey(), createdAt: Date.now(),
    items, total, paid: false, payMethod: null, payClaimed: false, cancelled: false, source: 'staff', ...payPatch,
  });
  S.cart = emptyCart();
  S.undo = [];
  S.moreOpen = false;
  S.nameEdit = false;
  persistCart();
  buzz(30);
  renderAll();
  const offline = S.mode !== 'demo' && !S.sync.online;
  const wait = offline ? ' · เก็บในเครื่อง รอส่ง' : '';
  if (rec) toast(`บันทึก #${number} · ${pm === 'transfer' ? 'โอน' : 'เงินสด'} ${M.fmtMoney(total)}` + wait, offline ? 'warn' : 'ok', { label: 'แก้', fn: () => startEdit(newId) });
  else toast(`บันทึก #${number}${name ? ' ' + name : ''} แล้ว` + wait, offline ? 'warn' : 'ok');
}

// ---------- แก้ไขออเดอร์ที่บันทึกแล้ว ----------
function startEdit(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  if (!S.cart.editId && S.cart.lines.length) S.stash = S.cart; // พักใบที่จดค้างไว้ก่อน
  S.cart = {
    lines: o.items.map((it) => M.fromItem(it, uid())), sel: null,
    name: o.name || o.table || '', type: o.type === 'takeaway' ? 'takeaway' : 'dine',
    editId: o.id, editNumber: o.number, editSource: o.source || 'staff',
  };
  S.undo = [];
  S.moreOpen = false;
  persistCart();
  go('order');
}
function finishEdit() {
  S.cart = S.stash || emptyCart();
  S.stash = null;
  S.undo = [];
  persistCart();
}

// =====================================================================
// หน้าคิว
// =====================================================================
const payOf = (o) => (!o.paid ? 'none' : o.payMethod === 'transfer' ? 'transfer' : 'cash');

function renderQueue() {
  const el = $('#scr-queue');
  if (isTyping(el)) return;
  if (isRecord()) { renderSales(el); return; }
  const live = S.orders.filter((o) => !o.cancelled);
  const pend = live.filter((o) => !M.isDone(o)).sort((a, b) => a.createdAt - b.createdAt);
  const done = live.filter(M.isDone).sort((a, b) => b.createdAt - a.createdAt);
  const canc = S.orders.filter((o) => o.cancelled).sort((a, b) => b.createdAt - a.createdAt);
  const unpaid = live.filter((o) => !o.paid).length;
  const late = pend.filter(isLate).length;
  const qrOpen = S.settings.qrOpen !== false;
  el.innerHTML = `
    <div class="q-top">
      <div class="q-stats">
        <div class="q-stat"><b class="tnum">${pend.length}</b><span>รอทำ</span></div>
        <div class="q-stat${late ? ' bad' : ''}"><b class="tnum">${late}</b><span>เกิน ${+S.settings.overdueMin || 10} นาที</span></div>
        <div class="q-stat${unpaid ? ' warn' : ''}"><b class="tnum">${unpaid}</b><span>ยังไม่จ่าย</span></div>
      </div>
      ${qrOn() ? `<div class="qr-row card">
        <span class="qr-ic${qrOpen ? ' on' : ''}">${icon('qr')}</span>
        <span class="qr-txt"><b>รับออเดอร์จาก QR</b><small>${qrOpen ? 'เปิดอยู่ · นักเรียนสแกนสั่งเองได้' : 'ปิดอยู่ · นักเรียนจะเห็นว่าร้านปิดรับชั่วคราว'}</small></span>
        <button class="switch" type="button" role="switch" aria-checked="${qrOpen}" aria-label="รับออเดอร์จาก QR" data-act="qr-open"></button>
      </div>` : ''}
    </div>
    <div class="sec-head"><h2>รอทำ <span class="count tnum">${pend.length}</span></h2><small>เก่าสุดอยู่บน · แตะรายการเมื่อทำเสร็จ</small></div>
    ${pend.length ? `<div class="cards">${pend.map((o) => orderCard(o)).join('')}</div>`
      : `<div class="empty">${icon('check-circle', 'lg')}<span>ไม่มีออเดอร์ค้าง</span></div>`}
    <div class="sec-head"><h2>เสร็จแล้ว <span class="count tnum">${done.length}</span></h2></div>
    <div class="done-list">${done.length ? done.map((o) => (S.openDone.has(o.id) ? orderCard(o, true) : doneRow(o))).join('') : '<p class="hint">ยังไม่มี</p>'}</div>
    ${canc.length ? `<button class="sec-toggle" type="button" data-act="toggle-cancelled">${icon(S.showCancelled ? 'chev-up' : 'chev-down')} ยกเลิกแล้ว (${canc.length})</button>
      ${S.showCancelled ? canc.map(cancelRow).join('') : ''}` : ''}`;
}

// ---------- ร้านแบบจดเฉยๆ: รายการขายวันนี้ ----------
function renderSales(el) {
  const live = S.orders.filter((o) => !o.cancelled).sort((a, b) => b.createdAt - a.createdAt);
  const canc = S.orders.filter((o) => o.cancelled).sort((a, b) => b.createdAt - a.createdAt);
  const s = M.summarize(S.orders);
  el.innerHTML = `
    <div class="q-top">
      <div class="q-stats">
        <div class="q-stat"><b class="tnum">${M.fmtMoney(s.sales)}</b><span>ยอดวันนี้</span></div>
        <div class="q-stat"><b class="tnum">${s.orderCount}</b><span>บิล</span></div>
        <div class="q-stat"><b class="tnum">${s.items}</b><span>จาน</span></div>
      </div>
      <div class="pay-split card">
        <span><i class="sw-cash"></i>เงินสด <b class="tnum">${M.fmtMoney(s.cash)}</b></span>
        <span><i class="sw-transfer"></i>โอน <b class="tnum">${M.fmtMoney(s.transfer)}</b></span>
        ${s.unpaid ? `<span><i class="sw-unpaid"></i>ยังไม่จ่าย <b class="tnum">${M.fmtMoney(s.unpaid)}</b></span>` : ''}
      </div>
    </div>
    <div class="sec-head"><h2>ขายแล้ววันนี้ <span class="count tnum">${live.length}</span></h2><small>ล่าสุดอยู่บน · แตะเพื่อแก้หรือยกเลิก</small></div>
    <div class="done-list">${live.length ? live.map((o) => (S.openDone.has(o.id) ? saleCard(o) : saleRow(o))).join('')
      : `<div class="empty">${icon('note', 'lg')}<span>ยังไม่มีการขายวันนี้</span></div>`}</div>
    ${canc.length ? `<button class="sec-toggle" type="button" data-act="toggle-cancelled">${icon(S.showCancelled ? 'chev-up' : 'chev-down')} ยกเลิกแล้ว (${canc.length})</button>
      ${S.showCancelled ? canc.map(cancelRow).join('') : ''}` : ''}`;
}

const itemsText = (o) => o.items.map((it) => {
  const extra = M.optionText(it.options);
  return `${it.name}${extra ? ' (' + extra + ')' : ''}${it.qty > 1 ? ' ×' + it.qty : ''}`;
}).join(', ');

function saleRow(o) {
  const pay = payOf(o);
  return `<button class="sale-row" type="button" data-act="done-toggle" data-id="${o.id}">
    <span class="sr-top"><b class="tnum">${esc(M.orderNo(o))}</b><small class="tnum">${M.fmtTime(o.createdAt)}</small>${o._pending ? `<span class="badge warn">${icon('cloud-off')}รอส่ง</span>` : ''}</span>
    <span class="sr-items">${esc(itemsText(o))}</span>
    <span class="sr-right"><b class="tnum">${M.fmtMoney(o.total)}</b><span class="badge ${pay === 'transfer' ? 'primary' : pay === 'cash' ? 'ok' : 'warn'}">${pay === 'transfer' ? 'โอน' : pay === 'cash' ? 'เงินสด' : 'ยังไม่จ่าย'}</span></span>
  </button>`;
}

function saleCard(o) {
  const pays = [['cash', 'เงินสด'], ['transfer', 'โอน'], ['none', 'ยังไม่จ่าย']];
  return `<article class="oc sale" data-id="${o.id}" data-num="${esc(M.orderNo(o))}">
    <header class="oc-head">
      <div class="oc-id"><b class="oc-no tnum">${esc(M.orderNo(o))}</b></div>
      <div class="oc-time"><small class="tnum">ขายเมื่อ ${M.fmtTime(o.createdAt)}</small></div>
    </header>
    <ul class="sale-items">${o.items.map((it) => {
      const extra = M.optionText(it.options);
      return `<li><span class="tnum">${it.qty}×</span><span><b>${esc(it.name)}</b>${extra ? `<small>${esc(extra)}</small>` : ''}${it.note ? `<small class="it-note">${esc(it.note)}</small>` : ''}</span><span class="tnum">${M.fmtMoney(it.price * it.qty)}</span></li>`;
    }).join('')}</ul>
    <div class="oc-pay">
      <div class="seg pay" role="group" aria-label="การจ่ายเงิน">${pays.map(([m, t]) =>
        `<button class="${payOf(o) === m ? 'on' : ''} p-${m}" type="button" data-act="pay" data-id="${o.id}" data-m="${m}" aria-pressed="${payOf(o) === m}">${t}</button>`).join('')}</div>
      <b class="oc-total tnum">${M.fmtMoney(o.total)}</b>
    </div>
    <div class="oc-actions">
      <button class="btn sm" type="button" data-act="done-toggle" data-id="${o.id}">${icon('chev-up')}ย่อ</button>
      <button class="btn sm" type="button" data-act="edit" data-id="${o.id}">${icon('edit')}แก้ไข</button>
      ${confirmBtn('cancel:' + o.id, icon('x') + 'ยกเลิกบิล', 'แตะอีกครั้ง = ยกเลิก', 'sm danger', 'cancel', o.id)}
    </div>
  </article>`;
}

function idTags(o) {
  const tags = [];
  if (M.isQr(o)) tags.push(`<span class="badge primary">${icon('qr')}QR</span>`);
  if (o.type === 'takeaway') tags.push(`<span class="badge">${icon('bag')}กลับบ้าน</span>`);
  if (o.name) tags.push(`<span class="badge">${icon('user')}${esc(o.name)}</span>`);
  else if (o.table) tags.push(`<span class="badge">โต๊ะ ${esc(o.table)}</span>`);
  if (o._pending) tags.push(`<span class="badge warn" title="ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์">${icon('cloud-off')}รอส่ง</span>`);
  return tags.join('');
}

function orderCard(o, opened = false) {
  const mins = M.minutesSince(o.createdAt);
  const done = M.isDone(o);
  const late = !done && isLate(o);
  const qr = M.isQr(o);
  const ps = M.payState(o);
  const check = qr && S.menuLoaded ? M.checkPrices(o, S.menu) : { ok: true };
  const items = o.items.map((it, i) => {
    const extra = M.optionText(it.options);
    return `<button class="it ${it.served ? 'served' : 'wait'}" type="button" data-act="serve" data-id="${o.id}" data-i="${i}" aria-pressed="${!!it.served}">
      <span class="it-q tnum">${it.qty}</span>
      <span class="it-name"><b>${esc(it.name)}</b>${extra ? `<small>${esc(extra)}</small>` : ''}${it.note ? `<small class="it-note">${esc(it.note)}</small>` : ''}</span>
      <span class="it-state">${it.served ? icon('check', 'sm') + 'เสร็จ' : 'รอทำ'}</span>
    </button>`;
  }).join('');
  const pays = [['none', 'ยังไม่จ่าย'], ['cash', 'เงินสด'], ['transfer', 'โอน']];
  let payNote = '';
  if (qr && !o.paid) {
    payNote = ps === 'claimed'
      ? `<div class="note primary">${icon('wallet')}<span><b>ลูกค้าแจ้งโอนแล้ว</b>${o.payClaimedAt ? ' ' + M.fmtTime(o.payClaimedAt) : ''} · เช็คยอด ${M.fmtMoney(o.total)} ในแอปธนาคาร แล้วกด "โอน"</span></div>`
      : `<div class="note">${icon('wallet')}<span>รอลูกค้าโอนพร้อมเพย์ ${M.fmtMoney(o.total)}</span></div>`;
  }
  const priceNote = check.ok ? '' : `<div class="note bad">${icon('alert')}<span><b>ราคาไม่ตรงเมนู</b> ตามเมนูตอนนี้ควรเป็น ${M.fmtMoney(check.expected)}</span></div>`;
  return `<article class="oc${late ? ' late' : ''}${S.fresh.has(o.id) ? ' fresh' : ''}${qr ? ' is-qr' : ''}" data-id="${o.id}" data-num="${esc(M.orderNo(o))}">
    <header class="oc-head">
      <div class="oc-id"><b class="oc-no tnum">${esc(M.orderNo(o))}</b><div class="oc-tags">${idTags(o)}</div></div>
      <div class="oc-time">${late ? `<span class="badge bad">${icon('alert')}ค้าง ${mins} นาที</span>` : done ? '<span class="badge ok">เสร็จแล้ว</span>' : `<span class="oc-mins tnum">${mins ? mins + ' นาที' : 'เพิ่งสั่ง'}</span>`}<small class="tnum">สั่ง ${M.fmtTime(o.createdAt)}</small></div>
    </header>
    <div class="oc-items">${items}</div>
    ${payNote}${priceNote}
    <div class="oc-pay">
      <div class="seg pay" role="group" aria-label="การจ่ายเงิน">${pays.map(([m, t]) =>
        `<button class="${payOf(o) === m ? 'on' : ''} p-${m}" type="button" data-act="pay" data-id="${o.id}" data-m="${m}" aria-pressed="${payOf(o) === m}">${t}</button>`).join('')}</div>
      <b class="oc-total tnum">${M.fmtMoney(o.total)}</b>
    </div>
    <div class="oc-actions">
      ${!done && o.items.length > 1 ? `<button class="btn sm" type="button" data-act="serve-all" data-id="${o.id}">${icon('check')}เสร็จทั้งใบ</button>` : ''}
      ${opened ? `<button class="btn sm" type="button" data-act="done-toggle" data-id="${o.id}">${icon('chev-up')}ย่อ</button>` : ''}
      <button class="btn sm" type="button" data-act="edit" data-id="${o.id}">${icon('edit')}แก้ไข</button>
      ${confirmBtn('cancel:' + o.id, icon('x') + 'ยกเลิก', 'แตะอีกครั้ง = ยกเลิก', 'sm danger', 'cancel', o.id)}
    </div>
  </article>`;
}

function doneRow(o) {
  const pay = payOf(o);
  return `<button class="done-row" type="button" data-act="done-toggle" data-id="${o.id}">
    <b class="dr-no tnum">${esc(M.orderNo(o))}</b>
    <span class="dr-mid"><span class="dr-tags">${idTags(o)}</span><small class="tnum">${M.fmtTime(o.createdAt)} · ${M.itemCount(o.items)} ที่</small></span>
    <span class="dr-total tnum">${M.fmtMoney(o.total)}</span>
    <span class="badge ${pay === 'none' ? (o.payClaimed ? 'primary' : 'warn') : 'ok'}">${pay === 'none' ? (o.payClaimed ? 'แจ้งโอนแล้ว' : 'ยังไม่จ่าย') : pay === 'cash' ? 'เงินสด' : 'โอน'}</span>
  </button>`;
}

function cancelRow(o) {
  return `<div class="cancel-row">
    <span><s>${esc(M.orderNo(o))}</s> ${o.name ? esc(o.name) + ' · ' : ''}${M.fmtTime(o.createdAt)} · ${M.fmtMoney(o.total)}</span>
    <button class="btn ghost sm" type="button" data-act="restore" data-id="${o.id}">กู้คืน</button>
  </div>`;
}

function toggleServed(id, i) {
  const o = S.orders.find((x) => x.id === id);
  if (!o?.items[i]) return;
  const items = o.items.map((it, j) => (j === i ? { ...it, served: !it.served } : it));
  data.updateOrder(id, { items });
  buzz();
  if (!M.isDone(o) && items.every((it) => it.served)) toast(`${M.orderLabel(o)} เสร็จครบแล้ว${M.isQr(o) ? ' · หน้าจอลูกค้าขึ้นว่าพร้อมรับแล้ว' : ''}`);
}
function serveAll(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  data.updateOrder(id, { items: o.items.map((it) => ({ ...it, served: true })) });
  buzz();
  toast(`${M.orderLabel(o)} เสร็จครบแล้ว${M.isQr(o) ? ' · หน้าจอลูกค้าขึ้นว่าพร้อมรับแล้ว' : ''}`);
}
function setPaid(id, m) {
  const paid = m !== 'none';
  data.updateOrder(id, { paid, payMethod: paid ? m : null, paidAt: paid ? Date.now() : null });
  buzz();
}
function cancelOrder(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o || !confirmTap('cancel:' + id)) return;
  data.updateOrder(id, { cancelled: true, cancelledAt: Date.now() }, { at: Date.now(), type: 'cancel' });
  toast(`ยกเลิก ${M.orderLabel(o)} แล้ว`, 'bad', { label: 'กู้คืน', fn: () => restoreOrder(id) });
}
function restoreOrder(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  data.updateOrder(id, { cancelled: false, cancelledAt: null }, { at: Date.now(), type: 'restore' });
  toast(`กู้คืน ${M.orderLabel(o)} แล้ว`);
}

// =====================================================================
// หน้าสรุปยอด
// =====================================================================
// ช่วงที่เลือก: วัน / 7 วัน / เดือน / ปี  (at = วันที่อ้างอิงในช่วงนั้น)
const RANGES = [['day', 'วัน'], ['week', '7 วัน'], ['month', 'เดือน'], ['year', 'ปี']];
function sumRange(r = S.sum.range, at = S.sum.at) {
  if (r === 'day') return [at, at];
  if (r === 'week') return [M.addDays(at, -6), at];
  if (r === 'month') return [M.monthStart(at), M.monthEnd(at)];
  return [at.slice(0, 4) + '-01-01', at.slice(0, 4) + '-12-31'];
}

async function loadSummary() {
  const [a, b] = sumRange();
  const req = ++S.sum.req;
  S.sum.past = null;
  S.sum.days = null;
  if (S.sum.range === 'day' && a === S.today) { S.sum.loading = false; return; }
  S.sum.loading = true;
  renderSummary();
  try {
    if (S.sum.range === 'day') {
      const list = await data.fetchOrdersRange(a, a);
      if (req !== S.sum.req) return;
      S.sum.past = list;
      if (list.length) data.saveDay(a, M.daySummary(list)); // ซ่อมยอดรายวันของวันนั้นให้ตรงกับออเดอร์จริง
    } else {
      const list = await data.fetchDays(a, b > S.today ? S.today : b);
      if (req !== S.sum.req) return;
      S.sum.days = list;
    }
  } catch (e) {
    console.error(e);
    S.sum.past = [];
    S.sum.days = [];
    toast('โหลดยอดย้อนหลังไม่สำเร็จ', 'bad');
  }
  S.sum.loading = false;
  if (S.screen === 'summary') renderSummary();
}

/** ยอดของช่วงที่เลือก (วันนี้ใช้ออเดอร์สดในเครื่อง ไม่ต้องรอยอดรายวันอัปเดต) */
function currentSummary() {
  const [a, b] = sumRange();
  if (S.sum.range === 'day') {
    const orders = a === S.today ? S.orders : (S.sum.past || []);
    return { ...M.summarize(orders), orders };
  }
  const days = (S.sum.days || []).filter((d) => d.dateKey !== S.today);
  if (a <= S.today && S.today <= b && S.orders.length) days.push({ dateKey: S.today, ...M.daySummary(S.orders) });
  return { ...M.combineDays(days), days };
}

function rangeLabel() {
  const [a, b] = sumRange();
  const r = S.sum.range;
  if (r === 'day') return M.fmtDay(a, true) + (a === S.today ? ' · วันนี้' : '');
  if (r === 'week') return `${M.fmtDay(a)} – ${M.fmtDay(b)}`;
  if (r === 'month') return M.fmtMonth(a);
  return M.fmtYear(a);
}

// กราฟแท่งแนวตั้ง (รายเดือน = แท่งละวัน, รายปี = แท่งละเดือน) แตะแท่งเพื่อดูละเอียด
function vbars(bars, { every = 1, drill } = {}) {
  const max = Math.max(1, ...bars.map((x) => x.value));
  const peak = bars.reduce((p, x) => (x.value > (p?.value ?? 0) ? x : p), null);
  return `<div class="vchart" style="--n:${bars.length}">
    ${bars.map((x) => `<button class="vb${x === peak ? ' peak' : ''}${x.today ? ' today' : ''}${x.value ? '' : ' zero'}" type="button" ${drill && !x.future ? `data-act="${drill}" data-k="${x.key}"` : 'disabled'} aria-label="${esc(x.aria)} ${M.fmtMoney(x.value)}">
      <span class="vb-v tnum">${x === peak ? M.fmtMoney(x.value) : ''}</span>
      <span class="vb-track"><i style="--h:${(x.value / max) * 100}%"></i></span>
    </button>`).join('')}
  </div>
  <div class="vchart-x" style="--n:${bars.length}">${bars.map((x, i) => `<span>${i % every === 0 || i === bars.length - 1 ? esc(x.label) : ''}</span>`).join('')}</div>`;
}

function renderSummary() {
  const el = $('#scr-summary');
  if (isTyping(el)) return;
  const r = S.sum.range;
  const [a, b] = sumRange();
  const s = S.sum.loading ? M.combineDays([]) : currentSummary();
  const maxQty = Math.max(1, ...s.byMenu.map((m) => m.qty));
  const menuById = Object.fromEntries(S.menu.map((m) => [m.id, m]));
  const atEnd = r === 'day' ? a >= S.today : b >= S.today;
  const billWord = isRecord() ? 'บิล' : 'ออเดอร์';

  const part = (cls, v) => (v > 0 ? `<i class="${cls}" style="flex:${v}"></i>` : '');
  const pay = s.sales ? `<section class="panel card">
      <h3>การจ่ายเงิน${s.cancelledCount ? `<small>ยกเลิก ${s.cancelledCount} ${billWord} ไม่นับในยอด</small>` : ''}</h3>
      <div class="paybar">${part('sw-cash', s.cash)}${part('sw-transfer', s.transfer)}${part('sw-unpaid', s.unpaid)}</div>
      <div class="paytable">
        <i class="sw-cash"></i><span>เงินสด</span><b class="tnum">${M.fmtMoney(s.cash)}</b>
        <i class="sw-transfer"></i><span>โอน</span><b class="tnum">${M.fmtMoney(s.transfer)}</b>
        ${s.unpaid ? `<i class="sw-unpaid"></i><span>ยังไม่จ่าย</span><b class="tnum">${M.fmtMoney(s.unpaid)}</b>` : ''}
      </div>
    </section>` : '';

  let chart = '';
  if (r === 'day' && s.byHour.length) {
    let h0 = s.byHour[0].hour, h1 = s.byHour[s.byHour.length - 1].hour;
    while (h1 - h0 < 5 && (h0 > 0 || h1 < 23)) { if (h0 > 0) h0--; if (h1 - h0 < 5 && h1 < 23) h1++; }
    const byH = Object.fromEntries(s.byHour.map((x) => [x.hour, x]));
    const max = Math.max(1, ...s.byHour.map((x) => x.sales));
    const peak = s.byHour.reduce((p, x) => (x.sales > p.sales ? x : p)).hour;
    const bars = [], xs = [];
    for (let h = h0; h <= h1; h++) {
      const v = byH[h]?.sales || 0;
      bars.push(`<div class="hr${h === peak ? ' peak' : ''}"><span class="v tnum">${h === peak ? M.fmtMoney(v) : ''}</span><span class="track"><i class="b" style="--h:${(v / max) * 100}%"></i></span></div>`);
      xs.push(`<span>${h}</span>`);
    }
    chart = `<section class="panel card"><h3>ยอดขายรายชั่วโมง<small>ขายดีสุด ${peak}:00–${peak + 1}:00 น.</small></h3><div class="hours">${bars.join('')}</div><div class="hours-x tnum">${xs.join('')}</div></section>`;
  } else if (r === 'week') {
    const byKey = Object.fromEntries(s.byDay.map((d) => [d.key, d]));
    const keys = Array.from({ length: 7 }, (_, i) => M.addDays(a, i));
    const max = Math.max(1, ...keys.map((k) => byKey[k]?.sales || 0));
    chart = `<section class="panel card"><h3>รายวัน<small>แตะวันเพื่อดูละเอียด</small></h3><div class="days">${keys.map((k) => {
      const v = byKey[k]?.sales || 0;
      return `<button class="day-row${k === S.today ? ' today' : ''}" type="button" data-act="sum-day" data-k="${k}" ${k > S.today ? 'disabled' : ''}><span>${M.fmtDay(k)}</span><span class="bar"><i style="--w:${(v / max) * 100}%"></i></span><b class="tnum">${M.fmtMoney(v)}</b></button>`;
    }).join('')}</div></section>`;
  } else if (r === 'month') {
    const byKey = Object.fromEntries(s.byDay.map((d) => [d.key, d]));
    const n = +b.slice(8, 10);
    const bars = Array.from({ length: n }, (_, i) => {
      const k = a.slice(0, 8) + String(i + 1).padStart(2, '0');
      const dn = i + 1;
      return { key: k, value: byKey[k]?.sales || 0, label: dn === 1 || dn % 5 === 0 ? String(dn) : '', aria: M.fmtDay(k), today: k === S.today, future: k > S.today };
    });
    chart = `<section class="panel card"><h3>รายวันในเดือนนี้<small>แตะแท่งเพื่อดูวันนั้น</small></h3>${vbars(bars, { every: 1, drill: 'sum-day' })}</section>`;
  } else if (r === 'year') {
    const byMonth = new Map();
    for (const d of s.byDay) byMonth.set(d.key.slice(0, 7), (byMonth.get(d.key.slice(0, 7)) || 0) + d.sales);
    const bars = Array.from({ length: 12 }, (_, i) => {
      const k = `${a.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`;
      return { key: k, value: byMonth.get(k.slice(0, 7)) || 0, label: M.fmtMonth(k, 'short'), aria: M.fmtMonth(k), today: k.slice(0, 7) === S.today.slice(0, 7), future: k > S.today };
    });
    chart = `<section class="panel card"><h3>รายเดือน<small>แตะแท่งเพื่อดูเดือนนั้น</small></h3>${vbars(bars, { every: 1, drill: 'sum-month' })}</section>`;
  }

  const days = r === 'day' ? 0 : s.activeDays;
  const bigSub = !s.orderCount ? 'ยังไม่มีการขาย'
    : r === 'day' ? `เฉลี่ย ${M.fmtMoney(s.sales / s.orderCount)} ต่อ${billWord}`
    : `ขาย ${days} วัน · เฉลี่ย ${M.fmtMoney(s.sales / Math.max(1, days))} ต่อวัน`;
  const top = s.byMenu[0];
  el.innerHTML = `
    <div class="seg range" role="group" aria-label="ช่วงเวลา">
      ${RANGES.map(([k, t]) => `<button class="${r === k ? 'on' : ''}" type="button" data-act="range" data-r="${k}" aria-pressed="${r === k}">${t}</button>`).join('')}
    </div>
    <div class="day-nav">
      <button class="iconbtn" type="button" data-act="day-step" data-d="-1" aria-label="ก่อนหน้า">${icon('back')}</button>
      ${r === 'day'
        ? `<label class="day-pick"><span>${rangeLabel()}</span><input id="sumDate" type="date" value="${S.sum.at}" max="${S.today}" aria-label="เลือกวันที่"></label>`
        : `<span class="day-pick"><span>${rangeLabel()}</span></span>`}
      <button class="iconbtn" type="button" data-act="day-step" data-d="1" aria-label="ถัดไป" ${atEnd ? 'disabled' : ''}>${icon('next')}</button>
    </div>
    ${S.sum.loading ? '<p class="hint">กำลังโหลด…</p>' : ''}
    <div class="kpis">
      <div class="kpi big card"><small>ยอดขาย</small><b class="tnum">${M.fmtMoney(s.sales)}</b><span class="kpi-sub">${bigSub}</span></div>
      <div class="kpi card"><small>${billWord}</small><b class="tnum">${s.orderCount.toLocaleString('th-TH')}</b><span class="kpi-sub">${s.items.toLocaleString('th-TH')} ${isRecord() ? 'จาน' : 'ที่'}</span></div>
      ${qrOn() || s.qrCount
        ? `<div class="kpi card"><small>สั่งผ่าน QR</small><b class="tnum">${s.qrCount}</b><span class="kpi-sub">${s.orderCount ? Math.round((s.qrCount / s.orderCount) * 100) : 0}% · ${M.fmtMoney(s.qrSales)}</span></div>`
        : `<div class="kpi card"><small>ขายดีสุด</small><b class="kpi-name">${top ? esc(top.name) : '–'}</b><span class="kpi-sub">${top ? top.qty.toLocaleString('th-TH') + ' จาน' : ''}</span></div>`}
    </div>
    ${chart}
    ${pay}
    <section class="panel card"><h3>ขายดี<small>เรียงตามจำนวน</small></h3>
    ${s.byMenu.length ? `<ol class="rank">${s.byMenu.map((m, i) => `
      <li><i class="bar" style="--w:${(m.qty / maxQty) * 100}%"></i>
        <span class="rk tnum">${i + 1}</span><span class="sw" style="background:${M.tileColor(menuById[m.menuId] || { name: m.name })}"></span>
        <span class="rn">${esc(m.name)}</span><span class="rq tnum"><b>${m.qty.toLocaleString('th-TH')}</b></span><span class="rr tnum">${M.fmtMoney(m.revenue)}</span></li>`).join('')}</ol>`
      : '<p class="hint">ยังไม่มีการขายในช่วงนี้</p>'}
    </section>
    <button class="btn wide" type="button" data-act="csv" ${s.orderCount || s.cancelledCount ? '' : 'disabled'}>${icon('download')}ส่งออก CSV</button>
    <p class="small-note">${r === 'day'
      ? 'ไฟล์ CSV มีทุกรายการของวันนั้น (รวมที่ยกเลิก มีคอลัมน์สถานะ) เปิดด้วย Excel / Google Sheets ได้'
      : 'ไฟล์ CSV มี 1 แถวต่อ 1 วัน: จำนวนบิล ยอดขาย เงินสด/โอน และจำนวนที่ขายได้ของแต่ละเมนู พร้อมแถวรวม'}</p>`;
}

function setRange(r) {
  if (r === S.sum.range) return;
  S.sum.range = r;
  if (r === 'week') S.sum.at = S.sum.at > S.today ? S.today : S.sum.at;
  loadSummary();
  renderSummary();
}
function stepDay(d) {
  const r = S.sum.range;
  let next;
  if (r === 'day') next = M.addDays(S.sum.at, d);
  else if (r === 'week') next = M.addDays(S.sum.at, 7 * d);
  else if (r === 'month') next = M.addMonths(S.sum.at, d);
  else next = `${+S.sum.at.slice(0, 4) + d}-01-01`;
  // ช่วงที่มีวันนี้อยู่ ใช้วันนี้เป็นจุดอ้างอิง
  const [a, b] = sumRange(r, next);
  if (a <= S.today && S.today <= b) next = S.today;
  if (next > S.today) return;
  S.sum.at = next;
  loadSummary();
  renderSummary();
}
function drill(range, key) {
  S.sum.range = range;
  const [a, b] = sumRange(range, key);
  S.sum.at = a <= S.today && S.today <= b ? S.today : key;
  loadSummary();
  renderSummary();
  $('#scr-summary').scrollTop = 0;
}

// หน้าพรีวิวบน claude.ai ห้ามดาวน์โหลดเอง ต้องขอผ่านความสามารถ downloads ของหน้า (แอปจริงไม่มี window.claude)
const previewDownloads = (() => { try { return window.claude?.use ? window.claude.use('downloads') : null; } catch { return null; } })();

async function exportCSV() {
  const [a, b] = sumRange();
  const sum = currentSummary();
  const csv = S.sum.range === 'day' ? M.ordersToCSV(sum.orders) : M.daysToCSV(sum.days);
  const filename = S.sum.range === 'day' ? `${S.shop}-${a}.csv` : `${S.shop}-daily-${a}_to_${b > S.today ? S.today : b}.csv`;
  const dl = previewDownloads ? await previewDownloads.catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename, data: csv }); toast('ส่งออก CSV แล้ว'); }
    catch (e) { if (e?.code !== 'declined') toast('ส่งออกไฟล์ไม่ได้ในหน้านี้', 'bad'); }
    return;
  }
  if (framed) { toast('หน้าตัวอย่างนี้ดาวน์โหลดไฟล์ไม่ได้ ในแอปจริงกดได้ปกติ', 'warn'); return; }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('ส่งออก CSV แล้ว');
}

// =====================================================================
// หน้าตั้งค่า
// =====================================================================
function studentUrl() {
  const u = new URL('order.html', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('s', S.shop);
  const qs = new URLSearchParams(location.search);
  if (qs.has('demo')) u.searchParams.set('demo', '1');
  if (qs.has('emulator')) u.searchParams.set('emulator', '1');
  return u.href;
}

function renderSettings() {
  const el = $('#scr-settings');
  if (isTyping(el)) return;
  const st = S.settings;
  const d = S.menuDraft;
  const pp = M.promptpayTarget(st.promptpay);
  const theme = pref('theme', 'system');
  const row = (label, sub, control) => `<div class="set-row"><span class="set-txt"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>${control}</div>`;
  const sw = (on, act, label) => `<button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="${label}" data-act="${act}"></button>`;
  el.innerHTML = `
    <div class="set-wrap">
    <section class="set-group">
      <h2 class="group-h">ร้าน</h2>
      <div class="card form">
        <div class="shop-id">
          <span class="mark lg" style="--mark:${esc(st.color || '#1D5BD8')}">${esc(st.mark || 'ร')}</span>
          <span class="set-txt"><b class="shop-name">${nameHtml(st.name)}</b><small>เครื่องนี้ใช้กับร้านนี้</small></span>
          <button class="btn sm" type="button" data-act="switch-shop">${icon('swap')}เปลี่ยนร้าน</button>
        </div>
        <label class="field"><span>ชื่อร้าน</span><input id="setName" type="text" data-set="name" maxlength="40" value="${esc(st.name)}"></label>
        <div class="field"><span>แบบของร้าน</span>
          <div class="seg mode" role="group" aria-label="แบบของร้าน">
            <button class="${isRecord() ? 'on' : ''}" type="button" data-act="shop-mode" data-v="record" aria-pressed="${isRecord()}">จดเฉยๆ</button>
            <button class="${!isRecord() ? 'on' : ''}" type="button" data-act="shop-mode" data-v="kitchen" aria-pressed="${!isRecord()}">จดเพื่อทำ (มีคิว)</button>
          </div>
          <p class="hint-text">${isRecord()
            ? 'กดเมนูแล้วกด เงินสด/โอน = บันทึกการขายทันที ไม่มีคิว เหมาะกับร้านที่ตักให้เลย อยากรู้แค่ว่าขายอะไรไปเท่าไหร่'
            : 'ออเดอร์เข้าคิวรอทำ แตะเสร็จทีละรายการ เหมาะกับร้านที่ต้องทำทีละชาม และเปิดให้นักเรียนสั่งเองผ่านมือถือได้'}</p>
        </div>
        ${isRecord() ? '' : row('มีให้เลือก "กลับบ้าน"', st.takeaway !== false ? 'หัวใบมีปุ่ม ทานที่ร้าน / กลับบ้าน' : 'ทานที่ร้านอย่างเดียว', sw(st.takeaway !== false, 'takeaway', 'มีให้เลือกกลับบ้าน'))}
        ${isRecord() ? '' : row('เตือนเมื่อออเดอร์ค้างเกิน', 'การ์ดในหน้าคิวจะเป็นสีแดง', `<div class="stepper">
          <button type="button" data-act="overdue" data-d="-1" aria-label="ลด">${icon('minus')}</button>
          <output class="tnum">${+st.overdueMin || 10}</output>
          <button type="button" data-act="overdue" data-d="1" aria-label="เพิ่ม">${icon('plus')}</button>
        </div><span class="unit">นาที</span>`)}
        <label class="field"><span>ปุ่มหมายเหตุด่วน (คั่นด้วยจุลภาค ,)</span><input id="setNotes" type="text" data-set="quickNotes" value="${esc((st.quickNotes || []).join(', '))}"></label>
      </div>
    </section>

    ${isRecord() ? '' : `<section class="set-group">
      <h2 class="group-h">นักเรียนสั่งเองผ่านมือถือ</h2>
      <div class="card form">
        ${row('เปิดให้สแกนสั่งเอง', st.qrOrdering !== false ? 'มีโปสเตอร์ QR ให้นักเรียนสแกนสั่ง ออเดอร์เข้าคิวทันที' : 'ปิดอยู่ · นักเรียนสั่งที่หน้าร้านอย่างเดียว', sw(st.qrOrdering !== false, 'qr-ordering', 'เปิดให้นักเรียนสั่งเอง'))}
        ${st.qrOrdering === false ? '' : `
        ${row('รับออเดอร์ตอนนี้', st.qrOpen !== false ? 'เปิดอยู่' : 'ปิดชั่วคราว · นักเรียนจะเห็นว่าร้านปิดรับ', sw(st.qrOpen !== false, 'qr-open', 'รับออเดอร์จาก QR ตอนนี้'))}
        <label class="field"><span>เลขพร้อมเพย์ของร้าน (ไม่บังคับ)</span>
          <input id="setPromptpay" type="tel" inputmode="numeric" data-set="promptpay" maxlength="20" placeholder="ว่างไว้ = ใช้ป้าย QR หน้าร้าน" value="${esc(st.promptpay || '')}">
        </label>
        <p class="hint-text">${st.promptpay
          ? (pp ? `${icon('check', 'sm')} ใช้ได้ · นักเรียนจะเห็น QR ยอดพอดีในมือถือ`
            : `<span class="err">${icon('alert', 'sm')} เลขนี้ใช้ไม่ได้ ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก</span>`)
          : 'ว่างไว้: หลังสั่ง นักเรียนจะเห็นยอดเงิน และให้สแกน QR พร้อมเพย์ที่ป้ายหน้าร้าน'}</p>
        ${st.promptpay ? `<label class="field"><span>ชื่อบัญชี (ให้นักเรียนเช็คก่อนโอน)</span><input id="setPpName" type="text" data-set="promptpayName" maxlength="40" placeholder="เช่น นาย สมชาย ใจดี" value="${esc(st.promptpayName || '')}"></label>` : ''}
        <div class="row-btns">
          <button class="btn primary" type="button" data-act="go" data-to="poster">${icon('qr')}โปสเตอร์ QR สั่งอาหาร</button>
          <a class="btn" href="${esc(studentUrl())}" target="_blank" rel="noopener">${icon('link')}เปิดหน้านักเรียน</a>
        </div>`}
      </div>
    </section>`}

    <section class="set-group">
      <div class="group-h"><h2>เมนู</h2><button class="btn primary sm" type="button" data-act="menu-new">${icon('plus')}เพิ่มเมนู</button></div>
      <div class="card menu-card">
        <p class="small-note">แตะเมนูเพื่อแก้ไข (ชื่อ ราคา ตัวเลือก) · ไอคอนตา = ซ่อน/แสดง · ลำดับในนี้ = ลำดับปุ่มบนหน้าจด</p>
        ${d && !d.id ? menuEditor(d) : ''}
        ${M.groupByCategory(S.menu, M.bySort).map(([cat, list]) => `<h3 class="cat">${esc(cat)}</h3><div>` +
          list.map((m) => (d?.id === m.id ? menuEditor(d) : menuRow(m))).join('') + '</div>').join('')}
      </div>
    </section>

    <section class="set-group">
      <h2 class="group-h">เครื่องนี้</h2>
      <div class="card form">
        ${row('หน้าตา', '', `<div class="seg theme" role="group" aria-label="ธีม">${[['system', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']].map(([k, t]) =>
          `<button class="${theme === k ? 'on' : ''}" type="button" data-act="theme" data-v="${k}" aria-pressed="${theme === k}">${t}</button>`).join('')}</div>`)}
        ${row('เสียงเตือนออเดอร์ QR', 'ดังเมื่อมีออเดอร์ใหม่หรือมีคนแจ้งโอน', `<button class="btn sm" type="button" data-act="test-sound">${icon('sound')}ลอง</button>${sw(pref('sound', '1') === '1', 'sound', 'เสียงเตือน')}`)}
        ${row('ไม่ให้จอดับ', 'ระหว่างเปิดแอปนี้', sw(pref('wake', '1') === '1', 'wake', 'ไม่ให้จอดับ'))}
      </div>
    </section>

    <section class="set-group">
      <h2 class="group-h">บัญชี</h2>
      <div class="card form">
        ${S.mode === 'demo'
          ? `<p>โหมดทดลอง: ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ใส่ค่าใน <code>firebase-config.js</code> เพื่อใช้จริงและซิงก์ข้ามเครื่อง</p>
             <div class="row-btns">${confirmBtn('demo-reset', `${icon('trash')}ล้างข้อมูลทดลองของร้านนี้`, 'แตะอีกครั้งเพื่อล้าง', 'danger', 'demo-reset')}</div>`
          : `<p>เข้าสู่ระบบเป็น <b>${esc(S.user?.email)}</b></p>
             <div class="row-btns">${confirmBtn('logout', `${icon('logout')}ออกจากระบบ`, 'แตะอีกครั้งเพื่อออก', '', 'logout')}</div>`}
      </div>
    </section>
    <p class="ver tnum">เวอร์ชัน ${APP_VERSION} · ${S.mode === 'demo' ? 'โหมดทดลอง' : 'Firebase: ' + esc(data.projectId)} · ร้าน ${esc(S.shop)}</p>
    </div>`;
}

function menuRow(m) {
  const off = m.active === false;
  const opts = (m.options || []).length ? (m.options || []).map((g) => esc(g.name)).join(', ') : 'ไม่มีตัวเลือก';
  return `<div class="mrow${off ? ' off' : ''}">
    <button class="mrow-main" type="button" data-act="menu-edit" data-id="${esc(m.id)}">
      <span class="swatch" style="--tile:${M.tileColor(m)}"></span>
      <span class="mrow-txt"><b>${esc(m.name)}</b><small>${opts}${off ? ' · ซ่อนอยู่' : ''}</small></span>
      <span class="mrow-price tnum">${M.fmtMoney(m.price)}</span>
    </button>
    <button class="iconbtn" type="button" data-act="menu-hide" data-id="${esc(m.id)}" aria-label="${off ? 'แสดงเมนูนี้' : 'ซ่อนเมนูนี้'}">${icon(off ? 'eye-off' : 'eye')}</button>
  </div>`;
}

function menuEditor(d) {
  const cats = [...new Set(S.menu.map((m) => m.category).filter(Boolean))];
  const cur = M.tileColor({ name: d.name, category: d.category, color: d.color });
  const groups = d.options.map((g, gi) => `
    <div class="og">
      <div class="og-head">
        <input class="input" type="text" data-g="${gi}" data-gf="name" value="${esc(g.name)}" placeholder="ชื่อกลุ่ม เช่น ขนาด" aria-label="ชื่อกลุ่มตัวเลือก">
        <div class="seg">
          <button class="${!g.multi ? 'on' : ''}" type="button" data-act="og-type" data-g="${gi}" data-v="0">เลือก 1</button>
          <button class="${g.multi ? 'on' : ''}" type="button" data-act="og-type" data-g="${gi}" data-v="1">หลายอย่าง</button>
        </div>
        <button class="iconbtn" type="button" data-act="og-del" data-g="${gi}" aria-label="ลบกลุ่มนี้">${icon('trash')}</button>
      </div>
      ${!g.multi ? `<label class="og-key"><input type="checkbox" data-act-change="og-key" data-g="${gi}" ${g.key ? 'checked' : ''}> แสดงในใบสั่งเสมอ แม้เป็นค่าปกติ (เช่น เส้น)</label>` : ''}
      ${g.choices.map((c, ci) => `
        <div class="choice-row">
          ${!g.multi ? `<button class="def${(+g.def || 0) === ci ? ' on' : ''}" type="button" data-act="og-def" data-g="${gi}" data-c="${ci}" aria-label="ตั้งเป็นค่าเริ่มต้น" title="ค่าเริ่มต้น">${icon('star')}</button>` : ''}
          <input class="input" type="text" data-g="${gi}" data-c="${ci}" data-cf="name" value="${esc(c.name)}" placeholder="ชื่อตัวเลือก" aria-label="ชื่อตัวเลือก">
          <label class="price-in">+฿<input type="text" inputmode="numeric" data-g="${gi}" data-c="${ci}" data-cf="price" value="${+c.price || 0}" aria-label="ราคาเพิ่ม"></label>
          <button class="iconbtn" type="button" data-act="oc-del" data-g="${gi}" data-c="${ci}" aria-label="ลบตัวเลือก">${icon('x')}</button>
        </div>`).join('')}
      <button class="btn sm ghost" type="button" data-act="oc-add" data-g="${gi}">${icon('plus')}ตัวเลือก</button>
    </div>`).join('');

  return `<div class="editor" id="menuEditor">
    <label class="field"><span>ชื่อเมนู</span><input id="mdName" type="text" data-d="name" maxlength="30" value="${esc(d.name)}" placeholder="เช่น ข้าวขาหมู"></label>
    <div class="field-row">
      <label class="field"><span>ราคา (บาท)</span><input id="mdPrice" type="text" inputmode="numeric" data-d="price" value="${esc(d.price)}"></label>
      <label class="field"><span>หมวดหมู่</span><input id="mdCat" type="text" data-d="category" list="catList" value="${esc(d.category)}"></label>
    </div>
    <datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <label class="field"><span>คำอธิบายสั้น (หน้านักเรียน)</span><input id="mdDesc" type="text" data-d="desc" maxlength="60" value="${esc(d.desc || '')}" placeholder="เช่น ขาหมูพะโล้ ผักกาดดอง"></label>
    <div class="field"><span>สีประจำเมนู</span>
      <div class="colors" role="group" aria-label="สีเมนู">${M.TILE_COLORS.map((c) =>
        `<button class="color-opt${c.hex === cur ? ' on' : ''}" type="button" data-act="tile-color" data-c="${c.id}" style="--tile:${c.hex}" aria-pressed="${c.hex === cur}" aria-label="${c.name}" title="${c.name}">${c.hex === cur ? icon('check') : ''}</button>`).join('')}</div>
    </div>
    <h4>ตัวเลือก</h4>
    <p class="small-note">ดาว = ค่าเริ่มต้น (แตะเมนูแล้วได้ตัวนี้เลย) · 2 กลุ่มแรกอยู่ในแถบตัวเลือก ที่เหลืออยู่ใต้ปุ่ม "เพิ่มเติม"</p>
    ${groups || '<p class="hint">ไม่มีตัวเลือก (เช่น เครื่องดื่ม)</p>'}
    <div class="row-btns">
      <button class="btn sm" type="button" data-act="og-add">${icon('plus')}กลุ่มตัวเลือก</button>
      ${OPTION_PRESETS.map((p) => `<button class="btn sm" type="button" data-act="og-preset" data-p="${p.id}">ใช้${esc(p.label)}</button>`).join('')}
    </div>
    ${d.id ? `<div class="row-btns">
      <button class="btn sm" type="button" data-act="menu-move" data-id="${esc(d.id)}" data-d="-1">${icon('up')}เลื่อนขึ้น</button>
      <button class="btn sm" type="button" data-act="menu-move" data-id="${esc(d.id)}" data-d="1">${icon('down')}เลื่อนลง</button>
      ${confirmBtn('copy-opts', 'ใช้ตัวเลือกนี้กับทั้งหมวด', 'แตะอีกครั้ง = ทับทั้งหมวด', 'sm', 'opts-copy')}
    </div>` : ''}
    <div class="row-btns end">
      ${d.id ? confirmBtn('mdel:' + d.id, `${icon('trash')}ลบเมนู`, 'แตะอีกครั้งเพื่อลบ', 'danger', 'menu-del', d.id) : ''}
      <span class="grow"></span>
      <button class="btn" type="button" data-act="menu-close">ยกเลิก</button>
      <button class="btn primary" type="button" data-act="menu-save">${icon('check')}บันทึกเมนู</button>
    </div>
  </div>`;
}

function openMenuEditor(id) {
  const m = id && S.menu.find((x) => x.id === id);
  S.menuDraft = m
    ? JSON.parse(JSON.stringify({ id: m.id, name: m.name, price: m.price, category: m.category || '', desc: m.desc || '', color: m.color || '', options: m.options || [], active: m.active !== false, sortOrder: m.sortOrder ?? 0 }))
    : { name: '', price: '', category: S.menu[0]?.category || 'ข้าว', desc: '', color: '', options: presetGroups(S.shop === 'noodle' ? 'noodle' : 'rice'), active: true };
  renderSettings();
  $('#menuEditor')?.scrollIntoView({ block: 'nearest' });
}

function updateDraft(t) {
  const d = S.menuDraft;
  if (!d) return;
  if (t.dataset.d) d[t.dataset.d] = t.value;
  else if (t.dataset.gf) d.options[+t.dataset.g][t.dataset.gf] = t.value;
  else if (t.dataset.cf) d.options[+t.dataset.g].choices[+t.dataset.c][t.dataset.cf] = t.value;
}

const toPrice = (v) => Math.max(0, Math.round(+String(v).replace(/[^\d.]/g, '') || 0));
function cleanOptions(groups) {
  return groups.map((g) => {
    const seen = new Set();
    const choices = g.choices
      .map((c) => ({ name: String(c.name || '').trim(), price: toPrice(c.price) }))
      .filter((c) => c.name && !seen.has(c.name) && seen.add(c.name));
    const out = { name: String(g.name || '').trim() || 'ตัวเลือก', multi: !!g.multi, def: g.multi ? 0 : Math.min(+g.def || 0, Math.max(0, choices.length - 1)), choices };
    if (!g.multi && g.key) out.key = true;
    return out;
  }).filter((g) => g.choices.length);
}

function saveMenuDraft() {
  const d = S.menuDraft;
  const name = String(d.name || '').trim();
  if (!name) { toast('ใส่ชื่อเมนูก่อน', 'bad'); return; }
  const item = {
    name,
    price: toPrice(d.price),
    category: String(d.category || '').trim() || 'อื่นๆ',
    desc: String(d.desc || '').trim(),
    color: d.color || '',
    options: cleanOptions(d.options),
    active: d.active !== false,
    sortOrder: d.id ? d.sortOrder : Math.max(0, ...S.menu.map((m) => m.sortOrder || 0)) + 10,
  };
  if (d.id) item.id = d.id;
  data.saveMenuItem(item);
  S.menuDraft = null;
  toast(`บันทึกเมนู "${name}" แล้ว`);
  renderSettings();
}

function moveMenu(id, dir) {
  const list = [...S.menu].sort(M.bySort);
  const m = list.find((x) => x.id === id);
  if (!m) return;
  const same = list.filter((x) => (x.category || 'อื่นๆ') === (m.category || 'อื่นๆ'));
  const j = same.indexOf(m) + dir;
  if (j < 0 || j >= same.length) return;
  const other = same[j];
  const a = list.indexOf(m), b = list.indexOf(other);
  [list[a], list[b]] = [list[b], list[a]];
  data.reorderMenu(list.map((x, i) => ({ id: x.id, sortOrder: (i + 1) * 10 })));
  if (S.menuDraft?.id === id) S.menuDraft.sortOrder = (b + 1) * 10;
}

function copyOptionsToCategory() {
  const d = S.menuDraft;
  if (!d?.id || !confirmTap('copy-opts')) return;
  const options = cleanOptions(d.options);
  const cat = String(d.category || '').trim();
  const targets = S.menu.filter((m) => m.id !== d.id && (m.category || '') === cat);
  for (const m of targets) {
    const { id, ...rest } = m;
    data.saveMenuItem({ id, ...rest, options });
  }
  toast(`ใช้ตัวเลือกนี้กับ ${targets.length} เมนูในหมวด "${cat}" แล้ว`);
}

function saveSettingField(t) {
  const k = t.dataset.set;
  const v = t.value.trim();
  if (k === 'name') data.saveShop({ name: v || seedFor(S.shop).settings.name });
  if (k === 'quickNotes') data.saveShop({ quickNotes: v.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 12) });
  if (k === 'promptpay') data.saveShop({ promptpay: v.replace(/[^\d-]/g, '') });
  if (k === 'promptpayName') data.saveShop({ promptpayName: v });
  toast('บันทึกแล้ว');
}

// =====================================================================
// โปสเตอร์ QR ให้นักเรียนสแกน
// =====================================================================
function renderPoster() {
  const el = $('#scr-poster');
  const st = S.settings;
  const url = studentUrl();
  el.innerHTML = `<div class="poster-wrap">
    <div class="poster" id="poster">
      <div class="pp-head">
        <span class="mark lg" style="--mark:${esc(st.color || '#1D5BD8')}">${esc(st.mark || 'ร')}</span>
        <div><small>สั่งอาหารผ่านมือถือ</small><h1>${esc(st.name)}</h1></div>
      </div>
      <div class="pp-qr">${qrSVG(url, { ecl: 'Q', margin: 1, label: 'QR สำหรับสั่งอาหาร' })}</div>
      <ol class="pp-steps">
        <li><b>สแกน</b><span>เลือกเมนูที่อยากกิน</span></li>
        <li><b>จ่ายพร้อมเพย์</b><span>QR ยอดพอดีขึ้นให้เลย</span></li>
        <li><b>รอเรียกคิว</b><span>รับที่หน้าร้าน</span></li>
      </ol>
      <p class="pp-foot">ไม่ต้องโหลดแอป · ไม่ต้องสมัครสมาชิก</p>
    </div>
    <div class="poster-tools">
      ${framed ? '' : `<button class="btn primary" type="button" data-act="print">${icon('print')}พิมพ์โปสเตอร์</button>`}
      <button class="btn" type="button" data-act="copy-link">${icon('copy')}คัดลอกลิงก์</button>
      <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('link')}เปิดดู</a>
    </div>
    ${S.mode === 'demo' ? `<div class="note warn">${icon('info')}<span>โหมดทดลอง: QR นี้ใช้ได้เฉพาะบนเครื่องนี้ พอต่อ Firebase และขึ้นเว็บจริงแล้ว QR จะเป็นลิงก์ที่มือถือทุกเครื่องเปิดได้</span></div>` : ''}
    <p class="link-text" id="linkText">${esc(url)}</p>
  </div>`;
}

async function copyLink() {
  const url = studentUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์แล้ว');
  } catch {
    const t = $('#linkText');
    if (t) {
      const r = document.createRange();
      r.selectNodeContents(t);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    toast('คัดลอกไม่ได้ เลือกข้อความลิงก์ไว้ให้แล้ว', 'warn');
  }
}

// =====================================================================
// ปุ่มทั้งหมด (event delegation)
// =====================================================================
const ACTIONS = {
  go: (el) => go(el.dataset.to),
  'pick-shop': (el) => openShop(el.dataset.id),
  'switch-shop': () => { S.screen = 'order'; showPicker(); },
  'sync-info': () => toast(syncState().info, S.sync.online || S.mode === 'demo' ? 'info' : 'warn'),
  'toast-action': () => {
    const f = S.toastAction;
    S.toastAction = null;
    $('#toast').className = 'toast';
    f?.();
  },

  // จดออเดอร์
  add: (el) => addMenu(el.dataset.id),
  sel: (el) => { S.cart.sel = el.dataset.key; S.moreOpen = false; renderOrder(); },
  qty: (el) => changeQty(+el.dataset.d),
  opt: (el) => setOpt(+el.dataset.g, +el.dataset.c),
  more: () => { S.moreOpen = !S.moreOpen && !!selLine(); renderOrder(); },
  qnote: (el) => toggleQuickNote(+el.dataset.i),
  undo,
  save: (el) => saveOrder(el.dataset.pm),
  clear: () => {
    if (!confirmTap('clear')) return;
    pushUndo();
    S.cart.lines = [];
    S.cart.sel = null;
    commitCart();
  },
  otype: (el) => {
    if (S.cart.type === el.dataset.v) return;
    pushUndo();
    S.cart.type = el.dataset.v;
    commitCart();
  },
  name: () => {
    S.nameEdit = true;
    renderTicket();
    const i = $('#nameInput');
    i?.focus();
    i?.select();
  },
  'edit-cancel': () => { finishEdit(); go('queue'); },

  // คิว
  serve: (el) => toggleServed(el.dataset.id, +el.dataset.i),
  'serve-all': (el) => serveAll(el.dataset.id),
  pay: (el) => setPaid(el.dataset.id, el.dataset.m),
  edit: (el) => startEdit(el.dataset.id),
  cancel: (el) => cancelOrder(el.dataset.id),
  restore: (el) => restoreOrder(el.dataset.id),
  'done-toggle': (el) => {
    const id = el.dataset.id;
    if (S.openDone.has(id)) S.openDone.delete(id); else S.openDone.add(id);
    renderQueue();
  },
  'toggle-cancelled': () => { S.showCancelled = !S.showCancelled; renderQueue(); },
  'shop-mode': (el) => {
    const mode = el.dataset.v === 'record' ? 'record' : 'kitchen';
    if (mode === S.settings.mode) return;
    const patch = mode === 'record' ? { mode, qrOrdering: false, qrOpen: false } : { mode };
    Object.assign(S.settings, patch);
    data.saveShop(patch);
    toast(mode === 'record' ? 'เปลี่ยนเป็นร้านแบบจดเฉยๆ แล้ว' : 'เปลี่ยนเป็นร้านแบบจดเพื่อทำ (มีคิว) แล้ว');
    renderAll();
  },
  takeaway: () => {
    const on = S.settings.takeaway === false;
    S.settings.takeaway = on;
    data.saveShop({ takeaway: on });
    if (!on) { S.cart.type = 'dine'; persistCart(); }
    renderAll();
  },
  'qr-ordering': () => {
    const on = S.settings.qrOrdering === false;
    const patch = { qrOrdering: on, qrOpen: on };
    Object.assign(S.settings, patch);
    data.saveShop(patch);
    toast(on ? 'เปิดให้นักเรียนสั่งเองผ่านมือถือแล้ว' : 'ปิดการสั่งผ่านมือถือแล้ว', on ? 'ok' : 'warn');
    renderAll();
  },
  'qr-open': () => {
    const on = S.settings.qrOpen === false;
    S.settings.qrOpen = on;
    data.saveShop({ qrOpen: on });
    toast(on ? 'เปิดรับออเดอร์จาก QR แล้ว' : 'ปิดรับออเดอร์จาก QR ชั่วคราว', on ? 'ok' : 'warn');
    renderAll();
  },

  // สรุปยอด
  range: (el) => setRange(el.dataset.r),
  'day-step': (el) => stepDay(+el.dataset.d),
  'sum-day': (el) => drill('day', el.dataset.k),
  'sum-month': (el) => drill('month', el.dataset.k),
  csv: exportCSV,

  // ตั้งค่า
  overdue: (el) => {
    const v = Math.min(120, Math.max(1, (+S.settings.overdueMin || 10) + +el.dataset.d));
    S.settings.overdueMin = v;
    data.saveShop({ overdueMin: v });
    renderSettings();
  },
  theme: (el) => { setPref('theme', el.dataset.v); applyTheme(); renderSettings(); },
  sound: () => { setPref('sound', pref('sound', '1') === '1' ? '0' : '1'); renderSettings(); },
  'test-sound': () => { unlockAudio(); const was = pref('sound', '1'); setPref('sound', '1'); chime('new'); setPref('sound', was); },
  wake: () => { setPref('wake', pref('wake', '1') === '1' ? '0' : '1'); updateWake(); renderSettings(); },
  print: () => window.print(),
  'copy-link': copyLink,
  'menu-new': () => openMenuEditor(null),
  'menu-edit': (el) => openMenuEditor(el.dataset.id),
  'menu-close': () => { S.menuDraft = null; renderSettings(); },
  'menu-save': saveMenuDraft,
  'menu-del': (el) => {
    const id = el.dataset.id;
    if (!confirmTap('mdel:' + id)) return;
    data.deleteMenuItem(id);
    S.menuDraft = null;
    toast('ลบเมนูแล้ว', 'bad');
  },
  'menu-hide': (el) => {
    const m = S.menu.find((x) => x.id === el.dataset.id);
    if (!m) return;
    const { id, ...rest } = m;
    data.saveMenuItem({ id, ...rest, active: m.active === false });
    toast(m.active === false ? `แสดง "${m.name}" แล้ว` : `ซ่อน "${m.name}" แล้ว`);
  },
  'menu-move': (el) => moveMenu(el.dataset.id, +el.dataset.d),
  'opts-copy': copyOptionsToCategory,
  'og-add': () => { S.menuDraft.options.push({ name: '', multi: false, def: 0, choices: [{ name: '', price: 0 }] }); renderSettings(); },
  'og-preset': (el) => { S.menuDraft.options = presetGroups(el.dataset.p); renderSettings(); },
  'tile-color': (el) => { S.menuDraft.color = el.dataset.c; renderSettings(); },
  'og-del': (el) => { S.menuDraft.options.splice(+el.dataset.g, 1); renderSettings(); },
  'og-type': (el) => { S.menuDraft.options[+el.dataset.g].multi = el.dataset.v === '1'; renderSettings(); },
  'og-def': (el) => { S.menuDraft.options[+el.dataset.g].def = +el.dataset.c; renderSettings(); },
  'oc-add': (el) => { S.menuDraft.options[+el.dataset.g].choices.push({ name: '', price: 0 }); renderSettings(); },
  'oc-del': (el) => {
    const g = S.menuDraft.options[+el.dataset.g];
    g.choices.splice(+el.dataset.c, 1);
    if ((+g.def || 0) >= g.choices.length) g.def = 0;
    renderSettings();
  },
  logout: () => { if (confirmTap('logout')) data.logout(); },
  'demo-reset': () => {
    if (!confirmTap('demo-reset')) return;
    data.resetDemo();
    S.seeded = false;
    S.seenQr = null;
    S.cart = emptyCart();
    S.stash = null;
    S.undo = [];
    persistCart();
    toast('ล้างข้อมูลทดลองแล้ว', 'bad');
  },
};

function bindEvents() {
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    // กดปุ่มระหว่างพิมพ์: ปิดคีย์บอร์ดก่อน เพื่อให้หน้าจอวาดใหม่ได้
    const ae = document.activeElement;
    if (ae && ae !== el && ae.matches('input, textarea')) ae.blur();
    ACTIONS[el.dataset.act]?.(el, e);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'noteInput') {
      const l = selLine();
      if (l) { l.note = t.value.slice(0, 80); persistCart(); }
    } else if (t.id === 'nameInput') {
      S.cart.name = t.value.replace(/\s+/g, ' ').slice(0, 12);
      persistCart();
    } else if (t.closest('#menuEditor') && t.type !== 'checkbox') {
      updateDraft(t);
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.set) saveSettingField(t);
    else if (t.dataset.actChange === 'og-key') {
      const g = S.menuDraft?.options[+t.dataset.g];
      if (g) g.key = t.checked;
    } else if (t.id === 'sumDate' && t.value) {
      S.sum.at = t.value > S.today ? S.today : t.value;
      t.blur();
      loadSummary();
      renderSummary();
    }
  });

  document.addEventListener('focusout', (e) => {
    const id = e.target.id;
    if (id === 'nameInput') { S.nameEdit = false; setTimeout(() => { if (S.screen === 'order') renderTicket(); }, 0); }
    if (id === 'noteInput') setTimeout(() => { if (S.screen === 'order') renderOrder(); }, 0);
    if (e.target.closest?.('#scr-settings')) setTimeout(() => { if (S.screen === 'settings' && !isTyping($('#scr-settings'))) renderSettings(); }, 0);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('#nameInput, #noteInput, [data-set]')) e.target.blur();
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const err = $('#loginErr');
    btn.disabled = true;
    btn.textContent = 'กำลังเข้าสู่ระบบ…';
    err.textContent = '';
    try {
      await data.login($('#loginEmail').value, $('#loginPass').value);
      $('#loginPass').value = '';
    } catch (er) {
      err.textContent = er.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'เข้าสู่ระบบ';
    }
  });

  document.addEventListener('visibilitychange', updateWake);
}

function applyTheme() {
  const t = pref('theme', 'system');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---------- ไม่ให้จอดับระหว่างใช้งาน ----------
let wakeLock = null;
async function updateWake() {
  const want = !!S.user && pref('wake', '1') === '1' && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* เบราว์เซอร์ไม่อนุญาต ไม่เป็นไร */ }
}

// ---------- PWA: ลงทะเบียน service worker (ไม่ทำตอนถูกฝังในกรอบ เช่นหน้าพรีวิว) ----------
function registerSW() {
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure && !framed) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
}

boot();
