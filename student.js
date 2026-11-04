// student.js — หน้าสั่งอาหารของนักเรียน (เปิดจากการสแกน QR ที่ร้าน: order.html?s=<รหัสร้าน>)
// เลือกเมนู → ตะกร้า → สั่ง (เข้าคิวร้านทันที) → จ่ายพร้อมเพย์ด้วย QR ยอดพอดี → ติดตามสถานะจนพร้อมรับ

import * as data from './data.js';
import * as M from './model.js';
import { SHOPS, shopById, seedFor } from './shops.js';
import { injectSprite, icon } from './icons.js';
import { qrSVG, qrCanvas } from './qr.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const buzz = (p = 12) => { try { navigator.vibrate?.(p); } catch { /* ไม่รองรับ */ } };
const nameHtml = (s) => esc(s).split(' ').filter(Boolean).map((w) => `<span class="w">${w}</span>`).join(' ');
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ไม่เป็นไร */ } },
};

const S = {
  mode: 'demo',
  shop: '',
  user: null,
  settings: null,
  shopLoaded: false,
  menu: [],
  menuLoaded: false,
  view: 'menu',          // 'menu' | 'track'
  cart: { lines: [], type: 'dine', name: '' },
  sheet: null,           // { kind: 'item', draft } | { kind: 'cart' }
  mine: [],              // ออเดอร์ของฉันวันนี้ [{ id, number, dateKey }]
  trackId: null,
  track: null,           // ออเดอร์ที่กำลังติดตาม (สด)
  placing: false,
  toastAction: null,
};

const cartKey = () => 'so.scart.' + S.shop;
const mineKey = () => 'so.mine.' + S.shop;
const saveCart = () => store.set(cartKey(), S.cart);

// =====================================================================
// เริ่มหน้า
// =====================================================================
async function boot() {
  injectSprite();
  bindEvents();
  // รหัสร้านจากลิงก์ QR: order.html?s=khaomoo (หรือ order.html#khaomoo)
  const id = new URLSearchParams(location.search).get('s') || decodeURIComponent(location.hash.slice(1));
  if (!shopById(id)) { showShopList(); return; }
  S.shop = id;
  S.cart = { lines: [], type: 'dine', name: '', ...store.get(cartKey(), {}) };
  S.mine = store.get(mineKey(), []).filter((o) => o.dateKey === M.thaiDateKey());
  store.set(mineKey(), S.mine);
  try {
    S.mode = await data.init({ role: 'customer' });
  } catch (e) {
    console.error(e);
    $('#bootMsg').innerHTML = 'เปิดหน้าสั่งอาหารไม่สำเร็จ<br><small>ลองเช็กอินเทอร์เน็ตแล้วโหลดใหม่</small><br><br><button class="btn primary" type="button" onclick="location.reload()">โหลดใหม่</button>';
    return;
  }
  data.onError((msg) => toast(msg, 'bad'));
  data.useShop(id);
  let started = false;
  data.onAuth((user) => {
    S.user = user;
    if (!user || started) return;
    started = true;
    start();
  });
}

function start() {
  data.watchShop((s, meta) => {
    if (!s && S.mode === 'demo' && !meta.fromCache) {
      // โหมดทดลอง: ถ้ายังไม่มีร้านในเครื่องนี้ ใส่ข้อมูลตั้งต้นให้เลย หน้าจะได้ลองได้ทันที
      const seed = seedFor(S.shop);
      data.seedShop(seed.settings, seed.menu);
      return;
    }
    S.settings = s;
    S.shopLoaded = true;
    document.title = s ? `สั่งอาหาร · ${s.short || s.name}` : 'สั่งอาหาร';
    render();
  });
  data.watchMenu((list) => {
    S.menu = list.sort(M.bySort);
    S.menuLoaded = true;
    render();
  });
  const last = S.mine[S.mine.length - 1];
  if (last) openTrack(last.id, false);
  else render();
}

function showShopList() {
  $('#boot').hidden = true;
  $('#app').hidden = false;
  $('#view').innerHTML = `<div class="s-wrap s-pick">
    <h1>เลือกร้าน</h1>
    <p class="muted">ลิงก์นี้ไม่ได้ระบุร้าน เลือกร้านที่ต้องการสั่ง</p>
    ${SHOPS.map((s) => `<a class="shop-link card" href="?s=${s.id}${location.search.includes('demo') ? '&demo=1' : ''}">
      <span class="mark lg" style="--mark:${s.color}">${esc(s.mark)}</span><b>${esc(s.name)}</b>${icon('next')}</a>`).join('')}
  </div>`;
}

