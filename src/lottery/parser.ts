/**
 * ตัวแยกข้อความโพยหวยจากแชต — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * ใช้ร่วมกันทั้งหน้าวางข้อความเองและบอท WhatsApp
 *
 *   243=150                → 243 (3 ตัวบน) 150
 *   30.70=100ລ່າງ           → 30 และ 70 ล่าง เลขละ 100
 *   38.78.33.73=300ບລ      → บน 300 และล่าง 300 ทุกเลข
 *   26.590.90=10ບລ         → 26 / 90 บนล่าง แล้วแยก 590 ลงแถวใหม่ (เลข 3 ตัวลงบนอย่างเดียว)
 *   78.87=1000*1000฿       → บน 1000 × ล่าง 1000 บาท
 *   772;5 · 762-5          → เลข 772 / 762 บน 5
 *   23:63:20ບລ             → : คั่นทั้งเลขและยอดได้เมื่อยอดมีคำกำกับ (23 63 บนล่าง เลขละ 20)
 *   04_44_84_=20           → คั่นเลขด้วยขีดล่างได้
 *   570 57 70-30,000       → หลายเลขคั่นด้วยช่องว่าง ขีดตัวเดียวคั่นยอด
 *   33 73 073 ໂຕ 20         → ໂຕ / ຕົວ / ตัว = เลขละ (เหมือน =)
 *   =10.000 · =10,000      → ยอดกีบตั้งแต่ 10,000 = พิมพ์เต็มจำนวนแล้ว ไม่คูณ
 *   ລວມ150 · ລາວ200,000    → ยอดรวมที่ลูกค้าแจ้ง (ใช้ตรวจกับยอดที่คิดได้)
 *   ຫລັກ2-9=5              → เติมหลักร้อย 2 และ 9 หน้าเลข 2 ตัวทุกตัวด้านบน (08 → 208, 908) เป็นเลข 3 ตัวบน เลขละ 5
 *   16.56=10₭ ຫລັກ 8=2₭    → ຫລັກ ต่อท้ายบรรทัดเดียวกัน อ่านเหมือนขึ้นบรรทัดใหม่ (16 56 เลขละ 10 · 816 856 เลขละ 2)
 *   32 72 11 / ຫຼັກ 1 .3 .5ໂຕ500฿ → บรรทัดเลข 2 ตัวที่ไม่มียอดตามด้วย ຫລັກ = เลขฐานของ ຫລັກ เท่านั้น (ไม่ใช่รายการแทง)
 *   เอาแต่3โต              → หมายเหตุ "เอาแต่เลข 3 ตัว" ไม่ใช่รายการแทง
 *   04/44/84 / ລັກ2 / 22/62 / ລັກ8 / ໂຕ20 ບລ ເອົາທັງ2-3ໂຕ
 *                          → หลายชุด "เลขฐาน + ລັກN" ที่ไม่มียอด ใช้ยอดบรรทัดท้ายร่วมกัน (204 244 284 … 822 862 บน 20)
 *                            ເອົາທັງ2-3ໂຕ = แทงเลขฐาน 2 ตัวด้วยตามฝั่งที่ระบุ · ไม่มี = เลข 3 ตัวอย่างเดียว
 *   919 / 959 / 989=10     → บรรทัดเลขเดี่ยวที่ไม่มียอดติดกัน ตามด้วยเลขเดี่ยวที่มียอด = ใช้ยอด/คำกำกับเดียวกันทุกเลข
 *   24 / 64 / 07 / ປ່ອງ3   → ປ່ອງ / ຮູ = ยอดเลขละ ใช้กับทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน (24 64 07 บน เลขละ 3)
 *   ລາວ ບົນ-ລ່າງ ຮູ10 / 08,80,02 / 95,59 → หัวยอดก่อนเลข = ยอดของบรรทัดเลขที่ไม่มียอดด้านล่าง (บนล่าง เลขละ 10)
 *   22_10 / 62_10 / ລ່າງ   → เลขเดียว + ขีดล่างตัวเดียว = ยอด · บรรทัด ລ່າງ / ບົນ / ບລ เปล่า ๆ = ฝั่งของบรรทัดด้านบนที่ไม่ได้ระบุฝั่ง
 *   173 / 73 / 33 / ໂຕ10   → บรรทัด ໂຕ10 / =10 / =ໂຕ5฿ / ໂຕ=10 ที่ไม่มีเลข ใช้แบบเดียวกับ ປ່ອງ (173 73 33 บน เลขละ 10)
 *   00=20=400=ໂຕ10ພ.ບ.ລ   → = คั่นระหว่างเลขได้ (= ตัวสุดท้ายคั่นยอด) · 00 20 บนล่าง 400 บน เลขละ 10
 *
 *   11 5? 91=10            → ? ที่ทำให้เลขนามสัตว์ครบชุด เติมให้เลย (11 51 91 · ดู animal.ts)
 *
 * บรรทัดที่อ่านไม่ออกจะไม่ถูกเดา (ยกเว้นเลขนามสัตว์ด้านบน) — คืนเป็น issue ให้คนตรวจ
 */

import { fillAnimalGuesses } from "./animal";
import { applyReadRules, prepareReadRules, type ReadRuleSpec } from "./read-rules";

export type Currency = "LAK" | "THB";
export type Position = "TOP" | "BOTTOM";

export type ParsedBet = {
  /** บรรทัดในข้อความ (เริ่มที่ 1) */
  line: number;
  /** เก็บเป็นข้อความเพื่อคงศูนย์นำหน้า เช่น "06" */
  number: string;
  digits: 2 | 3;
  position: Position;
  currency: Currency;
  /** ยอดจริงหลังคูณตัวคูณกีบแล้ว (ยอดกีบที่พิมพ์ตั้งแต่ LAK_FULL_BET_AMOUNT ไม่คูณ) */
  amount: number;
};

export type ParseIssueCode =
  /** มีแต่เลข ไม่มียอด เช่น "399" */
  | "NO_AMOUNT"
  /** เลขไม่ใช่ 2 หรือ 3 หลัก */
  | "BAD_NUMBER"
  /** เลข 3 ตัวลงได้เฉพาะบน */
  | "THREE_DIGIT_BOTTOM"
  /** ยอดรวมที่แจ้ง (ລວມ) ไม่ตรงกับยอดที่คิดได้ */
  | "TOTAL_MISMATCH"
  | "UNREADABLE"
  /** โพยจากรูปที่ยังไม่ได้ข้อความจาก OCR (รอคิว/อ่านไม่ได้) — ตัวแยกข้อความไม่สร้างเอง ดู ticket.ts */
  | "FROM_IMAGE"
  /** AI อ่านรูปได้ครบแล้ว แต่แม่หวยตั้งให้รอคนตรวจก่อนนับยอด (ปิดสวิตช์ dealers.aiAutoCount) — ตัวแยกข้อความไม่สร้างเอง ดู ticket.ts */
  | "AI_HOLD";

export type ParseIssue = { code: ParseIssueCode; line: number; text: string };

export type ParsedTicket = {
  bets: ParsedBet[];
  issues: ParseIssue[];
  /** บรรทัดที่ไม่มีตัวเลขเลย เช่น ชื่อลูกค้า คำทักทาย */
  notes: string[];
  /**
   * ยอดรวมที่ลูกค้าแจ้ง ในหน่วยที่พิมพ์แบบย่อ (ยังไม่คูณ) — null = ไม่ได้แจ้ง
   * แจ้งเต็มจำนวน (ตั้งแต่ LAK_FULL_AMOUNT) ถูกหารตัวคูณกลับ: ລວມ750,000 = ລວມ750 เมื่อตัวคูณ 1,000
   */
  declaredTotal: number | null;
  /** ผลรวมของยอดในทุกรายการ ในหน่วยที่พิมพ์แบบย่อ (ยังไม่คูณ) ใช้เทียบกับ declaredTotal */
  typedTotal: number;
  needsReview: boolean;
};

export type ParseOptions = {
  /** ลูกค้าพิมพ์ยอดกีบย่อเป็นหลักพัน: 150 = 150,000 กีบ — บาทไม่คูณ */
  lakMultiplier?: number;
  /** เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเองของแม่หวย (read-rules.ts) — ใช้กับทีละบรรทัดก่อนอ่านตามรูปแบบมาตรฐาน */
  rules?: readonly ReadRuleSpec[];
  /** false = ไม่ใช้เงื่อนไขที่ติดมากับระบบ (built-in-read-rules.ts) — ใช้ในเทสต์ไวยากรณ์ของตัวแยกเองเท่านั้น ระบบจริงใช้เสมอ */
  builtInRules?: boolean;
};

export const DEFAULT_LAK_MULTIPLIER = 1000;
/** ยอดรวม (ລວມ) กีบที่พิมพ์ตั้งแต่ค่านี้ (10.000 / 10,000) ถือว่าพิมพ์เต็มจำนวนแล้ว — ไม่คูณตัวคูณกีบ */
export const LAK_FULL_AMOUNT = 10_000;
/**
 * ยอดแทงกีบที่พิมพ์ตั้งแต่ค่านี้ถือว่าเต็มจำนวน — คูณเฉพาะ 1–999: "=5" = 5,000 · "=5.000" / "=1000" = 5,000 / 1,000
 * (ยอดรวมใช้ LAK_FULL_AMOUNT เพราะยอดรวมแบบย่อเกิน 999 ได้บ่อย: ລວມ1.800 = 1,800,000)
 */
export const LAK_FULL_BET_AMOUNT = 1_000;

type PositionMark = Position | "BOTH";

type SuffixToken = { text: string; position?: PositionMark; currency?: Currency };

/**
 * คำกำกับท้ายยอด — "ບ" ตัวเดียว = ບົນ (ผู้ใช้เลือก: ลูกค้าย่อ ບົນ แบบนี้ ส่วนบาทพิมพ์ ບາດ / ฿ / B)
 * "บ" ไทยตัวเดียวยังไม่อยู่ในนี้เพราะกำกวม (บน หรือ บาท) จึงส่งให้คนตรวจ
 */
const SUFFIX_TOKENS: SuffixToken[] = [
  { text: "ບົນລ່າງ", position: "BOTH" },
  { text: "ບົນລາງ", position: "BOTH" },
  // ລ່າງບົນ = ບົນລ່າງ ที่พิมพ์สลับลำดับ
  { text: "ລ່າງບົນ", position: "BOTH" },
  { text: "ລາງບົນ", position: "BOTH" },
  { text: "ล่างบน", position: "BOTH" },
  { text: "ລບ", position: "BOTH" },
  { text: "ลบ", position: "BOTH" },
  { text: "ບລ", position: "BOTH" },
  { text: "บนล่าง", position: "BOTH" },
  { text: "บล", position: "BOTH" },
  { text: "ລ່າງ", position: "BOTTOM" },
  { text: "ລາງ", position: "BOTTOM" },
  { text: "ລຸ່ມ", position: "BOTTOM" },
  { text: "ລ", position: "BOTTOM" },
  { text: "ล่าง", position: "BOTTOM" },
  { text: "ล", position: "BOTTOM" },
  { text: "ບົນ", position: "TOP" },
  { text: "ບ", position: "TOP" },
  { text: "บน", position: "TOP" },
  { text: "฿", currency: "THB" },
  { text: "บาท", currency: "THB" },
  // บาด = ບາດ ที่พิมพ์ด้วยตัวอักษรไทย
  { text: "บาด", currency: "THB" },
  { text: "ບາດ", currency: "THB" },
  { text: "thb", currency: "THB" },
  { text: "baht", currency: "THB" },
  { text: "₭", currency: "LAK" },
  { text: "ກີບ", currency: "LAK" },
  // ກິບ / กิบ = ກີບ ที่พิมพ์สระอิแทนสระอี
  { text: "ກິບ", currency: "LAK" },
  { text: "กีบ", currency: "LAK" },
  { text: "กิบ", currency: "LAK" },
  { text: "lak", currency: "LAK" },
  { text: "kip", currency: "LAK" },
  // ລາວ ท้ายยอด = บอกว่าเป็นหวยลาว ไม่มีผลกับรายการ
  // ເລກ / เลข หน้าคำกำกับ ("ເລກລ່າງ" = เลขล่าง) ไม่มีผล
  { text: "ເລກ" },
  { text: "เลข" },
  // ເລຂ = ເລກ ที่พิมพ์ ຂ แทน ກ · ເລຂບນ / ເລກບນ = ເລກບົນ ที่ไม่มีไม้ົ (ບນ เดี่ยว ๆ ยังกำกวม ส่งให้คนตรวจ)
  { text: "ເລຂ" },
  { text: "ເລຂບນ", position: "TOP" },
  { text: "ເລກບນ", position: "TOP" },
  { text: "ລາວ" },
  { text: "ลาว" },
  // ພັນ / ພ / พัน ท้ายยอด = หลักพันกีบ ซึ่งยอดกีบแบบย่อเป็นหลักพันอยู่แล้ว (ตัวคูณกีบ) — ไม่มีผลกับรายการ
  { text: "ພັນ" },
  { text: "ພ" },
  { text: "พัน" },
  { text: "พ" },
  // 5k = 5 พัน (kip ยาวกว่าจึงถูกเลือกก่อน)
  { text: "k" },
  // 100b = 100 บาท (baht ยาวกว่าจึงถูกเลือกก่อน)
  { text: "b", currency: "THB" },
];
// คำยาวก่อน กัน "ລ" ชนะ "ລ່າງ"
SUFFIX_TOKENS.sort((a, b) => b.text.length - a.text.length);

