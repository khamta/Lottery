import type { DrawStatusValue } from "@/lib/validations/draw";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Date -> string) */
export type DrawRow = {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  drawDate: string;
  status: DrawStatusValue;
  topResult: string | null;
  bottomResult: string | null;
  ticketCount: number;
  updatedAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const DRAW_SORTABLE = ["name", "drawDate", "status", "updatedAt"] as const;

/** สถานะ -> คีย์ i18n (ห้ามเก็บข้อความตรง ๆ เพราะระบบรองรับ 4 ภาษา) */
export const statusKey: Record<DrawStatusValue, string> = {
  OPEN: "draws.statusOPEN",
  CLOSED: "draws.statusCLOSED",
  SETTLED: "draws.statusSETTLED",
};
