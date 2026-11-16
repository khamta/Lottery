import type { WhatsappAccountRow } from "../types";

/** บัญชีที่แสดงในหน้ารายละเอียด + ข้อมูลสำหรับเชื่อมต่อ (QR เป็นรูปที่ server สร้างให้แล้ว) */
export type WhatsappAccountDetail = WhatsappAccountRow & {
  /** data URL ของรูป QR (null = ไม่มี QR ให้สแกนตอนนี้) */
  qrImage: string | null;
  pairingCode: string | null;
};

import type { LotteryTypeValue } from "@/lottery/labels";
import type { Currency } from "@/lottery/parser";

/**
 * กลุ่มของบัญชี — dealerId = อ่านโพยเข้าแม่หวยไหน (null = ไม่อ่าน) · lottery = ลงงวดของหวยประเภทไหน
 * readImages = อ่านรูปโพยด้วย AI ไหม (false = เก็บรูปไว้เป็นโพยรอตรวจ ให้คนดูเอง)
 * threeDigitBottom = เลข 3 ตัวแทงล่าง / บนล่างได้ · currency = สกุลเงินเมื่อทั้งโพยไม่ระบุ (src/lottery/group-read.ts)
 */
export type WhatsappGroupRow = {
  id: string;
  name: string;
  jid: string;
  size: number;
  active: boolean;
  dealerId: string | null;
  lottery: LotteryTypeValue;
  readImages: boolean;
  threeDigitBottom: boolean;
  currency: Currency;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const GROUP_SORTABLE = ["name", "size"] as const;