/** ยอด: คั่นหลักพันด้วย , หรือ . ได้ (10,000 / 10.000) — จุดที่ไม่ใช่หลักพันไม่ถูกนับเป็นยอด */
const AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})+(?!\d)|\d[\d,]*`;
/** ລາວ200,000 = ยอดรวมของโพยหวยลาว · ลวม = ລວມ ที่พิมพ์ด้วยตัวอักษรไทย */
const TOTAL_LINE = new RegExp(String.raw`^(?:ລວມ|รวม|ลวม|total|ລາວ|ลาว)[^\d]*(${AMOUNT})`, "i");
/** =15/ລາວ · =15 ລາວ = ยอดรวมของโพยหวยลาว (ລາວ ต่อท้ายแทนนำหน้า) */
const LAO_TOTAL_TAIL = new RegExp(String.raw`^[=:]\s*(${AMOUNT})\s*[/\s]*(?:ລາວ|ลาว)\s*$`, "iu");
/**
 * ລ120 / ล 14.000บน = ยอดรวม (ລ / ล ตัวเดียวนำหน้ายอดเปล่า ๆ = ย่อของ ລວມ ไม่ใช่ ລ່າງ)
 * ตัวท้าย (group 2) ต้องเป็นคำกำกับ — ตรวจด้วย readSuffix ใน totalOf
 */
const SHORT_TOTAL_LINE = new RegExp(String.raw`^(?:ລ|ล)\s*[=:]?\s*(${AMOUNT})([^\d]*)$`, "iu");
/**
 * 14.000ບົນ / 14,000 / 500.000 = ยอดรวม — ตัวเลขรูปแบบหลักพันเดี่ยว ๆ ในบรรทัด ที่ทุกกลุ่มหลังตัวแรกเป็น 000
 * (ยอดเงินกีบไม่มีหลักร้อย — "500.600" / "506.546" คือเลข 3 ตัวสองตัว ไม่ใช่ยอดรวม)
 * ยอดแบบย่อที่มีหลักร้อย (ລວມ1.800) ต้องมี ລວມ / ລ นำหน้า
 */
const BARE_TOTAL_LINE = /^(\d{1,3}(?:[.,]000)+)([^\d]*)$/u;
/** =15.000 = ยอดรวมแบบ BARE_TOTAL_LINE ที่มี = นำหน้า — ใช้เฉพาะเมื่อไม่มีเลขรอยอดด้านบน */
const EQUALS_TOTAL_LINE = /^[=:]\s*(\d{1,3}(?:[.,]000)+)([^\d]*)$/u;

/** บรรทัดยอดรวม → [ข้อความทั้งบรรทัด, ยอด] · null = ไม่ใช่บรรทัดยอดรวม */
function totalOf(text: string): RegExpMatchArray | null {
  const full = text.match(TOTAL_LINE) ?? text.match(LAO_TOTAL_TAIL);
  if (full && !laoBetLine(text, full) && !LAO_EACH.test(text)) return full;
  // ລ120 / 14.000ບົນ — ส่วนท้ายต้องอ่านเป็นคำกำกับได้ (ບົນ / ฿ / ພັນ …) ไม่งั้นไม่ใช่ยอดรวม
  // Jo: 70.000k = ชื่อลูกค้า + ยอดรวม (ชื่อไม่ใช่ ໂຕ / ຮູ / ປ່ອງ ซึ่งเป็นยอดเลขละ)
  const named = text.match(NAMED_TOTAL);
  const rest = named && !AMOUNT_EACH_PREFIX.test(`${named[1]}1`) ? named[2]! : text;
  const short = rest.match(SHORT_TOTAL_LINE) ?? rest.match(BARE_TOTAL_LINE);
  return short && readSuffix(short[2]) ? short : null;
}
/**
 * ລາວ นำหน้าเลขแทงที่มีเลข/ยอดตามมา = ชื่อหวย ไม่ใช่ยอดรวม: "ລາວ03-43-83=5" (ລາວ200,000 / ລາວ/90 ยังเป็นยอดรวม)
 * — ລວມ / รวม / total ยังเป็นยอดรวมเสมอ
 */
const LAO_PREFIX = /^(?:ລາວ|ลาว)/iu;
/** ລາວໂຕ2ພັນ / ລາວ ຮູ10 = ยอดเลขละของหวยลาว (บรรทัดยอดของเลขด้านบน/หัวยอด) ไม่ใช่ยอดรวม */
const LAO_EACH = /^(?:ລາວ|ลาว)\s*[/:]?\s*(?:ໂຕ|ຕົວ|ตัว|โต|to|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|hu)\s*(?:ລະ|ละ)?\s*\d/iu;
function laoBetLine(text: string, match: RegExpMatchArray): boolean {
  return LAO_PREFIX.test(text) && /[\d=:]/.test(text.slice(match[0].length));
}
/** ชื่อ + : นำหน้ายอดรวม: "Jo: 70.000k" → ["Jo", "70.000k"] */
const NAMED_TOTAL = /^([\p{L}\p{M}]{2,})\s*:\s*(\d.*)$/u;
/** หน่วยเต็มของยอดรวม: ລວມ:1ລ້ານ = 1,000,000 กีบ · ລວມ5ແສນ = 500,000 กีบ */
const TOTAL_UNITS: Record<string, number> = { ລ້ານ: 1_000_000, ລານ: 1_000_000, ล้าน: 1_000_000, ແສນ: 100_000, แสน: 100_000 };
const TOTAL_UNIT_LINE = /^(?:ລວມ|รวม|ลวม|total|ລາວ|ลาว)[^\d]*(\d+(?:[.,]\d+)?)\s*(ລ້ານ|ລານ|ล้าน|ແສນ|แสน)/iu;
/** สกุลเงิน/หลักพันระหว่างยอดบนกับ × : "20ບາດ×20ບາດ" */
const CURRENCY_BEFORE_TIMES = /(\d)\s*(฿|ບາດ|บาท|บาด|baht|b|₭|ກີບ|ກິບ|กีบ|กิบ|kip|ພັນ|ພ|พัน|k)\s*(?=[*x×]\s*\d)/iu;
/** ໂຕ / ຮູ / ປ່ອງ (+ລະ) หน้ายอด: "255=ໂຕ5ພັນ" */
const AMOUNT_EACH_PREFIX = /^(?:ໂຕ|ຕົວ|ตัว|โต|to|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|hu)\s*(?:ລະ|ละ)?\s*(?=\d)/iu;
/** คำกำกับหน้ายอด: "ບ10" · "ລ່າງ 20" (ตรวจกับ SUFFIX_TOKENS อีกชั้น) */
const MARK_BEFORE_AMOUNT = /^([^\d\s][^\d]*?)\s*(\d.*)$/u;
const THB_WORD =/฿|บาท|บาด|ບາດ|thb|baht/i;
const LAK_WORD = /₭|ກີບ|ກິບ|กีบ|กิบ|\bkip\b|\blak\b/i;
/**
 * บรรทัดที่มีแต่คำบอกบาท: B / b / ฿ / บาท / บาด / ບາດ (วงเล็บ จุด ขีด / เว้นวรรค ไม่มีผล)
 * มีคำประกอบได้: "ລາວ/ເງິນບາດ฿" = หวยลาว จ่ายเงินบาท
 */
const THB_ONLY_LINE = /^(?:ລາວ|ลาว|ຫວຍ|หวย|ເງິນ|เงิน|ຈ່າຍ|จ่าย|ເປັນ|เป็น)*(?:b|฿|บาท|บาด|ບາດ|baht|thb)+$/i;

/**
 * มีบรรทัด B (หรือ ฿ / บาท / ບາດ) เดี่ยว ๆ อยู่ด้านบนก่อนบรรทัดตัวเลขแรก หรือด้านล่างหลังบรรทัดตัวเลขสุดท้าย = ทั้งโพยเป็นเงินบาท
 * บรรทัด B ที่อยู่ระหว่างรายการไม่นับ (ไม่รู้ว่าหมายถึงส่วนไหน)
 */
function hasThbMarkLine(lines: readonly string[]) {
  const withDigits = lines.flatMap((text, index) => (/\d/.test(text) ? [index] : []));
  if (withDigits.length === 0) return false;
  const first = withDigits[0]!;
  const last = withDigits.at(-1)!;
  return lines.some(
    (text, index) => (index < first || index > last) && THB_ONLY_LINE.test(text.replace(/[\s.:+\-/()[\]（）]/g, "")),
  );
}
/** ยอดหลักแสน: "2ແສນ" / "2 แสน" (ตัวเลขหลักเดียว) */
const LAKH_AMOUNT = /^([1-9])\s*(?:ແສນ|แสน)(.*)$/u;
/**
 * ยอดหลักล้าน: "1ລ້ານ" = 1,000,000 กีบ · "1.5ລ້ານ" · "1ລ້ານ*1ລ້ານ" (ตัวเลข 1–9 ทศนิยมได้ 1 ตำแหน่ง)
 * แปลงเป็นยอดเต็มจำนวน (ไม่คูณตัวคูณกีบ) · "200ລ້ານ" ยังกำกวม ส่งให้คนตรวจ
 */
const MILLION_AMOUNT = /(?<![\d.,])([1-9](?:[.,]\d)?)\s*(?:ລ້ານ|ລານ|ล้าน)/gu;
/** ยอดบนกับยอดล่างเขียนเป็นคำแยกกัน: "30ບົນ/20ລ່າງ" · "20ລ່າງ,30ບົນ" (คั่นด้วย / , - หรือช่องว่าง) */
const TOP_BOTTOM_WORDS = new RegExp(
  String.raw`^(${AMOUNT})\s*(ບົນ|บน|ລ່າງ|ລາງ|ລຸ່ມ|ล่าง)\s*[/,\-\s]?\s*(${AMOUNT})\s*(ບົນ|บน|ລ່າງ|ລາງ|ລຸ່ມ|ล่าง)(.*)$`,
  "u",
);
/**
 * จำนวนหลัก + ฝั่ง หน้ายอด: "2ລ່າງ1" = เลข 2 ตัวล่าง เลขละ 1 · "3ໂຕບົນ5" = เลข 3 ตัวบน เลขละ 5
 * ต้องมียอดตามหลัง — "=2ລ່າງ" เปล่า ๆ ยังเป็นยอด 2 ล่าง
 */
const DIGITS_SIDE_PREFIX = /^([23])\s*(?:ໂຕ|ຕົວ|ตัว|โต)?\s*(ບົນລ່າງ|ບລ|บนล่าง|บล|ລ່າງ|ລາງ|ລຸ່ມ|ล่าง|ບົນ|บน)\s*(?=\d)/u;
const AMOUNT_PART = new RegExp(String.raw`^(${AMOUNT})(?:\s*[*x×]\s*(${AMOUNT}))?(.*)$`, "i");
/** ขีดคั่นเลข 3 ตัวขึ้นไป (มียอดหลัง = ได้): 605-645-685 · 406-446-486=1 */
const DASH_NUMBERS_LINE = /^\d{2,3}(?:\s*-\s*\d{2,3}){2,}\s*(?:[=;:].*)?$/;
/** ; คั่นเลข (2 ตัวขึ้นไป) แล้วขีดตัวเดียวคั่นยอด: 20;25-5 */
const SEMICOLON_DASH_LINE = /^\s*(\d{2,3}(?:\s*;\s*\d{2,3})+)\s*-\s*(\d[^-=;:]*)$/;
/**
 * : หรือ ; คั่นทั้งเลขและยอด แล้วยอดมีคำกำกับต่อท้าย: "23:63:20ບລ" = "23,63=20ບລ"
 * คำกำกับ (ฝั่ง/สกุลเงิน) บอกว่าตัวท้ายเป็นยอด — "23:63:20" เปล่า ๆ ยังกำกวม (20 อาจเป็นเลข)
 */
const COLON_SUFFIX_LINE = /^(\d{2,3}(?:\s*[;:]\s*\d{2,3})+)\s*[;:]\s*(\d[\d,.]*)\s*([^\d=;:]+)$/u;
/** ขีดตัวเดียวคั่นเลขกับยอด: 762-5 · 570 57 70-30,000 */
const DASH_LINE = /^([^-]+?)\s*-\s*([^-]+)$/;
/** ตัวคั่นระหว่างเลข — รวมวงเล็บ: "826)866=10" */
const NUMBER_SEPARATOR = /[.\-/,_\s+()[\]]+/;
/** ໂຕ / ຕົວ / ตัว / to / ປ່ອງ / ຮູ / hu (+ລະ) ระหว่างเลขกับยอด = เลขละ — "33 73 ໂຕ 20" · "92ປ່ອງ10" อ่านเหมือน "33 73=20" · "92=10" */
const EACH_WORD = /\s*(?:ໂຕ|ຕົວ|ตัว|โต|to|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|hu)\s*(?:ລະ|ละ)?\s*(?=\d)/iu;
/** เอาแต่3โต / ເອົາແຕ່3ໂຕ = ลูกค้าบอกว่าเอาแต่เลข 3 ตัว — หมายเหตุ ไม่ใช่รายการแทง */
const ONLY_THREE_LINE = /^(?:เอาแต่|ເອົາແຕ່|ແຕ່)\s*3\s*(?:ตัว|โต|ໂຕ|ຕົວ)?$/u;
/** คำบอกจำนวนลาว/ไทย (หลักหน่วย) */
const UNIT_WORDS: Record<string, number> = {
  ໜຶ່ງ: 1, ນຶ່ງ: 1, ເອັດ: 1, หนึ่ง: 1, เอ็ด: 1,
  ສອງ: 2, สอง: 2, ສາມ: 3, สาม: 3, ສີ່: 4, สี่: 4, ຫ້າ: 5, ห้า: 5,
  ຫົກ: 6, หก: 6, ເຈັດ: 7, เจ็ด: 7, ແປດ: 8, แปด: 8, ເກົ້າ: 9, เก้า: 9,
};
const UNIT_WORD = Object.keys(UNIT_WORDS).join("|");
/** [หน่วย]ສິບ[หน่วย] · ຊາວ/ยี่สิบ[หน่วย] · หน่วย (ສີບ = สะกดผิดที่พบบ่อยของ ສິບ) */
const NUMBER_WORD = `(?:(${UNIT_WORD})?(ສິບ|ສີບ|สิบ)|(ຊາວ|ยี่สิบ))?(${UNIT_WORD})?`;
/** คำบอกจำนวนที่ตามด้วย ພັນ / พัน: "ສອງພັນ" "ສິບຫ້າພັນ" "ຊາວພັນ" */
const NUMBER_WORDS_THOUSAND = new RegExp(`()${NUMBER_WORD}(?=\\s*(?:ພັນ|พัน))`, "gu");
/** คำบอกจำนวนหลัง ໂຕ / ໂຕລະ / ຮູ / ປ່ອງ / = : "ໂຕລະຫ້າສິບ" */
const NUMBER_WORDS_EACH = new RegExp(`((?:ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|=)\\s*(?:ລະ|ละ)?\\s*)${NUMBER_WORD}`, "gu");

const toDigits = (match: string, prefix: string, tensUnit?: string, ten?: string, twenty?: string, unit?: string) => {
  if (!ten && !twenty && !unit) return match;
  const tens = ten ? (tensUnit ? UNIT_WORDS[tensUnit] : 1) * 10 : twenty ? 20 : 0;
  return `${prefix}${tens + (unit ? UNIT_WORDS[unit] : 0)}`;
};

/**
 * ยอดที่เขียนเป็นคำ → ตัวเลข: "ໂຕສອງພັນ" → "ໂຕ2ພັນ" · "ໂຕລະຫ້າສີບ" → "ໂຕລະ50"
 * แปลงเฉพาะคำที่ตามด้วย ພັນ / พัน หรืออยู่หลัง ໂຕ / ຮູ / ປ່ອງ / = — ชื่อคนไม่โดนแปลง
 */
function numberWordsToDigits(text: string) {
  return text
    .replace(NUMBER_WORDS_THOUSAND, toDigits)
    .replace(NUMBER_WORDS_EACH, toDigits)
    .replace(EACH_THOUSAND, "$11ພັນ");
}
/** ປ່ອງລະພັນ / ໂຕລະພັນ / ตัวละพัน (ไม่มีตัวเลข) = เลขละหนึ่งพัน → "ປ່ອງລະ1ພັນ" */
const EACH_THOUSAND = /((?:ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู)\s*(?:ລະ|ละ)?\s*)(?:ພັນ|พัน)/gu;

/** คำทักทาย / "ซื้อเลข" หน้าเลขแรก: "ສບດຊື້ເລກ807;07:…" → "807;07:…" */
const GREETING_PREFIX = /^(?:(?:ສະບາຍດີ|ສບດ|ຂໍຊື້|ຊື້|ເລກ|ສະບາຍ|สวัสดี|ขอซื้อ|ซื้อ|เลข)\s*)+(?=\d)/u;
/** ประโยคนำที่ลงท้ายด้วย ซื้อ / เลข หน้าเลขแรก: "ເຮົາຢາກຊື້ເລກ 14 54 94 ໂຕ 10ພັນ" → "14 54 94 ໂຕ 10ພັນ" */
const BUY_PREFIX = /^[\p{L}\p{M}\s]*?(?:ຊື້|ເລກ|ซื้อ|เลข)\s*(?=\d)/u;
/**
 * ประโยคซื้อ + คำเรียกแม่หวย หน้าเลขแรก: "ຊື້ເລກແມ່ 15 55 95 ໂຕລະ20ພັນ" → "15 55 95 ໂຕລະ20ພັນ"
 * คำหลัง ຊື້/ເລກ ต้องไม่ใช่คำกำกับ ("ເລກລ່າງ 15=20" คงฝั่งไว้) หรือคำสำคัญ (ໂຕ / ຫລັກ …) — ดู stripBuyAddress
 */
const BUY_ADDRESS_PREFIX = /^[\p{L}\p{M}\s]*?(?:ຊື້|ເລກ|ซื้อ|เลข)([\p{L}\p{M}\s]+?)(?=\d)/u;
function stripBuyAddress(text: string) {
  const match = text.match(BUY_ADDRESS_PREFIX);
  const word = match?.[1]!.trim();
  // หัวโพยที่มีวันที่ ("ຊື້ເລກລາວມື້ນີ້ແດ່02/10/26") ต้องมีคำอยู่ถึงจะรู้ว่าเป็นวันที่ — ไม่ตัด
  if (!match || !word || readSuffix(word) || KEYWORD_PREFIX.test(word) || isDateOrPhoneLine(text)) return text;
  return text.slice(match[0].length);
}
/** ชื่อลูกค้าเว้นวรรคนำหน้ารายการเต็ม (มี = : ; คั่นยอด): "ສາວຫູ້າ 01-41-81:5" → ["ສາວຫູ້າ", "01-41-81:5"] */
const LEADING_NAME = /^([\p{L}\p{M}]{2,})\s+(?=\d[^=:;]*[=:;]\s*\d)/u;
/** ชื่อลูกค้านำหน้ายอดรวม (ติดกัน / คั่นด้วย . : - ช่องว่าง): "ສາວໂນ.ລວມ16ພັນ" → ["ສາວໂນ", "ລວມ16ພັນ"] */
const NAMED_SUM = /^([\p{L}\p{M}]{2,}?)[\s.:,\-]*(?=(?:ລວມ|รวม|ลวม)[^\d]*\d)/u;
/** คำที่ขึ้นต้นบรรทัดได้แต่ไม่ใช่ชื่อ: ລວມ / ລາວ / ຫລັກ / ໃສ່ / ໂຕ / ຮູ / ທັງ … */
const KEYWORD_PREFIX =
  /^(?:ລວມ|รวม|ลวม|ລາວ|ลาว|ຫລັກ|ຫຼັກ|ລັກ|หลัก|ลัก|ໃສ່|ຕື່ມ|ເອົາ|ใส่|เติม|เอา|ແຕ່|ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|ທັງ|ທັ້ງ|ทั้ง|ทัง)/u;
/** ชื่อต้องไม่ใช่คำกำกับฝั่ง/สกุลเงิน ("ບົນ 01=5") หรือคำกำกับที่พิมพ์ผิด · null = ไม่มีชื่อนำหน้า */
function leadingName(text: string): RegExpMatchArray | null {
  const match = text.match(LEADING_NAME) ?? text.match(NAMED_SUM);
  if (!match || !isAttachedName(match[1]!) || readSuffix(match[1]!) || KEYWORD_PREFIX.test(match[1]!)) return null;
  return match;
}

/** เส้นคั่นท้ายโพย: _____ / ----- / ===== / ..... (3 ตัวขึ้นไป) · -- / __ / == (2 ตัวได้) */
const DIVIDER_LINE = /^\s*(?:[_\-=—–─]{2,}|[\s_\-=—–─.*~]{3,})\s*$/u;
/** ตัวเลขเปล่า ๆ ใต้เส้นคั่น = ยอดรวม: 101.000 · 101,000 · 101 (ต่อท้ายสกุลเงินได้) */
const DIVIDED_TOTAL = /^(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:฿|₭|ກີບ|ກິບ|กีบ|กิบ|บาท|บาด|ບາດ)?$/u;
/** ชื่อลูกค้านำหน้ายอดใต้เส้นคั่น (มี . ในชื่อได้): "ອ.ເຕວ  56" → "ອ.ເຕວ" */
const DIVIDED_NAME = /^([\p{L}\p{M}][\p{L}\p{M}.\s]*?)[\s:.\-]*(?=\d)/u;
/** วันที่ d/m/yyyy · d-m-yy · yyyy-mm-dd (คั่นด้วย / - . ได้) */
const DATE = /(?<!\d)(?:(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})|\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2})(?!\d)/g;
/** เบอร์โทร: ตัวเลขติดกัน 8 หลักขึ้นไป หรือกลุ่มที่มีเลข 4 หลัก (020 5555 1234 / 020-555-1234) */
const PHONE = /\+?(?<!\d)(?:\d{8,}|\d{2,4}[\s-]\d{3,4}[\s-]\d{4})(?!\d)/g;

/**
 * บรรทัดที่ตัวเลขทุกตัวเป็นวันที่หรือเบอร์โทร (ที่เหลือเป็นชื่อ/อีโมจิ) — ไม่ใช่รายการแทง
 * รับเฉพาะรูปแบบที่เป็นเลขแทงไม่ได้: ปี 4 หลัก / วันหรือเดือนหลักเดียว / เลข 4 หลักขึ้นไป
 * ("30.10.26" อาจเป็นเลข 30 10 26 จึงไม่ถือเป็นวันที่) — มีตัวหนังสือในบรรทัดด้วย ("ຊື້ເລກ…02/10/26") = วันที่แน่นอน
 */
function isDateOrPhoneLine(text: string) {
  const words = /\p{L}/u.test(text);
  const rest = text
    .replace(DATE, (match, day?: string, month?: string, year?: string) =>
      day === undefined || year!.length === 4 || day.length === 1 || month!.length === 1 || words ? "" : match,
    )
    .replace(PHONE, "");
  return rest !== text && !/\d/.test(rest);
}
/** วันที่/เดือนไม่มีปี ที่วันเป็นเลขตัวเดียว (ไม่ใช่เลขแทง): "7/10" = 7 ต.ค. */
const SHORT_DATE_LINE = /^[1-9]\s*\/\s*(?:0?[1-9]|1[0-2])$/u;
/** ເອົາທັງ2-3ໂຕ / เอาทั้ง2-3ตัว = ชุด ລັກ ให้แทงเลขฐาน 2 ตัวด้วย ไม่ใช่เลข 3 ตัวอย่างเดียว */
const TAKE_BOTH = /(?:ເອົາ|เอา)?\s*(?:ທັງ|ທັ້ງ|ทั้ง|ทัง)\s*2\s*[-,.\/&]?\s*3\s*(?:ໂຕ|ຕົວ|ตัว|โต)?/u;
/** ນຳ / ດ້ວຍ / ด้วย ท้ายบรรทัด ຫລັກ = ชุด ລັກ แทงเลขฐาน 2 ตัวด้วย: "ຈັບຫລັກ8ນຳ" */
const HUNDREDS_ALSO = /(?<=\d)\s*(?:ນຳ|ນໍາ|ດ້ວຍ|ด้วย|นำ)\s*$/u;
/** ໂຕ20 ບລ / =20 = บรรทัดยอดที่ไม่มีเลข — ใช้กับทุกชุด ລັກ ที่ยังไม่มียอดด้านบน */
const SHARED_AMOUNT_LINE = /^(?:[=;:]\s*(?:ໂຕ|ຕົວ|ตัว|โต|to)?|(?:ໂຕ|ຕົວ|ตัว|โต|to)\s*[=;:]?)\s*(\d.*)$/iu;
/** 22_10 = เลข 22 ยอด 10 — เลขเดียว ขีดล่างตัวเดียว ไม่มี = ; : */
const UNDERSCORE_LINE = /^\s*\d{2,3}\s*_\s*\d[^_=;:]*$/;
/**
 * ตัวท้ายที่ลงท้ายด้วย ພັນ / ພ / พัน / พ / k หรือคำบอกบาท = ยอดแน่นอน
 * "32_72_29_69_5ພັນ" = "32_72_29_69=5ພັນ" · "19-99-200Bເລກບົນ" = "19-99=200Bເລກບົນ"
 */
// (.*?) แบบสั้นที่สุด — ไม่งั้น "436-439-25,000Kເລກ" ถูกตัดที่ลูกน้ำเป็นยอด "000K"
const THOUSAND_TAIL = /^(.*?\d)\s*[_.,\-/\s]+\s*(\d[\d,.]*\s*(?:ພັນ|ພ|พัน|พ|k|฿|baht|b|บาท|บาด|ບາດ)[^\d=;:]*)$/iu;
/** หลัง / ตัวท้ายเป็นเลขหลักเดียวหรือ 4 หลักขึ้นไป (เป็นเลขแทงไม่ได้) = ยอด: "18.58.98/2" = "18.58.98=2" */
const SLASH_TAIL = /^(.*\d)\s*\/\s*((?:\d|\d{4,})(?!\d)[^\d=;:/]*)$/u;
/**
 * เลข / ยอด — มี / ตัวเดียวคั่นยอด: "96/50" = "96=50" · "19 59 99/50" = "19 59 99=50"
 * (คั่นเลขด้วย / ทุกตัว "32/72/50" ยังกำกวม · ใต้บรรทัดนี้มียอด/ຫລັກ รออยู่ = เลขล้วน ดู awaitsBelow)
 */
const SLASH_AMOUNT_LINE = /^(\d{2,3}(?:[\s.,\-_]+\d{2,3})*)\s*\/\s*(\d[\d,.]*\D*)$/u;
/**
 * = ที่พิมพ์แทนตัวคั่นเลข 3 ตัว (ตามด้วยเลข 3 ตัวอีก 2 ตัวขึ้นไปก่อน = ยอด): "860=820-860=5" = "860-820-860=5"
 * (เลข 2 ตัว "86=10-82=5" กำกวมกับ เลข=ยอด จึงไม่แปลง)
 */
const EQUALS_AS_SEPARATOR = /^(\d{3}(?:[\s.,\-_]+\d{3})*)\s*=\s*(?=\d{3}(?:[\s.,\-_]+\d{3})+\s*=\s*\d)/u;
/** ตัวท้ายเป็น บน*ล่าง (เป็นเลขแทงไม่ได้) = ยอด ไม่ว่าคั่นด้วยอะไร: "14/7*7" · "32 72 50*50" */
const TIMES_TAIL = /^(.*\d)\s*[_.,\-/\s]+\s*(\d[\d,.]*\s*[*x×]\s*\d[\d,.]*[^\d=;:]*)$/iu;
/**
 * ตัวท้ายเป็นเลขหลักเดียว (ไม่มีใครแทงเลขตัวเดียว) = ยอด ไม่ว่าคั่นด้วยอะไร: "030 3" · "32.72.5ບລ" · "32_72_5"
 * · "490(3" (วงเล็บ = ; ที่พิมพ์พลาด)
 */
const SINGLE_DIGIT_TAIL = /^(.*\d)\s*[_.,\-/\s()]+\s*(\d(?![\d,.])[^\d=;:]*)$/u;
/**
 * เลขคั่นด้วยช่องว่างล้วน + ตัวท้ายเป็นยอดรูปแบบหลักพัน (3.000 / 25,000) = ยอด: "732 772 3.000" = "732 772=3.000"
 * ตัวคั่นต่างกัน (เลขคั่นช่องว่าง ยอดมี . ,) จึงไม่กำกวม — "732.772.3.000" ไม่รับ
 */
const THOUSAND_FORMAT_TAIL = /^(\d{2,3}(?:\s+\d{2,3})*)\s+(\d{1,3}(?:[.,]000)+(?![\d.,])[^\d=;:]*)$/u;
/** ປ່ອງ3 / ຮູ3 = ยอดเลขละ 3 ของทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน */
const EACH_AMOUNT_LINE = /^(?:ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|hu)\s*(\d.*)$/iu;
/**
 * ลາວ ບົນ-ລ່າງ ຮູ10 = หัวยอด: [คำกำกับฝั่ง/สกุลเงิน] + ຮູ/ປ່ອງ/ໂຕ + ยอด — ไม่มีเลขรอด้านบน
 * จึงเป็นยอดของบรรทัดเลขที่ไม่มียอดด้านล่าง (จนกว่าจะเจอหัวยอดใหม่หรือ ລວມ)
 */
const HEADING_LINE = /^([^\d=:;]*?)\s*(?:ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู|hu|ໂຕ|ຕົວ|ตัว|โต|to)\s*(?:ລະ|ละ)?\s*(\d.*)$/iu;
/** บรรทัดยอดที่ไม่มีเลข (ໂຕ5ພັນ / =10 / ປ່ອງ3 / ບລ ໂຕ10) — ยอดของเลขที่ไม่มียอดในบรรทัดติดกันด้านบน */
function isAmountOnlyLine(text: string) {
  if (SHARED_AMOUNT_LINE.test(text) || EACH_AMOUNT_LINE.test(text)) return true;
  const head = text.match(HEADING_LINE);
  return !!head && readSuffix(head[1]) !== null;
}
/**
 * อักขระควบคุมที่มองไม่เห็น (Unicode Cf): zero-width space / joiner, BOM, soft hyphen และเครื่องหมายทิศทาง
 * (LRM/RLM U+200E–U+200F, U+202A–U+202E, U+2066–U+2069) ที่ WhatsApp Web/Desktop แทรกมาตอน copy —
 * ไม่ใช่ \s จึงติดอยู่กับเลขแล้วทำให้ทั้งบรรทัดอ่านไม่ออก (สระ/วรรณยุกต์ไทย-ลาวเป็น Mn ไม่โดนตัด)
 * ตัวเว้นว่างที่มองไม่เห็นแต่ไม่ใช่ Cf ก็ตัดด้วย: U+034F, U+115F/U+1160/U+3164/U+FFA0 (Hangul filler),
 * U+17B4/U+17B5 (Khmer), U+2800 (braille blank) — ติดมาระหว่างเลขกับ ໂຕ แล้วทั้งบรรทัดอ่านไม่ออก
 */
const INVISIBLE = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u2800\u3164\uFFA0]/gu;
/** อีโมจิ ธงชาติ (regional indicator) และตัวเลือกรูปแบบอีโมจิ (U+FE0F / keycap U+20E3) — ฿ ₭ ไม่ใช่อีโมจิ */
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}]/gu;
/** ตัวเลข/เครื่องหมายเต็มความกว้าง (０-９ ＝ ＊ …) จากคีย์บอร์ดจีน/ญี่ปุ่น → ASCII */
const FULL_WIDTH = /[！-～]/g;

/** เลขลาว (໐-໙) / เลขไทย (๐-๙) → 0-9 และตัดอักขระล่องหนที่ติดมากับการ copy */
function normalize(text: string) {
  return text
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(FULL_WIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[໐-໙]/g, (d) => String(d.charCodeAt(0) - 0x0ed0))
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    // สระ/วรรณยุกต์/เครื่องหมายที่ติดบนตัวเลข ("0̂6" · "0ໍ6") = พิมพ์พลาด — ตัวเลขไม่มีเครื่องหมาย เก็บเฉพาะตัวเลข
    .replace(/(?<=\d)\p{M}+/gu, "")
    // ປອ່ງ = ປ່ອງ ที่วางไม้เอกผิดที่ (หน้าจอดูเหมือนกัน)
    .replace(/ປອ່ງ/g, "ປ່ອງ")
    // ປ້ອງ / ປອ້ງ = ປ່ອງ ที่ใช้ไม้โทแทนไม้เอก
    .replace(/ປ້ອງ|ປອ້ງ/g, "ປ່ອງ")
    // ປ່ຽງ = ປ່ອງ ที่พิมพ์ ຽ แทน ອ
    .replace(/ປ່ຽງ/g, "ປ່ອງ")
    // ຫັລກ = ຫລັກ ที่พิมพ์ไม้กันก่อน ລ (หน้าจอดูเหมือนกัน)
    .replace(/ຫັລກ/g, "ຫລັກ")
    // ໂຕ ที่ปนตัวอักษรไทย (โຕ / ໂต) = ໂຕ
    .replace(/โຕ|ໂต/g, "ໂຕ")
    // ລາ່ງ / ลา่ง = ລ່າງ / ล่าง ที่วางไม้เอกหลังสระอา
    .replace(/ລາ່ງ/g, "ລ່າງ")
    .replace(/ลา่ง/g, "ล่าง")
    // ' ’ ‘ ` ´ " “ ” ″ ระหว่างตัวเลข = ตัวคั่นเลข: "19'59'99" = "032"072"932" = "19.59.99"
    .replace(/(?<=\d)['’‘`´"“”″]+(?=\d)/g, ".")
    // = ซ้ำระหว่างเลขกับยอด = พิมพ์ซ้ำ: "790==2" = "790=2" (เส้นคั่น "=====" ไม่มีเลขสองข้าง ไม่โดน)
    .replace(/(?<=\d\s*)={2,}(?=\s*\d)/g, "=")
    // ขีดยาว – — − ‐ ‒ (จากผลอ่านรูป / คีย์บอร์ดมือถือ) = ขีด -: "076–2" = "076-2"
    .replace(/[‐‑‒–—―−]/g, "-")
    .trim();
}

function toAmount(text: string) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const value = Number(text.replace(/[.,]/g, ""));
  return value > 0 ? value : null;
}

