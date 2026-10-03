/**
 * ผลอ่านรูปโพยของบริการ OCR (ocr/server.py) → ข้อความโพย มี 2 ขั้น — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 *
 *   ขั้นที่ 1  transcribeImage    เขียนทุกอย่างที่ OCR อ่านได้ออกมาตามตำแหน่งในรูป ไม่ตัดอะไรทิ้ง
 *                                (เก็บใน ticket_images.transcript ให้คนเห็นในหน้าตรวจโพยว่ารูปมีอะไรบ้าง)
 *   ขั้นที่ 2  imageToTicketText  กรองและแปลงเป็นข้อความโพยตามกติกาที่ผู้ใช้บอก (IMAGE_RULES + การแปลงด้านล่าง)
 *                                แล้วส่งให้ตัวแยกข้อความ (parser.ts) อ่านเหมือนข้อความในแชตทั่วไป
 *
 * กติกาใหม่ที่ผู้ใช้บอก → เพิ่มใน IMAGE_RULES (หรือการแปลงด้านล่าง) พร้อมเทสต์
 * แล้วรัน `bun run ocr:reapply` ให้ใช้กับรูปที่เก็บไว้แล้วด้วย (อ่านจากผล OCR ที่เก็บไว้ ไม่ต้องให้ OCR อ่านรูปซ้ำ)
 *
 *   ลายมือ                 →  ข้อความโพย
 *   516.30 · 516-30 · 47:50 →  516=30 · 47=50       (ตัวคั่นระหว่างเลขกับยอด)
 *   526  (ช่องว่าง)  5       →  526=5                 (เลขกับยอดเป็นคนละกล่อง แต่อยู่แถวเดียวกัน)
 *   32: 50∝50 · 50x50       →  32=50*50              (บน × ล่าง)
 *   คอลัมน์หัว B             →  ทุกรายการในคอลัมน์ต่อท้าย ฿ (หัว K หรือไม่มีหัว = กีบ)
 *   30.9.26 (วันที่)          →  ข้าม
 *   ລວມ150 (รูปแคปแชต)      →  ລວມ150                (Tesseract อ่านตัวลาว/ไทยได้ PaddleOCR อ่านไม่ได้)
 *
 * ตัวแปลงไม่เดา: กล่องที่แปลงไม่ได้ส่งต่อตามที่ OCR อ่าน ให้ parser ติดเป็นบรรทัดที่อ่านไม่ออก
 * และเลขที่ไม่มียอด (เช่น เลขที่โยงเส้นตั้งไว้กับยอดเดียวกัน) ส่งเป็นเลขเปล่า ให้คนเติมยอดเอง
 * OCR อ่านผิดได้ทั้งที่มั่นใจสูง โพยจากรูปจึงต้องให้คนตรวจกับรูปเสมอ (ดู readImageTicketText)
 */

/** กล่องข้อความหนึ่งกล่องจาก PaddleOCR — box = 4 มุม [x, y] เริ่มที่มุมซ้ายบน ตามเข็มนาฬิกา */
export type OcrBox = { box: Array<[number, number]>; text: string; score: number };
/** บรรทัดจาก Tesseract พร้อมความมั่นใจเฉลี่ย (0-100) */
export type OcrLine = { text: string; conf: number };
export type OcrResult = { paddle: OcrBox[]; tesseract: OcrLine[]; errors?: string[] };

type Piece = { text: string; left: number; right: number; top: number; bottom: number };
type Header = Piece & { thb: boolean };

/** ความมั่นใจขั้นต่ำของบรรทัด Tesseract ที่จะเชื่อว่าเป็นยอดรวม — ต่ำกว่านี้มักเป็นตัวอักษรขยะ */
const TOTAL_MIN_CONF = 75;
/** กล่องที่สูงเกินกว้างเท่านี้ = OCR อ่านตัวเลขที่เขียนเรียงลงมาเป็นกล่องเดียว (เช่น ยอด 5 ของทุกแถว) */
const VERTICAL_RATIO = 1.8;
/** เลขกับยอดต้องซ้อนกันในแนวตั้งอย่างน้อยเท่านี้ (สัดส่วนของกล่องที่เตี้ยกว่า) จึงถือว่าอยู่แถวเดียวกัน */
const ROW_OVERLAP = 0.5;
/** ระยะห่างแนวนอนสูงสุดระหว่างเลขกับยอด (เท่าของความสูงตัวอักษร) */
const PAIR_GAP = 1.5;
/** ขอบซ้ายของบรรทัดในคอลัมน์เดียวกันเหลื่อมกันได้ไม่เกินเท่านี้ (เท่าของความสูงตัวอักษร) — ลายมือ/รูปถ่ายเอียงทำให้ขอบเลื่อนทีละนิด */
const COLUMN_DRIFT = 0.75;

