import type { WhatsappAccountRow } from "../types";

/** บัญชีที่แสดงในหน้ารายละเอียด + ข้อมูลสำหรับเชื่อมต่อ (QR เป็นรูปที่ server สร้างให้แล้ว) */
export type WhatsappAccountDetail = WhatsappAccountRow & {
  /** data URL ของรูป QR (null = ไม่มี QR ให้สแกนตอนนี้) */
  qrImage: string | null;
  pairingCode: string | null;
};

/** กลุ่มของบัญชี — dealerId = อ่านโพยเข้าแม่หวยไหน (null = ไม่อ่าน) */
export type WhatsappGroupRow = {
  id: string;
  name: string;
  jid: string;
  size: number;
  active: boolean;
  dealerId: string | null;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const GROUP_SORTABLE = ["name", "size"] as const;