function readSuffix(text: string) {
  // วงเล็บรอบคำกำกับไม่มีผล: "(ບລ)" = "ບລ"
  let rest = text.toLowerCase().replace(/[\s.+/\-()[\]（）]/g, "");
  let position: PositionMark | undefined;
  let currency: Currency | undefined;

  while (rest) {
    const token = SUFFIX_TOKENS.find((t) => rest.startsWith(t.text));
    if (!token) return null;
    if (token.position) {
      if (position) return null;
      position = token.position;
    }
    if (token.currency) {
      if (currency) return null;
      currency = token.currency;
    }
    rest = rest.slice(token.text.length);
  }
  return { position, currency };
}

type Stake = Omit<ParsedBet, "line" | "amount"> & { typed: number };
/** amount = ยอดของบรรทัด (เฉพาะบรรทัดรายการปกติ) ให้เลขที่รออยู่ด้านบนใช้ซ้ำ */
type LineResult = { stakes: Stake[]; amount?: Amount } | { issue: ParseIssueCode };
/** digits = ยอดบอกจำนวนหลักของเลขไว้ ("2ລ່າງ1" = เลข 2 ตัว) */
type Amount = { first: number; second?: number; position?: PositionMark; currency: Currency; digits?: 2 | 3 };

/**
 * คำกำกับท้ายยอดที่มีชื่อลูกค้าต่อท้าย: "ກີບ ອ້າຍຊານ" → คำกำกับ "ກີບ" (ชื่อไม่นับ)
 * ชื่อ = คำท้ายที่คั่นด้วยช่องว่าง เป็นตัวหนังสือล้วน ยาว 2 ตัวขึ้นไป · คำที่ติดกับยอด ("100ບ ອ້າຍ") ต้องเป็นคำกำกับเสมอ
 * (คำที่มี ບ ລ ติดยอดตัดเป็นชื่อไม่ได้ — อาจเป็นคำกำกับที่พิมพ์ผิด)
 */
