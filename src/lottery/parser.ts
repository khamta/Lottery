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
 *   32 72 11 / ຫຼັກ 1 .3 .5ໂຕ500฿ → บรรทัดเลข 2 ตัวที่ไม่มียอดตามด้วย ຫລັກ = เลขฐานของ ຫລັກ เท่านั้น (ไม่ใช่รายการแทง)
 *   เอาแต่3โต              → หมายเหตุ "เอาแต่เลข 3 ตัว" ไม่ใช่รายการแทง
 *   04/44/84 / ລັກ2 / 22/62 / ລັກ8 / ໂຕ20 ບລ ເອົາທັງ2-3ໂຕ
 *                          → หลายชุด "เลขฐาน + ລັກN" ที่ไม่มียอด ใช้ยอดบรรทัดท้ายร่วมกัน (204 244 284 … 822 862 บน 20)
 *                            ເອົາທັງ2-3ໂຕ = แทงเลขฐาน 2 ตัวด้วยตามฝั่งที่ระบุ · ไม่มี = เลข 3 ตัวอย่างเดียว
 *   919 / 959 / 989=10     → บรรทัดเลขเดี่ยวที่ไม่มียอดติดกัน ตามด้วยเลขเดี่ยวที่มียอด = ใช้ยอด/คำกำกับเดียวกันทุกเลข
 *   24 / 64 / 07 / ປ່ອງ3   → ປ່ອງ / ຮູ = ยอดเลขละ ใช้กับทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน (24 64 07 บน เลขละ 3)
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
  // ລາວ ท้ายยอด = บอกว่าเป็นหวยลาว ไม่มีผลกับรายการ
  { text: "ລາວ" },
  { text: "ลาว" },
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
const EACH_WORD = /\s*(?:ໂຕ|ຕົວ|ตัว|โต)\s*(?=\d)/u;
/** เอาแต่3โต / ເອົາແຕ່3ໂຕ = ลูกค้าบอกว่าเอาแต่เลข 3 ตัว — หมายเหตุ ไม่ใช่รายการแทง */
const ONLY_THREE_LINE = /^(?:เอาแต่|ເອົາແຕ່|ແຕ່)\s*3\s*(?:ตัว|โต|ໂຕ|ຕົວ)?$/u;
/** ເອົາທັງ2-3ໂຕ / เอาทั้ง2-3ตัว = ชุด ລັກ ให้แทงเลขฐาน 2 ตัวด้วย ไม่ใช่เลข 3 ตัวอย่างเดียว */
const TAKE_BOTH = /(?:ເອົາ|เอา)?\s*(?:ທັງ|ທັ້ງ|ทั้ง|ทัง)\s*2\s*[-,.\/&]?\s*3\s*(?:ໂຕ|ຕົວ|ตัว|โต)?/u;
/** ໂຕ20 ບລ / =20 = บรรทัดยอดที่ไม่มีเลข — ใช้กับทุกชุด ລັກ ที่ยังไม่มียอดด้านบน */
const SHARED_AMOUNT_LINE = /^(?:[=;:]|ໂຕ|ຕົວ|ตัว|โต)\s*(\d.*)$/u;
/** ປ່ອງ3 / ຮູ3 = ยอดเลขละ 3 ของทุกเลขที่ไม่มียอดในบรรทัดติดกันด้านบน */
const EACH_AMOUNT_LINE = /^(?:ປ່ອງ|ປອງ|ป่อง|ຮູ|รู)\s*(\d.*)$/u;
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

type Stake = Omit<ParsedBet, "line" | "amount"> & { typed: number };
type LineResult = { stakes: Stake[] } | { issue: ParseIssueCode };
type Amount = { first: number; second?: number; position?: PositionMark; currency: Currency };

/** ส่วนยอดหลัง = / ໂຕ เช่น "100ລ່າງ" · "1000*1000฿" */
function parseAmount(text: string): Amount | { issue: ParseIssueCode } {
  const amount = text.trim().match(AMOUNT_PART);
  if (!amount) return { issue: text.trim() ? "UNREADABLE" : "NO_AMOUNT" };

  const first = toAmount(amount[1]);
  const second = amount[2] === undefined ? undefined : toAmount(amount[2]);
  const suffix = readSuffix(amount[3]);
  if (first === null || second === null || !suffix) return { issue: "UNREADABLE" };

  // "1000*1000" = บน × ล่าง อยู่แล้ว จึงห้ามมีคำกำกับฝั่งซ้ำ
  if (second !== undefined && suffix.position) return { issue: "UNREADABLE" };
  return { first, second, position: second !== undefined ? "BOTH" : suffix.position, currency: suffix.currency ?? "LAK" };
}

function stakesFor(numbers: readonly string[], { first, second, position = "TOP", currency }: Amount): LineResult {
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

/** เติมหลักร้อยหน้าเลขฐาน — หลักร้อยเป็นวงนอก: [2, 9] × [08, 48] → 208 248 908 948 */
const withHundreds = (hundreds: readonly string[], bases: readonly string[]) =>
  hundreds.flatMap((digit) => bases.map((base) => `${digit}${base}`));

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

  const amount = parseAmount(amountPart);
  return "issue" in amount ? amount : stakesFor(numbers, amount);
}

/** ຫລັກ2-9=5 = เติมหลักร้อย 2 และ 9 หน้าเลข 2 ตัวทุกตัวในบรรทัดด้านบน เป็นเลข 3 ตัวบน เลขละ 5 */
const HUNDREDS_LINE = /^(?:ຫລັກ|ຫຼັກ|ລັກ|หลัก)\s*(.*)$/iu;