// =====================================================================
// วาดหน้า
// =====================================================================
function render() {
  if (!S.shopLoaded || !S.menuLoaded) return;
  $('#boot').hidden = true;
  $('#app').hidden = false;
  if (S.view === 'track') renderTrack();
  else renderMenu();
  renderCartBar();
  if (S.sheet) renderSheet();
}

const qrEnabled = () => S.settings?.qrOrdering !== false && S.settings?.mode !== 'record';
const qrOpen = () => qrEnabled() && S.settings?.qrOpen !== false;
const takeawayOn = () => S.settings?.takeaway !== false;
const closedMsg = () => (qrEnabled() ? 'ร้านปิดรับออเดอร์ทางมือถือชั่วคราว' : 'ร้านนี้สั่งที่หน้าร้านเท่านั้น');
const activeMenu = () => S.menu.filter((m) => m.active !== false);
const menuById = (id) => S.menu.find((m) => m.id === id);
const cartQty = (menuId) => S.cart.lines.filter((l) => l.menuId === menuId).reduce((s, l) => s + l.qty, 0);

function shopHead() {
  const st = S.settings;
  const q = +st.queue || 0;
  return `<header class="s-head">
    <span class="mark lg" style="--mark:${esc(st.color || '#1D5BD8')}" aria-hidden="true">${esc(st.mark || 'ร')}</span>
    <div class="s-head-txt">
      <h1>${esc(st.name)}</h1>
      <p>${qrOpen()
        ? `<span class="badge ok"><span class="dot live"></span>เปิดรับออเดอร์</span><span class="muted">${q ? `ตอนนี้มี ${q} คิว` : 'ไม่มีคิวรอ'}</span>`
        : `<span class="badge warn">${closedMsg()}</span>`}</p>
    </div>
  </header>`;
}

function renderMenu() {
  const view = $('#view');
  if (!S.settings) {
    view.innerHTML = `<div class="s-wrap"><div class="s-empty card">${icon('store', 'lg')}<h2>ร้านนี้ยังไม่เปิดระบบสั่งอาหาร</h2><p class="muted">สั่งที่หน้าร้านได้ตามปกติ</p></div></div>`;
    return;
  }
  const cats = M.groupByCategory(activeMenu(), M.bySort);
  const live = S.mine.slice().reverse();
  view.innerHTML = `<div class="s-wrap">
    ${shopHead()}
    ${live.length ? `<button class="mine-banner card" type="button" data-act="track" data-id="${esc(live[0].id)}">
        <span class="mine-q tnum">Q${esc(live[0].number)}</span>
        <span class="mine-txt"><b>ออเดอร์ของคุณ</b><small>แตะเพื่อดูสถานะและจ่ายเงิน</small></span>${icon('next')}</button>` : ''}
    <ul class="s-how" aria-label="วิธีสั่ง">
      <li>${icon('cart')}<span>เลือกเมนู</span></li>
      <li>${icon('wallet')}<span>จ่ายพร้อมเพย์</span></li>
      <li>${icon('bell')}<span>รอเรียกคิว รับที่ร้าน</span></li>
    </ul>
    ${!qrOpen() ? `<div class="note warn">${icon('info')}<span>${closedMsg()} ดูเมนูได้ แต่สั่งที่หน้าร้านนะ</span></div>` : ''}
    ${cats.length > 1 ? `<nav class="cat-nav" aria-label="หมวดเมนู">${cats.map(([c], i) => `<button class="cat-chip" type="button" data-act="cat" data-i="${i}">${esc(c)}</button>`).join('')}</nav>` : ''}
    ${cats.map(([c, list], i) => `<section class="s-cat" id="cat-${i}">
      <h2>${esc(c)}</h2>
      <div class="s-list card">${list.map(itemRow).join('')}</div>
    </section>`).join('')}
    ${cats.length ? '' : '<p class="hint">ร้านยังไม่ได้ใส่เมนู</p>'}
    <p class="s-foot">ราคารวมทุกอย่างแล้ว · สั่งแล้วร้านเริ่มทำทันที</p>
  </div>`;
}

function itemRow(m) {
  const q = cartQty(m.id);
  const hasOpts = (m.options || []).some((g) => g.choices?.length);
  return `<button class="s-item" type="button" data-act="item" data-id="${esc(m.id)}" style="--tile:${M.tileColor(m)}" ${qrOpen() ? '' : 'aria-disabled="true"'}>
    <span class="s-item-txt">
      <b>${nameHtml(m.name)}</b>
      ${m.desc ? `<small>${esc(m.desc)}</small>` : ''}
      <span class="s-price tnum">${M.fmtMoney(m.price)}${hasOpts ? '<em>ปรับได้</em>' : ''}</span>
    </span>
    <span class="s-add${q ? ' has' : ''}" aria-label="${q ? 'มีในตะกร้า ' + q : 'เพิ่ม'}">${q ? `<b class="tnum">${q}</b>` : icon('plus')}</span>
  </button>`;
}

