import { z } from "zod";

import { isSelectableModel, OCR_MODEL_AUTO, OCR_REREAD_NONE } from "@/lottery/ai-models";

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ dealers.validation.* (src/i18n/modules/dealers.ts) */
export const dealerSchema = z.object({
  name: z.string().trim().min(1, "dealers.validation.nameRequired").max(120, "validation.nameMax"),
  note: z.string().max(200, "dealers.validation.noteMax"),
  /** รุ่นหลักที่อ่านรูปโพย — "auto" = อัตโนมัติ · ชื่อรุ่น = รุ่นนั้นอ่านทุกรูปก่อน (Claude ในรายการ / Ollama ทุกรุ่น) */
  ocrModel: z
    .string()
    .refine((value) => value === OCR_MODEL_AUTO || isSelectableModel(value), "dealers.validation.ocrModel"),
  /** รุ่นที่อ่านซ้ำเมื่อรุ่นหลักอ่านไม่ผ่าน — "none" = ไม่อ่านซ้ำ (ไม่ใช้ในโหมดอัตโนมัติ) */
  ocrStrongModel: z
    .string()
    .refine((value) => value === OCR_REREAD_NONE || isSelectableModel(value), "dealers.validation.ocrModel"),
});

export const createDealerSchema = dealerSchema;
export const updateDealerSchema = dealerSchema.extend({ id: z.string().min(1, "validation.required") });
export const deleteDealerSchema = z.object({ id: z.string().min(1, "validation.required") });
/** เลือกแม่หวยที่จะทำงานด้วย (เก็บใน cookie) */
export const selectDealerSchema = z.object({ id: z.string().min(1, "validation.required") });

export type DealerInput = z.infer<typeof dealerSchema>;