function readSuffixWithoutName(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  // ชื่อติดยอดทั้งคำ ("5ຂົນ") — ต้องไม่มีอักษรที่ขึ้นต้นคำกำกับฝั่ง/สกุลเงิน (ບ ລ บ ล) กันคำกำกับที่พิมพ์ผิด ("5ບນ") ถูกตัดทิ้งเงียบ ๆ
  // หน่วยเงิน (ແສນ / ລ້ານ) ไม่ใช่ชื่อ — ตัดทิ้งแล้วยอดจะผิดเงียบ ๆ ("2ແສນ" ≠ 2)
  // ชื่อที่มี ບ ລ ("5ລອມ") ได้ ถ้ายาว 3 ตัวขึ้นไปและห่างจากคำกำกับฝั่ง/สกุลเงินทุกคำเกิน 1 ตัวอักษร ("ບນ" ยังรอตรวจ)
  // คำกำกับ + ชื่อติดกันทั้งคำ ("40฿เกด") — ชื่อผ่านกติกาเดียวกับชื่อติดยอด และขึ้นต้นด้วยตัวอักษร (ไม่ใช่วรรณยุกต์/สระลอย)
  // ตรวจก่อนชื่อทั้งคำ กัน "10ລ່າງສົມ" ถูกตัดทั้งคำเป็นชื่อแล้วฝั่งหายเงียบ ๆ
  if (words.length === 1) {
    const chars = [...words[0]!];
    for (let cut = chars.length - 2; cut >= 1; cut--) {
      const name = chars.slice(cut).join("");
      if (!/^\p{L}/u.test(name) || !isAttachedName(name)) continue;
      // คำกำกับอักษรเดียว (ລ / ບ) + ชื่อ กำกวมกับชื่อที่ขึ้นต้นด้วย ລ ບ ("ລອມ") — ใช้ได้เฉพาะสัญลักษณ์ ฿ ₭
      const mark = chars.slice(0, cut);
      if (mark.length === 1 && /\p{L}/u.test(mark[0]!)) continue;
      const suffix = readSuffix(mark.join(""));
      if (suffix && (suffix.position || suffix.currency)) return suffix;
    }
    if (isAttachedName(words[0]!)) return { position: undefined, currency: undefined };
  }
  const attached = !/^\s/.test(text);
  for (let keep = words.length - 1; keep >= (attached ? 1 : 0); keep--) {
    const name = words.slice(keep).join("");
    if (!/^[\p{L}\p{M}]{2,}$/u.test(name)) continue;
    const suffix = readSuffix(words.slice(0, keep).join(" "));
    if (suffix) return suffix;
  }
  return null;
}

/** ชื่อลูกค้าที่ติดยอด: ตัวหนังสือล้วน ≥ 2 ตัว ไม่ใช่อักษรอังกฤษ / หน่วยเงิน / คำกำกับที่พิมพ์ผิด */
function isAttachedName(word: string) {
  return (
    /^[\p{L}\p{M}]{2,}$/u.test(word) &&
    !/\p{Script=Latin}|ແສນ|แสน|ລ້ານ|ລານ|ล้าน/u.test(word) &&
    (!/[ບລบล]/u.test(word) || isNotSuffixTypo(word))
  );
}

/** คำกำกับฝั่ง/สกุลเงินภาษาลาว/ไทย (2 ตัวอักษรขึ้นไป) ที่ชื่อติดยอดต้องไม่ใกล้เคียง */
const MARK_WORDS = SUFFIX_TOKENS.filter(
  (t) => (t.position || t.currency) && [...t.text].length >= 2 && !/\p{Script=Latin}/u.test(t.text),
).map((t) => [...t.text]);

/** ระยะแก้ไข (Levenshtein) ระหว่างสองคำ นับทีละ code point */
function editDistance(a: readonly string[], b: readonly string[]) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** คำที่มี ບ ລ บ ล ยาว 3 ตัวขึ้นไป และไม่ใช่คำกำกับที่พิมพ์ผิด 1 ตัวอักษร = ชื่อได้ ("ລອມ") */
function isNotSuffixTypo(word: string) {
  const chars = [...word];
  return chars.length >= 3 && MARK_WORDS.every((mark) => editDistance(chars, mark) > 1);
}

