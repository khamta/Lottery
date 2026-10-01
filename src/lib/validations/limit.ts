import { z } from "zod";

export const positionEnum = z.enum(["TOP", "BOTTOM"]);
export const currencyEnum = z.enum(["LAK", "THB"]);

const limitFields = z.object({
  digits: z.coerce
    .number({ invalid_type_error: "limits.validation.digits" })
    .refine((value) => value === 2 || value === 3, "limits.validation.digits"),
  /** ว่าง = ใช้กับทุกเลขของประเภทนั้น */
  number: z.string().trim().regex(/^\d{0,3}$/, "limits.validation.number"),
  position: positionEnum,
  currency: currencyEnum,
  /** ยอดรับสูงสุดต่อเลข ตามยอดจริง (กีบเต็มจำนวน ไม่ใช่หลักพัน) — 0 = ปิดรับ */
  maxAmount: z.coerce
    .number({ invalid_type_error: "limits.validation.amountNumber" })
    .min(0, "limits.validation.amountMin"),
});

type LimitFields = z.infer<typeof limitFields>;

function checkLimit(value: LimitFields, ctx: z.RefinementCtx) {
  if (value.number && value.number.length !== value.digits) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["number"], message: "limits.validation.numberLength" });
  }
  // เลข 3 ตัวลงได้เฉพาะบน
  if (value.digits === 3 && value.position === "BOTTOM") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["position"], message: "limits.validation.threeTopOnly" });
  }
}

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ limits.validation.* (src/i18n/modules/limits.ts) */
export const limitSchema = limitFields.superRefine(checkLimit);

export const createLimitSchema = limitSchema;
export const updateLimitSchema = limitFields
  .extend({ id: z.string().min(1, "validation.required") })
  .superRefine(checkLimit);
export const deleteLimitSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ลบหลายรายการพร้อมกัน — จำกัดไม่เกิน 100 id ต่อครั้ง (เท่ากับ pageSize สูงสุด) */
export const deleteLimitsSchema = z.object({
  ids: z
    .array(z.string().min(1, "validation.required"))
    .min(1, "validation.required")
    .max(100, "validation.required"),
});

export type LimitInput = z.infer<typeof limitSchema>;
export type PositionValue = z.infer<typeof positionEnum>;
export type CurrencyValue = z.infer<typeof currencyEnum>;
