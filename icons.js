// icons.js — ไอคอนเส้นทั้งหมดของแอป (24x24 วาดเอง) ใช้ร่วมกันทั้งหน้าร้านและหน้านักเรียน
// เรียก injectSprite() ครั้งเดียวตอนเริ่ม แล้วใช้ icon('ชื่อ') ใน HTML

const P = {
  note: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  queue: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  chart: '<path d="M3 21h18"/><rect x="5" y="11" width="3.2" height="7" rx=".6"/><rect x="10.4" y="5" width="3.2" height="13" rx=".6"/><rect x="15.8" y="13.5" width="3.2" height="4.5" rx=".6"/>',
  gear: '<path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"/><circle cx="12" cy="12" r="3.2"/>',
  'cloud-ok': '<path d="M7 19h10.2a4.3 4.3 0 0 0 .6-8.55A6.2 6.2 0 0 0 5.9 9.6 4.7 4.7 0 0 0 7 19z"/><path d="M9.3 14.2l2 2 3.6-3.7"/>',
  'cloud-up': '<path d="M7 19h10.2a4.3 4.3 0 0 0 .6-8.55A6.2 6.2 0 0 0 5.9 9.6 4.7 4.7 0 0 0 7 19z"/><path d="M12 16.5v-5M9.6 13.8 12 11.4l2.4 2.4"/>',
  'cloud-off': '<path d="M7 19h10.2a4.3 4.3 0 0 0 .6-8.55A6.2 6.2 0 0 0 5.9 9.6 4.7 4.7 0 0 0 7 19z"/><path d="M3 3l18 18"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18h2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  'chev-down': '<path d="M6 9l6 6 6-6"/>',
  'chev-up': '<path d="M6 15l6-6 6 6"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><path d="M3 3l18 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  star: '<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h3v3h-3zM20.5 14v.01M17 20.5h3.5V17M14 20.5v-.01"/>',
  bag: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  dine: '<path d="M7 3v7.5M4.8 3v4.6a2.2 2.2 0 0 0 4.4 0V3M7 10.5V21"/><path d="M17.5 21V3c-2.2 1.6-3.3 4.4-3.3 7.6h3.3"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21h4"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10.5h18M16 15.5h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
  cart: '<path d="M3 5h2.2l2.1 10.3a1.2 1.2 0 0 0 1.2 1h9.2a1.2 1.2 0 0 0 1.2-.9L21 8.5H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  sound: '<path d="M4 9.5h3.5L12.5 5.5v13l-5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.6 6.4a8.2 8.2 0 0 1 0 11.2"/>',
  store: '<path d="M3.5 9 5 4h14l1.5 5"/><path d="M3.5 9a2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0"/><path d="M5 12v8.5h14V12M10 20.5v-5h4v5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M20.5 16l-5-5L6 20"/>',
  bowl: '<path d="M3 11.5h18a9 7.5 0 0 1-18 0z"/><path d="M9 19.5h6M6.5 11.5c1-1.5 2-1.5 3 0s2 1.5 3 0 2-1.5 3 0 2 1.5 2.5 0"/><path d="M14 2.5l4 7.5M17 2l3 7"/>',
};

export function injectSprite() {
  if (document.getElementById('icon-sprite')) return;
  const box = document.createElement('div');
  box.innerHTML = `<svg id="icon-sprite" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${
    Object.entries(P).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')
  }</defs></svg>`;
  document.body.prepend(box.firstElementChild);
}

export const icon = (name, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
