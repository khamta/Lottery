import { z } from "zod";

/** ตัวคูณยอดกีบที่เลือกได้: 1000 = ลูกค้าพิมพ์ย่อเป็นหลักพัน, 1 = พิมพ์ยอดเต็ม */
export const LAK_MULTIPLIERS = [1000, 1] as const;

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ customers.validation.* (src/i18n/modules/customers.ts) */
export const customerSchema = z.object({
  name: z.string().trim().min(1, "customers.validation.nameRequired").max(120, "validation.nameMax"),
  /** เบอร์ WhatsApp ตัวเลขล้วนรวมรหัสประเทศ เช่น 8562055512345 — ว่างได้ */
  phone: z.string().trim().regex(/^(\d{8,15})?$/, "customers.validation.phone"),
  lakMultiplier: z.coerce
    .number({ invalid_type_error: "customers.validation.multiplier" })
    .refine((value) => (LAK_MULTIPLIERS as readonly number[]).includes(value), "customers.validation.multiplier"),
  note: z.string().max(200, "customers.validation.noteMax"),
});

export const createCustomerSchema = customerSchema;
export const updateCustomerSchema = customerSchema.extend({ id: z.string().min(1, "validation.required") });
export const deleteCustomerSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ลบหลายรายการพร้อมกัน — จำกัดไม่เกิน 100 id ต่อครั้ง (เท่ากับ pageSize สูงสุด) */
export const deleteCustomersSchema = z.object({
  ids: z
    .array(z.string().min(1, "validation.required"))
    .min(1, "validation.required")
    .max(100, "validation.required"),
});

export type CustomerInput = z.infer<typeof customerSchema>;
