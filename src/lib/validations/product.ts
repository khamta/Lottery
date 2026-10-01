import { z } from "zod";

export const productStatusEnum = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

/** ข้อความ error เป็นคีย์ i18n — กฎเฉพาะ module ใช้ products.validation.* (src/i18n/modules/products.ts) กฎกลางใช้ validation.* */
export const productSchema = z.object({
  name: z.string().min(2, "products.validation.nameMin").max(120, "validation.nameMax"),
  sku: z
    .string()
    .min(3, "products.validation.skuMin")
    .max(40, "validation.nameMax")
    .regex(/^[A-Za-z0-9-_]+$/, "products.validation.skuPattern"),
  description: z.string().max(1000, "validation.descriptionMax").optional().or(z.literal("")),
  price: z.coerce
    .number({ invalid_type_error: "products.validation.priceNumber" })
    .min(0, "products.validation.priceMin"),
  stock: z.coerce
    .number({ invalid_type_error: "products.validation.stockNumber" })
    .int("products.validation.stockInt")
    .min(0, "products.validation.stockMin"),
  status: productStatusEnum.default("DRAFT"),
});

export const createProductSchema = productSchema;
export const updateProductSchema = productSchema.extend({ id: z.string().min(1, "validation.required") });
export const deleteProductSchema = z.object({ id: z.string().min(1, "validation.required") });
/** ลบหลายรายการพร้อมกัน — จำกัดไม่เกิน 100 id ต่อครั้ง (เท่ากับ pageSize สูงสุด) */
export const deleteProductsSchema = z.object({
  ids: z
    .array(z.string().min(1, "validation.required"))
    .min(1, "validation.required")
    .max(100, "validation.required"),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductStatusValue = z.infer<typeof productStatusEnum>;
