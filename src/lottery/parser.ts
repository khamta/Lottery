/**
 * ตัวแยกข้อความโพยหวยจากแชต — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * ใช้ร่วมกันทั้งหน้าวางข้อความเองและบอท WhatsApp
 *
 *   243=150                → 243 (3 ตัวบน) 150
 *   30.70=100ລ່າງ           → 30 และ 70 ล่าง เลขละ 100
 *   38.78.33.73=300ບລ      → บน 300 และล่าง 300 ทุกเลข
 *   78.87=1000*1000฿       → บน 1000 × ล่าง 1000 บาท
 *   772;5 · 762-5          → เลข 772 / 762 บน 5
 *   ລວມ150                 → ยอดรวมที่ลูกค้าแจ้ง (ใช้ตรวจกับยอดที่คิดได้)
 *
 * บรรทัดที่อ่านไม่ออกจะไม่ถูกเดา — คืนเป็น issue ให้คนตรวจ
 */

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
  /** ยอดจริงหลังคูณตัวคูณกีบแล้ว */
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
  /** ยอดรวมที่ลูกค้าแจ้ง ตามตัวเลขที่พิมพ์ (ยังไม่คูณ) — null = ไม่ได้แจ้ง */
  declaredTotal: number | null;
  /** ผลรวมของยอดที่พิมพ์ในทุกรายการ (ยังไม่คูณ) ใช้เทียบกับ declaredTotal */
  typedTotal: number;
  needsReview: boolean;
};

export type ParseOptions = {
  /** ลูกค้าพิมพ์ยอดกีบย่อเป็นหลักพัน: 150 = 150,000 กีบ — บาทไม่คูณ */
  lakMultiplier?: number;
};

export const DEFAULT_LAK_MULTIPLIER = 1000;

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

const TOTAL_LINE = /^(?:ລວມ|รวม|total)[^\d]*(\d[\d,]*)/i;
const AMOUNT_PART = /^(\d[\d,]*)(?:\s*[*x×]\s*(\d[\d,]*))?(.*)$/i;
const DASH_LINE = /^(\d{2,3})\s*-\s*(.+)$/;
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
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const value = Number(text.replaceAll(",", ""));
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

function parseLine(text: string): LineResult {
  const parts = text.split(/[=;:]/);
  if (parts.length > 2) return { issue: "UNREADABLE" };

  let numbersPart = parts[0];
  let amountPart = parts[1];

  if (amountPart === undefined) {
    // ไม่มี = หรือ ; → รับรูปแบบ "เลข-ยอด" (762-5) เท่านั้น ที่เหลือถือว่าไม่มียอด
    const dash = text.match(DASH_LINE);
    const tokens = text.split(/[.\-/,\s+]+/).filter(Boolean);
    if (dash && tokens.length === 2) {
      [, numbersPart, amountPart] = dash;
    } else {
      return { issue: tokens.every((t) => /^\d{2,3}$/.test(t)) ? "NO_AMOUNT" : "UNREADABLE" };
    }
  }

  const numbers = numbersPart.split(/[.\-/,\s+]+/).filter(Boolean);
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
  if (hasBottom && numbers.some((n) => n.length === 3)) return { issue: "THREE_DIGIT_BOTTOM" };

  const stakes = numbers.flatMap((number) => {
    const base = { number, digits: number.length as 2 | 3, currency };
    return [
      ...(position !== "BOTTOM" ? [{ ...base, position: "TOP" as const, typed: first }] : []),
      ...(hasBottom ? [{ ...base, position: "BOTTOM" as const, typed: second ?? first }] : []),
    ];
  });
  return { stakes };
}

export function parseTicket(message: string, options: ParseOptions = {}): ParsedTicket {
  const lakMultiplier = options.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER;
  const bets: ParsedBet[] = [];
  const issues: ParseIssue[] = [];
  const notes: string[] = [];
  let declaredTotal: number | null = null;
  let typedTotal = 0;

  message.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = normalize(raw);
    if (!text) return;

    if (!/\d/.test(text)) {
      notes.push(text);
      return;
    }

    const total = text.match(TOTAL_LINE);
    if (total) {
      const value = toAmount(total[1]);
      if (value === null) issues.push({ code: "UNREADABLE", line, text });
      else declaredTotal = (declaredTotal ?? 0) + value;
      return;
    }

    const result = parseLine(text);
    if ("issue" in result) {
      issues.push({ code: result.issue, line, text });
      return;
    }
    for (const { typed, ...stake } of result.stakes) {
      typedTotal += typed;
      bets.push({ ...stake, line, amount: typed * (stake.currency === "LAK" ? lakMultiplier : 1) });
    }
  });

  // บรรทัดที่อ่านไม่ออกทำให้ยอดไม่ตรงอยู่แล้ว จึงเทียบยอดรวมเฉพาะเมื่ออ่านได้ครบทุกบรรทัด
  if (declaredTotal !== null && issues.length === 0 && bets.length > 0 && declaredTotal !== typedTotal) {
    issues.push({ code: "TOTAL_MISMATCH", line: 0, text: `${declaredTotal} ≠ ${typedTotal}` });
  }

  return { bets, issues, notes, declaredTotal, typedTotal, needsReview: issues.length > 0 };
}
