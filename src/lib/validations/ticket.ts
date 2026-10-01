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

export type TicketInput = z.infer<typeof ticketSchema>;
export type TicketStatusValue = z.infer<typeof ticketStatusEnum>;
export type TicketSourceValue = z.infer<typeof ticketSourceEnum>;
