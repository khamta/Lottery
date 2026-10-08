/**
 * ปรับรูปโพยก่อนส่งให้ AI อ่าน (image-ai.ts) และก่อนส่งให้คนตรวจ (tickets/image/[id]/route.ts)
 * ไม่ปรับแสง/คอนทราสต์ของรูปแล้ว — ทำแค่ตัวอักษรให้เข้มและหนาขึ้น (ink.ts) กระดาษคงความสว่างเดิม
 *
 *   หมุนตาม EXIF            รูปจากมือถือที่ตะแคง → ตั้งตรง
 *   ย่อด้านยาวเหลือ 2000px    เฉพาะรูปที่ส่งให้ AI — โมเดลย่อรูปใหญ่อยู่แล้ว ส่งเล็กลงเร็วกว่า (ไม่ขยายรูปเล็ก)
 *   หมึกเข้มและหนาขึ้น        ลายมือเส้นบาง/ปากกาสีจางอ่านง่ายขึ้น
 *
 * ไฟล์รูปที่เก็บไว้ (image-store.ts) เป็นต้นฉบับเสมอ — ปรับตอนส่งเท่านั้น
 * ปรับไม่ได้ (รูปเสีย / ชนิดที่ sharp ไม่รองรับ) → ส่งรูปเดิม ไม่ให้การปรับรูปทำให้อ่านไม่ได้
 * ปิดได้ด้วย OCR_ENHANCE=0 (รูปที่ส่งให้ AI) และ IMAGE_AUTO_ADJUST=0 (รูปที่ส่งให้คนตรวจ)
 */
import sharp from "sharp";

import { boldInkPixels } from "./ink";

/** ด้านยาวสุดของรูปที่ส่งให้ AI */
const MAX_SIDE = 2000;

export type SlipImageFile = { data: Uint8Array; mimeType: string };

export const enhanceEnabled = () => process.env.OCR_ENHANCE !== "0";
export const autoAdjustEnabled = () => process.env.IMAGE_AUTO_ADJUST !== "0";

/** หมุนตั้งตรง (+ ย่อถ้าระบุ) แล้วทำหมึกเข้ม/หนาขึ้น — gif (อาจเป็นภาพเคลื่อนไหว) / ปรับไม่ได้ → รูปเดิม */
async function boldInk(data: Uint8Array, mimeType: string, maxSide?: number): Promise<SlipImageFile> {
  if (mimeType.toLowerCase().startsWith("image/gif")) return { data, mimeType };
  try {
    let image = sharp(data, { failOn: "none" }).rotate();
    if (maxSide) image = image.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
    // รูปโปร่งใส (PNG) → พื้นขาวเหมือนกระดาษ
    const { data: pixels, info } = await image
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    boldInkPixels(pixels, info.width, info.height, 3);
    const out = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data: new Uint8Array(out), mimeType: "image/jpeg" };
  } catch {
    return { data, mimeType };
  }
}

/** รูปที่ส่งให้ AI อ่าน — ย่อด้านยาวเหลือ 2000px + หมึกเข้ม/หนาขึ้น */
export async function enhanceSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  if (!enhanceEnabled()) return { data, mimeType };
  return boldInk(data, mimeType, MAX_SIDE);
}

/** รูปต้นฉบับที่ส่งให้คนตรวจ — ขนาดเดิม หมึกเข้ม/หนาขึ้น (ไฟล์ที่เก็บไว้ไม่ถูกแก้) */
export async function autoAdjustSlipImage(data: Uint8Array, mimeType: string): Promise<SlipImageFile> {
  if (!autoAdjustEnabled()) return { data, mimeType };
  return boldInk(data, mimeType);
}