/** ส่วนยอดหลัง = / ໂຕ เช่น "100ລ່າງ" · "1000*1000฿" */
function parseAmount(text: string, fallback: Currency = "LAK"): Amount | { issue: ParseIssueCode } {
  // =ໂຕ5ພັນ / =ຮູລະ10 — คำว่า "เลขละ" หลัง = ไม่มีผลกับยอด
  let body = text.trim().replace(AMOUNT_EACH_PREFIX, "");
  // =ບ10 / =ລ່າງ 20 / =ບລ5 — คำกำกับฝั่ง/สกุลเงินหน้ายอด = ท้ายยอด: "10ບ"
  const before = body.match(MARK_BEFORE_AMOUNT);
  if (before && readSuffix(before[1])) body = `${before[2]}${before[1]}`;
  // =2ລ່າງ1 = เลข 2 ตัวล่าง เลขละ 1 → "1ລ່າງ" (parseLine ตรวจว่าเลขทุกตัวมีจำนวนหลักตรงกับที่บอก)
  const digitsSide = body.match(DIGITS_SIDE_PREFIX);
  if (digitsSide) body = `${body.slice(digitsSide[0].length)}${digitsSide[2]}`;
  // 20ບາດ×20ບາດ / 20ບາດ×20 — สกุลเงินที่คั่นกลาง บน×ล่าง ย้ายไปท้าย: "20×20ບາດ"
  const between = body.match(CURRENCY_BEFORE_TIMES);
  if (between) {
    body = body.replace(CURRENCY_BEFORE_TIMES, "$1");
    if (!body.toLowerCase().includes(between[2].toLowerCase())) body += between[2];
  }
  // 2ແສນ = 200,000 กีบ = ยอดย่อ 200 (เฉพาะ 1–9 ແສນ · "200ແສນ" กำกวม ส่งให้คนตรวจ)
  body = body.replace(MILLION_AMOUNT, (_, value: string) => String(Math.round(Number(value.replace(",", ".")) * 1_000_000)));
  const lakh = body.match(LAKH_AMOUNT);
  if (lakh) body = `${Number(lakh[1]) * 100}${lakh[2]}`;
  // 30ບົນ/20ລ່າງ · 20ລ່າງ 30ບົນ = บน × ล่าง: "30*20"
  // ฝั่งเดียวกันสองครั้ง ("30ບົນ/20ບົນ") ไม่แปลง → อ่านไม่ออกตามเดิม
  const sided = body.match(TOP_BOTTOM_WORDS);
  const isTop = (side: string) => /^(?:ບົນ|บน)$/u.test(side);
  if (sided && isTop(sided[2]!) !== isTop(sided[4]!)) {
    const [, a, firstSide, b, , rest] = sided;
    body = isTop(firstSide!) ? `${a}*${b}${rest}` : `${b}*${a}${rest}`;
  }
  const amount = body.match(AMOUNT_PART);
  if (!amount) return { issue: text.trim() ? "UNREADABLE" : "NO_AMOUNT" };

  const first = toAmount(amount[1]);
  const second = amount[2] === undefined ? undefined : toAmount(amount[2]);
  const suffix = readSuffix(amount[3]) ?? readSuffixWithoutName(amount[3]);
  if (first === null || second === null || !suffix) return { issue: "UNREADABLE" };

  // "1000*1000" = บน × ล่าง อยู่แล้ว จึงห้ามมีคำกำกับฝั่งซ้ำ
  if (second !== undefined && suffix.position) return { issue: "UNREADABLE" };
  return {
    first,
    second,
    position: second !== undefined ? "BOTH" : suffix.position,
    currency: suffix.currency ?? fallback,
    ...(digitsSide ? { digits: Number(digitsSide[1]) as 2 | 3 } : {}),
  };
}

function stakesFor(numbers: readonly string[], { first, second, position = "TOP", currency }: Amount): LineResult {
  const hasBottom = position !== "TOP";
  // บนล่าง (ບລ / บนล่าง / บน×ล่าง) ใช้ได้เฉพาะเลข 2 ตัว → เลข 3 ตัวลงบนอย่างเดียวด้วยยอดบน · ล่างล้วนกับเลข 3 ตัว = พิมพ์ผิด
  const threeDigitTopOnly = position === "BOTH";
  if (hasBottom && !threeDigitTopOnly && numbers.some((n) => n.length === 3)) return { issue: "THREE_DIGIT_BOTTOM" };

  // เลข 3 ตัวที่ปนมากับ ບລ แยกลงไปเป็นแถวใหม่ต่อท้าย (เลข 2 ตัว บน/ล่าง ก่อน) ให้อ่านโพยไม่สับสนว่าลงล่างด้วย
  const ordered = threeDigitTopOnly ? [...numbers.filter((n) => n.length === 2), ...numbers.filter((n) => n.length === 3)] : numbers;
  const stakes = ordered.flatMap((number) => {
    const base = { number, digits: number.length as 2 | 3, currency };
    return [
      ...(position !== "BOTTOM" ? [{ ...base, position: "TOP" as const, typed: first }] : []),
      ...(hasBottom && number.length === 2 ? [{ ...base, position: "BOTTOM" as const, typed: second ?? first }] : []),
    ];
  });
  return { stakes };
}

/** เติมหลักร้อยหน้าเลขฐาน — หลักร้อยเป็นวงนอก: [2, 9] × [08, 48] → 208 248 908 948 */
const withHundreds = (hundreds: readonly string[], bases: readonly string[]) =>
  hundreds.flatMap((digit) => bases.map((base) => `${digit}${base}`));

/** dashNumbers = โพยนี้ใช้ขีดคั่นเลข (มีบรรทัด "605-645-685") → "724-764" เป็นเลข 2 ตัว ไม่ใช่เลข 724 ยอด 764 */
function parseLine(raw: string, fallback: Currency = "LAK", dashNumbers = false): LineResult {
  // = คั่นระหว่างเลขด้วย — = ตัวสุดท้ายคั่นยอด: "00=20=400=ໂຕ10ພ.ບ.ລ" = "00,20,400=ໂຕ10ພ.ບ.ລ"
  // ต้องมี ໂຕ / ຮູ / ປ່ອງ หน้ายอด หรือเลข 3 ตัวขึ้นไป — "32=100=200" ยังกำกวม (100 อาจเป็นยอด)
  const equalsParts = raw.split("=");
  const equalsNumbers = equalsParts.slice(0, -1);
  // ; คั่นเลข + ขีดตัวเดียวคั่นยอด: "20;25-5" = "20,25=5" (ขีดคั่นเลขในโพยนี้ + หลังขีดเป็นเลข 2-3 ตัว = ไม่ใช่ยอด)
  const semicolonDash = raw.match(SEMICOLON_DASH_LINE);
  // : คั่นทั้งเลขและยอด + คำกำกับท้ายยอด: "23:63:20ບລ" = "23,63=20ບລ"
  const colonSuffix = raw.match(COLON_SUFFIX_LINE);
  const colonMark = colonSuffix ? readSuffix(colonSuffix[3]!) : null;
  const line =
    colonSuffix && (colonMark?.position || colonMark?.currency)
      ? `${colonSuffix[1]!.replace(/[;:]/g, ",")}=${colonSuffix[2]}${colonSuffix[3]}`
      :
    equalsNumbers.length >= 2 &&
    equalsNumbers.every((part) => /^\s*\d{2,3}\s*$/.test(part)) &&
    (equalsNumbers.length >= 3 || AMOUNT_EACH_PREFIX.test(equalsParts.at(-1)!.trim()))
      ? `${equalsParts.slice(0, -1).join(",")}=${equalsParts.at(-1)}`
      : semicolonDash && !(dashNumbers && /^\d{2,3}$/.test(semicolonDash[2]!.trim()))
        ? `${semicolonDash[1]!.replace(/;/g, ",")}=${semicolonDash[2]}`
        : raw;
  // มี ໂຕ / ຮູ / hu คั่นยอดแล้ว (ไม่มี =) → ; : ที่เหลือคั่นระหว่างเลข: "06;46;506 hu 20" = "06,46,506=20"
  const each = !line.includes("=") && EACH_WORD.test(line);
  // เลขเดียว + ขีดล่างตัวเดียว + ยอด: "22_10" = "22=10" (หลายขีด "04_44_84_=20" ยังเป็นตัวคั่นเลข)
  const underscore = !each && UNDERSCORE_LINE.test(line);
  const thousand =
    !each && !/[=;:]/.test(line)
      ? (line.match(THOUSAND_FORMAT_TAIL) ?? line.match(THOUSAND_TAIL) ?? line.match(TIMES_TAIL) ?? line.match(SLASH_TAIL) ?? line.match(SINGLE_DIGIT_TAIL))
      : null;
  // มี = ตัวเดียว → ; : หน้า = คั่นระหว่างเลข: "24;64;28=100*50" = "24,64,28=100*50"
  const single = line.split("=").length === 2;
  const text = each
    ? line.replace(/[;:]/g, ",").replace(EACH_WORD, "=")
    : thousand
      ? `${thousand[1]}=${thousand[2]}`
      : underscore
        ? line.replace("_", "=")
        : single
          ? line.replace(/^[^=]*/, (numbers) => numbers.replace(/[;:]/g, ","))
          : line;
  const parts = text.split(/[=;:]/);
  if (parts.length > 2) return { issue: "UNREADABLE" };

  let numbersPart = parts[0];
  let amountPart = parts[1];

  if (amountPart === undefined) {
    // ไม่มี = หรือ ; → รับรูปแบบ "เลข-ยอด" ที่มีขีดตัวเดียว ที่เหลือถือว่าไม่มียอด
    // "35-50" · "08.48.88-20" (เลขคั่นด้วย . แล้วขีดตัวเดียว = ขีดคั่นยอด) — เว้นแต่โพยนี้ใช้ขีดคั่นเลข
    // ("724-764" ในโพย 605-645-685) ซึ่งหลังขีดต้องเป็นยอดแน่นอน (30,000 / 5 / 100ລ່າງ)
    const dash = text.match(DASH_LINE);
    const tokens = text.split(NUMBER_SEPARATOR).filter(Boolean);
    const bareRight = /^\d{2,3}$/.test(dash?.[2].trim() ?? "");
    if (dash && (!bareRight || !dashNumbers)) {
      [, numbersPart, amountPart] = dash;
    } else {
      return { issue: tokens.every((t) => /^\d{2,3}$/.test(t)) ? "NO_AMOUNT" : "UNREADABLE" };
    }
  }

  const numbers = numbersPart.split(NUMBER_SEPARATOR).filter(Boolean);
  if (numbers.length === 0) return { issue: "UNREADABLE" };
  if (!numbers.every((n) => /^\d{2,3}$/.test(n))) return { issue: "BAD_NUMBER" };

  const amount = parseAmount(amountPart, fallback);
  if ("issue" in amount) return amount;
  // "2ລ່າງ1" กับเลข 3 ตัว = บอกจำนวนหลักขัดกับเลขที่พิมพ์ → ให้คนตรวจ
  if (amount.digits && numbers.some((n) => n.length !== amount.digits)) return { issue: "UNREADABLE" };
  const result = stakesFor(numbers, amount);
  return "issue" in result ? result : { ...result, amount };
}

/** ຫລັກ2-9=5 = เติมหลักร้อย 2 และ 9 หน้าเลข 2 ตัวทุกตัวในบรรทัดด้านบน เป็นเลข 3 ตัวบน เลขละ 5 */
const HUNDREDS_LINE = /^(?:(?:ໃສ່|ຕື່ມ|ເອົາ|ຈັບ|ใส่|เติม|เอา|จับ)\s*)?(?:ຫລັກ|ຫຼັກ|ລັກ|หลัก|ลัก)\s*(.*)$/iu;
/**
 * จุดแยกชุด: หลัง "=ยอด" ตามด้วยช่องว่าง (ตัวคั่นค้างหลังช่องว่างตัดทิ้ง) แล้วเป็นเลขชุดใหม่ที่มี = ของตัวเอง
 * ("…=3 510.550=1" · "…=5 31.71.=5" · "…=5 ../211-251=3")
 * คำกำกับเว้นวรรคจากยอดได้: "06.46=20 ພັນກີບບົນລ່າງລາວ 006.046=20 ພັນກີບບົນ"
 * หรือ / ติดยอดแล้วเป็นชุดเลข 2 ตัวขึ้นไปที่มี = ของตัวเอง: "30.70=20×30/29.69.05=10" (ชุดเลขตัวเดียว "32=10/20=5" ไม่แยก)
 * หรือหลัง "ໂຕยอด" (มีคำกำกับหรือช่องว่างต่อท้าย) เป็นเลขชุดใหม่ที่มี ໂຕ ของตัวเอง: "08 48 88 ໂຕ10ພັນ708 748 788 ໂຕ5"
 */
const MULTI_GROUP_BREAK =
  /(?<=[=:]\s*\d[^\s=:]*(?:\s+[^\d\s=:]+)?)\s+[.,\-/_]*\s*(?=\d{2,3}(?:\s*[.,\-/_]\s*\d{2,3})*\s*[.,\-/_]?\s*[=:])|(?<=[=:]\s*\d[\d.,]*(?:\s*[*x×]\s*\d[\d.,]*)?[^\d\s=:/]*)\s*\/\s*(?=\d{2,3}(?:\s*[.,\-_]\s*\d{2,3})+\s*[.,\-_]?\s*[=:])|(?<=(?:ໂຕ|ຕົວ|ตัว|โต|[Tt][Oo]|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู)\s*(?:ລະ|ละ)?\s*\d[\d.,]*(?:[^\d\s=:]+\s*|\s+))(?=\d{2,3}(?:\s*[.,\-/_\s]\s*\d{2,3})*\s*[.,\-/_]?\s*(?:ໂຕ|ຕົວ|ตัว|โต|[Tt][Oo]|ປ່ອງ|ປອງ|ป่อง|ຮູ|ຮ|รู)\s*(?:ລະ|ละ)?\s*\d)/u;
