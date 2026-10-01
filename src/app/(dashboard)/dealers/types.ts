/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type DealerRow = {
  id: string;
  name: string;
  note: string | null;
  /** ชื่อเจ้าของ — มีค่าเฉพาะแม่หวยของบัญชีอื่น (ผู้ดูแลระบบเห็น) */
  ownerName: string | null;
  drawCount: number;
  customerCount: number;
  groupCount: number;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const DEALER_SORTABLE = ["name", "createdAt", "updatedAt"] as const;
