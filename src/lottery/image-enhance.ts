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
 * ไฟล์รูปที่เก็บไว้ (image-store.ts) เป็นต้นฉบับเสมอ — ปรับตอนส่งให้ AI (enhanceSlipImage) และตอนส่งให้คนตรวจ (autoAdjustSlipImage แค่แสง/ช่วงสี)
 * ปรับไม่ได้ (รูปเสีย / ชนิดที่ sharp ไม่รองรับ) → ส่งรูปเดิม ไม่ให้การปรับรูปทำให้อ่านไม่ได้
 * ปิดได้ด้วย OCR_ENHANCE=0
 */
import sharp from "sharp";

import { autoLevelsPixels, brightnessFactor } from "./auto-levels";

export { brightnessFactor };

/** ด้านยาวสุดของรูปที่ส่งให้ AI */
const MAX_SIDE = 2000;
/** ส่วนเบี่ยงเบนต่ำกว่านี้ = รูปซีด คอนทราสต์ต่ำ */
const LOW_CONTRAST_STDEV = 45;

export type SlipImageFile = { data: Uint8Array; mimeType: string };

export const enhanceEnabled = () => process.env.OCR_ENHANCE !== "0";

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

export const autoAdjustEnabled = () => process.env.IMAGE_AUTO_ADJUST !== "0";

/**
 * ปรับรูปต้นฉบับก่อนส่งให้คนตรวจ (tickets/image/[id]/route.ts) — ไฟล์ที่เก็บไว้ไม่ถูกแก้ รูปที่เห็นในหน้าโพยสว่างและชัดขึ้น
 * หมุนตาม EXIF + ความสว่าง/ยืดช่วงสีอัตโนมัติ (auto-levels.ts — สูตรเดียวกับปุ่ม "ปรับอัตโนมัติ" ในหน้าแก้รูป)
 * ไม่ย่อ ไม่ทำ CLAHE / sharpen (รูปดูแปลกตาสำหรับคน) · ปรับไม่ได้ / gif → รูปเดิม · ปิดได้ด้วย IMAGE_AUTO_ADJUST=0
 */
export async function autoAdjustSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  if (!autoAdjustEnabled() || mimeType.toLowerCase().startsWith("image/gif")) return { data, mimeType };
  try {
    // รูปโปร่งใส (PNG) → พื้นขาวเหมือนกระดาษ
    const { data: pixels, info } = await sharp(data, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length);
    if (!autoLevelsPixels(rgba)) return { data, mimeType };
    const adjusted = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
      .removeAlpha()
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data: new Uint8Array(adjusted), mimeType: "image/jpeg" };
  } catch {
    return { data, mimeType };
  }
}
