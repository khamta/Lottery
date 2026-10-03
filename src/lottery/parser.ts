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
 *
 * บรรทัดที่อ่านไม่ออกจะไม่ถูกเดา — คืนเป็น issue ให้คนตรวจ
 */

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
  /** ยอดจริงหลังคูณตัวคูณกีบแล้ว (ยอดกีบที่พิมพ์ตั้งแต่ LAK_FULL_AMOUNT ไม่คูณ) */
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
};

export const DEFAULT_LAK_MULTIPLIER = 1000;
/** ยอดกีบที่พิมพ์ตั้งแต่ค่านี้ (10.000 / 10,000) ถือว่าพิมพ์เต็มจำนวนแล้ว — ไม่คูณตัวคูณกีบ */
export const LAK_FULL_AMOUNT = 10_000;

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
  { text: "ບາດ", currency: "THB" },
  { text: "thb", currency: "THB" },
  { text: "baht", currency: "THB" },
  { text: "₭", currency: "LAK" },
  { text: "ກີບ", currency: "LAK" },
  { text: "กีบ", currency: "LAK" },
  { text: "lak", currency: "LAK" },
  { text: "kip", currency: "LAK" },
];
// คำยาวก่อน กัน "ລ" ชนะ "ລ່າງ"
SUFFIX_TOKENS.sort((a, b) => b.text.length - a.text.length);

