import { z } from "zod";

import { LOTTERY_TYPES } from "@/lottery/labels";

export const drawStatusEnum = z.enum(["OPEN", "CLOSED", "SETTLED"]);
export const lotteryTypeEnum = z.enum(LOTTERY_TYPES);

/**
 * ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ draws.validation.* (src/i18n/modules/draws.ts)
 * สถานะไม่ได้กรอกในฟอร์ม: มีเลขที่ออกครบ = ออกผลแล้ว (ดู src/lottery/draw-status.ts) · อัตราจ่ายมาจากแม่หวย
 */
const drawFields = z.object({
  name: z.string().trim().min(2, "draws.validation.nameMin").max(120, "validation.nameMax"),
  /** ประเภทหวย — วันเดียวเปิดได้หลายงวด (หวยเวียดนาม V3–V9 ออกหลายรอบต่อวัน) */
  lottery: lotteryTypeEnum.default("LAO"),
  /** วันที่ออก รูปแบบ YYYY-MM-DD (ค่าจาก <input type="date">) */
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "draws.validation.dateInvalid"),
  /** เวลาออกผล HH:mm (เวลาลาว) — ถึงเวลานี้ระบบปิดรับโพยให้เอง · ว่าง = ไม่ปิดเอง */
  closeTime: z
    .string()
    .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "draws.validation.closeTime")
    .default(""),
  /** เลข 3 ตัวบนที่ออก — ว่างได้จนกว่าจะออกผล */
  topResult: z.string().regex(/^(\d{3})?$/, "draws.validation.topResult"),
  /** เลข 2 ตัวล่างที่ออก */
  bottomResult: z.string().regex(/^(\d{2})?$/, "draws.validation.bottomResult"),
});

type DrawFields = z.infer<typeof drawFields>;

/** เลขที่ออกต้องกรอกครบทั้งคู่หรือว่างทั้งคู่ — กรอกครึ่งเดียวคิดรางวัลไม่ได้ */
function requireResultPair(value: DrawFields, ctx: z.RefinementCtx) {
  if (!value.topResult === !value.bottomResult) return;
  const missing = value.topResult ? "bottomResult" : "topResult";
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [missing], message: "draws.validation.resultPair" });
}

export const drawSchema = drawFields.superRefine(requireResultPair);

export const createDrawSchema = drawSchema;
export const updateDrawSchema = drawFields
  .extend({ id: z.string().min(1, "validation.required") })
  .superRefine(requireResultPair);
export const deleteDrawSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ปิดรับ / เปิดรับอีกครั้ง — งวดที่ออกผลแล้วเปลี่ยนด้วยการแก้เลขที่ออกเท่านั้น */
export const setDrawStatusSchema = z.object({
  id: z.string().min(1, "validation.required"),
  status: z.enum(["OPEN", "CLOSED"]),
});

export type DrawInput = z.infer<typeof drawSchema>;
export type DrawStatusValue = z.infer<typeof drawStatusEnum>;
