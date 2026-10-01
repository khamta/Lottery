import { z } from "zod";

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ dealers.validation.* (src/i18n/modules/dealers.ts) */
export const dealerSchema = z.object({
  name: z.string().trim().min(1, "dealers.validation.nameRequired").max(120, "validation.nameMax"),
  note: z.string().max(200, "dealers.validation.noteMax"),
});

export const createDealerSchema = dealerSchema;
export const updateDealerSchema = dealerSchema.extend({ id: z.string().min(1, "validation.required") });
export const deleteDealerSchema = z.object({ id: z.string().min(1, "validation.required") });
/** เลือกแม่หวยที่จะทำงานด้วย (เก็บใน cookie) */
export const selectDealerSchema = z.object({ id: z.string().min(1, "validation.required") });

export type DealerInput = z.infer<typeof dealerSchema>;