/**
 * หลายชุด "เลข-ยอดK" (ไม่มี =) ในบรรทัดเดียว คั่นด้วยช่องว่างหรือติดกัน: "36-39-100,000K 436-439-25,000K" · "76-79-200B476-479-50B" → แยกทีละชุด
 * ยอดต้องลงท้ายด้วย k / ພັນ / ฿ / ບາດ ทั้งสองชุด (ดู THOUSAND_TAIL) — ชุดหลังไม่มียอดของตัวเองไม่แยก
 */
/**
 * เลขหลักเดียวกลางรายการ (ไม่มีใครแทงเลขตัวเดียว) = ยอดของเลขก่อนหน้า แล้วเริ่มชุดใหม่:
 * "01-41-81-3-070-11-51-91=5" → "01-41-81-3" + "070-11-51-91=5" — ชุดหลังต้องมียอดของตัวเอง (= : ;)
 */
const MID_DIGIT_BREAK =
  /(?<=\d{2,3}\s*[-._,]\s*(?<!\d)\d)\s*[-._,]\s*(?=\d{2,3}(?:\s*[-._,]\s*\d{2,3})*\s*[=:;])/u;
const THOUSAND_GROUP_BREAK =
  /(?<=\d\s*(?:k|ພັນ|ພ|พัน|พ|฿|baht|b|บาท|บาด|ບາດ))\s*(?=\d{2,3}(?:\s*[.,\-/_]\s*\d{2,3})*\s*[.,\-/_]\s*\d[\d,.]*\s*(?:k|ພັນ|ພ|พัน|พ|฿|baht|b|บาท|บาด|ບາດ))/iu;
/** หลายรายการ "เลข-ยอด." คั่นด้วย / ในบรรทัดเดียว: "528-3./ 628-3./ 521-2./" · "21-5×5. /61-5×5." → แยกทีละรายการ */
const SLASH_DASH_ENTRIES =
  /^\/?\s*\d{2,3}\s*-\s*\d[\d,]*(?:\s*[*x×]\s*\d[\d,]*)?\s*\.?(?:\s*\/\s*\d{2,3}\s*-\s*\d[\d,]*(?:\s*[*x×]\s*\d[\d,]*)?\s*\.?)+\s*\/?$/u;
/**
 * หมายเหตุค้างจ่าย: ขึ้นต้นด้วยตัวหนังสือ ลงท้ายด้วย ຄ້າງ / ค้าง — "ເອື້ອຍຊິມ30₭ຄ້າງ" ไม่ใช่รายการแทง
 * ท้ายบรรทัดรายการ (เว้นวรรคคั่น) แยกออกเป็นหมายเหตุ: "11.51.91.ຮູ10 ເອື້ອຍຊິມ30₭ຄ້າງ"
 */
const DEBT_NOTE = /^[\p{L}\p{M}].*(?:ຄ້າງ|ค้าง)$/u;
const DEBT_NOTE_TAIL = /^(.*\d\S*)\s+([\p{L}\p{M}].*(?:ຄ້າງ|ค้าง))$/u;
/** รายการ + ຫລັກ ในบรรทัดเดียว: "16.56.96=10₭ ຫລັກ 8=2₭" → [รายการ, ຫລັກ…] */
const INLINE_HUNDREDS = /^(.*\d\D*?)\s*((?:(?:ໃສ່|ຕື່ມ|ເອົາ|ใส่|เติม|เอา)\s*)?(?:ຫລັກ|ຫຼັກ|ລັກ|หลัก|ลัก)\s*\d.*)$/u;
/**
 * รายการ + ยอดรวมท้ายบรรทัด (เว้นวรรคคั่น): "24.64=5x10.     ລາວ/90" → [รายการ, ยอดรวม]
 * ต้องมีเลขหลังคำ — "=10 ລາວ" ยังเป็นคำกำกับท้ายยอด
 */
const INLINE_TOTAL = /^(.*\d\D*?)\s+((?:ລວມ|รวม|ลวม|ລາວ|ลาว)[^\d]*\d[^=;:]*)$/u;
/** ລວມ ติดท้ายยอดไม่เว้นวรรค: "ປ່ອງ20ລວມ160" → ["ປ່ອງ20", "ລວມ160"] (ລາວ ติดยอดยังเป็นคำกำกับ ไม่แยก) */
const ATTACHED_TOTAL = /^(.*\d\D*?)((?:ລວມ|รวม|ลวม)[^\d]*\d[^=;:]*)$/u;
/**
 * เลข 3 ตัวขึ้นไปคั่นด้วย ; หรือ : ล้วน ไม่มียอด: "10;50;90;210" = เลขล้วน รอยอดบรรทัดล่าง (Hu 20)
 * (2 ตัว "772;5" / "20;25" ยังเป็น เลข;ยอด)
 */
const SEMICOLON_NUMBERS = /^\d{2,3}(?:\s*[;:]\s*\d{2,3}){2,}\s*[;:]?$/;
const semicolonNumbers = (text: string) => (SEMICOLON_NUMBERS.test(text) ? text.replace(/[;:]/g, ",") : text);
/** เลข-ยอด แบบง่าย: "97-20" · "23.5" — ใช้ดูว่าโพยนี้เขียนยอดหลังขีด/จุด (ดู SPLIT_AMOUNT_LINE) */
const SIMPLE_BET_LINE = /^\d{2,3}\s*[.\-]\s*\d{1,3}$/;
/**
 * เลข.ยอด.ยอด ในโพยที่เขียน "เลข-ยอด" ทีละบรรทัด = ยอดสองก้อนรวมกัน ไม่ใช่บน×ล่าง: "11.5.50" = 11 ยอด 55
 * ยอดแรกต้องเป็นเลขหลักเดียว (เป็นเลขแทงไม่ได้) — ไม่มีบรรทัด เลข-ยอด อื่นในโพย "11.5.50" กำกวม (อาจเป็นวันที่)
 */
