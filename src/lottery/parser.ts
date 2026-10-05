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
  | "FROM_IMAGE";

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

/** คำกำกับท้ายยอด — "ບ" / "บ" ตัวเดียวไม่อยู่ในนี้เพราะกำกวม (ບົນ หรือ ບາດ) จึงส่งให้คนตรวจ */
const SUFFIX_TOKENS: SuffixToken[] = [
  { text: "ບົນລ່າງ", position: "BOTH" },
  { text: "ບົນລາງ", position: "BOTH" },
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
  { text: "กีบ", currency: "LAK" },
  { text: "lak", currency: "LAK" },
  { text: "kip", currency: "LAK" },
  // ລາວ ท้ายยอด = บอกว่าเป็นหวยลาว ไม่มีผลกับรายการ
  // ເລກ / เลข หน้าคำกำกับ ("ເລກລ່າງ" = เลขล่าง) ไม่มีผล
  { text: "ເລກ" },
  { text: "เลข" },
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
/** ລາວ200,000 = ยอดรวมของโพยหวยลาว */
const TOTAL_LINE = new RegExp(String.raw`^(?:ລວມ|รวม|total|ລາວ|ลาว)[^\d]*(${AMOUNT})`, "i");
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

/** บรรทัดยอดรวม → [ข้อความทั้งบรรทัด, ยอด] · null = ไม่ใช่บรรทัดยอดรวม */
function totalOf(text: string): RegExpMatchArray | null {
  const full = text.match(TOTAL_LINE) ?? text.match(LAO_TOTAL_TAIL);
  if (full) return full;
  // ລ120 / 14.000ບົນ — ส่วนท้ายต้องอ่านเป็นคำกำกับได้ (ບົນ / ฿ / ພັນ …) ไม่งั้นไม่ใช่ยอดรวม
  const short = text.match(SHORT_TOTAL_LINE) ?? text.match(BARE_TOTAL_LINE);
  return short && readSuffix(short[2]) ? short : null;
}
/** หน่วยเต็มของยอดรวม: ລວມ:1ລ້ານ = 1,000,000 กีบ · ລວມ5ແສນ = 500,000 กีบ */
const TOTAL_UNITS: Record<string, number> = { ລ້ານ: 1_000_000, ລານ: 1_000_000, ล้าน: 1_000_000, ແສນ: 100_000, แสน: 100_000 };
const TOTAL_UNIT_LINE = /^(?:ລວມ|รวม|total|ລາວ|ลาว)[^\d]*(\d+(?:[.,]\d+)?)\s*(ລ້ານ|ລານ|ล้าน|ແສນ|แสน)/iu;
/** สกุลเงิน/หลักพันระหว่างยอดบนกับ × : "20ບາດ×20ບາດ" */
const CURRENCY_BEFORE_TIMES = /(\d)\s*(฿|ບາດ|บาท|บาด|baht|b|₭|ກີບ|กีบ|kip|ພັນ|ພ|พัน|k)\s*(?=[*x×]\s*\d)/iu;
/** ໂຕ / ຮູ / ປ່ອງ (+ລະ) หน้ายอด: "255=ໂຕ5ພັນ" */
const AMOUNT_EACH_PREFIX = /^(?:ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|รู|hu)\s*(?:ລະ|ละ)?\s*(?=\d)/iu;
const THB_WORD =/฿|บาท|บาด|ບາດ|thb|baht/i;
const LAK_WORD = /₭|ກີບ|กีบ|\bkip\b|\blak\b/i;
/** บรรทัดที่มีแต่คำบอกบาท: B / b / ฿ / บาท / บาด / ບາດ (วงเล็บ จุด ขีด เว้นวรรค ไม่มีผล) */
const THB_ONLY_LINE = /^(?:b|฿|บาท|บาด|ບາດ|baht|thb)$/i;

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
    (text, index) => (index < first || index > last) && THB_ONLY_LINE.test(text.replace(/[\s.:+\-()[\]（）]/g, "")),
  );
}
const AMOUNT_PART = new RegExp(String.raw`^(${AMOUNT})(?:\s*[*x×]\s*(${AMOUNT}))?(.*)$`, "i");
/** ขีดคั่นเลข 3 ตัวขึ้นไป (มียอดหลัง = ได้): 605-645-685 · 406-446-486=1 */
const DASH_NUMBERS_LINE = /^\d{2,3}(?:\s*-\s*\d{2,3}){2,}\s*(?:[=;:].*)?$/;
/** ขีดตัวเดียวคั่นเลขกับยอด: 762-5 · 570 57 70-30,000 */
const DASH_LINE = /^([^-]+?)\s*-\s*([^-]+)$/;
/** ตัวคั่นระหว่างเลข — รวมวงเล็บ: "826)866=10" */
const NUMBER_SEPARATOR = /[.\-/,_\s+()[\]]+/;
/** ໂຕ / ຕົວ / ตัว / ປ່ອງ / ຮູ / hu (+ລະ) ระหว่างเลขกับยอด = เลขละ — "33 73 ໂຕ 20" · "92ປ່ອງ10" อ่านเหมือน "33 73=20" · "92=10" */
const EACH_WORD = /\s*(?:ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|รู|hu)\s*(?:ລະ|ละ)?\s*(?=\d)/iu;
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
const NUMBER_WORDS_EACH = new RegExp(`((?:ໂຕ|ຕົວ|ตัว|โต|ປ່ອງ|ປອງ|ป่อง|ຮູ|รู|=)\\s*(?:ລະ|ละ)?\\s*)${NUMBER_WORD}`, "gu");

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
  return text.replace(NUMBER_WORDS_THOUSAND, toDigits).replace(NUMBER_WORDS_EACH, toDigits);
}