// ---------- แถบตะกร้า ----------
function renderCartBar() {
  const bar = $('#cartBar');
  refreshCart();
  const n = M.itemCount(S.cart.lines);
  const show = S.view === 'menu' && n > 0 && !S.sheet;
  bar.hidden = !show;
  document.body.classList.toggle('has-cartbar', show);
  document.documentElement.classList.toggle('has-cartbar', show);
  if (!show) return;
  const total = cartTotal();
  bar.innerHTML = `<button class="cartbar-btn" type="button" data-act="open-cart">
    <span class="cb-n tnum">${n}</span><span class="cb-l">ดูตะกร้า</span><span class="cb-t tnum">${M.fmtMoney(total)}</span>
  </button>`;
}

// อัปเดตราคาในตะกร้าตามเมนูล่าสุด และทำเครื่องหมายรายการที่ร้านซ่อน/ลบไปแล้ว
function refreshCart() {
  for (const l of S.cart.lines) {
    const m = menuById(l.menuId);
    l.gone = !m || m.active === false;
    if (!m) continue;
    l.name = m.name;
    l.basePrice = +m.price || 0;
    l.options = (l.options || []).map((o) => {
      const g = (m.options || []).find((x) => x.name === o.group);
      const c = g?.choices?.find((x) => x.name === o.choice);
      return c ? { ...o, price: +c.price || 0 } : null;
    }).filter(Boolean);
  }
}
const cartTotal = () => S.cart.lines.filter((l) => !l.gone).reduce((s, l) => s + M.unitPrice(l) * l.qty, 0);

// =====================================================================
// แผ่นเลือกตัวเลือก / ตะกร้า (bottom sheet)
// =====================================================================
function openItem(id, lineKey = null) {
  if (!qrOpen() && !lineKey) { toast(closedMsg(), 'warn'); return; }
  const m = menuById(id);
  if (!m) return;
  const line = lineKey && S.cart.lines.find((l) => l.key === lineKey);
  const draft = line
    ? { key: line.key, menuId: m.id, qty: line.qty, options: line.options.slice(), note: line.note || '' }
    : { key: null, menuId: m.id, qty: 1, options: M.defaultOptions(m), note: '' };
  // เมนูไม่มีตัวเลือก: แตะครั้งเดียวใส่ตะกร้าเลย
  if (!line && !(m.options || []).some((g) => g.choices?.length)) {
    addToCart(draft);
    toast(`เพิ่ม ${m.name} แล้ว`);
    return;
  }
  S.sheet = { kind: 'item', draft };
  showSheet();
}

function openCart() {
  S.sheet = { kind: 'cart' };
  showSheet();
}

function showSheet() {
  const wrap = $('#sheet');
  wrap.hidden = false;
  document.body.classList.add('sheet-open');
  renderSheet();
  renderCartBar();
  requestAnimationFrame(() => wrap.classList.add('in'));
}
function closeSheet() {
  const wrap = $('#sheet');
  wrap.classList.remove('in');
  S.sheet = null;
  document.body.classList.remove('sheet-open');
  setTimeout(() => { if (!S.sheet) wrap.hidden = true; }, 200);
  renderCartBar();
  if (S.view === 'menu') renderMenu();
}

