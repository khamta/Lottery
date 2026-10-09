/**
 * ทำตัวอักษรบนรูปโพยให้เข้มและหนาขึ้น โดยไม่ปรับแสงของรูป — ปิดอยู่โดยค่าเริ่มต้น เปิดด้วย OCR_ENHANCE=1 / IMAGE_AUTO_ADJUST=1 (image-enhance.ts)
 * ไม่ import sharp — ทำงานกับพิกเซลดิบ (RGB / RGBA) จึงเทสต์ได้ตรง ๆ
 *
 *   เข้มขึ้น  พิกเซลที่มืดกว่ากระดาษชัดเจน (หมึก) ถูกกดให้มืดลงตามเส้นโค้ง · กระดาษและส่วนที่สว่างกว่าจุดตัดคงเดิม (แสงไม่เปลี่ยน)
 *   หนาขึ้น  แต่ละพิกเซลใช้สีของพิกเซลหมึกที่มืดที่สุดรอบตัว (min filter) — เส้นลายมือหนาขึ้นข้างละ radius พิกเซล
 */

/** กระดาษ = ความสว่างที่ percentile นี้ (รูปโพยส่วนใหญ่เป็นพื้นกระดาษ) */
const PAPER_PERCENTILE = 90;
/** มืดกว่ากระดาษถึงสัดส่วนนี้ = หมึก — ระหว่างนี้ถึงกระดาษ (เงา/ลายกระดาษ) ไม่แตะ */
const INK_KNEE = 0.8;
/** ความแรงของเส้นโค้งกดหมึก (1 = ไม่เปลี่ยน · 2 = หมึกครึ่งทางมืดลงเหลือครึ่ง) */
const INK_GAMMA = 2;
/** จุดตัดต่ำกว่านี้ = รูปมืดทั้งรูป แยกหมึกกับกระดาษไม่ได้ — ไม่ปรับ */
const MIN_KNEE = 32;
/** ด้านยาวทุก ๆ เท่านี้ เพิ่มความหนาอีก 1 พิกเซล (รูป 2000px = ข้างละ 1px · รูปเต็มจากมือถือ 4000px = 2px) */
const PX_PER_BOLD = 2000;

/** ความสว่างของพิกเซล (Rec. 601) 0-255 */
const luminance = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

/** จุดตัดหมึก (0-255) จากฮิสโตแกรมความสว่าง — null = รูปว่าง/มืดทั้งรูป ไม่ปรับ */
export function inkKnee(histogram: ArrayLike<number>): number | null {
  let total = 0;
  for (let v = 0; v < 256; v++) total += histogram[v] ?? 0;
  if (total === 0) return null;
  const target = (total * PAPER_PERCENTILE) / 100;
  let seen = 0;
  let paper = 255;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v] ?? 0;
    if (seen >= target) {
      paper = v;
      break;
    }
  }
  const knee = Math.round(paper * INK_KNEE);
  return knee < MIN_KNEE ? null : knee;
}

/** ตารางแปลงค่าสี 0-255 → 0-255: ต่ำกว่าจุดตัดถูกกดให้มืดลง ต่อเนื่องที่จุดตัด · ตั้งแต่จุดตัดขึ้นไปคงเดิม */
export function inkTable(knee: number): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = v >= knee ? v : Math.round(knee * (v / knee) ** INK_GAMMA);
  return table;
}

/** ความหนาที่เพิ่ม (พิกเซลต่อข้าง) ตามขนาดรูป */
export const boldRadius = (width: number, height: number) => Math.max(1, Math.round(Math.max(width, height) / PX_PER_BOLD));

/**
 * ทำหมึกให้เข้มและหนาขึ้นในที่ — pixels = RGB หรือ RGBA เรียงแถว (channels = 3 | 4) · alpha ไม่แตะ
 * คืน false ถ้ารูปไม่ต้องปรับ (ว่าง / มืดทั้งรูป)
 */
export function boldInkPixels(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number, channels: 3 | 4): boolean {
  const count = width * height;
  if (count === 0 || pixels.length < count * channels) return false;

  const histogram = new Uint32Array(256);
  const lum = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += channels) {
    const value = luminance(pixels[p]!, pixels[p + 1]!, pixels[p + 2]!);
    lum[i] = value;
    histogram[value]!++;
  }
  const knee = inkKnee(histogram);
  if (knee === null) return false;

  // หนาขึ้น: หาพิกเซลที่มืดที่สุดรอบตัว (แยกแนวนอน แล้วแนวตั้ง — เท่ากับช่องสี่เหลี่ยม (2r+1)²)
  const radius = boldRadius(width, height);
  const across = new Int32Array(count);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let best = row + x;
      for (let dx = Math.max(0, x - radius), end = Math.min(width - 1, x + radius); dx <= end; dx++) {
        if (lum[row + dx]! < lum[best]!) best = row + dx;
      }
      across[row + x] = best;
    }
  }
  const source = pixels.slice();
  const table = inkTable(knee);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = across[y * width + x]!;
      for (let dy = Math.max(0, y - radius), end = Math.min(height - 1, y + radius); dy <= end; dy++) {
        const candidate = across[dy * width + x]!;
        if (lum[candidate]! < lum[best]!) best = candidate;
      }
      // รอบตัวไม่มีหมึก = สีเดิม (กระดาษ/เงาไม่ขยาย)
      const from = (lum[best]! < knee ? best : y * width + x) * channels;
      const to = (y * width + x) * channels;
      pixels[to] = table[source[from]!]!;
      pixels[to + 1] = table[source[from + 1]!]!;
      pixels[to + 2] = table[source[from + 2]!]!;
    }
  }
  return true;
}
