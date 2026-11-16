// shops.js — รายชื่อร้านและข้อมูลตั้งต้นของแต่ละร้าน (ร้านในโรงเรียน)
// ตอนนี้มีร้านเดียว: ข้าวขาหมู (จดเฉยๆ) ร้านก๋วยเตี๋ยวเอาออกแล้ว (2026-11-16)
// เพิ่มร้านใหม่: เพิ่ม 1 รายการใน SHOPS แล้วเพิ่มเมนูตั้งต้นใน seedFor()
// ข้อมูลจริงของแต่ละร้านอยู่ที่ shops/{id} ใน Firestore (ตั้งค่า + เมนู + ออเดอร์ + ยอดรายวัน แยกกันทั้งหมด)
//
// แบบของร้าน (settings.mode)
//   'record'  = จดเฉยๆ   : กดเมนูแล้วกด "เงินสด"/"โอน" บันทึกเป็นยอดขายทันที ไม่มีคิว
//   'kitchen' = จดเพื่อทำ : มีคิวรอทำ แตะเสร็จทีละรายการ และเปิดให้นักเรียนสแกนสั่งเองได้
//   เลือกแบบ 'kitchen' ได้เฉพาะร้านที่ตั้ง kitchenOk: true (ตอนนี้ไม่มีร้านไหน) ร้านอื่นเป็นแบบจดเฉยๆ ตลอด

export const SHOPS = [
  { id: 'khaomoo', name: 'ข้าวขาหมู หมูแดง หมูกรอบ', short: 'ข้าวขาหมู', mark: 'ข', color: '#B42318', note: 'จดเฉยๆ', kitchenOk: false },
];

export function shopById(id) {
  return SHOPS.find((s) => s.id === id) || null;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- ร้านข้าวขาหมู ----------
// เมนูจริง 6 อย่าง (ข้าวอย่างเดียว ไม่มีเครื่องดื่ม) · ตัวเลือก: พิเศษ, ใส่ไข่
// ราคายังเป็นราคาตัวอย่าง แม่ค้าแก้เองได้ในหน้าตั้งค่า → เมนู

const RICE_OPTIONS = [
  { name: 'ขนาด', multi: false, def: 0, choices: [{ name: 'ธรรมดา', price: 0 }, { name: 'พิเศษ', price: 10 }] },
  { name: 'ไข่', multi: false, def: 0, choices: [{ name: 'ไม่ใส่ไข่', price: 0 }, { name: 'ใส่ไข่', price: 10 }] },
];

const KHAOMOO_MENU = [
  { id: 'k01', name: 'ข้าวขาหมู', price: 50, color: 'red', desc: '' },
  { id: 'k02', name: 'ข้าวหมูแดง', price: 50, color: 'cyan', desc: '' },
  { id: 'k03', name: 'ข้าวไก่ทอด ซอสมะขาม', price: 50, color: 'yellow', desc: '' },
  { id: 'k04', name: 'ข้าวหมูแดง +หมูกรอบ', price: 55, color: 'green', desc: '' },
  { id: 'k05', name: 'ข้าวหมูกรอบ', price: 50, color: 'pink', desc: '' },
  { id: 'k06', name: 'ข้าวไก่ย่าง', price: 50, color: 'purple', desc: '' },
].map((m, i) => ({ ...m, category: 'ข้าว', options: clone(RICE_OPTIONS), active: true, sortOrder: (i + 1) * 10 }));

/** สีเดิมของเมนูตั้งต้น (ก่อน 2026-11-16) — ใช้ย้ายสีเมนูที่ยังไม่เคยถูกแก้ไปเป็นชุดสีใหม่ครั้งเดียว */
export const LEGACY_SEED_COLORS = { k01: 'brown', k02: 'red', k03: 'amber', k04: 'tomato', k05: 'gold', k06: 'coffee' };
export const PALETTE_V = 2;

/** ชุดตัวเลือกมาตรฐานที่ใช้ในหน้าแก้เมนู */
export const OPTION_PRESETS = [
  { id: 'rice', label: 'ชุดข้าว (พิเศษ/ไข่)', groups: RICE_OPTIONS },
];
export function presetGroups(id) {
  return clone(OPTION_PRESETS.find((p) => p.id === id)?.groups || []);
}

/** ตั้งค่าและเมนูตั้งต้นของร้าน (ใช้ตอนเปิดร้านครั้งแรก) */
export function seedFor(id) {
  const s = shopById(id);
  const base = {
    name: s?.name || 'ร้านของฉัน',
    short: s?.short || 'ร้าน',
    mark: s?.mark || 'ร',
    color: s?.color || '#1D5BD8',
    overdueMin: 10,
    promptpay: '',       // ไม่ใส่ = ให้นักเรียนสแกน QR พร้อมเพย์ที่ป้ายหน้าร้าน
    promptpayName: '',
    queue: 0,
  };
  if (id === 'khaomoo') {
    return {
      settings: {
        ...base, mode: 'record', takeaway: false, qrOrdering: false, qrOpen: false, paletteV: PALETTE_V,
        quickNotes: ['แยกน้ำราด', 'ราดน้ำเยอะ', 'ซอสแยก', 'เนื้อล้วน', 'ไม่เอาหนัง', 'ไม่เอาผัก'],
      },
      menu: clone(KHAOMOO_MENU),
    };
  }
  // ร้านที่ไม่รู้จัก: เปิดเป็นร้านจดเฉยๆ เมนูว่าง
  return { settings: { ...base, mode: 'record', takeaway: false, qrOrdering: false, qrOpen: false, paletteV: PALETTE_V, quickNotes: [] }, menu: [] };
}
