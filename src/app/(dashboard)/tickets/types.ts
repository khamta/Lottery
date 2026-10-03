import type { DrawStatusValue } from "@/lib/validations/draw";
import type { TicketSourceValue, TicketStatusValue } from "@/lib/validations/ticket";
import type { ParseIssueCode } from "@/lottery/parser";

/** รูปแบบข้อมูลที่ส่งจาก server ไป client (Decimal -> number, Date -> string) */
export type OcrStatusValue = "PENDING" | "DONE" | "FAILED";

export type TicketRow = {
  id: string;
  /** เลขบิล yyMMddHHmmss (src/lottery/bill.ts) · null เฉพาะแถว optimistic ที่ server ยังไม่ออกเลขให้ */
  billNo: string | null;
  drawId: string;
  drawName: string;
  customerId: string | null;
  customerName: string | null;
  /** ชื่อ/เบอร์คนส่งในกลุ่ม กรณีบอทจับคู่กับลูกค้าไม่ได้ */
  senderName: string | null;
  source: TicketSourceValue;
  status: TicketStatusValue;
  rawText: string;
  lakMultiplier: number;
  note: string | null;
  issueCount: number;
  /** โพยจากรูป: สถานะการอ่านรูปด้วย OCR — null = โพยข้อความ (ไม่มีรูป) */
  ocrStatus: OcrStatusValue | null;
  /** โพยจากรูป: ทุกอย่างที่ OCR อ่านได้จากรูป ก่อนกรองตามกติกา (null = ยังไม่ได้อ่าน / ไม่มีรูป) */
  ocrTranscript: string | null;
  betCount: number;
  totalLak: number;
  totalThb: number;
  createdAt: string;
};

/** คอลัมน์ที่ยอมให้เรียงได้ — ชื่อต้องตรงกับ field ใน Prisma */
export const TICKET_SORTABLE = ["billNo", "createdAt", "status", "betCount", "totalLak", "totalThb"] as const;

/** ตัวเลือกในฟอร์ม/ตัวกรอง — server ส่งมาให้ client ไม่ดึงเอง */
export type DrawOption = { id: string; name: string; status: DrawStatusValue };
export type CustomerOption = { id: string; name: string; lakMultiplier: number };

export const TICKET_STATUSES = ["REVIEW", "CONFIRMED"] as const;

export function isTicketStatus(value: unknown): value is TicketStatusValue {
  return (TICKET_STATUSES as readonly unknown[]).includes(value);
}

/** ค่าตัวกรองใน URL (?draw=&status=) — draw: "all" = ทุกงวด */
export type TicketFilterValues = { drawId: string | null; status: TicketStatusValue | null };

/** สถานะ -> คีย์ i18n (ห้ามเก็บข้อความตรง ๆ เพราะระบบรองรับ 4 ภาษา) */
export const statusKey: Record<TicketStatusValue, string> = {
  CONFIRMED: "tickets.statusCONFIRMED",
  REVIEW: "tickets.statusREVIEW",
};

export const sourceKey: Record<TicketSourceValue, string> = {
  MANUAL: "tickets.sourceMANUAL",
  WHATSAPP: "tickets.sourceWHATSAPP",
};

export const ocrStatusKey: Record<OcrStatusValue, string> = {
  PENDING: "tickets.ocrPENDING",
  DONE: "tickets.ocrDONE",
  FAILED: "tickets.ocrFAILED",
};

/** ปัญหาที่ตัวแยกข้อความพบ -> คีย์ i18n */
export const issueKey: Record<ParseIssueCode, string> = {
  NO_AMOUNT: "tickets.issueNO_AMOUNT",
  BAD_NUMBER: "tickets.issueBAD_NUMBER",
  THREE_DIGIT_BOTTOM: "tickets.issueTHREE_DIGIT_BOTTOM",
  TOTAL_MISMATCH: "tickets.issueTOTAL_MISMATCH",
  UNREADABLE: "tickets.issueUNREADABLE",
  FROM_IMAGE: "tickets.issueFROM_IMAGE",
};

/** รูปโพย — เสิร์ฟจาก tickets/image/[id]/route.ts */
export const ticketImageUrl = (ticketId: string) => `/tickets/image/${ticketId}`;
