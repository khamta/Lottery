import type { ProductStatusValue } from "@/lib/validations/product";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Decimal -> number, Date -> string) */
export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  stock: number;
  status: ProductStatusValue;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const PRODUCT_SORTABLE = ["name", "sku", "price", "stock", "status", "updatedAt"] as const;

/** สถานะ -> คีย์ i18n (ห้ามเก็บข้อความตรง ๆ เพราะระบบรองรับ 4 ภาษา) */
export const statusKey: Record<ProductStatusValue, string> = {
  DRAFT: "products.statusDRAFT",
  ACTIVE: "products.statusACTIVE",
  ARCHIVED: "products.statusARCHIVED",
};