function renderSheet() {
  const body = $('#sheetBody');
  if (body.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
  if (S.sheet.kind === 'item') body.innerHTML = itemSheet(S.sheet.draft);
  else body.innerHTML = cartSheet();
}

function draftUnit(d) {
  const m = menuById(d.menuId);
  return M.unitPrice({ basePrice: +m?.price || 0, options: d.options });
}

function itemSheet(d) {
  const m = menuById(d.menuId);
  if (!m) return '';
  const groups = (m.options || []).map((g, gi) => [g, gi]).filter(([g]) => g.choices?.length);
  const quick = S.settings.quickNotes || [];
  const notes = (d.note || '').split(/\s*,\s*/).filter(Boolean);
  const groupHtml = ([g, gi]) => `<fieldset class="opt-group">
    <legend><b>${esc(g.name)}</b><small>${g.multi ? 'เลือกได้หลายอย่าง' : 'เลือก 1 อย่าง'}</small></legend>
    ${g.choices.map((c, ci) => {
      const on = M.isChosen(d.options, g.name, c.name);
      return `<button class="opt-row${on ? ' on' : ''}" type="button" role="${g.multi ? 'checkbox' : 'radio'}" aria-checked="${on}" data-act="opt" data-g="${gi}" data-c="${ci}">
        <span class="${g.multi ? 'box' : 'radio'}" aria-hidden="true">${g.multi && on ? icon('check') : ''}</span>
        <span class="opt-name">${esc(c.name)}</span>
        <span class="opt-price tnum">${+c.price ? '+' + M.fmtMoney(c.price) : ''}</span>
      </button>`;
    }).join('')}
  </fieldset>`;
  return `
    <div class="sh-grab" aria-hidden="true"></div>
    <div class="sh-head">
      <div><h2 id="sheetTitle">${esc(m.name)}</h2>${m.desc ? `<p class="muted">${esc(m.desc)}</p>` : ''}<p class="sh-base tnum">${M.fmtMoney(m.price)}</p></div>
      <button class="iconbtn" type="button" data-act="close-sheet" aria-label="ปิด">${icon('x')}</button>
    </div>
    <div class="sh-body">
      ${groups.map(groupHtml).join('')}
      ${quick.length ? `<fieldset class="opt-group"><legend><b>บอกร้าน</b><small>ไม่บังคับ</small></legend>
        <div class="qn-grid">${quick.map((q, qi) => `<button class="qn${notes.includes(q) ? ' on' : ''}" type="button" aria-pressed="${notes.includes(q)}" data-act="qnote" data-i="${qi}">${esc(q)}</button>`).join('')}</div>
      </fieldset>` : ''}
      <label class="field"><span>หมายเหตุอื่นๆ</span><input id="itemNote" type="text" maxlength="60" placeholder="เช่น ไม่เอาต้นหอม" value="${esc(notes.filter((n) => !quick.includes(n)).join(', '))}" autocomplete="off" enterkeyhint="done"></label>
    </div>
    <div class="sh-foot">
      <div class="stepper">
        <button type="button" data-act="dqty" data-d="-1" aria-label="ลด" ${d.qty <= 1 && !d.key ? 'disabled' : ''}>${icon(d.qty <= 1 && d.key ? 'trash' : 'minus')}</button>
        <output class="tnum">${d.qty}</output>
        <button type="button" data-act="dqty" data-d="1" aria-label="เพิ่ม">${icon('plus')}</button>
      </div>
      <button class="btn primary lg grow-btn" type="button" data-act="add-draft">${d.key ? 'บันทึก' : 'ใส่ตะกร้า'} · <span class="tnum">${M.fmtMoney(draftUnit(d) * d.qty)}</span></button>
    </div>`;
}

function cartSheet() {
  refreshCart();
  const c = S.cart;
  const gone = c.lines.some((l) => l.gone);
  const total = cartTotal();
  const pp = M.promptpayTarget(S.settings.promptpay);
  return `
    <div class="sh-grab" aria-hidden="true"></div>
    <div class="sh-head">
      <div><h2 id="sheetTitle">ตะกร้าของคุณ</h2><p class="muted">${esc(S.settings.name)}</p></div>
      <button class="iconbtn" type="button" data-act="close-sheet" aria-label="ปิด">${icon('x')}</button>
    </div>
    <div class="sh-body">
      ${c.lines.length ? `<div class="c-lines">${c.lines.map((l) => {
        const extra = [M.optionText(l.options), l.note].filter(Boolean).join(' · ');
        return `<div class="c-line${l.gone ? ' gone' : ''}">
          <button class="c-main" type="button" data-act="edit-line" data-key="${l.key}" ${l.gone ? 'disabled' : ''}>
            <b>${esc(l.name)}</b>${extra ? `<small>${esc(extra)}</small>` : ''}
            ${l.gone ? '<small class="c-gone">เมนูนี้หมดแล้ว ลบออกก่อนสั่ง</small>' : '<small class="c-edit">แก้ไข</small>'}
          </button>
          <div class="c-right">
            <span class="c-price tnum">${M.fmtMoney(M.unitPrice(l) * l.qty)}</span>
            <div class="stepper sm">
              <button type="button" data-act="lqty" data-key="${l.key}" data-d="-1" aria-label="${l.qty > 1 ? 'ลด' : 'ลบ'}">${icon(l.qty > 1 ? 'minus' : 'trash')}</button>
              <output class="tnum">${l.qty}</output>
              <button type="button" data-act="lqty" data-key="${l.key}" data-d="1" aria-label="เพิ่ม" ${l.gone ? 'disabled' : ''}>${icon('plus')}</button>
            </div>
          </div>
        </div>`;
      }).join('')}</div>` : '<p class="hint">ตะกร้าว่าง</p>'}
      ${takeawayOn() ? `<div class="field"><span>ทานที่ร้าน หรือกลับบ้าน</span>
        <div class="seg" role="group" aria-label="ทานที่ร้านหรือกลับบ้าน">
          <button class="${c.type !== 'takeaway' ? 'on' : ''}" type="button" data-act="ctype" data-v="dine" aria-pressed="${c.type !== 'takeaway'}">${icon('dine', 'sm')}ทานที่ร้าน</button>
          <button class="${c.type === 'takeaway' ? 'on' : ''}" type="button" data-act="ctype" data-v="takeaway" aria-pressed="${c.type === 'takeaway'}">${icon('bag', 'sm')}กลับบ้าน</button>
        </div>
      </div>` : ''}
      <label class="field"><span>ชื่อเล่น (ให้ร้านเรียกตอนอาหารเสร็จ)</span>
        <input id="custName" type="text" maxlength="20" placeholder="เช่น มิว" value="${esc(c.name)}" autocomplete="nickname" enterkeyhint="done">
      </label>
      <div class="c-sum"><span>รวม</span><b class="tnum">${M.fmtMoney(total)}</b></div>
      <div class="note primary">${icon('info')}<span>${pp
        ? 'กดสั่งแล้วร้านเริ่มทำทันที หน้าถัดไปจะมี <span class="nw">QR พร้อมเพย์</span>ยอดพอดีให้สแกนจ่าย'
        : 'กดสั่งแล้วร้านเริ่มทำทันที หน้าถัดไปจะบอกยอดเงิน ให้สแกน <span class="nw">QR พร้อมเพย์</span>ที่ป้ายหน้าร้าน'}</span></div>
    </div>
    <div class="sh-foot">
      <button class="btn primary lg wide" type="button" data-act="place" ${!c.lines.length || gone || S.placing || !qrOpen() ? 'disabled' : ''}>
        ${S.placing ? '<span class="spinner sm" aria-hidden="true"></span>กำลังส่งออเดอร์…' : `สั่งอาหาร · <span class="tnum">${M.fmtMoney(total)}</span>`}
      </button>
    </div>`;
}

function addToCart(d) {
  const m = menuById(d.menuId);
  if (!m) return;
  const line = { key: d.key || uid(), menuId: m.id, name: m.name, basePrice: +m.price || 0, qty: d.qty, options: M.sortOptions(m, d.options), note: (d.note || '').trim(), served: false };
  if (d.key) {
    const i = S.cart.lines.findIndex((l) => l.key === d.key);
    if (i >= 0) S.cart.lines[i] = line;
  } else {
    const same = S.cart.lines.find((l) => M.lineKey(l) === M.lineKey(line));
    if (same) same.qty += line.qty;
    else S.cart.lines.push(line);
  }
  saveCart();
  buzz();
  renderCartBar();
  if (S.view === 'menu' && !S.sheet) renderMenu();
}

async function placeOrder() {
  if (S.placing) return;
  refreshCart();
  const c = S.cart;
  if (!c.lines.length || c.lines.some((l) => l.gone)) return;
  const items = M.mergeLines(c.lines.map((l) => ({ ...l, served: false }))).map(M.toItem);
  const order = {
    dateKey: M.thaiDateKey(),
    items,
    total: M.orderTotal(items),
    paid: false, payMethod: null, payClaimed: false, cancelled: false,
    source: 'qr',
    type: takeawayOn() && c.type === 'takeaway' ? 'takeaway' : 'dine',
    name: (c.name || '').trim().slice(0, 20),
  };
  S.placing = true;
  renderSheet();
  try {
    const { id, number } = await data.placeQrOrder(order);
    S.mine = [...S.mine, { id, number, dateKey: order.dateKey }].slice(-5);
    store.set(mineKey(), S.mine);
    S.cart = { lines: [], type: c.type, name: c.name };
    saveCart();
    S.placing = false;
    closeSheet();
    buzz([30, 40, 30]);
    openTrack(id);
  } catch (e) {
    S.placing = false;
    renderSheet();
    toast(e.message || 'ส่งออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง', 'bad');
  }
}

// =====================================================================
// ติดตามออเดอร์ + จ่ายเงิน
// =====================================================================
let unsubTrack = null;
let lastStage = null;
function openTrack(id, scroll = true) {
  unsubTrack?.();
  S.trackId = id;
  S.track = null;
  S.view = 'track';
  lastStage = null;
  unsubTrack = data.watchMyOrder(id, (o) => {
    const before = lastStage;
    S.track = o;
    const stage = M.customerStage(o);
    lastStage = stage;
    if (before && before !== stage && stage === 'ready') {
      buzz([80, 60, 80, 60, 160]);
      chime();
      document.title = 'พร้อมรับแล้ว! · ' + (S.settings?.short || 'สั่งอาหาร');
    }
    render();
  });
  render();
  if (scroll) window.scrollTo(0, 0);
}
function backToMenu() {
  S.view = 'menu';
  document.title = S.settings ? `สั่งอาหาร · ${S.settings.short || S.settings.name}` : 'สั่งอาหาร';
  render();
  window.scrollTo(0, 0);
}

const STAGES = [
  ['ordered', 'สั่งแล้ว'],
  ['paid', 'จ่ายเงิน'],
  ['cooking', 'กำลังทำ'],
  ['ready', 'พร้อมรับ'],
];

function renderTrack() {
  const view = $('#view');
  const o = S.track;
  const st = S.settings || {};
  if (!o) {
    view.innerHTML = `<div class="s-wrap"><div class="t-bar"><button class="btn ghost sm" type="button" data-act="menu">${icon('back')}เมนู</button></div>
      <div class="s-empty card"><span class="spinner" aria-hidden="true"></span><p class="muted">กำลังโหลดออเดอร์…</p></div></div>`;
    return;
  }
  const stage = M.customerStage(o);
  const ps = M.payState(o);
  const pp = M.promptpayTarget(st.promptpay);
  const done = { ordered: true, paid: ps === 'paid', cooking: stage === 'cooking' || stage === 'ready', ready: stage === 'ready' };
  const current = stage === 'ready' ? 'ready' : stage === 'cooking' ? 'cooking' : ps !== 'paid' ? 'paid' : 'cooking';
  const head = {
    queued: ['ร้านได้รับออเดอร์แล้ว', st.queue > 1 ? `มีคิวรอทำอยู่ ${st.queue} คิว (รวมของคุณ)` : 'ร้านกำลังจะเริ่มทำให้'],
    cooking: ['กำลังทำอาหาร', 'อีกสักครู่ร้านจะเรียกเลขคิวของคุณ'],
    ready: ['พร้อมรับแล้ว', 'ไปรับที่หน้าร้าน แจ้งเลขคิวนี้'],
    cancelled: ['ร้านยกเลิกออเดอร์นี้', 'ติดต่อที่หน้าร้าน ถ้าโอนเงินไปแล้วร้านจะคืนให้'],
  }[stage] || ['', ''];

  let pay = '';
  if (stage !== 'cancelled') {
    if (ps === 'paid') {
      pay = `<div class="note ok">${icon('check-circle')}<span><b>จ่ายแล้ว</b> · ร้านยืนยันยอด ${M.fmtMoney(o.total)} แล้ว</span></div>`;
    } else if (!pp) {
      // ร้านไม่ได้ใส่เลขพร้อมเพย์: ให้สแกน QR พร้อมเพย์ที่ป้ายหน้าร้าน
      pay = `<section class="pay card" aria-label="จ่ายด้วย QR ที่ป้ายหน้าร้าน">
        <div class="pay-head"><span class="pp-tag">PromptPay · พร้อมเพย์</span><b class="tnum">฿${(+o.total).toFixed(2)}</b></div>
        <div class="sign-hint">
          <span class="sign-ic">${icon('qr', 'lg')}</span>
          <span><b>สแกน QR ที่ป้ายหน้าร้าน</b><small>เปิดแอปธนาคาร → สแกนจ่าย → ใส่ยอด <b class="tnum">${M.fmtMoney(o.total)}</b> ให้ตรง</small></span>
        </div>
        ${ps === 'claimed'
          ? `<div class="note primary">${icon('clock')}<span><b>แจ้งร้านแล้ว</b> รอร้านเช็คยอดในแอปธนาคาร</span></div>`
          : `<button class="btn primary lg wide" type="button" data-act="claim">${icon('check')}ฉันโอนแล้ว</button>
             <p class="pay-how">หรือจ่ายเงินสดตอนรับอาหาร</p>`}
      </section>`;
    } else {
      const payload = M.promptpayPayload(st.promptpay, o.total);
      pay = `<section class="pay card" aria-label="จ่ายด้วยพร้อมเพย์">
        <div class="pay-head"><span class="pp-tag">PromptPay · พร้อมเพย์</span><b class="tnum">฿${(+o.total).toFixed(2)}</b></div>
        ${S.mode === 'demo' ? `<div class="note warn">${icon('alert')}<span><b>โหมดทดลอง</b> QR นี้ใช้เลขตัวอย่าง ห้ามสแกนโอนเงินจริง</span></div>` : ''}
        <div class="pay-qr">${qrSVG(payload, { ecl: 'M', margin: 2, label: 'QR พร้อมเพย์ ยอด ' + o.total + ' บาท' })}</div>
        <dl class="pay-to">
          <dt>โอนเข้า</dt><dd>${esc(st.promptpayName || st.name)}</dd>
          <dt>พร้อมเพย์</dt><dd class="tnum">${esc(M.maskPromptpay(st.promptpay))}</dd>
          <dt>ยอด</dt><dd class="tnum"><b>${M.fmtMoney(o.total)}</b> (ใส่ให้แล้วใน QR)</dd>
        </dl>
        ${ps === 'claimed'
          ? `<div class="note primary">${icon('clock')}<span><b>แจ้งร้านแล้ว</b> รอร้านเช็คยอดในแอปธนาคาร</span></div>`
          : `<p class="pay-how">เปิดแอปธนาคาร → สแกนจ่าย → ${framed ? 'สแกน QR นี้' : 'สแกน QR นี้ หรือบันทึกรูปแล้วเลือกจากอัลบั้ม'}</p>
             <div class="pay-btns">
               ${framed ? '' : `<button class="btn" type="button" data-act="save-qr">${icon('image')}บันทึกรูป QR</button>`}
               <button class="btn primary" type="button" data-act="claim">${icon('check')}ฉันโอนแล้ว</button>
             </div>`}
      </section>`;
    }
  }

  view.innerHTML = `<div class="s-wrap">
    <div class="t-bar">
      <button class="btn ghost sm" type="button" data-act="menu">${icon('back')}เมนู</button>
      <span class="t-shop">${esc(st.short || st.name || '')}</span>
    </div>
    <section class="t-hero card stage-${stage}">
      <small>เลขคิวของคุณ</small>
      <b class="t-q tnum">${esc(M.orderNo(o))}</b>
      ${o.name ? `<span class="t-name">${icon('user', 'sm')}${esc(o.name)} · ${o.type === 'takeaway' ? 'กลับบ้าน' : 'ทานที่ร้าน'}</span>` : `<span class="t-name">${o.type === 'takeaway' ? icon('bag', 'sm') + 'กลับบ้าน' : icon('dine', 'sm') + 'ทานที่ร้าน'}</span>`}
      <div class="t-status"><b>${head[0]}</b><span>${head[1]}</span></div>
      ${stage === 'cancelled' ? '' : `<ol class="steps">${STAGES.map(([k, t]) =>
        `<li class="${done[k] ? 'done' : ''}${current === k && !done[k] ? ' now' : ''}"><span class="step-dot">${done[k] ? icon('check') : ''}</span><span>${t}</span></li>`).join('')}</ol>`}
    </section>
    ${pay}
    <section class="card t-items">
      <h3>รายการ <small class="tnum">สั่งเมื่อ ${M.fmtTime(o.createdAt)}</small></h3>
      ${o.items.map((it) => {
        const extra = [M.optionText(it.options), it.note].filter(Boolean).join(' · ');
        return `<div class="t-item${it.served ? ' served' : ''}"><span class="t-iq tnum">${it.qty}×</span><span class="t-in"><b>${esc(it.name)}</b>${extra ? `<small>${esc(extra)}</small>` : ''}</span><span class="tnum">${M.fmtMoney(it.price * it.qty)}</span></div>`;
      }).join('')}
      <div class="c-sum"><span>รวม</span><b class="tnum">${M.fmtMoney(o.total)}</b></div>
    </section>
    <button class="btn wide" type="button" data-act="menu">${icon('plus')}สั่งเพิ่มอีกออเดอร์</button>
    <p class="s-foot">เก็บหน้านี้ไว้ได้ ปิดแล้วเปิดลิงก์เดิม สถานะจะกลับมาเอง</p>
  </div>`;
}

async function saveQr() {
  const o = S.track;
  const st = S.settings;
  if (!o || !st) return;
  const cv = qrCanvas(M.promptpayPayload(st.promptpay, o.total), { scale: 12, caption: `${M.orderNo(o)} · ${M.fmtMoney(o.total)}` });
  const name = `promptpay-${M.orderNo(o)}.png`;
  try {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'QR พร้อมเพย์' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('บันทึกรูปแล้ว');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('บันทึกรูปไม่ได้ ลองแคปหน้าจอแทน', 'warn');
  }
}

// ---------- เสียงตอนพร้อมรับ ----------
let actx = null;
function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* ไม่รองรับ */ }
}
function chime() {
  if (!actx) return;
  const t0 = actx.currentTime + 0.02;
  [784, 1046.5, 1318.5].forEach((f, i) => {
    const o = actx.createOscillator();
    const g = actx.createGain();
    const t = t0 + i * 0.14;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + 0.75);
  });
}