/** เลข.ยอด: "526.20" — ใช้เป็นยอดเฉพาะโพยที่เข้าเงื่อนไข dotAmounts ใน parseTicket */
const DOT_AMOUNT_LINE = /^(\d{2,3})\s*\.\s*(\d{1,3})$/;
const SPLIT_AMOUNT_LINE =/^(\d{2,3})\s*[.\-]\s*(\d)\s*[.\-]\s*(\d{1,3})$/;
/** คำกำกับฝั่ง + ยอดรวม (ไม่มีเลขแทง): "ລ່າງບົນ ລວມ280" → ["ລ່າງບົນ", "ລວມ280"] */
/** คำกำกับฝั่ง + ยอด (ไม่มีเลขแทง): "ລ່າງ30฿" → ["ລ່າງ", "30", "฿"] — ดูเงื่อนไขที่ใช้ใน parseTicket */
const SIDE_AMOUNT_LINE = /^(\D+?)\s*(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(\D*)$/u;
const SIDE_THEN_TOTAL =/^(\D+?)\s*((?:ລວມ|รวม|ลวม)[^\d]*\d[^=;:]*)$/u;

/**
 * บรรทัด ຫລັກ… → รายการ · null = ไม่ใช่บรรทัดหลัก — bases = เลข 2 ตัวในบรรทัดด้านบน (ไม่ซ้ำ ตามลำดับ)
 * ລັກ2 ที่ไม่มียอด → { hundreds } ให้ parseTicket รอยอดจากบรรทัดท้ายชุด
 */
function parseHundredsLine(
  text: string,
  bases: readonly string[],
  fallback: Currency = "LAK",
): LineResult | { hundreds: string[] } | null {
  const match = text.match(HUNDREDS_LINE);
  if (!match) return null;
  const body = /[=;:]/.test(match[1]) ? match[1] : match[1].replace(EACH_WORD, "=");
  const parts = body.split(/[=;:]/);
  if (parts.length > 2) return { issue: "UNREADABLE" };

  const digits = parts[0].split(NUMBER_SEPARATOR).filter(Boolean);
  if (digits.length === 0 || !digits.every((d) => /^\d$/.test(d))) return { issue: "BAD_NUMBER" };
  if (parts.length === 1) return { hundreds: [...new Set(digits)] };
  if (bases.length === 0) return { issue: "UNREADABLE" };

  const amount = parseAmount(parts[1], fallback);
  if ("issue" in amount) return amount;
  // ผลเป็นเลข 3 ตัว จึงลงได้เฉพาะบน — บนล่างลงบนอย่างเดียว (ดู stakesFor) · ล่างล้วน = พิมพ์ผิด
  if (amount.position === "BOTTOM") return { issue: "THREE_DIGIT_BOTTOM" };
  const result = stakesFor(withHundreds([...new Set(digits)], bases), amount);
  return "issue" in result ? result : { ...result, amount };
}

export function parseTicket(message: string, options: ParseOptions = {}): ParsedTicket {
  const lakMultiplier = options.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER;
  /** ยอดแทงกีบที่พิมพ์ → ยอดจริง (คูณเฉพาะ 1–999 · ตั้งแต่ 1,000 = พิมพ์เต็มจำนวนแล้ว) */
  const lakAmount = (typed: number) => (typed >= LAK_FULL_BET_AMOUNT ? typed : typed * lakMultiplier);
  /** ยอดแทงกีบที่พิมพ์ → หน่วยแบบย่อ ใช้เทียบยอดรวม — 5.000 = 5 เมื่อตัวคูณ 1,000 */
  const betShort = (typed: number) => (typed >= LAK_FULL_BET_AMOUNT && lakMultiplier > 0 ? typed / lakMultiplier : typed);
  /** ยอดรวมกีบที่พิมพ์ → หน่วยแบบย่อ — 30,000 = 30 เมื่อตัวคูณ 1,000 */
  const lakShort = (typed: number) => (typed >= LAK_FULL_AMOUNT && lakMultiplier > 0 ? typed / lakMultiplier : typed);
  const bets: ParsedBet[] = [];
  const issues: ParseIssue[] = [];
  const notes: string[] = [];
  let declaredTotal: number | null = null;
  let typedTotal = 0;
  const rules = prepareReadRules(options.rules ?? [], { builtIn: options.builtInRules ?? true });
  // โพยบาท → รายการที่ไม่ได้ระบุสกุลเงินเป็นบาท (รายการที่ระบุ ກີບ / ₭ เองยังเป็นกีบ):
  // · มีบรรทัด B / ฿ เดี่ยว ๆ ด้านบนหรือด้านล่างของโพย
  // · ລວມ80฿ และทั้งข้อความไม่มีคำบอกกีบเลย
  const normalized = message.split(/\r?\n/).map(normalize);
  const fallback: Currency =
    hasThbMarkLine(normalized) ||
    (normalized.some((text) => totalOf(text) !== null && THB_WORD.test(text)) && !normalized.some((text) => LAK_WORD.test(text)))
      ? "THB"
      : "LAK";
  // มีบรรทัดที่ขีดคั่นเลข 3 ตัวขึ้นไป (605-645-685 / 406-446-486=1) → ขีดในโพยนี้คั่นเลข ไม่ใช่คั่นยอด
  const dashNumbers = normalized.some((text) => DASH_NUMBERS_LINE.test(text));
  /** บรรทัดเลข 2 ตัวล้วนที่ไม่มียอด (ติดกันได้หลายบรรทัด) — ถ้าบรรทัดถัดไปเป็น ຫລັກ จะใช้เป็นเลขฐานแทน และไม่นับเป็นปัญหา */
  let bare: { numbers: string[]; line: number; issues: ParseIssue[] } | null = null;
  /** ชุด "เลขฐาน + ລັກ2" ที่ยังไม่มียอด — รอบรรทัดยอดท้ายชุด (ໂຕ20 ບລ) · ระหว่างรอ issue ของชุดยังค้างไว้ */
  let groups: Array<{ bases: string[]; hundreds: string[]; baseLine: number; line: number; issues: ParseIssue[] }> = [];
  /** ເອົາທັງ2-3ໂຕ — ชุด ລັກ แทงเลขฐาน 2 ตัวด้วย */
  let takeBoth = false;
  /**
   * บรรทัดเลขที่ไม่มียอดติดกัน — รอยอดจากบรรทัดถัดไป:
   * ປ່ອງ3 = ทุกเลขเลขละ 3 · เลขเดี่ยวที่มียอด (989=10) = ใช้ยอดเดียวกัน (เฉพาะเมื่อทุกบรรทัดที่รอเป็นเลขเดี่ยว)
   */
  /** continued = บรรทัดลงท้ายด้วยตัวคั่น ("02-04-06-") = เขียนต่อบรรทัดถัดไป */
  let pending: Array<{ numbers: string[]; line: number; issue: ParseIssue; continued?: boolean }> = [];
  /** หัวยอด (ລາວ ບົນ-ລ່າງ ຮູ10) — ยอดของบรรทัดเลขที่ไม่มียอดด้านล่าง · used = มีเลขใช้แล้ว */
  let heading: { amount: Amount; line: number; text: string; used: boolean } | null = null;
  /** หัวยอดที่ไม่มีเลขใช้เลย = อ่านไม่ออก (เหมือน ປ່ອງ3 ที่ไม่มีเลขรอด้านบน) */
  const closeHeading = () => {
    if (heading && !heading.used) issues.push({ code: "UNREADABLE", line: heading.line, text: heading.text });
    heading = null;
  };
  /**
   * บรรทัดรายการติดกันล่าสุดที่ไม่ได้ระบุฝั่ง (ลงบนตามค่าเริ่มต้น) — บรรทัด ລ່າງ / ບົນ / ບລ เปล่า ๆ ถัดมา
   * เปลี่ยนฝั่งของบรรทัดเหล่านี้: "22_10 / 62_10 / ລ່າງ" = 22 62 ล่าง เลขละ 10 · placed = รายการใน bets ที่บรรทัดนี้ลงไว้
   */
  let unmarked: Array<{ numbers: string[]; line: number; amount: Amount; stakes: Stake[]; placed: ParsedBet[] }> = [];
  /** บรรทัดก่อนหน้าเป็นเส้นคั่น (_____) — ตัวเลขเปล่า ๆ บรรทัดถัดไปเป็นยอดรวม */
  let afterDivider = false;
  /** ส่วนของยอดรวมที่แจ้งที่อยู่ในช่วงกำกวม 1,000–9,999 (นับเป็นหน่วยย่อไว้ก่อน) */
  let ambiguousTotal = 0;
  /** ยอดรวมที่แจ้ง (ລວມ / ใต้เส้นคั่น) → หน่วยย่อ */
  const addDeclared = (value: number) => {
    if (value >= LAK_FULL_BET_AMOUNT && value < LAK_FULL_AMOUNT) ambiguousTotal += value;
    declaredTotal = (declaredTotal ?? 0) + lakShort(value);
  };
  /** มีบรรทัดว่างก่อนบรรทัดนี้ */
  let gap = false;
  /** หัวฝั่ง (ບລ / ລ່າງ เปล่า ๆ ที่เว้นบรรทัดจากด้านบน) — ฝั่งของบรรทัดรายการด้านล่างที่ไม่ได้ระบุฝั่ง */
  let sideHeading: PositionMark | null = null;
  const dropIssues = (list: readonly ParseIssue[]) => {
    for (const issue of list) issues.splice(issues.indexOf(issue), 1);
  };
  /** at = ตำแหน่งที่แทรกใน bets (ไม่ระบุ = ต่อท้าย) · คืนรายการที่ลงไป */
  const addStakes = (stakes: readonly Stake[], lineOf: (stake: Omit<Stake, "typed">) => number, at = bets.length) => {
    const placed = stakes.map(({ typed, ...stake }): ParsedBet => {
      const lak = stake.currency === "LAK";
      typedTotal += lak ? betShort(typed) : typed;
      return { ...stake, line: lineOf(stake), amount: lak ? lakAmount(typed) : typed };
    });
    bets.splice(at, 0, ...placed);
    return placed;
  };
  /** บรรทัด ລ່າງ / ບົນ / ບລ เปล่า ๆ → อ่านบรรทัดใน unmarked ใหม่ด้วยฝั่งนั้น · false = ใช้ไม่ได้ (เช่น เลข 3 ตัวลงล่าง) */
  const remarkPosition = (position: PositionMark) => {
    const results = unmarked.map((entry) => stakesFor(entry.numbers, { ...entry.amount, position }));
    const failed = results.find((result) => "issue" in result);
    if (failed && "issue" in failed) return failed.issue;
    // แทนที่รายการเดิมของแต่ละบรรทัดตรงตำแหน่งเดิม — รายการที่ลงหลังบรรทัดเหล่านี้ (เลข 3 ตัวของ ຫລັກ) อยู่ที่เดิม
    unmarked.forEach((entry, i) => {
      const at = bets.indexOf(entry.placed[0]!);
      bets.splice(at, entry.placed.length);
      for (const { typed, currency } of entry.stakes) typedTotal -= currency === "LAK" ? betShort(typed) : typed;
      const result = results[i]!;
      if (!("issue" in result)) addStakes(result.stakes, () => entry.line, at);
    });
    return null;
  };

  // ຫລັກ กลางบรรทัด แยกเป็นอีกบรรทัด (เลขแถวเดิม): "16.56=10₭ ຫລັກ 8=2₭" = "16.56=10₭" + "ຫລັກ 8=2₭"
  const segments = message.split(/\r?\n/).flatMap((raw, index) => {
    // "51=" (= ท้ายบรรทัดไม่มียอด) = เลขเปล่า "51" — รอยอดจากบรรทัดถัดไปแบบเดียวกัน
    let text = normalize(raw).replace(/(?<=\d)\s*[=;:]+$/, "");
    const debt = text.match(DEBT_NOTE_TAIL);
    if (debt) text = debt[1]!;
    // ยอดรวมท้ายบรรทัด แยกเป็นอีกบรรทัด (เลขแถวเดิม): "24.64=5x10. ລາວ/90" = "24.64=5x10." + "ລາວ/90"
    // ฝั่งเปล่า ๆ + ยอดรวม: "ລ່າງບົນ ລວມ280" = "ລ່າງບົນ" + "ລວມ280"
    const total = text.match(INLINE_TOTAL) ?? text.match(ATTACHED_TOTAL) ?? text.match(SIDE_THEN_TOTAL);
    const tail = total && totalOf(total[2]) && (/\d/.test(total[1]) || readSuffix(total[1])?.position) ? total[2] : null;
    if (tail) text = total![1];
    const inline = text.match(INLINE_HUNDREDS);
    return (inline ? [inline[1], inline[2]] : [text])
      // หลายชุด "เลข=ยอด" ในบรรทัดเดียว: "10.50=3 510.550=1" → แยกทีละชุด (เลขแถวเดิม)
      .flatMap((part) => part.split(MULTI_GROUP_BREAK))
      .flatMap((part) => part.split(THOUSAND_GROUP_BREAK))
      .flatMap((part) => part.split(MID_DIGIT_BREAK))
      .flatMap((part) => (SLASH_DASH_ENTRIES.test(part.trim()) ? part.split("/").filter((entry) => entry.trim()) : [part]))
      .concat(tail ? [tail] : [])
      .concat(debt ? [debt[2]!] : [])
      .map((original) => ({ original: original.trim(), line: index + 1 }));
  });
  // เลขที่อ่านไม่ชัด (5?) ในชุดเต็มนามสัตว์ → เติมเลขที่ทำให้นามครบ: "11 5? 91" = 11 51 91
  fillAnimalGuesses(segments.map((segment) => segment.original)).forEach((text, i) => (segments[i]!.original = text));
  // บรรทัดเลขล้วนติดกันที่ตามด้วยบรรทัดยอดเปล่า ๆ ("28 68 / 228 268 / ໂຕ5ພັນ") หรือบรรทัด ຫລັກ ("32 72 11 / ຫຼັກ 1ໂຕ5")
  // = เลขที่รอยอด/เลขฐานของบรรทัดด้านล่าง — ไม่ใช้เงื่อนไขอ่านโพยและ "96/50" กับบรรทัดเหล่านี้
  // ไม่งั้น "{N} {A}" อ่าน "28 68" เป็นเลข 28 ยอด 68
  const awaitsBelow = new Set<number>();
  for (let i = segments.length - 1, next = false; i >= 0; i--) {
    const text = segments[i]!.original;
    const tokens = semicolonNumbers(text).split(NUMBER_SEPARATOR).filter(Boolean);
    const numbersOnly = tokens.length > 0 && tokens.every((t) => /^\d{2,3}$/.test(t));
    if (numbersOnly && next) awaitsBelow.add(i);
    else next = !numbersOnly && (isAmountOnlyLine(text) || HUNDREDS_LINE.test(text));
  }

  // โพยเขียน "เลข-ยอด" ทีละบรรทัด (2 บรรทัดขึ้นไป) → "11.5.50" = ยอดรวม 5+50
  const splitAmounts = segments.filter((segment) => SIMPLE_BET_LINE.test(segment.original)).length >= 2;
  // "526.20 / 566 / 26 / … / 62.20" — บรรทัด เลข.ยอด 2 บรรทัดขึ้นไปที่ยอดเท่ากัน และบรรทัดอื่นเป็นเลขเดี่ยวล้วน
  // → จุดคั่นยอด ("62.20" = 62 ยอด 20 ไม่ใช่เลข 62 กับ 20) แล้วเลขเดี่ยวที่รออยู่ได้ยอดเดียวกัน
  const dotTails = segments.flatMap((segment) => segment.original.match(DOT_AMOUNT_LINE)?.[2] ?? []);
  const dotAmounts =
    dotTails.length >= 2 &&
    new Set(dotTails).size === 1 &&
    segments.every(({ original }) => !/\d/.test(original) || DOT_AMOUNT_LINE.test(original) || /^\d{2,3}$/.test(original));

  segments.forEach(({ original, line }, index) => {
    if (!original) {
      gap = true;
      return;
    }

    // เงื่อนไขของผู้ใช้: ข้ามบรรทัด = ไม่ใช่รายการแทง · แปลงแล้วอ่านต่อตามรูปแบบมาตรฐาน
    // (issue ยังแสดงบรรทัดตามที่ลูกค้าพิมพ์ ให้คนหาเจอในแชต)
    const ruled = awaitsBelow.has(index) ? original : applyReadRules(original, rules);
    if (ruled === null) {
      notes.push(original);
      return;
    }
    // ธง / อีโมจิ (🇱🇦 💰 ✅ ❤️) ไม่มีผลกับรายการ — ตัดออกก่อนอ่าน · บรรทัดที่มีแต่อีโมจิเก็บเป็นหมายเหตุ
    let text = numberWordsToDigits(ruled.replace(EMOJI, "").trim().replace(GREETING_PREFIX, "").replace(BUY_PREFIX, "")).trim();
    text = stripBuyAddress(text);
    if (!text) {
      if (ruled.trim()) notes.push(original);
      return;
    }
    // ລາວ03-43-83=5 = ชื่อหวยนำหน้ารายการ (ไม่ใช่ ລວມ) → ตัดชื่อทิ้งแล้วอ่านเป็นรายการ
    const laoLabel = text.match(TOTAL_LINE);
    if (laoLabel && laoBetLine(text, laoLabel)) text = text.replace(LAO_PREFIX, "").replace(/^[\s:/.\-]+/, "");
    // ສາວຫູ້າ 01-41-81:5 = ชื่อลูกค้านำหน้ารายการ → เก็บชื่อเป็นหมายเหตุ แล้วอ่านเลขที่เหลือ
    const name = leadingName(text);
    if (name) {
      notes.push(name[1]!);
      text = text.slice(name[0].length);
    }
    if (!awaitsBelow.has(index)) text = text.replace(SLASH_AMOUNT_LINE, "$1=$2");
    text = semicolonNumbers(text.replace(EQUALS_AS_SEPARATOR, "$1-"));
    if (dotAmounts) text = text.replace(DOT_AMOUNT_LINE, "$1=$2");
    if (splitAmounts) text = text.replace(SPLIT_AMOUNT_LINE, (_, number: string, a: string, b: string) => `${number}=${Number(a) + Number(b)}`);

    if (TAKE_BOTH.test(text)) {
      takeBoth = true;
      text = text.replace(TAKE_BOTH, "").trim();
    }
    // ຈັບຫລັກ8ນຳ = เติมหลัก 8 "ด้วย" — เลขฐาน 2 ตัวยังแทงอยู่ (เหมือน ເອົາທັງ2-3ໂຕ)
    if (HUNDREDS_LINE.test(text) && HUNDREDS_ALSO.test(text)) {
      takeBoth = true;
      text = text.replace(HUNDREDS_ALSO, "").trim();
    }
    // ລ່າງ / ບົນ / ບລ เปล่า ๆ — ติดใต้บรรทัดรายการที่ไม่ได้ระบุฝั่ง → เปลี่ยนฝั่งของบรรทัดเหล่านั้น
    // มีบรรทัดว่างคั่นจากด้านบน / ไม่มีรายการด้านบน → หัวฝั่งของบรรทัดรายการด้านล่าง
    const mark = text && !/\d/.test(text) ? readSuffix(text) : null;
    const afterGap = gap;
    gap = false;
    if (mark?.position && !mark.currency) {
      if (unmarked.length > 0 && !afterGap) {
        const issue = remarkPosition(mark.position);
        if (issue) issues.push({ code: issue, line, text: original });
      } else {
        sideHeading = mark.position;
        notes.push(original);
      }
      unmarked = [];
      return;
    }
    // ไม่มีตัวเลข (ชื่อ คำทักทาย) · เอาแต่3โต · วันที่ / เบอร์โทร (03/10/2026🇱🇦 · ນາງ ແອ໋ມ 02055551234) = หมายเหตุ
    if (!text || !/\d/.test(text) || ONLY_THREE_LINE.test(text) || DEBT_NOTE.test(text) || (!totalOf(text) && isDateOrPhoneLine(text)) || SHORT_DATE_LINE.test(text)) {
      notes.push(original);
      if (DIVIDER_LINE.test(text)) afterDivider = true;
      return;
    }
    // ตัวเลขเปล่า ๆ ใต้เส้นคั่น (_____ / -----) = ยอดรวม เหมือน ລວມ101.000
    // ชื่อลูกค้านำหน้ายอดใต้เส้นคั่น: "ອ.ເຕວ  56" = ชื่อ ອ.ເຕວ + ยอดรวม 56
    const dividedName = afterDivider ? text.match(DIVIDED_NAME) : null;
    const named = dividedName && !readSuffix(dividedName[1]!) && !KEYWORD_PREFIX.test(dividedName[1]!) ? dividedName : null;
    const divided = afterDivider ? text.slice(named ? named[0].length : 0).match(DIVIDED_TOTAL) : null;
    afterDivider = false;
    if (divided) {
      const value = toAmount(divided[1]);
      if (value !== null) {
        if (named) notes.push(named[1]!.trim());
        pending = [];
        closeHeading();
        addDeclared(value);
        return;
      }
    }
    const run = unmarked;
    unmarked = [];

    // ລ່າງ30฿ ใต้บรรทัดรายการที่ไม่ได้ระบุฝั่ง และ 30 = ผลรวมยอดของบรรทัดเหล่านั้นพอดี
    // → ฝั่งของบรรทัดด้านบน + ยอดรวม (เหมือน "ລ່າງ" เปล่า ๆ ตามด้วย "ລວມ30฿") · ไม่เท่า = ยังส่งให้คนตรวจ
    const sideTotal = run.length > 0 && !afterGap && !totalOf(text) ? text.match(SIDE_AMOUNT_LINE) : null;
    const sideMark = sideTotal ? readSuffix(sideTotal[1]!) : null;
    const sideRest = sideTotal ? readSuffix(sideTotal[3]!) : null;
    const sideValue = sideTotal ? toAmount(sideTotal[2]!) : null;
    const runTyped = run.reduce((sum, entry) => sum + entry.stakes.reduce((s, stake) => s + stake.typed, 0), 0);
    if (sideMark?.position && !sideMark.currency && sideRest && !sideRest.position &&
      (!sideRest.currency || run.every((entry) => entry.amount.currency === sideRest.currency)) && sideValue === runTyped) {
      unmarked = run;
      const issue = remarkPosition(sideMark.position);
      unmarked = [];
      if (issue) issues.push({ code: issue, line, text: original });
      else addDeclared(sideValue);
      return;
    }

    // หัวยอดที่ไม่มีเลขรอด้านบน → ยอดของเลขด้านล่าง · มีเลขรอ → ใช้กับเลขด้านบน (ดู each ด้านล่าง)
    // ต้องอยู่ก่อน TOTAL_LINE: "ລາວ ຮູ10" ไม่ใช่ยอดรวม ລາວ10
    const head = groups.length === 0 ? text.match(HEADING_LINE) : null;
    const headSuffix = head ? readSuffix(head[1]) : null;
    const headAmount = head && headSuffix ? `${head[2]}${head[1]}` : null;
    if (headAmount !== null && pending.length === 0) {
      closeHeading();
      const amount = parseAmount(headAmount, fallback);
      if ("issue" in amount) issues.push({ code: amount.issue, line, text: original });
      else heading = { amount, line, text: original, used: false };
      bare = null;
      return;
    }

    // =15.000 ที่ไม่มีเลขรอยอดด้านบน = ยอดรวม (มีเลขรอ = ยอดเลขละของเลขเหล่านั้น ดู each ด้านล่าง)
    const equalsTotal = pending.length === 0 && groups.length === 0 ? text.match(EQUALS_TOTAL_LINE) : null;
    const total = totalOf(text) ?? (equalsTotal && readSuffix(equalsTotal[2]!) ? equalsTotal : null);
    if (total) {
      pending = [];
      sideHeading = null;
      closeHeading();
      // ລວມ:1ລ້ານ / ລວມ 1.5ລ້ານ / ລວມ 5ແສນ = ยอดเต็มจำนวน (กีบ)
      const unit = text.match(TOTAL_UNIT_LINE);
      const value = unit ? Number(unit[1].replace(",", ".")) * TOTAL_UNITS[unit[2]] : toAmount(total[1]);
      if (value === null || !(value > 0)) issues.push({ code: "UNREADABLE", line, text: original });
      else addDeclared(value);
      // "30.000 ເລກລ່າງ" — ยอดรวมที่บอกฝั่ง = ฝั่งของรายการด้านบนที่ไม่ได้ระบุฝั่ง (เหมือนบรรทัด ລ່າງ เปล่า ๆ)
      const side = readSuffix(text.slice(text.indexOf(total[1]) + total[1].length).replace(/[:=]/g, ""))?.position;
      if (side && run.length > 0) {
        unmarked = run;
        const issue = remarkPosition(side);
        if (issue) issues.push({ code: issue, line, text: original });
        unmarked = [];
      }
      return;
    }

    // ໂຕ20 ບລ ท้ายชุด ລັກ → ยอดเดียวกันทุกชุด: เลข 3 ตัวลงแถว ລັກ · เลขฐาน 2 ตัว (ເອົາທັງ2-3ໂຕ) ลงแถวเลขฐาน
    const shared = groups.length > 0 ? text.match(SHARED_AMOUNT_LINE) : null;
    if (shared) {
      const amount = parseAmount(shared[1], fallback);
      const results = groups.map((group) =>
        "issue" in amount
          ? amount
          : stakesFor([...(takeBoth ? group.bases : []), ...withHundreds(group.hundreds, group.bases)], amount),
      );
      const failed = results.find((result) => "issue" in result);
      if (failed && "issue" in failed) {
        issues.push({ code: failed.issue, line, text: original });
      } else {
        groups.forEach((group, i) => {
          const result = results[i];
          if ("issue" in result) return;
          dropIssues(group.issues);
          addStakes(result.stakes, (stake) => (stake.digits === 2 ? group.baseLine : group.line));
        });
      }
      groups = [];
      bare = null;
      pending = [];
      takeBoth = false;
      return;
    }

    // ປ່ອງ3 / ຮູ3 — หรือ ໂຕ10 / =10 ที่ไม่มีชุด ລັກ รออยู่ แต่มีเลขไม่มียอดด้านบน (173 / 133 / 73 / ໂຕ10)
    const each = headAmount ?? (text.match(EACH_AMOUNT_LINE) ?? (pending.length > 0 ? text.match(SHARED_AMOUNT_LINE) : null))?.[1];
    if (each !== undefined) {
      const amount = parseAmount(each, fallback);
      const results = pending.map((wait) => ("issue" in amount ? amount : stakesFor(wait.numbers, amount)));
      const failed = pending.length === 0 ? { issue: "UNREADABLE" as const } : results.find((result) => "issue" in result);
      if (failed && "issue" in failed) {
        issues.push({ code: failed.issue, line, text: original });
      } else {
        pending.forEach((wait, i) => {
          const result = results[i];
          if ("issue" in result) return;
          dropIssues([wait.issue]);
          const placed = addStakes(result.stakes, () => wait.line);
          // ໂຕ3 ไม่ได้ระบุฝั่ง → บรรทัด ບົນ-ລ່າງ / ລ່າງ เปล่า ๆ ถัดมาเปลี่ยนฝั่งของเลขเหล่านี้ได้
          if (!("issue" in amount) && amount.position === undefined) {
            unmarked.push({ numbers: wait.numbers, line: wait.line, amount, stakes: result.stakes, placed });
          }
        });
      }
      groups = [];
      bare = null;
      pending = [];
      return;
    }

    const prev = bare;
    bare = null;
    const waiting = pending;
    pending = [];
    const bases = prev?.numbers ?? [...new Set(bets.filter((bet) => bet.digits === 2).map((bet) => bet.number))];
    const hundreds = parseHundredsLine(text, bases, fallback);
    if (hundreds && "hundreds" in hundreds) {
      // ລັກ2 ไม่มียอด — ต้องมีเลขฐานด้านบน แล้วรอยอดจากบรรทัดท้ายชุด
      const issue: ParseIssue = { code: prev ? "NO_AMOUNT" : "UNREADABLE", line, text: original };
      issues.push(issue);
      if (prev) groups.push({ bases: prev.numbers, hundreds: hundreds.hundreds, baseLine: prev.line, line, issues: [...prev.issues, issue] });
      else groups = [];
      return;
    }
    if (hundreds && !("issue" in hundreds) && prev) dropIssues(prev.issues);
    let result: LineResult = hundreds ?? parseLine(text, fallback, dashNumbers);
    // ใต้หัวฝั่ง (ລ່າງ เว้นบรรทัด) และบรรทัดนี้ไม่ได้ระบุฝั่ง → ใช้ฝั่งของหัว
    if (sideHeading && !hundreds && !("issue" in result) && result.amount && result.amount.position === undefined) {
      const amount: Amount = { ...result.amount, position: sideHeading };
      const sided = stakesFor([...new Set(result.stakes.map((stake) => stake.number))], amount);
      result = "issue" in sided ? sided : { ...sided, amount };
    }
    if ("issue" in result) {
      const numbers = text.split(NUMBER_SEPARATOR).filter(Boolean);
      // เลขไม่มียอดใต้หัวยอด (ລາວ ບົນ-ລ່າງ ຮູ10) → ใช้ยอดของหัว
      if (heading && !hundreds && result.issue === "NO_AMOUNT" && numbers.length > 0 && numbers.every((n) => /^\d{2,3}$/.test(n))) {
        const headed = stakesFor(numbers, heading.amount);
        if ("issue" in headed) issues.push({ code: headed.issue, line, text: original });
        else addStakes(headed.stakes, () => line);
        heading.used = true;
        return;
      }
      const issue: ParseIssue = { code: result.issue, line, text: original };
      issues.push(issue);
      if (!hundreds && result.issue === "NO_AMOUNT" && numbers.length > 0 && numbers.every((n) => /^\d{2,3}$/.test(n))) {
        pending = [...waiting, { numbers, line, issue, continued: /[-,./_]\s*$/.test(text) }];
      }
      if (!hundreds && result.issue === "NO_AMOUNT" && numbers.every((n) => /^\d{2}$/.test(n))) {
        bare = prev
          ? { numbers: [...new Set([...prev.numbers, ...numbers])], line: prev.line, issues: [...prev.issues, issue] }
          : { numbers: [...new Set(numbers)], line, issues: [issue] };
        return;
      }
      groups = [];
      return;
    }
    groups = [];
    // บรรทัดนี้มียอด (เลขเดียวหรือหลายเลข: 989=10 · 509,549,589 ໂຕ20) → เลขเดี่ยวที่รออยู่ด้านบนใช้ยอด/คำกำกับเดียวกัน
    // บรรทัดที่รอ: เลขเดี่ยว · หลายเลขที่มีเลข 3 ตัว (บรรทัดต่อ "506.546" / "586.599.598/1")
    // · ลงท้ายด้วยตัวคั่น ("02-04-06-" = เขียนต่อบรรทัดล่าง)
    // หลายเลขที่เป็นเลข 2 ตัวล้วนอื่น ๆ ไม่รับ — อาจเป็นเลขฐานของ ຫລັກ ("32 72 11" / "45=20" ยังรอตรวจ)
    const singles = waiting.every(
      (wait) => wait.numbers.length === 1 || wait.continued || wait.numbers.some((n) => n.length === 3),
    );
    const filled: typeof unmarked = [];
    if (!hundreds && result.amount && singles) {
      for (const wait of waiting) {
        const same = stakesFor(wait.numbers, result.amount);
        if ("issue" in same) continue;
        dropIssues([wait.issue]);
        const placed = addStakes(same.stakes, () => wait.line);
        filled.push({ numbers: wait.numbers, line: wait.line, amount: result.amount, stakes: same.stakes, placed });
      }
    }
    const placed = addStakes(result.stakes, () => line);
    // ไม่ได้ระบุฝั่ง → รอดูว่าบรรทัดถัดไปเป็น ລ່າງ / ບົນ เปล่า ๆ หรือไม่
    if (!hundreds && result.amount && result.amount.position === undefined) {
      const numbers = [...new Set(result.stakes.map((stake) => stake.number))];
      unmarked = [...run, ...filled, { numbers, line, amount: result.amount, stakes: result.stakes, placed }];
    }
    // ຫລັກ ที่ไม่ได้ระบุฝั่ง ไม่ตัดบรรทัดเลข 2 ตัวด้านบน: "07-47=100 / ຫລັກ4-5=30 / ບົນລ່າງ" → 07 47 บนล่าง
    // (เลข 3 ตัวของ ຫລັກ ลงบนอย่างเดียวอยู่แล้ว จึงไม่ต้องอ่านใหม่)
    if (hundreds && result.amount && result.amount.position === undefined) unmarked = run;
  });
  // ยอดเต็มจำนวนที่หารกลับเป็นหน่วยย่ออาจมีทศนิยม (15,500 = 15.5) — ปัดกันเศษทศนิยมของ float
  closeHeading();
  typedTotal = Math.round(typedTotal * 1000) / 1000;
  // ยอดรวม 1,000–9,999 กำกวม: 9.000 = 9,000 กีบเต็ม (ย่อ 9) หรือ ລວມ1.800 = ย่อ 1,800 — เลือกแบบที่ตรงกับยอดที่คิดได้
  if (declaredTotal !== null && ambiguousTotal > 0 && lakMultiplier > 0) {
    const asFull = declaredTotal - ambiguousTotal + ambiguousTotal / lakMultiplier;
    if (Math.round(asFull * 1000) / 1000 === typedTotal) declaredTotal = asFull;
  }
  if (declaredTotal !== null) declaredTotal = Math.round(declaredTotal * 1000) / 1000;

  // บรรทัดที่อ่านไม่ออกทำให้ยอดไม่ตรงอยู่แล้ว จึงเทียบยอดรวมเฉพาะเมื่ออ่านได้ครบทุกบรรทัด
  if (declaredTotal !== null && issues.length === 0 && bets.length > 0 && declaredTotal !== typedTotal) {
    issues.push({ code: "TOTAL_MISMATCH", line: 0, text: `${declaredTotal} ≠ ${typedTotal}` });
  }

  return { bets, issues, notes, declaredTotal, typedTotal, needsReview: issues.length > 0 };
}