const DATE = /^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\.?$/;
const HEADER = /^([BK฿])[.:]?$/i;
/** เครื่องหมายคูณที่เขียนด้วยมือ/พิมพ์: ∝ α x × ✕ * */
const TIMES = /(\d)\s*[∝αxX×✕*]\s*(\d)/g;
/** เลข 2-3 หลัก ตัวคั่น แล้วยอด (อาจเป็นบน×ล่าง) — ไม่ให้ติดกับตัวเลขอื่น */
const ENTRY = /(?<!\d)(\d{2,3})\s*[.:;\-\s]+\s*(\d+(?:\*\d+)?)(?!\d)/g;
const NUMBER_ONLY = /^(\d{2,3})[.:;\-]*$/;
const AMOUNT_ONLY = /^[.:;\-]*(\d+(?:\*\d+)?)\.?$/;
const TOTAL_WORD = /(?:ລວມ|ລວມ|ลวม|รวม)\D{0,3}?(\d[\d,]*)/;

const width = (p: Piece) => p.right - p.left;
const height = (p: Piece) => p.bottom - p.top;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

function toPiece({ box, text }: OcrBox): Piece {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  return { text, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** ตัวอักษรที่ OCR มักอ่านสลับกับตัวเลข — แก้เฉพาะกล่องที่เป็นตัวเลขเป็นหลัก */
const LOOKALIKE: Record<string, string> = { O: "0", o: "0", D: "0", l: "1", I: "1", S: "5", s: "5", Z: "2", z: "2" };

function clean(raw: string) {
  let text = raw.normalize("NFC").trim().replace(TIMES, "$1*$2");
  const digits = text.replace(/\D/g, "").length;
  const letters = text.replace(/[^A-Za-z]/g, "").length;
  if (digits > 0 && digits >= letters * 2) text = text.replace(/[OoDlISsZz]/g, (c) => LOOKALIKE[c]!);
  // TIMES อาจต้องรอบสองหลังแก้ตัวอักษร (เช่น "5Ox5O")
  return text.replace(TIMES, "$1*$2");
}

/** "50050" / "3000300" / "3502350" = 50∝50 ที่ OCR อ่านเครื่องหมายคูณเป็น 0 หรือ 2 → "50*50" */
function splitTimes(amount: string) {
  if (amount.includes("*") || amount.length < 5 || amount.length % 2 === 0) return amount;
  const half = (amount.length - 1) / 2;
  const [left, mid, right] = [amount.slice(0, half), amount[half], amount.slice(half + 1)];
  return left === right && (mid === "0" || mid === "2") && !left.startsWith("0") ? `${left}*${right}` : amount;
}

/** กล่องที่ตัวเลขเรียงลงมาในแนวตั้ง → แยกเป็นกล่องละตัว (แต่ละตัวมักเป็นยอดของคนละแถว) */
function splitVertical(piece: Piece): Piece[] {
  const digits = piece.text.replace(/[^\d]/g, "");
  if (!/^\d{2,}\.?$/.test(piece.text) || height(piece) < width(piece) * VERTICAL_RATIO) return [piece];
  const step = height(piece) / digits.length;
  return [...digits].map((digit, i) => ({
    ...piece,
    text: digit,
    top: piece.top + step * i,
    bottom: piece.top + step * (i + 1),
  }));
}

/** กล่องเดียวที่มีหลายรายการ ("47:50.547:70") → แยกเป็นรายการละกล่อง โดยแบ่งความกว้างตามตำแหน่งตัวอักษร */
function splitEntries(piece: Piece): Piece[] {
  // มี "=" = รูปแคปข้อความที่พิมพ์ตามรูปแบบแชตอยู่แล้ว ส่งให้ parser อ่านตรง ๆ
  // (";" แปลงเป็น "=" ตามปกติ — ความหมายเดียวกัน และ OCR มักอ่าน ":" ของลายมือเป็น ";")
  if (piece.text.includes("=")) return [piece];
  const matches = [...piece.text.matchAll(ENTRY)];
  if (matches.length === 0) return [piece];
  // เหลือตัวเลข/ตัวอักษรนอกรายการที่จับได้ = อ่านไม่ออกจริง ส่งตามที่อ่านได้ ไม่ตัดทิ้งเอง
  if (!/^[\s.:\-,]*$/.test(piece.text.replace(ENTRY, ""))) return [piece];

  const perChar = width(piece) / Math.max(piece.text.length, 1);
  return matches.map((match) => ({
    ...piece,
    text: `${match[1]}=${splitTimes(match[2]!)}`,
    left: piece.left + perChar * match.index!,
    right: piece.left + perChar * (match.index! + match[0].length),
  }));
}

const sameRow = (a: Piece, b: Piece) =>
  overlap(a.top, a.bottom, b.top, b.bottom) >= ROW_OVERLAP * Math.min(height(a), height(b));

/** เลขเปล่ากับยอดเปล่าที่อยู่แถวเดียวกันทางขวา → รายการเดียว ("526" + "5" → "526=5") */
function pairNumbersWithAmounts(pieces: Piece[]): Piece[] {
  const used = new Set<Piece>();
  const result: Piece[] = [];
  // ตัวเลขที่ขอบซ้ายตรงกับรายการเต็ม (เลข=ยอด) ของแถวอื่น = ต้นบรรทัดของคอลัมน์ถัดไป ไม่ใช่ยอดของเลขทางซ้าย
  const drift = COLUMN_DRIFT * median(pieces.map(height));
  const entries = pieces.filter((piece) => piece.text.includes("="));
  const startsLine = (piece: Piece) =>
    entries.some((entry) => entry !== piece && !sameRow(entry, piece) && Math.abs(entry.left - piece.left) <= drift);

  for (const piece of [...pieces].sort((a, b) => a.left - b.left)) {
    if (used.has(piece)) continue;
    const number = piece.text.match(NUMBER_ONLY);
    if (number) {
      const amount = pieces
        .filter(
          (other) =>
            !used.has(other) &&
            other !== piece &&
            AMOUNT_ONLY.test(other.text) &&
            !startsLine(other) &&
            other.left >= piece.right - width(piece) * 0.2 &&
            other.left - piece.right <= PAIR_GAP * Math.max(height(piece), height(other)) &&
            sameRow(piece, other),
        )
        .sort((a, b) => a.left - b.left)[0];
      if (amount) {
        used.add(amount);
        result.push({
          text: `${number[1]}=${splitTimes(amount.text.match(AMOUNT_ONLY)![1]!)}`,
          left: piece.left,
          right: amount.right,
          top: Math.min(piece.top, amount.top),
          bottom: Math.max(piece.bottom, amount.bottom),
        });
        continue;
      }
    }
    result.push(piece);
  }
  return result.filter((piece) => !used.has(piece));
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/**
 * จัดกล่องเป็นคอลัมน์ เรียงซ้าย→ขวา แต่ละคอลัมน์บน→ล่าง
 * ไล่จากบนลงล่าง: กล่องอยู่คอลัมน์เดียวกับบรรทัดก่อนหน้าที่ขอบซ้ายใกล้กันที่สุด (ไม่เกิน COLUMN_DRIFT)
 * — ใช้ขอบซ้ายเพราะคนเขียนชิดซ้ายเป็นคอลัมน์ ส่วนความยาวบรรทัดต่างกันมาก (24=50 กับ 49=300*300)
 */
function toColumns(pieces: Piece[]): Piece[][] {
  const lineHeight = median(pieces.map(height));
  const drift = COLUMN_DRIFT * lineHeight;
  const middle = (p: Piece) => (p.top + p.bottom) / 2;
  const columns: Piece[][] = [];

  for (const piece of [...pieces].sort((a, b) => middle(a) - middle(b))) {
    const column = columns
      .map((col) => ({ col, distance: Math.abs(col.at(-1)!.left - piece.left) }))
      // บรรทัดเดียวกัน (กึ่งกลางสูงเท่ากัน) อยู่คอลัมน์เดียวกันไม่ได้ — ใช้กึ่งกลางเพราะกล่องของรูปเอียงสูงเกินจริง
      .filter(({ col, distance }) => distance <= drift && middle(piece) - middle(col.at(-1)!) >= lineHeight / 2)
      .sort((a, b) => a.distance - b.distance)[0]?.col;
    if (column) column.push(piece);
    else columns.push([piece]);
  }

  const leftOf = (column: Piece[]) => median(column.map((p) => p.left));
  return columns.sort((a, b) => leftOf(a) - leftOf(b));
}

/** หัวคอลัมน์ B (บาท) / K (กีบ) ที่อยู่เหนือคอลัมน์นี้ */
function columnIsThb(column: Piece[], headers: Header[]) {
  const left = Math.min(...column.map((p) => p.left));
  const right = Math.max(...column.map((p) => p.right));
  const top = column[0]!.top;
  const header = headers
    .filter((h) => h.top <= top && overlap(h.left, h.right, left, right) > 0)
    .sort((a, b) => b.top - a.top)[0];
  return header?.thb ?? false;
}

/** ยอดรวมที่ลูกค้าเขียน/พิมพ์ (ລວມ150) — อ่านจาก Tesseract เพราะ PaddleOCR อ่านตัวลาว/ไทยไม่ได้ */
function declaredTotal(lines: OcrLine[]) {
  for (const line of lines) {
    if (line.conf < TOTAL_MIN_CONF) continue;
    // Tesseract มักเว้นวรรคระหว่างตัวอักษรลาว/ไทย ("ล ว ม 150")
    const match = line.text.replace(/\s+/g, "").match(TOTAL_WORD);
    if (match) return `ລວມ${match[1]}`;
  }
  return null;
}

const countOf = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

type RuleContext = {
  /** ยอดรวม ລວມ… ที่อ่านได้จาก Tesseract (null = ไม่มี) */
  total: string | null;
};

/**
 * กติกากรองของขั้นที่ 2 — ตัดสิ่งที่ไม่ใช่รายการแทงทิ้ง
 *   box   = ใช้กับกล่องข้อความแต่ละกล่อง ก่อนจับคู่เลขกับยอดและจัดคอลัมน์
 *   entry = ใช้กับรายการหลังจับคู่เลขกับยอดแล้ว
 * skip คืน true = ตัดทิ้ง (ยังเห็นได้ในข้อความขั้นที่ 1)
 */
export type ImageRule = {
  id: string;
  /** กติกาเป็นคำพูด ตามที่ผู้ใช้บอก */
  rule: string;
  stage: "box" | "entry";
  skip: (text: string, context: RuleContext) => boolean;
};

export const IMAGE_RULES: ImageRule[] = [
  {
    id: "no-digit",
    rule: "กล่องที่ไม่มีตัวเลข (หัวกระดาษ ชื่อ คำทักทาย) ไม่ใช่รายการแทง",
    stage: "box",
    skip: (text) => !/\d/.test(text),
  },
  {
    id: "mostly-letters",
    rule: "กล่องที่ตัวอักษรมากกว่าตัวเลข ไม่ใช่รายการแทง",
    stage: "box",
    skip: (text) => countOf(text, /\p{L}/gu) > countOf(text, /\d/g),
  },
  {
    id: "date",
    rule: "บรรทัดวันที่ เช่น 30.9.26 — ข้าม",
    stage: "box",
    skip: (text) => DATE.test(text),
  },
  {
    id: "total-word",
    rule: "คำ ລວມ150 ที่ PaddleOCR อ่านเป็นตัวละติน (a5u150) — ได้ยอดรวมจาก Tesseract แล้ว",
    stage: "box",
    skip: (text, { total }) => !!total && /\p{L}/u.test(text) && text.endsWith(total.replace(/\D/g, "")),
  },
  {
    id: "single-digit",
    rule: "ตัวเลขหลักเดียวที่จับคู่กับเลขไม่ได้ ไม่ใช่ทั้งเลขหวยและรายการ — มักเป็นเส้นโยงหรือจุดที่ OCR อ่านเป็น 1",
    stage: "entry",
    skip: (text) => countOf(text, /\d/g) <= 1,
  },
];

const skipBy = (rules: ImageRule[], stage: ImageRule["stage"], context: RuleContext) => {
  const active = rules.filter((rule) => rule.stage === stage);
  return (piece: Piece) => active.some((rule) => rule.skip(piece.text, context));
};

/** กล่องในบรรทัดเดียวกันที่ห่างกันเกินเท่านี้ (เท่าของความสูงตัวอักษร) = คนละคอลัมน์ — ขั้นที่ 1 คั่นให้กว้างขึ้น */
const TRANSCRIPT_COLUMN_GAP = 2;
const COLUMN_SPACE = "      ";

/**
 * ขั้นที่ 1: ทุกกล่องที่ PaddleOCR อ่านได้ ตามที่อ่าน (ไม่แก้ ไม่ตัด) จัดเป็นบรรทัดตามตำแหน่งในรูป
 * กล่องในบรรทัดเดียวกันเรียงซ้าย→ขวา · PaddleOCR อ่านไม่ได้เลย → ใช้บรรทัดของ Tesseract แทน
 */
export function transcribeImage(ocr: OcrResult): string {
  const pieces = ocr.paddle
    .map((box) => ({ ...toPiece(box), text: box.text.normalize("NFC").trim() }))
    .filter((piece) => piece.text);
  if (pieces.length === 0) {
    return ocr.tesseract
      .map((line) => line.text.normalize("NFC").trim())
      .filter(Boolean)
      .join("\n");
  }

  const gap = TRANSCRIPT_COLUMN_GAP * median(pieces.map(height));
  const middle = (p: Piece) => (p.top + p.bottom) / 2;
  const rows: Piece[][] = [];
  for (const piece of [...pieces].sort((a, b) => middle(a) - middle(b))) {
    const row = rows.at(-1);
    // เทียบกับกล่องแรกของบรรทัด — รูปเอียงทำให้เทียบกับกล่องล่าสุดแล้วไหลข้ามบรรทัดได้
    if (row && sameRow(row[0]!, piece)) row.push(piece);
    else rows.push([piece]);
  }

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.left - b.left)
        .map((piece, i) => (i === 0 ? "" : piece.left - row[i - 1]!.right > gap ? COLUMN_SPACE : " ") + piece.text)
        .join(""),
    )
    .join("\n");
}

/** ขั้นที่ 2: ผล OCR → ข้อความโพย ตามกติกาใน rules */
export function imageToTicketText(ocr: OcrResult, rules: ImageRule[] = IMAGE_RULES): string {
  const headers: Header[] = [];
  const pieces: Piece[] = [];

  const total = declaredTotal(ocr.tesseract);
  const skipBox = skipBy(rules, "box", { total });
  const skipEntry = skipBy(rules, "entry", { total });

  for (const box of ocr.paddle) {
    const piece = { ...toPiece(box), text: clean(box.text) };
    const header = piece.text.match(HEADER);
    if (header) {
      headers.push({ ...piece, thb: header[1]!.toUpperCase() !== "K" });
      continue;
    }
    if (skipBox(piece)) continue;
    pieces.push(...splitVertical(piece).flatMap(splitEntries));
  }

  const entries = pairNumbersWithAmounts(pieces)
    .filter((piece) => !skipEntry(piece))
    // เลขที่ไม่มียอด (เช่น เลขในกลุ่มที่โยงเส้นไว้) → เลขเปล่า ให้ parser แจ้งว่าไม่มียอด
    .map((piece) => ({ ...piece, text: piece.text.match(NUMBER_ONLY)?.[1] ?? piece.text }));

  const blocks = toColumns(entries).map((column) => {
    const thb = columnIsThb(column, headers);
    return column
      .map((piece) => (thb && /^\d{2,3}=[\d*]+$/.test(piece.text) ? `${piece.text}฿` : piece.text))
      .join("\n");
  });

  return [...blocks, ...(total ? [total] : [])].join("\n\n");
}
