import type { DrawStatusValue } from "@/lib/validations/draw";
import type { TicketSourceValue, TicketStatusValue } from "@/lib/validations/ticket";
import { OCR_SERVICE_READER } from "@/lottery/image-text";
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
  /** โพยจากรูป: ตัวอ่านที่กำลังอ่าน (PENDING) / อ่านล่าสุด — ชื่อรุ่น Claude หรือ "ocr" · null = ยังรอคิว */
  ocrReader: string | null;
  /** โพยจากรูป: ทุกอย่างที่ OCR อ่านได้จากรูป ก่อนกรองตามกติกา (null = ยังไม่ได้อ่าน / ไม่มีรูป) */
  ocrTranscript: string | null;
  /** โพยจากรูป: เวลาที่คนแก้รูป (ครอป/ลบ/หมุน) ล่าสุด — null = ยังไม่เคยแก้ (รูปตามที่ลูกค้าส่งมา) */
  imageEditedAt: string | null;
  /** กลุ่ม WhatsApp ที่ส่งโพยนี้มา (null = คีย์เอง / ไม่รู้กลุ่ม) */
  groupId: string | null;
  /** เข้ามาหลังจากที่ผู้ใช้กด "ดูทั้งหมดแล้ว" ของกลุ่มนี้ครั้งล่าสุด (ยังไม่ได้ดู) */
  isNew: boolean;
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

/** กลุ่มโพยของโพยที่ไม่มีกลุ่ม WhatsApp (คีย์เอง / ไม่รู้กลุ่ม) — ใช้ทั้งใน URL (?group=none) และ TicketSeen.groupKey */
export const NO_GROUP = "none";
/** ?group=all = ดูทุกกลุ่มรวมกัน */
export const ALL_GROUPS = "all";

/**
 * ตัวเลือกกลุ่มในหน้าโพย (ของงวดที่กรองอยู่) — key = WhatsappGroup.id หรือ NO_GROUP · name null = NO_GROUP (แปลตอนแสดง)
 * total = จำนวนโพยในงวด · unread = จำนวนที่ยังไม่ได้ดู
 */
export type TicketGroupOption = { key: string; name: string | null; total: number; unread: number };

/**
 * ค่าใน URL ที่หน้าโพยจำไว้ (cookie แยกตามแม่หวย) — กลับมาที่ /tickets เปล่า ๆ จะได้ตัวกรองเดิม
 * ไม่จำเลขหน้า: กลับมาแล้วเริ่มที่หน้าแรก (โพยใหม่อยู่บนสุด)
 */
export const REMEMBERED_TICKET_PARAMS = [
  "draw",
  "group",
  "status",
  "odd",
  "amount",
  "image",
  "q",
  "pageSize",
  "sort",
  "order",
] as const;

/** ชื่อ cookie ที่จำตัวกรองของหน้าโพย — แยกตามแม่หวย เพราะงวด/กลุ่มเป็นของแม่หวยแต่ละคน */
export const ticketFiltersCookie = (dealerId: string) => `tickets-filters-${dealerId}`;

export const TICKET_STATUSES = ["REVIEW", "CONFIRMED"] as const;

export function isTicketStatus(value: unknown): value is TicketStatusValue {
  return (TICKET_STATUSES as readonly unknown[]).includes(value);
}

/**
 * ปุ่มอ่านรูปโพยรอตรวจทั้งงวดใหม่ของผู้ดูแลระบบ — count = จำนวนใบที่อ่านใหม่ได้ (rereadableWhere)
 * limit = อ่านได้ครั้งละไม่เกินเท่านี้ใบ (REREAD_DRAW_MAX)
 */
export type RereadDrawTarget = { drawId: string; drawName: string; count: number; limit: number };

/** สั่งอ่านรูปใหม่ได้ไหม: โพยจากรูปที่ยังรอตรวจ และรูปไม่ได้อยู่ในคิวอ่าน */
export const canRereadImage = (row: Pick<TicketRow, "status" | "ocrStatus">) =>
  row.status === "REVIEW" && !!row.ocrStatus && row.ocrStatus !== "PENDING";

/**
 * ค่าตัวกรองใน URL (?draw=&status=&odd=1&amount=&image=1) — draw: "all" = ทุกงวด · oddLak = เฉพาะโพยที่มียอดกีบไม่ลงท้าย 000
 * amount = เฉพาะโพยที่มีรายการแทงยอดต่อตัวเท่านี้พอดี (กีบหรือบาท) · null/ไม่มี = ไม่กรอง
 * image = เฉพาะโพยที่มีรูป (?image=1)
 */
export type TicketFilterValues = {
  drawId: string | null;
  status: TicketStatusValue | null;
  oddLak: boolean;
  amount?: number | null;
  image?: boolean;
  /** กลุ่มที่ดูอยู่ (TicketGroupOption.key) — null/ไม่มี = ทุกกลุ่ม */
  groups?: string[] | null;
};

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

/** ตัวอ่านรูป (ocrReader) → ชื่อที่แสดง: claude-sonnet-5-5 → Sonnet 5.5 · "ocr" → OCR */
export function readerName(reader: string) {
  if (reader === OCR_SERVICE_READER) return "OCR";
  const [family, ...version] = reader.replace(/^claude-/, "").split("-");
  if (!family || version.length === 0) return reader;
  return `${family[0]!.toUpperCase()}${family.slice(1)} ${version.join(".")}`;
}

/** สถานะการอ่านรูป + ตัวอ่าน: รอคิว · กำลังอ่านด้วย Sonnet 5.5 · อ่านแล้ว (Opus 5.5) · อ่านไม่ได้ */
export function ocrStatusText(
  { ocrStatus, ocrReader }: { ocrStatus: OcrStatusValue; ocrReader: string | null },
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (!ocrReader || ocrStatus === "FAILED") return t(ocrStatusKey[ocrStatus]);
  return t(ocrStatus === "PENDING" ? "tickets.ocrReadingBy" : "tickets.ocrDoneBy", { reader: readerName(ocrReader) });
}

/** ปัญหาที่ตัวแยกข้อความพบ -> คีย์ i18n */
export const issueKey: Record<ParseIssueCode, string> = {
  NO_AMOUNT: "tickets.issueNO_AMOUNT",
  BAD_NUMBER: "tickets.issueBAD_NUMBER",
  THREE_DIGIT_BOTTOM: "tickets.issueTHREE_DIGIT_BOTTOM",
  TOTAL_MISMATCH: "tickets.issueTOTAL_MISMATCH",
  UNREADABLE: "tickets.issueUNREADABLE",
  FROM_IMAGE: "tickets.issueFROM_IMAGE",
};

/**
 * รูปโพย — เสิร์ฟจาก tickets/image/[id]/route.ts · original = รูปต้นฉบับก่อนแก้
 * editedAt ต่อท้าย URL: แก้รูปแล้ว URL เปลี่ยน เบราว์เซอร์จึงไม่ใช้รูปเก่าที่ cache ไว้
 */
export function ticketImageUrl(ticketId: string, { editedAt = null, original = false }: { editedAt?: string | null; original?: boolean } = {}) {
  if (original) return `/tickets/image/${ticketId}?original=1`;
  return editedAt ? `/tickets/image/${ticketId}?v=${new Date(editedAt).getTime()}` : `/tickets/image/${ticketId}`;
}
