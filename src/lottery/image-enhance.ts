/**
 * รูปโพยที่ส่งให้ AI อ่าน (image-ai.ts) และส่งให้คนตรวจ (tickets/image/[id]/route.ts)
 * ค่าเริ่มต้น = รูปต้นฉบับตามที่นำเข้า ไม่ปรับอะไร — คนปรับเองทีหลังตอนตรวจ (image-editor-dialog.tsx)
 * ยกเว้นรูปที่ใหญ่เกินที่ AI รับได้ (MAX_AI_BYTES) → หมุนตาม EXIF + ย่อด้านยาวเหลือ 2000px เท่านั้น ไม่ปรับหมึก/แสง
 *
 * เปิดการทำหมึกเข้มและหนาขึ้น (ink.ts) ได้ด้วย OCR_ENHANCE=1 (รูปที่ส่งให้ AI) และ IMAGE_AUTO_ADJUST=1 (รูปที่ส่งให้คนตรวจ)
 *
 * ไฟล์รูปที่เก็บไว้ (image-store.ts) เป็นต้นฉบับเสมอ — ปรับตอนส่งเท่านั้น
 * ปรับไม่ได้ (รูปเสีย / ชนิดที่ sharp ไม่รองรับ) → ส่งรูปเดิม ไม่ให้การปรับรูปทำให้อ่านไม่ได้
 */
import sharp from "sharp";

import { boldInkPixels } from "./ink";

/** ด้านยาวสุดของรูปที่ย่อก่อนส่งให้ AI */
const MAX_SIDE = 2000;
/** รูปใหญ่กว่านี้ย่อก่อนส่งให้ AI — ผู้ให้บริการรับรูปละไม่เกิน ~5MB */
const MAX_AI_BYTES = 4 * 1024 * 1024;

export type SlipImageFile = { data: Uint8Array; mimeType: string };

export const enhanceEnabled = () => process.env.OCR_ENHANCE === "1";
export const autoAdjustEnabled = () => process.env.IMAGE_AUTO_ADJUST === "1";

/** หมุนตั้งตรง (+ ย่อถ้าระบุ) (+ หมึกเข้ม/หนาขึ้นถ้า ink) — gif (อาจเป็นภาพเคลื่อนไหว) / ปรับไม่ได้ → รูปเดิม */
async function adjust(data: Uint8Array, mimeType: string, { maxSide, ink }: { maxSide?: number; ink: boolean }): Promise<SlipImageFile> {
  if (mimeType.toLowerCase().startsWith("image/gif")) return { data, mimeType };
  try {
    let image = sharp(data, { failOn: "none" }).rotate();
    if (maxSide) image = image.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
    // รูปโปร่งใส (PNG) → พื้นขาวเหมือนกระดาษ
    image = image.flatten({ background: "#ffffff" }).removeAlpha();
    if (!ink) return { data: new Uint8Array(await image.jpeg({ quality: 90 }).toBuffer()), mimeType: "image/jpeg" };
    const { data: pixels, info } = await image.raw().toBuffer({ resolveWithObject: true });
    boldInkPixels(pixels, info.width, info.height, 3);
    const out = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data: new Uint8Array(out), mimeType: "image/jpeg" };
  } catch {
    return { data, mimeType };
  }
}

/** รูปที่ส่งให้ AI อ่าน — ต้นฉบับ · ใหญ่เกิน = ย่อเท่านั้น · OCR_ENHANCE=1 = ย่อ + หมึกเข้ม/หนาขึ้น */
export async function enhanceSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  if (enhanceEnabled()) return adjust(data, mimeType, { maxSide: MAX_SIDE, ink: true });
  if (data.length <= MAX_AI_BYTES) return { data, mimeType };
  return adjust(data, mimeType, { maxSide: MAX_SIDE, ink: false });
}

/** รูปต้นฉบับที่ส่งให้คนตรวจ — ต้นฉบับ · IMAGE_AUTO_ADJUST=1 = หมึกเข้ม/หนาขึ้น (ไฟล์ที่เก็บไว้ไม่ถูกแก้) */
export async function autoAdjustSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  if (!autoAdjustEnabled()) return { data, mimeType };
  return adjust(data, mimeType, { ink: true });
}
