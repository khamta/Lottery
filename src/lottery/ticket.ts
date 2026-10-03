import { parseTicket, type Currency, type ParsedBet, type ParsedTicket, type ParseIssue } from "./parser";
import type { ReadRuleSpec } from "./read-rules";

/** ตัวคูณกีบของลูกค้า + เงื่อนไขอ่านโพยของแม่หวย (ไม่ระบุ = ไม่มีเงื่อนไขเพิ่ม) */
export type ReadOptions = { lakMultiplier: number; rules?: readonly ReadRuleSpec[] };

export type TicketStatusValue = "CONFIRMED" | "REVIEW";

export type TicketSummary = {
  status: TicketStatusValue;
  /** รายการที่นับยอด — โพยสถานะ REVIEW ยังไม่นับ จึงว่าง */
  bets: ParsedBet[];
  issues: ParseIssue[];
  betCount: number;
  totalLak: number;
  totalThb: number;
};

const sumOf = (bets: ParsedBet[], currency: Currency) =>
  bets.reduce((sum, bet) => (bet.currency === currency ? sum + bet.amount : sum), 0);

/** ข้อความนี้เป็นโพยหรือไม่ — ข้อความคุยทั่วไปและข้อความที่มีแต่ยอดรวมไม่นับ */
export function isTicketMessage(parsed: ParsedTicket) {
  return parsed.bets.length > 0 || parsed.issues.length > 0;
}

/**
 * ผลการแยกข้อความ → สถานะและยอดของโพย
 * อ่านได้ครบทุกบรรทัด = CONFIRMED · มีบรรทัดที่อ่านไม่ออก = REVIEW (ยังไม่นับยอด)
 * force = คนตรวจยืนยันให้นับเฉพาะบรรทัดที่อ่านได้
 */
export function summarizeTicket(parsed: ParsedTicket, force = false): TicketSummary {
  const confirmed = parsed.bets.length > 0 && (parsed.issues.length === 0 || force);
  const bets = confirmed ? parsed.bets : [];

  return {
    status: confirmed ? "CONFIRMED" : "REVIEW",
    bets,
    issues: parsed.issues,
    betCount: bets.length,
    totalLak: sumOf(bets, "LAK"),
    totalThb: sumOf(bets, "THB"),
  };
}

/**
 * ข้อความ → ค่าที่จะเขียนลงตาราง tickets / bets — ทางเดียวที่ใช้ทั้งหน้าคีย์โพยและบอท WhatsApp
 * คืน null เมื่อข้อความไม่ใช่โพย
 */
export function readTicketText(text: string, { lakMultiplier, rules }: ReadOptions, force = false) {
  const parsed = parseTicket(text, { lakMultiplier, rules });
  if (!isTicketMessage(parsed)) return null;
  const summary = summarizeTicket(parsed, force);

  return {
    fields: {
      status: summary.status,
      rawText: text,
      lakMultiplier,
      issues: summary.issues,
      totalLak: summary.totalLak,
      totalThb: summary.totalThb,
      betCount: summary.betCount,
    },
    bets: summary.bets.map(({ number, digits, position, currency, amount }) => ({
      number,
      digits,
      position,
      currency,
      amount,
    })),
  };
}

/** ค่าที่จะเขียนลงตาราง tickets / bets */
export type TicketRecord = NonNullable<ReturnType<typeof readTicketText>>;

/**
 * โพยจากรูปที่ยังไม่ได้ข้อความจาก OCR (รอคิว / อ่านไม่ได้ / อ่านแล้วไม่มีอะไรเป็นโพย) → ค่าที่จะเขียนลงตาราง tickets
 * รอตรวจและยังไม่นับยอด โดยมี issue FROM_IMAGE บอกว่ายังรอรูปอยู่ — ข้อความ (คำบรรยายรูป) ว่างได้
 * OCR อ่านได้แล้วใช้ readTicketText ตามข้อความปกติ (ดู applyOcr ใน ingest.ts)
 */
export function readImageTicketText(text: string, { lakMultiplier, rules }: ReadOptions): TicketRecord {
  const parsed = parseTicket(text, { lakMultiplier, rules });
  return {
    fields: {
      status: "REVIEW",
      rawText: text,
      lakMultiplier,
      issues: [{ code: "FROM_IMAGE", line: 0, text: "" }, ...parsed.issues],
      totalLak: 0,
      totalThb: 0,
      betCount: 0,
    },
    bets: [],
  };
}
