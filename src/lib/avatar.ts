import { AVATAR_DATA_URL, type AVATAR_TYPES } from "@/lib/validations/profile";

/**
 * รูปโปรไฟล์ที่อัปโหลดเก็บเป็น bytes ใน users.avatar และเสิร์ฟผ่าน /api/avatar/<id>
 * `?v=` เปลี่ยนทุกครั้งที่อัปโหลดใหม่ จึง cache แบบ immutable ได้
 */
export function avatarUrl(userId: string, version: number = Date.now()) {
  return `/api/avatar/${userId}?v=${version}`;
}

/** แยก data URL → { type, bytes } สำหรับเก็บลงฐานข้อมูล (เรียกหลังผ่าน updateAvatarSchema แล้ว) */
export function decodeAvatarDataUrl(dataUrl: string) {
  const match = AVATAR_DATA_URL.exec(dataUrl);
  if (!match) throw new Error("validation.imageInvalid");
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { type: match[1] as (typeof AVATAR_TYPES)[number], bytes: Buffer.from(base64, "base64") };
}
