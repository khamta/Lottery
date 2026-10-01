import { z } from "zod";

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ whatsapp.validation.* (src/i18n/modules/whatsapp.ts) */
export const whatsappAccountSchema = z.object({
  name: z.string().trim().min(1, "whatsapp.validation.nameRequired").max(80, "validation.nameMax"),
  /** เบอร์ของบัญชี (ตัวเลขล้วน รวมรหัสประเทศ) ถ้าอยากจับคู่ด้วยรหัสแทน QR — ว่าง = สแกน QR */
  pairingPhone: z.string().trim().regex(/^(\d{8,15})?$/, "whatsapp.validation.phone"),
  /** ผู้ใช้ที่บัญชีนี้ผูกอยู่ (ผู้ดูแลระบบเลือก) — กลุ่มของบัญชีนี้อ่านเข้าได้เฉพาะแม่หวยของผู้ใช้คนนี้ */
  ownerId: z.string().min(1, "whatsapp.validation.ownerRequired"),
});

const id = z.string().min(1, "validation.required");

export const createWhatsappAccountSchema = whatsappAccountSchema;
export const updateWhatsappAccountSchema = whatsappAccountSchema.extend({ id });
export const deleteWhatsappAccountSchema = z.object({ id });

/** คำสั่งที่ส่งให้บอท: connect = ขึ้น QR ใหม่ · logout = เลิกเชื่อมต่อเบอร์นี้ · sync = อ่านรายชื่อกลุ่มใหม่ */
export const whatsappCommandSchema = z.object({ id, command: z.enum(["connect", "logout", "sync"]) });

/** ผูกกลุ่มกับแม่หวย — null = ไม่อ่านกลุ่มนี้ */
export const assignWhatsappGroupSchema = z.object({ id, dealerId: z.string().min(1).nullable() });

export type WhatsappAccountInput = z.infer<typeof whatsappAccountSchema>;
export type WhatsappCommand = z.infer<typeof whatsappCommandSchema>["command"];
