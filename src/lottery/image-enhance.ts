/**
 * ปรับรูปโพยก่อนส่งให้ AI อ่าน (image-ai.ts) — ปรับตามสภาพของแต่ละรูปเอง ไม่ใช้ค่าตายตัว
 *
 *   หมุนตาม EXIF          รูปจากมือถือที่ตะแคง → ตั้งตรง
 *   ย่อด้านยาวเหลือ 2000px  โมเดลย่อรูปใหญ่อยู่แล้ว ส่งเล็กลงเร็วกว่าและไม่เสียรายละเอียด (ไม่ขยายรูปเล็ก)
 *   ความสว่าง             รูปมืด (ถ่ายในร่ม/กลางคืน) → เพิ่มตามค่าเฉลี่ยความสว่าง ไม่เกิน 1.4 เท่า (มากกว่านี้หมึกจางตามกระดาษ) · รูปจ้าไม่ลดแสง (พื้นขาวจะกลายเป็นเทา)
 *   ยืดช่วงสี (normalize)    หมึกเข้มสุดเป็นดำ กระดาษเป็นขาว — ชดเชยแสงที่เพิ่มไม่สุด
 *   ความคมชัดเฉพาะจุด (CLAHE)  เงามือ/เงามือถือ/แสงไม่เท่ากันทั้งใบ → หมึกเด่นขึ้นทุกส่วน · รูปซีด (คอนทราสต์ต่ำ) ดึงแรงขึ้น
 *   เพิ่มความคม (sharpen)    ขอบตัวเลขลายมือชัดขึ้น
 *
 * รูปที่เก็บไว้ให้คนดู (image-store.ts) ไม่ถูกแก้ — ปรับเฉพาะรูปที่ส่งให้ AI
 * ปรับไม่ได้ (รูปเสีย / ชนิดที่ sharp ไม่รองรับ) → ส่งรูปเดิม ไม่ให้การปรับรูปทำให้อ่านไม่ได้
 * ปิดได้ด้วย OCR_ENHANCE=0
 */
import sharp from "sharp";

/** ด้านยาวสุดของรูปที่ส่งให้ AI */
const MAX_SIDE = 2000;
/** ค่าเฉลี่ยความสว่าง (0-255) ที่อยากได้ — กระดาษโพยส่วนใหญ่เป็นพื้นขาว */
const TARGET_BRIGHTNESS = 150;
/** เพิ่มแสงได้มากสุดกี่เท่า */
const MAX_BRIGHTEN = 1.4;
/** ส่วนเบี่ยงเบนต่ำกว่านี้ = รูปซีด คอนทราสต์ต่ำ */
const LOW_CONTRAST_STDEV = 45;

export type SlipImageFile = { data: Uint8Array; mimeType: string };

export const enhanceEnabled = () => process.env.OCR_ENHANCE !== "0";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** เพิ่มความสว่างกี่เท่า — มืดเพิ่มได้ถึง 1.4 เท่า (แรงกว่านี้หมึกสีน้ำเงินจางตามกระดาษ) · ไม่ลดแสง (ลดแล้วกระดาษ/พื้นขาวกลายเป็นเทา — รูปจ้าให้ CLAHE + normalize ดึงหมึกแทน) · ใกล้เป้าแล้วไม่ปรับ */
export function brightnessFactor(mean: number): number {
  if (mean <= 0) return MAX_BRIGHTEN;
  const factor = clamp(TARGET_BRIGHTNESS / mean, 1, MAX_BRIGHTEN);
  return Math.abs(factor - 1) < 0.1 ? 1 : factor;
}

/** ความแรงของ CLAHE — รูปซีดดึงแรงขึ้น รูปที่คอนทราสต์ดีอยู่แล้วดึงเบา ๆ (แรงไปกระดาษจะเป็นจุดด่าง) */
export const claheSlope = (stdev: number) => (stdev < LOW_CONTRAST_STDEV ? 4 : 3);

export async function enhanceSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  // gif อาจเป็นภาพเคลื่อนไหว — ไม่ใช่รูปถ่ายโพย ส่งตามเดิม
  if (!enhanceEnabled() || mimeType.toLowerCase().startsWith("image/gif")) return { data, mimeType };
  try {
    const { data: upright, info } = await sharp(data, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    const { channels } = await sharp(upright).greyscale().stats();
    const { mean, stdev } = channels[0]!;

    // ช่อง CLAHE ราว 1/8 ของรูป — เล็กพอให้แก้เงาเฉพาะจุด ใหญ่พอไม่ขยายลายกระดาษ
    const tile = (side: number) => Math.max(8, Math.round(side / 8));
    const enhanced = await sharp(upright)
      .modulate({ brightness: brightnessFactor(mean) })
      .normalize({ lower: 0.5, upper: 99.5 })
      .clahe({ width: tile(info.width), height: tile(info.height), maxSlope: claheSlope(stdev) })
      .sharpen({ sigma: 1 })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data: new Uint8Array(enhanced), mimeType: "image/jpeg" };
  } catch {
    return { data, mimeType };
  }
}