/** คำทักทาย / "ซื้อเลข" หน้าเลขแรก: "ສບດຊື້ເລກ807;07:…" → "807;07:…" */
const GREETING_PREFIX = /^(?:(?:ສະບາຍດີ|ສບດ|ຂໍຊື້|ຊື້|ເລກ|ສະບາຍ|สวัสดี|ขอซื้อ|ซื้อ|เลข)\s*)+(?=\d)/u;

/** เส้นคั่นท้ายโพย: _____ / ----- / ===== / ..... (3 ตัวขึ้นไป) */
const DIVIDER_LINE = /^[\s_\-=—–─.*~]{3,}$/u;
/** ตัวเลขเปล่า ๆ ใต้เส้นคั่น = ยอดรวม: 101.000 · 101,000 · 101 (ต่อท้ายสกุลเงินได้) */
const DIVIDED_TOTAL = /^(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:฿|₭|ກີບ|กีบ|บาท|บาด|ບາດ)?$/u;
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
/** ເອົາທັງ2-3ໂຕ / เอาทั้ง2-3ตัว = ชุด ລັກ ให้แทงเลขฐาน 2 ตัวด้วย ไม่ใช่เลข 3 ตัวอย่างเดียว */
const TAKE_BOTH = /(?:ເອົາ|เอา)?\s*(?:ທັງ|ທັ້ງ|ทั้ง|ทัง)\s*2\s*[-,.\/&]?\s*3\s*(?:ໂຕ|ຕົວ|ตัว|โต)?/u;
/** ໂຕ20 ບລ / =20 = บรรทัดยอดที่ไม่มีเลข — ใช้กับทุกชุด ລັກ ที่ยังไม่มียอดด้านบน */
const SHARED_AMOUNT_LINE = /^(?:[=;:]\s*(?:ໂຕ|ຕົວ|ตัว|โต)?|(?:ໂຕ|ຕົວ|ตัว|โต)\s*[=;:]?)\s*(\d.*)$/u;
/** 22_10 = เลข 22 ยอด 10 — เลขเดียว ขีดล่างตัวเดียว ไม่มี = ; : */
const UNDERSCORE_LINE = /^\s*\d{2,3}\s*_\s*\d[^_=;:]*$/;
/** ตัวท้ายที่ลงท้ายด้วย ພັນ / ພ / พัน / พ = ยอดแน่นอน: "32_72_29_69_5ພັນ" = "32_72_29_69=5ພັນ" */
const THOUSAND_TAIL = /^(.*\d)\s*[_.,\-/\s]+\s*(\d[\d,.]*\s*(?:ພັນ|ພ|พัน|พ|k)[^\d=;:]*)$/iu;
/** หลัง / ตัวท้ายเป็นเลขหลักเดียวหรือ 4 หลักขึ้นไป (เป็นเลขแทงไม่ได้) = ยอด: "18.58.98/2" = "18.58.98=2" */
const SLASH_TAIL = /^(.*\d)\s*\/\s*((?:\d|\d{4,})(?!\d)[^\d=;:/]*)$/u;
/** ตัวท้ายเป็น บน*ล่าง (เป็นเลขแทงไม่ได้) = ยอด ไม่ว่าคั่นด้วยอะไร: "14/7*7" · "32 72 50*50" */
const TIMES_TAIL = /^(.*\d)\s*[_.,\-/\s]+\s*(\d[\d,.]*\s*[*x×]\s*\d[\d,.]*[^\d=;:]*)$/iu;
/** ตัวท้ายเป็นเลขหลักเดียว (ไม่มีใครแทงเลขตัวเดียว) = ยอด ไม่ว่าคั่นด้วยอะไร: "030 3" · "32.72.5ບລ" · "32_72_5" */
const SINGLE_DIGIT_TAIL = /^(.*\d)\s*[_.,\-/\s]+\s*(\d(?![\d,.])[^\d=;:]*)$/u;
/** ປ່ອງ3 / ຮູ3 = ยอดเลขละ 3 ของทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน */
const EACH_AMOUNT_LINE = /^(?:ປ່ອງ|ປອງ|ป่อง|ຮູ|รู|hu)\s*(\d.*)$/iu;
/**
 * ลາວ ບົນ-ລ່າງ ຮູ10 = หัวยอด: [คำกำกับฝั่ง/สกุลเงิน] + ຮູ/ປ່ອງ/ໂຕ + ยอด — ไม่มีเลขรอด้านบน
 * จึงเป็นยอดของบรรทัดเลขที่ไม่มียอดด้านล่าง (จนกว่าจะเจอหัวยอดใหม่หรือ ລວມ)
 */