/** ยอด: คั่นหลักพันด้วย , หรือ . ได้ (10,000 / 10.000) — จุดที่ไม่ใช่หลักพันไม่ถูกนับเป็นยอด */
const AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})+(?!\d)|\d[\d,]*`;
/** ລາວ200,000 = ยอดรวมของโพยหวยลาว */
const TOTAL_LINE = new RegExp(String.raw`^(?:ລວມ|รวม|total|ລາວ|ลาว)[^\d]*(${AMOUNT})`, "i");
const AMOUNT_PART = new RegExp(String.raw`^(${AMOUNT})(?:\s*[*x×]\s*(${AMOUNT}))?(.*)$`, "i");
/** ขีดตัวเดียวคั่นเลขกับยอด: 762-5 · 570 57 70-30,000 */
const DASH_LINE = /^([^-]+?)\s*-\s*([^-]+)$/;
/** ตัวคั่นระหว่างเลข */
const NUMBER_SEPARATOR = /[.\-/,_\s+]+/;
/** ໂຕ / ຕົວ / ตัว ระหว่างเลขกับยอด = เลขละ — "33 73 ໂຕ 20" อ่านเหมือน "33 73=20" */
const EACH_WORD = /\s*(?:ໂຕ|ຕົວ|ตัว)\s*(?=\d)/u;
/** zero-width space / joiner (U+200B–U+200D) และ BOM (U+FEFF) */
const INVISIBLE = new RegExp(`[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200d)}${String.fromCharCode(0xfeff)}]`, "g");

/** เลขลาว (໐-໙) / เลขไทย (๐-๙) → 0-9 และตัดอักขระล่องหนที่ติดมากับการ copy */
function normalize(text: string) {
  return text
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/[໐-໙]/g, (d) => String(d.charCodeAt(0) - 0x0ed0))
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .trim();
}

function toAmount(text: string) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const value = Number(text.replace(/[.,]/g, ""));
  return value > 0 ? value : null;
}

function readSuffix(text: string) {
  let rest = text.toLowerCase().replace(/[\s.+/\-]/g, "");
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

type LineResult = { stakes: Array<Omit<ParsedBet, "line" | "amount"> & { typed: number }> } | { issue: ParseIssueCode };

function parseLine(line: string): LineResult {
  const text = /[=;:]/.test(line) ? line : line.replace(EACH_WORD, "=");
  const parts = text.split(/[=;:]/);
  if (parts.length > 2) return { issue: "UNREADABLE" };

  let numbersPart = parts[0];
  let amountPart = parts[1];

  if (amountPart === undefined) {
    // ไม่มี = หรือ ; → รับรูปแบบ "เลข-ยอด" ที่มีขีดตัวเดียว ที่เหลือถือว่าไม่มียอด
    // หลายเลขรับเฉพาะเมื่อหลังขีดไม่ใช่เลข 2-3 หลักเปล่า ๆ (30,000 / 5 / 100ລ່າງ) — "38.78-33" อาจเป็นเลขทั้งหมด
    const dash = text.match(DASH_LINE);
    const tokens = text.split(NUMBER_SEPARATOR).filter(Boolean);
    if (dash && (tokens.length === 2 || !/^\d{2,3}$/.test(dash[2].trim()))) {
      [, numbersPart, amountPart] = dash;
    } else {
      return { issue: tokens.every((t) => /^\d{2,3}$/.test(t)) ? "NO_AMOUNT" : "UNREADABLE" };
    }
  }

  const numbers = numbersPart.split(NUMBER_SEPARATOR).filter(Boolean);
  if (numbers.length === 0) return { issue: "UNREADABLE" };
  if (!numbers.every((n) => /^\d{2,3}$/.test(n))) return { issue: "BAD_NUMBER" };

  const amount = amountPart.trim().match(AMOUNT_PART);
  if (!amount) return { issue: amountPart.trim() ? "UNREADABLE" : "NO_AMOUNT" };

  const first = toAmount(amount[1]);
  const second = amount[2] === undefined ? undefined : toAmount(amount[2]);
  const suffix = readSuffix(amount[3]);
  if (first === null || second === null || !suffix) return { issue: "UNREADABLE" };

  // "1000*1000" = บน × ล่าง อยู่แล้ว จึงห้ามมีคำกำกับฝั่งซ้ำ
  if (second !== undefined && suffix.position) return { issue: "UNREADABLE" };

  const position: PositionMark = second !== undefined ? "BOTH" : (suffix.position ?? "TOP");
  const currency = suffix.currency ?? "LAK";
  const hasBottom = position !== "TOP";
  // บน+ล่างที่มีเลข 2 ตัวปน (26.66.590=10ບລ) → เลข 3 ตัวลงบนอย่างเดียว · ล่างล้วน หรือมีแต่เลข 3 ตัว = พิมพ์ผิด
  const threeDigitTopOnly = position === "BOTH" && numbers.some((n) => n.length === 2);
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

/** ຫລັກ2-9=5 = เติมหลักร้อย 2 และ 9 หน้าเลข 2 ตัวทุกตัวในบรรทัดด้านบน เป็นเลข 3 ตัวบน เลขละ 5 */
const HUNDREDS_LINE = /^(?:ຫລັກ|ຫຼັກ|หลัก)\s*(.*)$/iu;

/** บรรทัด ຫລັກ… → รายการ · null = ไม่ใช่บรรทัดหลัก — bases = เลข 2 ตัวในบรรทัดด้านบน (ไม่ซ้ำ ตามลำดับ) */
function parseHundredsLine(text: string, bases: readonly string[]): LineResult | null {
  const match = text.match(HUNDREDS_LINE);
  if (!match) return null;
  const parts = match[1].split(/[=;:]/);
  if (parts.length !== 2) return { issue: "UNREADABLE" };

  const digits = parts[0].split(NUMBER_SEPARATOR).filter(Boolean);
  if (digits.length === 0 || !digits.every((d) => /^\d$/.test(d))) return { issue: "BAD_NUMBER" };
  if (bases.length === 0) return { issue: "UNREADABLE" };

  const amount = parts[1].trim().match(AMOUNT_PART);
  if (!amount) return { issue: parts[1].trim() ? "UNREADABLE" : "NO_AMOUNT" };
  const typed = toAmount(amount[1]);
  const suffix = readSuffix(amount[3]);
  if (typed === null || !suffix) return { issue: "UNREADABLE" };
  // ผลเป็นเลข 3 ตัว จึงลงได้เฉพาะบน
  if (amount[2] !== undefined || (suffix.position && suffix.position !== "TOP")) return { issue: "THREE_DIGIT_BOTTOM" };

  const currency = suffix.currency ?? "LAK";
  const stakes = [...new Set(digits)].flatMap((digit) =>
    bases.map((base) => ({ number: `${digit}${base}`, digits: 3 as const, position: "TOP" as const, currency, typed })),
  );
  return { stakes };
}

export function parseTicket(message: string, options: ParseOptions = {}): ParsedTicket {
  const lakMultiplier = options.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER;
  /** ยอดกีบที่พิมพ์ → ยอดจริง (พิมพ์เต็มจำนวนแล้วไม่คูณ) */
  const lakAmount = (typed: number) => (typed >= LAK_FULL_AMOUNT ? typed : typed * lakMultiplier);
  /** ยอดกีบที่พิมพ์ → หน่วยแบบย่อ ใช้เทียบยอดรวม — 30,000 = 30 เมื่อตัวคูณ 1,000 */
  const lakShort = (typed: number) => (typed >= LAK_FULL_AMOUNT && lakMultiplier > 0 ? typed / lakMultiplier : typed);
  const bets: ParsedBet[] = [];
  const issues: ParseIssue[] = [];
  const notes: string[] = [];
  let declaredTotal: number | null = null;
  let typedTotal = 0;
  const rules = prepareReadRules(options.rules ?? []);

  message.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const original = normalize(raw);
    if (!original) return;

    // เงื่อนไขของผู้ใช้: ข้ามบรรทัด = ไม่ใช่รายการแทง · แปลงแล้วอ่านต่อตามรูปแบบมาตรฐาน
    // (issue ยังแสดงบรรทัดตามที่ลูกค้าพิมพ์ ให้คนหาเจอในแชต)
    const ruled = applyReadRules(original, rules);
    if (ruled === null) {
      notes.push(original);
      return;
    }
    const text = ruled.trim();
    if (!text) return;

    if (!/\d/.test(text)) {
      notes.push(original);
      return;
    }

    const total = text.match(TOTAL_LINE);
    if (total) {
      const value = toAmount(total[1]);
      if (value === null) issues.push({ code: "UNREADABLE", line, text: original });
      else declaredTotal = (declaredTotal ?? 0) + lakShort(value);
      return;
    }

    const bases = [...new Set(bets.filter((bet) => bet.digits === 2).map((bet) => bet.number))];
    const result = parseHundredsLine(text, bases) ?? parseLine(text);
    if ("issue" in result) {
      issues.push({ code: result.issue, line, text: original });
      return;
    }
    for (const { typed, ...stake } of result.stakes) {
      const lak = stake.currency === "LAK";
      typedTotal += lak ? lakShort(typed) : typed;
      bets.push({ ...stake, line, amount: lak ? lakAmount(typed) : typed });
    }
  });
  // ยอดเต็มจำนวนที่หารกลับเป็นหน่วยย่ออาจมีทศนิยม (15,500 = 15.5) — ปัดกันเศษทศนิยมของ float
  typedTotal = Math.round(typedTotal * 1000) / 1000;
  if (declaredTotal !== null) declaredTotal = Math.round(declaredTotal * 1000) / 1000;

  // บรรทัดที่อ่านไม่ออกทำให้ยอดไม่ตรงอยู่แล้ว จึงเทียบยอดรวมเฉพาะเมื่ออ่านได้ครบทุกบรรทัด
  if (declaredTotal !== null && issues.length === 0 && bets.length > 0 && declaredTotal !== typedTotal) {
    issues.push({ code: "TOTAL_MISMATCH", line: 0, text: `${declaredTotal} ≠ ${typedTotal}` });
  }

  return { bets, issues, notes, declaredTotal, typedTotal, needsReview: issues.length > 0 };
}
