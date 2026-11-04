// qr.js — วาด QR code (ใช้ไลบรารี qrcode-generator ใน vendor/qrcode.js ที่โหลดเป็น <script> ธรรมดาไว้ก่อน)

function matrix(text, ecl) {
  const q = window.qrcode(0, ecl);
  q.addData(text);
  q.make();
  return q;
}

/** QR เป็น SVG (คมทุกขนาด) — margin นับเป็นจำนวนช่อง */
export function qrSVG(text, { ecl = 'M', margin = 2, label = 'QR code' } = {}) {
  if (!text || !window.qrcode) return '';
  const q = matrix(text, ecl);
  const n = q.getModuleCount();
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      // รวมช่องดำที่อยู่ติดกันในแถวเดียวเป็นเส้นเดียว ไฟล์จะเล็กลง
      let w = 1;
      while (c + w < n && q.isDark(r, c + w)) w++;
      d += `M${c + margin} ${r + margin}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** QR เป็นรูป PNG (สำหรับปุ่ม "บันทึกรูป QR") */
export function qrCanvas(text, { ecl = 'M', scale = 10, margin = 4, caption = '' } = {}) {
  const q = matrix(text, ecl);
  const n = q.getModuleCount();
  const size = (n + margin * 2) * scale;
  const capH = caption ? Math.round(scale * 7) : 0;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size + capH;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  if (caption) {
    g.font = `600 ${Math.round(scale * 3.2)}px "IBM Plex Sans Thai", "Geist", sans-serif`;
    g.textAlign = 'center';
    g.fillText(caption, size / 2, size + capH * 0.45);
  }
  return cv;
}