// ---------- toast ----------
let toastTimer;
function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.className = 'toast show ' + kind;
  t.innerHTML = `<span>${esc(msg)}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + kind; }, 2600);
}

// =====================================================================
// ปุ่มทั้งหมด
// =====================================================================
function draft() { return S.sheet?.kind === 'item' ? S.sheet.draft : null; }

const ACTIONS = {
  item: (el) => openItem(el.dataset.id),
  cat: (el) => {
    const sec = document.getElementById('cat-' + el.dataset.i);
    if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + scrollY - 64, behavior: 'smooth' });
  },
  'open-cart': openCart,
  'close-sheet': closeSheet,
  opt: (el) => {
    const d = draft();
    const m = d && menuById(d.menuId);
    if (!m) return;
    d.options = M.setOption(m, d.options, +el.dataset.g, +el.dataset.c);
    renderSheet();
  },
  qnote: (el) => {
    const d = draft();
    const q = (S.settings.quickNotes || [])[+el.dataset.i];
    if (!d || !q) return;
    const parts = (d.note || '').split(/\s*,\s*/).filter(Boolean);
    d.note = (parts.includes(q) ? parts.filter((p) => p !== q) : [...parts, q]).join(', ');
    renderSheet();
  },
  dqty: (el) => {
    const d = draft();
    if (!d) return;
    const next = d.qty + +el.dataset.d;
    if (next <= 0 && d.key) {
      S.cart.lines = S.cart.lines.filter((l) => l.key !== d.key);
      saveCart();
      S.sheet = { kind: 'cart' };
      if (!S.cart.lines.length) { closeSheet(); return; }
      renderSheet();
      return;
    }
    d.qty = Math.max(1, Math.min(20, next));
    renderSheet();
  },
  'add-draft': () => {
    const d = draft();
    if (!d) return;
    const editing = !!d.key;
    addToCart(d);
    if (editing) { S.sheet = { kind: 'cart' }; renderSheet(); }
    else { closeSheet(); toast(`เพิ่ม ${menuById(d.menuId)?.name || ''} แล้ว`); }
  },
  'edit-line': (el) => {
    const l = S.cart.lines.find((x) => x.key === el.dataset.key);
    if (l) openItem(l.menuId, l.key);
  },
  lqty: (el) => {
    const l = S.cart.lines.find((x) => x.key === el.dataset.key);
    if (!l) return;
    l.qty += +el.dataset.d;
    if (l.qty <= 0) S.cart.lines = S.cart.lines.filter((x) => x !== l);
    l.qty = Math.min(20, l.qty);
    saveCart();
    if (!S.cart.lines.length) { closeSheet(); return; }
    renderSheet();
  },
  ctype: (el) => { S.cart.type = el.dataset.v; saveCart(); renderSheet(); },
  place: placeOrder,
  track: (el) => openTrack(el.dataset.id),
  menu: backToMenu,
  claim: () => {
    if (!S.track) return;
    data.claimPaid(S.track.id);
    buzz();
    toast('แจ้งร้านแล้ว ร้านจะเช็คยอดให้');
  },
  'save-qr': saveQr,
};

function bindEvents() {
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' && el.dataset.act === 'item') {
      if (el?.dataset.act === 'item') toast(closedMsg(), 'warn');
      return;
    }
    const ae = document.activeElement;
    if (ae && ae !== el && ae.matches('input, textarea')) ae.blur();
    ACTIONS[el.dataset.act]?.(el, e);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'custName') { S.cart.name = t.value.slice(0, 20); saveCart(); }
    if (t.id === 'itemNote') {
      const d = draft();
      if (!d) return;
      const quick = S.settings.quickNotes || [];
      const kept = (d.note || '').split(/\s*,\s*/).filter((n) => quick.includes(n));
      d.note = [...kept, t.value.trim()].filter(Boolean).join(', ');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.sheet) closeSheet();
    if (e.key === 'Enter' && e.target.matches('#custName, #itemNote')) e.target.blur();
  });
}

boot();
