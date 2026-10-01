/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  lakMultiplier: number;
  note: string | null;
  ticketCount: number;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const CUSTOMER_SORTABLE = ["name", "phone", "lakMultiplier", "updatedAt"] as const;

/** ตัวคูณยอดกีบ -> คีย์ i18n */
export const multiplierKey: Record<number, string> = {
  1000: "customers.multiplier1000",
  1: "customers.multiplier1",
};