const HEADING_LINE = /^([^\d=:;]*?)\s*(?:ປ່ອງ|ປອງ|ป่อง|ຮູ|รู|hu|ໂຕ|ຕົວ|ตัว|โต)\s*(?:ລະ|ละ)?\s*(\d.*)$/iu;
/**
 * อักขระควบคุมที่มองไม่เห็น (Unicode Cf): zero-width space / joiner, BOM, soft hyphen และเครื่องหมายทิศทาง
 * (LRM/RLM U+200E–U+200F, U+202A–U+202E, U+2066–U+2069) ที่ WhatsApp Web/Desktop แทรกมาตอน copy —
 * ไม่ใช่ \s จึงติดอยู่กับเลขแล้วทำให้ทั้งบรรทัดอ่านไม่ออก (สระ/วรรณยุกต์ไทย-ลาวเป็น Mn ไม่โดนตัด)
 */
const INVISIBLE = /\p{Cf}/gu;
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
    // ປອ່ງ = ປ່ອງ ที่วางไม้เอกผิดที่ (หน้าจอดูเหมือนกัน)
    .replace(/ປອ່ງ/g, "ປ່ອງ")
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
type Amount = { first: number; second?: number; position?: PositionMark; currency: Currency };

/**
 * คำกำกับท้ายยอดที่มีชื่อลูกค้าต่อท้าย: "ກີບ ອ້າຍຊານ" → คำกำกับ "ກີບ" (ชื่อไม่นับ)
 * ชื่อ = คำท้ายที่คั่นด้วยช่องว่าง เป็นตัวหนังสือล้วน ยาว 2 ตัวขึ้นไป · คำที่ติดกับยอด ("100ບ ອ້າຍ") ต้องเป็นคำกำกับเสมอ
 * (ບ ตัวเดียวกำกวม จึงตัดเป็นชื่อไม่ได้)
 */
function readSuffixWithoutName(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const attached = !/^\s/.test(text);
  for (let keep = words.length - 1; keep >= (attached ? 1 : 0); keep--) {
    const name = words.slice(keep).join("");
    if (!/^[\p{L}\p{M}]{2,}$/u.test(name)) continue;
    const suffix = readSuffix(words.slice(0, keep).join(" "));
    if (suffix) return suffix;
  }
  return null;
}