/**
 * บรรทัด ຫລັກ… → รายการ · null = ไม่ใช่บรรทัดหลัก — bases = เลข 2 ตัวในบรรทัดด้านบน (ไม่ซ้ำ ตามลำดับ)
 * ລັກ2 ที่ไม่มียอด → { hundreds } ให้ parseTicket รอยอดจากบรรทัดท้ายชุด
 */
function parseHundredsLine(text: string, bases: readonly string[]): LineResult | { hundreds: string[] } | null {
  const match = text.match(HUNDREDS_LINE);
  if (!match) return null;
  const body = /[=;:]/.test(match[1]) ? match[1] : match[1].replace(EACH_WORD, "=");
  const parts = body.split(/[=;:]/);
  if (parts.length > 2) return { issue: "UNREADABLE" };

  const digits = parts[0].split(NUMBER_SEPARATOR).filter(Boolean);
  if (digits.length === 0 || !digits.every((d) => /^\d$/.test(d))) return { issue: "BAD_NUMBER" };
  if (parts.length === 1) return { hundreds: [...new Set(digits)] };
  if (bases.length === 0) return { issue: "UNREADABLE" };

  const amount = parseAmount(parts[1]);
  if ("issue" in amount) return amount;
  // ผลเป็นเลข 3 ตัว จึงลงได้เฉพาะบน
  if (amount.position && amount.position !== "TOP") return { issue: "THREE_DIGIT_BOTTOM" };
  return stakesFor(withHundreds([...new Set(digits)], bases), amount);
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
  let pending: Array<{ numbers: string[]; line: number; issue: ParseIssue }> = [];
  const dropIssues = (list: readonly ParseIssue[]) => {
    for (const issue of list) issues.splice(issues.indexOf(issue), 1);
  };
  const addStakes = (stakes: readonly Stake[], lineOf: (stake: Omit<Stake, "typed">) => number) => {
    for (const { typed, ...stake } of stakes) {
      const lak = stake.currency === "LAK";
      typedTotal += lak ? lakShort(typed) : typed;
      bets.push({ ...stake, line: lineOf(stake), amount: lak ? lakAmount(typed) : typed });
    }
  };

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
    let text = ruled.trim();
    if (!text) return;

    if (TAKE_BOTH.test(text)) {
      takeBoth = true;
      text = text.replace(TAKE_BOTH, "").trim();
    }
    if (!text || !/\d/.test(text) || ONLY_THREE_LINE.test(text)) {
      notes.push(original);
      return;
    }

    const total = text.match(TOTAL_LINE);
    if (total) {
      pending = [];
      const value = toAmount(total[1]);
      if (value === null) issues.push({ code: "UNREADABLE", line, text: original });
      else declaredTotal = (declaredTotal ?? 0) + lakShort(value);
      return;
    }

    // ໂຕ20 ບລ ท้ายชุด ລັກ → ยอดเดียวกันทุกชุด: เลข 3 ตัวลงแถว ລັກ · เลขฐาน 2 ตัว (ເອົາທັງ2-3ໂຕ) ลงแถวเลขฐาน
    const shared = groups.length > 0 ? text.match(SHARED_AMOUNT_LINE) : null;
    if (shared) {
      const amount = parseAmount(shared[1]);
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

    const each = text.match(EACH_AMOUNT_LINE);
    if (each) {
      const amount = parseAmount(each[1]);
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
    const hundreds = parseHundredsLine(text, bases);
    if (hundreds && "hundreds" in hundreds) {
      // ລັກ2 ไม่มียอด — ต้องมีเลขฐานด้านบน แล้วรอยอดจากบรรทัดท้ายชุด
      const issue: ParseIssue = { code: prev ? "NO_AMOUNT" : "UNREADABLE", line, text: original };
      issues.push(issue);
      if (prev) groups.push({ bases: prev.numbers, hundreds: hundreds.hundreds, baseLine: prev.line, line, issues: [...prev.issues, issue] });
      else groups = [];
      return;
    }
    if (hundreds && !("issue" in hundreds) && prev) dropIssues(prev.issues);
    const result = hundreds ?? parseLine(text);
    if ("issue" in result) {
      const issue: ParseIssue = { code: result.issue, line, text: original };
      issues.push(issue);
      const numbers = text.split(NUMBER_SEPARATOR).filter(Boolean);
      if (!hundreds && result.issue === "NO_AMOUNT" && numbers.length > 0 && numbers.every((n) => /^\d{2,3}$/.test(n))) {
        pending = [...waiting, { numbers, line, issue }];
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
    // บรรทัดนี้เป็นเลขเดี่ยวที่มียอด → เลขเดี่ยวที่รออยู่ด้านบนใช้ยอดเดียวกัน (อ่านส่วนท้ายซ้ำด้วยเลขของบรรทัดนั้น)
    const lead = text.match(/^\d{2,3}(?!\d)/)?.[0];
    const singles = waiting.every((wait) => wait.numbers.length === 1);
    if (!hundreds && lead && singles && result.stakes.every((stake) => stake.number === lead)) {
      for (const wait of waiting) {
        const same = parseLine(wait.numbers[0] + text.slice(lead.length));
        if ("issue" in same) continue;
        dropIssues([wait.issue]);
        addStakes(same.stakes, () => wait.line);
      }
    }
    addStakes(result.stakes, () => line);
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
