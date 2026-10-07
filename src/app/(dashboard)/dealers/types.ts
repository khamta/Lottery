import type { OcrModelField, OcrStrongModelField } from "@/lottery/ai-models";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type DealerRow = {
  id: string;
  name: string;
  note: string | null;
  /** รุ่นที่อ่านรูปโพย — เป็นค่าในฟอร์มแล้ว ("auto" / ชื่อรุ่น · ดู src/lottery/ai-models.ts) */
  ocrModel: OcrModelField;
  /** รุ่นที่อ่านซ้ำ ("none" / ชื่อรุ่น) — ใช้เมื่อเลือกรุ่นหลักเอง */
  ocrStrongModel: OcrStrongModelField;
  /** สวิตช์หลัก: อ่านรูปโพยด้วย AI ไหม — false = ทุกกลุ่มของแม่หวยนี้ไม่อ่าน (เก็บรูปไว้รอตรวจ) */
  readImages: boolean;
  /** ชื่อเจ้าของ — มีค่าเฉพาะแม่หวยของบัญชีอื่น (ผู้ดูแลระบบเห็น) */
  ownerName: string | null;
  drawCount: number;
  customerCount: number;
  groupCount: number;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const DEALER_SORTABLE = ["name", "createdAt", "updatedAt"] as const;