/** ส่วนยอดหลัง = / ໂຕ เช่น "100ລ່າງ" · "1000*1000฿" */
function parseAmount(text: string, fallback: Currency = "LAK"): Amount | { issue: ParseIssueCode } {
  // =ໂຕ5ພັນ / =ຮູລະ10 — คำว่า "เลขละ" หลัง = ไม่มีผลกับยอด
  let body = text.trim().replace(AMOUNT_EACH_PREFIX, "");
  // 20ບາດ×20ບາດ / 20ບາດ×20 — สกุลเงินที่คั่นกลาง บน×ล่าง ย้ายไปท้าย: "20×20ບາດ"
  const between = body.match(CURRENCY_BEFORE_TIMES);
  if (between) {
    body = body.replace(CURRENCY_BEFORE_TIMES, "$1");
    if (!body.toLowerCase().includes(between[2].toLowerCase())) body += between[2];
  }
  const amount = body.match(AMOUNT_PART);
  if (!amount) return { issue: text.trim() ? "UNREADABLE" : "NO_AMOUNT" };

  const first = toAmount(amount[1]);
  const second = amount[2] === undefined ? undefined : toAmount(amount[2]);
  const suffix = readSuffix(amount[3]) ?? readSuffixWithoutName(amount[3]);
  if (first === null || second === null || !suffix) return { issue: "UNREADABLE" };

  // "1000*1000" = บน × ล่าง อยู่แล้ว จึงห้ามมีคำกำกับฝั่งซ้ำ
  if (second !== undefined && suffix.position) return { issue: "UNREADABLE" };
  return { first, second, position: second !== undefined ? "BOTH" : suffix.position, currency: suffix.currency ?? fallback };
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
  const line =
    equalsNumbers.length >= 2 &&
    equalsNumbers.every((part) => /^\s*\d{2,3}\s*$/.test(part)) &&
    (equalsNumbers.length >= 3 || AMOUNT_EACH_PREFIX.test(equalsParts.at(-1)!.trim()))
      ? `${equalsParts.slice(0, -1).join(",")}=${equalsParts.at(-1)}`
      : raw;
  // มี ໂຕ / ຮູ / hu คั่นยอดแล้ว (ไม่มี =) → ; : ที่เหลือคั่นระหว่างเลข: "06;46;506 hu 20" = "06,46,506=20"
  const each = !line.includes("=") && EACH_WORD.test(line);
  // เลขเดียว + ขีดล่างตัวเดียว + ยอด: "22_10" = "22=10" (หลายขีด "04_44_84_=20" ยังเป็นตัวคั่นเลข)
  const underscore = !each && UNDERSCORE_LINE.test(line);
  const thousand =
    !each && !/[=;:]/.test(line)
      ? (line.match(THOUSAND_TAIL) ?? line.match(TIMES_TAIL) ?? line.match(SLASH_TAIL) ?? line.match(SINGLE_DIGIT_TAIL))
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
  const result = stakesFor(numbers, amount);
  return "issue" in result ? result : { ...result, amount };
}

