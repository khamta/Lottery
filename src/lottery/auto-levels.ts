/**
 * ปรับแสง/คอนทราสต์อัตโนมัติของรูปโพย — สูตรเดียวที่ใช้ทั้งบอท (image-enhance.ts ด้วย sharp ก่อนบันทึกรูป)
 * และปุ่ม "ปรับอัตโนมัติ" ในหน้าแก้รูป (canvas ในเบราว์เซอร์) · ไม่ import sharp — ฝั่งเบราว์เซอร์ใช้ได้
 *
 *   ความสว่าง  รูปมืดเพิ่มแสงให้ค่าเฉลี่ยเข้าใกล้ 150 ไม่เกิน 1.4 เท่า · รูปจ้าไม่ลดแสง (พื้นขาวจะกลายเป็นเทา)
 *   ยืดช่วงสี  หมึกเข้มสุด (0.5%) เป็นดำ กระดาษสว่างสุด (99.5%) เป็นขาว
 */

/** ค่าเฉลี่ยความสว่าง (0-255) ที่อยากได้ — กระดาษโพยส่วนใหญ่เป็นพื้นขาว */
const TARGET_BRIGHTNESS = 150;
/** เพิ่มแสงได้มากสุดกี่เท่า */
const MAX_BRIGHTEN = 1.4;
/** ตัดปลายฮิสโตแกรมกี่ % ตอนยืดช่วงสี — เท่ากับ sharp.normalize({ lower: 0.5, upper: 99.5 }) */
export const LEVELS_CLIP = { lower: 0.5, upper: 99.5 };
/** ช่วงสีแคบกว่านี้ไม่ยืด (รูปสีเดียว/ว่าง — ยืดแล้วได้แต่สัญญาณรบกวน) */
const MIN_RANGE = 16;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** เพิ่มความสว่างกี่เท่า — มืดเพิ่มได้ถึง 1.4 เท่า (แรงกว่านี้หมึกสีน้ำเงินจางตามกระดาษ) · ไม่ลดแสง · ใกล้เป้าแล้วไม่ปรับ */
export function brightnessFactor(mean: number): number {
  if (mean <= 0) return MAX_BRIGHTEN;
  const factor = clamp(TARGET_BRIGHTNESS / mean, 1, MAX_BRIGHTEN);
  return Math.abs(factor - 1) < 0.1 ? 1 : factor;
}

/** ความสว่างของพิกเซล (Rec. 601) 0-255 */
export const luminance = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

/**
 * ตารางแปลงค่าสี 0-255 → 0-255 จากฮิสโตแกรมความสว่าง (256 ช่อง) — ใช้ตารางเดียวกันกับทั้ง R G B
 * รูปที่ไม่ต้องปรับ = null
 */
export function autoLevelsTable(histogram: ArrayLike<number>): Uint8ClampedArray | null {
  let total = 0;
  let sum = 0;
  for (let v = 0; v < 256; v++) {
    total += histogram[v] ?? 0;
    sum += v * (histogram[v] ?? 0);
  }
  if (total === 0) return null;
  const factor = brightnessFactor(sum / total);

  // ตำแหน่ง percentile ของค่าหลังเพิ่มแสง
  const scaled = (v: number) => Math.min(255, v * factor);
  const percentile = (percent: number) => {
    const target = (total * percent) / 100;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v] ?? 0;
      if (seen >= target) return scaled(v);
    }
    return 255;
  };
  let low = percentile(LEVELS_CLIP.lower);
  let high = percentile(LEVELS_CLIP.upper);
  if (high - low < MIN_RANGE) {
    low = 0;
    high = 255;
  }
  if (factor === 1 && low === 0 && high === 255) return null;

  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = Math.round(((scaled(v) - low) / (high - low)) * 255);
  return table;
}

/** ปรับพิกเซล RGBA (ImageData.data) ในที่ — คืน false ถ้ารูปไม่ต้องปรับ */
export function autoLevelsPixels(pixels: Uint8ClampedArray): boolean {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) histogram[luminance(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)]!++;
  const table = autoLevelsTable(histogram);
  if (!table) return false;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = table[pixels[i]!]!;
    pixels[i + 1] = table[pixels[i + 1]!]!;
    pixels[i + 2] = table[pixels[i + 2]!]!;
  }
  return true;
}
