import type { CurrencyValue, PositionValue } from "@/lib/validations/limit";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Decimal -> number, Date -> string) */
export type LimitRow = {
  id: string;
  digits: 2 | 3;
  /** ว่าง = ใช้กับทุกเลขของประเภทนั้น */
  number: string;
  position: PositionValue;
  currency: CurrencyValue;
  maxAmount: number;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const LIMIT_SORTABLE = ["digits", "number", "position", "currency", "maxAmount", "updatedAt"] as const;

export { currencyKey, digitsKey, positionKey } from "@/lottery/labels";
