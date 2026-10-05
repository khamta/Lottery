import { z } from "zod";

export const ticketStatusEnum = z.enum(["CONFIRMED", "REVIEW"]);
export const ticketSourceEnum = z.enum(["MANUAL", "WHATSAPP"]);

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ tickets.validation.* (src/i18n/modules/tickets.ts) */
export const ticketSchema = z.object({
  drawId: z.string().min(1, "tickets.validation.drawRequired"),
  /** ว่าง = ไม่ระบุลูกค้า */
  customerId: z.string(),
  /** ข้อความโพยตามที่ลูกค้าส่งมา — server แยกรายการเองเสมอ ไม่เชื่อผลที่ client แยก */
  text: z.string().trim().min(1, "tickets.validation.textRequired").max(5000, "tickets.validation.textMax"),
  note: z.string().max(200, "tickets.validation.noteMax"),
  /** นับยอดเฉพาะบรรทัดที่อ่านได้ ทั้งที่ยังมีบรรทัดที่อ่านไม่ออก */
  force: z.boolean(),
});

export const createTicketSchema = ticketSchema;
export const updateTicketSchema = ticketSchema.extend({ id: z.string().min(1, "validation.required") });
export const deleteTicketSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ลบหลายรายการพร้อมกัน — จำกัดไม่เกิน 100 id ต่อครั้ง (เท่ากับ pageSize สูงสุด) */
export const deleteTicketsSchema = z.object({
  ids: z
    .array(z.string().min(1, "validation.required"))
    .min(1, "validation.required")
    .max(100, "validation.required"),
});

/** ตัวอ่านรูปตอนสั่งอ่านโพยรอตรวจใหม่ — AI = Claude (มีค่าใช้จ่าย) · OCR = ตัวอ่านปกติในเครื่อง */
export const imageEngineEnum = z.enum(["AI", "OCR"]);
/** อ่านรูปของโพยรอตรวจใบเดียวใหม่ — ผู้ใช้ทุกคน */
export const rereadTicketImageSchema = z.object({
  id: z.string().min(1, "validation.required"),
  engine: imageEngineEnum,
});
/** อ่านรูปของโพยรอตรวจทั้งงวดใหม่ — ผู้ดูแลระบบเท่านั้น */
export const rereadDrawImagesSchema = z.object({
  drawId: z.string().min(1, "tickets.validation.drawRequired"),
  engine: imageEngineEnum,
});

/** รูปที่แก้แล้วส่งเป็น base64 — ไม่เกิน ~5MB ต่อรูป (หน้าแก้รูปย่อด้านยาวเหลือ 2,400px ก่อนส่ง) */
export const EDITED_IMAGE_MAX_BASE64 = 7_000_000;
export const editedImageMimeEnum = z.enum(["image/jpeg", "image/png"]);
/** แก้รูปโพยรอตรวจ (ครอป / ยางลบ / หมุน) แล้วอ่านใหม่ด้วยตัวอ่านที่เลือก — ผู้ใช้ทุกคน */
export const editTicketImageSchema = z.object({
  id: z.string().min(1, "validation.required"),
  engine: imageEngineEnum,
  mimeType: editedImageMimeEnum,
  data: z
    .string()
    .min(1, "validation.required")
    .max(EDITED_IMAGE_MAX_BASE64, "tickets.validation.imageTooLarge")
    .regex(/^[A-Za-z0-9+/]+=*$/, "tickets.validation.imageInvalid"),
});

/** กลุ่มโพยที่กด "ดูทั้งหมดแล้ว" ได้พร้อมกันสูงสุด — เกินนี้ไม่มีแม่หวยไหนใช้จริง */
export const SEEN_GROUPS_MAX = 200;
/**
 * กด "ดูทั้งหมดแล้ว" ของกลุ่มที่เปิดดูอยู่ — groupKeys = WhatsappGroup.id หรือ "none" (โพยที่ไม่มีกลุ่ม)
 * seenAt = เวลาที่ server render หน้านั้น: โพยที่เข้ามาหลังจากนั้น (ยังไม่เห็นบนจอ) ยังคงขึ้นเป็นยังไม่ได้ดู
 */
export const markTicketsSeenSchema = z.object({
  groupKeys: z
    .array(z.string().min(1, "validation.required").max(50, "validation.required"))
    .min(1, "validation.required")
    .max(SEEN_GROUPS_MAX, "validation.required"),
  seenAt: z.string().datetime("validation.required"),
});

/** เปิดหน้าตรวจโพยใบที่ยังไม่ได้ดู = ดูใบนั้นแล้ว */
export const markTicketReadSchema = z.object({ id: z.string().min(1, "validation.required") });

export type TicketInput = z.infer<typeof ticketSchema>;
export type EditTicketImageInput = z.infer<typeof editTicketImageSchema>;
export type EditedImageMime = z.infer<typeof editedImageMimeEnum>;
export type ImageEngineValue = z.infer<typeof imageEngineEnum>;
export type TicketStatusValue = z.infer<typeof ticketStatusEnum>;
export type TicketSourceValue = z.infer<typeof ticketSourceEnum>;
