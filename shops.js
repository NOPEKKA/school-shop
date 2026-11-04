// shops.js — รายชื่อร้านและข้อมูลตั้งต้นของแต่ละร้าน (ร้านในโรงเรียน)
// เพิ่มร้านใหม่: เพิ่ม 1 รายการใน SHOPS แล้วเพิ่มเมนูตั้งต้นใน seedFor()
// ข้อมูลจริงของแต่ละร้านอยู่ที่ shops/{id} ใน Firestore (ตั้งค่า + เมนู + ออเดอร์ + ยอดรายวัน แยกกันทั้งหมด)
//
// แบบของร้าน (settings.mode)
//   'record'  = จดเฉยๆ   : กดเมนูแล้วกด "เงินสด"/"โอน" บันทึกเป็นยอดขายทันที ไม่มีคิว
//   'kitchen' = จดเพื่อทำ : มีคิวรอทำ แตะเสร็จทีละรายการ และเปิดให้นักเรียนสแกนสั่งเองได้

export const SHOPS = [
  { id: 'khaomoo', name: 'ข้าวขาหมู หมูแดง หมูกรอบ', short: 'ข้าวขาหมู', mark: 'ข', color: '#B42318', note: 'จดเฉยๆ · ทดลองก่อน' },
  { id: 'noodle', name: 'ก๋วยเตี๋ยว', short: 'ก๋วยเตี๋ยว', mark: 'ก', color: '#0E7490', note: 'จดเพื่อทำ · มีคิว' },
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
  { id: 'k01', name: 'ข้าวขาหมู', price: 50, color: 'brown', desc: '' },
  { id: 'k02', name: 'ข้าวหมูแดง', price: 50, color: 'red', desc: '' },
  { id: 'k03', name: 'ข้าวไก่ทอด ซอสมะขาม', price: 50, color: 'amber', desc: '' },
  { id: 'k04', name: 'ข้าวหมูแดง +หมูกรอบ', price: 55, color: 'tomato', desc: '' },
  { id: 'k05', name: 'ข้าวหมูกรอบ', price: 50, color: 'gold', desc: '' },
  { id: 'k06', name: 'ข้าวไก่ย่าง', price: 50, color: 'coffee', desc: '' },
].map((m, i) => ({ ...m, category: 'ข้าว', options: clone(RICE_OPTIONS), active: true, sortOrder: (i + 1) * 10 }));

// ---------- ร้านก๋วยเตี๋ยว (เมนูชุดเดิมจากแอปเวอร์ชันแรก) ----------

const NOODLE_OPTIONS = [
  { name: 'เส้น', key: true, multi: false, def: 0, choices: [
    { name: 'เส้นเล็ก', price: 0 }, { name: 'เส้นใหญ่', price: 0 }, { name: 'เส้นหมี่', price: 0 }, { name: 'บะหมี่', price: 0 },
  ] },
  { name: 'น้ำ/แห้ง', multi: false, def: 0, choices: [{ name: 'น้ำ', price: 0 }, { name: 'แห้ง', price: 0 }] },
  { name: 'ขนาด', multi: false, def: 0, choices: [{ name: 'ธรรมดา', price: 0 }, { name: 'พิเศษ', price: 10 }] },
  { name: 'ท็อปปิ้ง', multi: true, def: 0, choices: [
    { name: 'เพิ่มเครื่อง', price: 15 }, { name: 'เพิ่มลูกชิ้น', price: 10 }, { name: 'ไข่ต้ม', price: 10 }, { name: 'กากหมู', price: 5 },
  ] },
];
const soupOnly = () => clone(NOODLE_OPTIONS).filter((g) => g.name !== 'เส้น' && g.name !== 'น้ำ/แห้ง');

const NOODLE_MENU = [
  { id: 'm01', name: 'หมูน้ำใส', price: 50, color: 'gold', desc: 'หมูสด หมูสับ ลูกชิ้น' },
  { id: 'm02', name: 'หมูน้ำตก', price: 50, color: 'maroon', desc: 'น้ำซุปเข้มข้น' },
  { id: 'm03', name: 'ต้มยำหมู', price: 55, color: 'tomato', desc: 'ต้มยำน้ำข้น' },
  { id: 'm04', name: 'เนื้อน้ำใส', price: 60, color: 'gold', desc: 'เนื้อสด เนื้อเปื่อย' },
  { id: 'm05', name: 'เนื้อน้ำตก', price: 60, color: 'maroon', desc: '' },
  { id: 'm06', name: 'ลูกชิ้นน้ำใส', price: 45, color: 'gold', desc: '' },
].map((m, i) => ({ ...m, category: 'ก๋วยเตี๋ยว', options: clone(NOODLE_OPTIONS), active: true, sortOrder: (i + 1) * 10 }))
  .concat([
    { id: 'm07', name: 'เกาเหลาหมู', price: 50, color: 'slate', category: 'ก๋วยเตี๋ยว', desc: 'ไม่ใส่เส้น', options: soupOnly(), active: true, sortOrder: 70 },
    { id: 'm08', name: 'น้ำเปล่า', price: 10, color: 'cyan', category: 'เครื่องดื่ม', desc: '', options: [], active: true, sortOrder: 80 },
    { id: 'm09', name: 'ชาเย็น', price: 25, color: 'amber', category: 'เครื่องดื่ม', desc: '', options: [], active: true, sortOrder: 90 },
  ]);

/** ชุดตัวเลือกมาตรฐานที่ใช้ในหน้าแก้เมนู */
export const OPTION_PRESETS = [
  { id: 'rice', label: 'ชุดข้าว (พิเศษ/ไข่)', groups: RICE_OPTIONS },
  { id: 'noodle', label: 'ชุดก๋วยเตี๋ยว', groups: NOODLE_OPTIONS },
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
        ...base, mode: 'record', takeaway: false, qrOrdering: false, qrOpen: false,
        quickNotes: ['แยกน้ำราด', 'ราดน้ำเยอะ', 'ซอสแยก', 'เนื้อล้วน', 'ไม่เอาหนัง', 'ไม่เอาผัก'],
      },
      menu: clone(KHAOMOO_MENU),
    };
  }
  return {
    settings: {
      ...base, mode: 'kitchen', takeaway: true, qrOrdering: true, qrOpen: true,
      quickNotes: ['ไม่ผัก', 'ไม่งอก', 'ไม่ชูรส', 'ไม่พริก', 'ใส่ถุงแยก'],
    },
    menu: clone(NOODLE_MENU),
  };
}