/** ຫລັກ2-9=5 = เติมหลักร้อย 2 และ 9 หน้าเลข 2 ตัวทุกตัวในบรรทัดด้านบน เป็นเลข 3 ตัวบน เลขละ 5 */
const HUNDREDS_LINE = /^(?:(?:ໃສ່|ຕື່ມ|ເອົາ|ใส่|เติม|เอา)\s*)?(?:ຫລັກ|ຫຼັກ|ລັກ|หลัก|ลัก)\s*(.*)$/iu;
/** จุดแยกชุด: หลัง "=ยอด" ตามด้วยช่องว่าง แล้วเป็นเลขชุดใหม่ที่มี = ของตัวเอง ("…=3 510.550=1") */
const MULTI_GROUP_BREAK = /(?<=[=:]\s*\d[^\s=:]*)\s+(?=\d{2,3}(?:\s*[.,\-/_]\s*\d{2,3})*\s*[=:])/u;
/** รายการ + ຫລັກ ในบรรทัดเดียว: "16.56.96=10₭ ຫລັກ 8=2₭" → [รายการ, ຫລັກ…] */
const INLINE_HUNDREDS = /^(.*\d\D*?)\s*((?:(?:ໃສ່|ຕື່ມ|ເອົາ|ใส่|เติม|เอา)\s*)?(?:ຫລັກ|ຫຼັກ|ລັກ|หลัก|ลัก)\s*\d.*)$/u;

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
  return stakesFor(withHundreds([...new Set(digits)], bases), amount);
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
   * เปลี่ยนฝั่งของบรรทัดเหล่านี้: "22_10 / 62_10 / ລ່າງ" = 22 62 ล่าง เลขละ 10 · รายการของบรรทัดเหล่านี้อยู่ท้าย bets เสมอ
   */
  let unmarked: Array<{ numbers: string[]; line: number; amount: Amount; stakes: Stake[] }> = [];
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
  const addStakes = (stakes: readonly Stake[], lineOf: (stake: Omit<Stake, "typed">) => number) => {
    for (const { typed, ...stake } of stakes) {
      const lak = stake.currency === "LAK";
      typedTotal += lak ? betShort(typed) : typed;
      bets.push({ ...stake, line: lineOf(stake), amount: lak ? lakAmount(typed) : typed });
    }
  };
  /** บรรทัด ລ່າງ / ບົນ / ບລ เปล่า ๆ → อ่านบรรทัดใน unmarked ใหม่ด้วยฝั่งนั้น · false = ใช้ไม่ได้ (เช่น เลข 3 ตัวลงล่าง) */
  const remarkPosition = (position: PositionMark) => {
    const results = unmarked.map((entry) => stakesFor(entry.numbers, { ...entry.amount, position }));
    const failed = results.find((result) => "issue" in result);
    if (failed && "issue" in failed) return failed.issue;
    const count = unmarked.reduce((sum, entry) => sum + entry.stakes.length, 0);
    bets.splice(bets.length - count, count);
    for (const entry of unmarked) {
      for (const { typed, currency } of entry.stakes) typedTotal -= currency === "LAK" ? betShort(typed) : typed;
    }
    unmarked.forEach((entry, i) => {
      const result = results[i];
      if (!("issue" in result)) addStakes(result.stakes, () => entry.line);
    });
    return null;
  };

  // ຫລັກ กลางบรรทัด แยกเป็นอีกบรรทัด (เลขแถวเดิม): "16.56=10₭ ຫລັກ 8=2₭" = "16.56=10₭" + "ຫລັກ 8=2₭"
  const segments = message.split(/\r?\n/).flatMap((raw, index) => {
    const text = normalize(raw);
    const inline = text.match(INLINE_HUNDREDS);
    return (inline ? [inline[1], inline[2]] : [text])
      // หลายชุด "เลข=ยอด" ในบรรทัดเดียว: "10.50=3 510.550=1" → แยกทีละชุด (เลขแถวเดิม)
      .flatMap((part) => part.split(MULTI_GROUP_BREAK))
      .map((original) => ({ original: original.trim(), line: index + 1 }));
  });
  // เลขที่อ่านไม่ชัด (5?) ในชุดเต็มนามสัตว์ → เติมเลขที่ทำให้นามครบ: "11 5? 91" = 11 51 91
  fillAnimalGuesses(segments.map((segment) => segment.original)).forEach((text, i) => (segments[i]!.original = text));

  segments.forEach(({ original, line }) => {
    if (!original) {
      gap = true;
      return;
    }

    // เงื่อนไขของผู้ใช้: ข้ามบรรทัด = ไม่ใช่รายการแทง · แปลงแล้วอ่านต่อตามรูปแบบมาตรฐาน
    // (issue ยังแสดงบรรทัดตามที่ลูกค้าพิมพ์ ให้คนหาเจอในแชต)
    const ruled = applyReadRules(original, rules);
    if (ruled === null) {
      notes.push(original);
      return;
    }
    // ธง / อีโมจิ (🇱🇦 💰 ✅ ❤️) ไม่มีผลกับรายการ — ตัดออกก่อนอ่าน · บรรทัดที่มีแต่อีโมจิเก็บเป็นหมายเหตุ
    let text = numberWordsToDigits(ruled.replace(EMOJI, "").trim().replace(GREETING_PREFIX, "")).trim();
    if (!text) {
      if (ruled.trim()) notes.push(original);
      return;
    }

    if (TAKE_BOTH.test(text)) {
      takeBoth = true;
      text = text.replace(TAKE_BOTH, "").trim();
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
    if (!text || !/\d/.test(text) || ONLY_THREE_LINE.test(text) || (!totalOf(text) && isDateOrPhoneLine(text))) {
      notes.push(original);
      if (DIVIDER_LINE.test(text)) afterDivider = true;
      return;
    }
    // ตัวเลขเปล่า ๆ ใต้เส้นคั่น (_____ / -----) = ยอดรวม เหมือน ລວມ101.000
    const divided = afterDivider ? text.match(DIVIDED_TOTAL) : null;
    afterDivider = false;
    if (divided) {
      const value = toAmount(divided[1]);
      if (value !== null) {
        pending = [];
        closeHeading();
        addDeclared(value);
        return;
      }
    }
    const run = unmarked;
    unmarked = [];

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

    const total = totalOf(text);
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
          addStakes(result.stakes, () => wait.line);
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
        addStakes(same.stakes, () => wait.line);
        filled.push({ numbers: wait.numbers, line: wait.line, amount: result.amount, stakes: same.stakes });
      }
    }
    addStakes(result.stakes, () => line);
    // ไม่ได้ระบุฝั่ง → รอดูว่าบรรทัดถัดไปเป็น ລ່າງ / ບົນ เปล่า ๆ หรือไม่
    if (!hundreds && result.amount && result.amount.position === undefined) {
      const numbers = [...new Set(result.stakes.map((stake) => stake.number))];
      unmarked = [...run, ...filled, { numbers, line, amount: result.amount, stakes: result.stakes }];
    }
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
