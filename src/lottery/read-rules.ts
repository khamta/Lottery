/**
 * เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเอง (หน้า /read-rules) — ลูกค้าพิมพ์รูปแบบใหม่มาเรื่อย ๆ จึงให้ผู้ใช้สอนระบบเองได้
 * โดยไม่ต้องแก้โค้ด — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ใช้ร่วมกันทั้งฝั่ง server (บอท/บันทึกโพย) และหน้าจอ (ดูตัวอย่างสด ๆ)
 *
 * ตัวแยกข้อความ (parser.ts) ใช้เงื่อนไขกับทีละบรรทัด ก่อนอ่านตามรูปแบบมาตรฐาน ตามลำดับนี้
 *   1. SKIP     ข้ามบรรทัด      บรรทัดที่ตรงเงื่อนไขไม่ใช่รายการแทง (ไม่นับเป็นบรรทัดที่อ่านไม่ออก)
 *   2. REPLACE  แทนคำ          เปลี่ยนคำ/สัญลักษณ์ทุกที่ในบรรทัด เช่น "ລ" → "ລ່າງ" · "/" → "="
 *   3. PATTERN  รูปแบบบรรทัด    แปลงบรรทัดทั้งบรรทัดเป็นรูปแบบมาตรฐาน (ใช้เงื่อนไขแรกที่ตรง)
 *                               เช่น "ລ {N} x{A}" → "{N}={A}ລ່າງ" : "ລ 30 70 x100" → "30 70=100ລ່າງ"
 * เงื่อนไขชนิดเดียวกันใช้ตามลำดับที่สร้าง
 *
 * ช่องว่างในรูปแบบ = มีหรือไม่มีช่องว่างก็ได้ · ตัวพิมพ์เล็ก/ใหญ่ถือว่าเหมือนกัน
 *   {N}  เลข 2-3 หลัก หนึ่งตัวหรือหลายตัวคั่นด้วย . , - / หรือช่องว่าง   (เขียน {เลข} / {ເລກ} ก็ได้)
 *   {A}  ยอด                                                         (เขียน {ยอด} / {ຍອດ} ก็ได้)
 *   {B}  ยอดตัวที่สอง เช่น ยอดล่างของ บน×ล่าง                           (เขียน {ยอด2} / {ຍອດ2} ก็ได้)
 *   *    อะไรก็ได้ (เฉพาะในรูปแบบที่ค้นหา — ในผลลัพธ์ * เป็นตัวอักษรธรรมดา เช่น {N}={A}*{B} = บน×ล่าง)
 */

export const READ_RULE_KINDS = ["SKIP", "REPLACE", "PATTERN"] as const;
export type ReadRuleKind = (typeof READ_RULE_KINDS)[number];

/** เงื่อนไขหนึ่งข้อ — find = ข้อความ/รูปแบบที่ค้นหา · replace = ผลลัพธ์ (SKIP ไม่ใช้) */
export type ReadRuleSpec = { kind: ReadRuleKind; find: string; replace: string };

/** จำนวนเงื่อนไขสูงสุดต่อแม่หวย — ทุกบรรทัดของทุกโพยต้องผ่านเงื่อนไขทั้งหมด */
export const READ_RULES_MAX = 300;

// ขอบตัวเลข (?<!\d) (?!\d) กัน "100" ถูกตัดเป็นเลข "10" กับยอด "0"
const SLOTS = {
  N: String.raw`(?<!\d)(\d{2,3}(?!\d)(?:\s*[.,\-/\s]\s*\d{2,3}(?!\d))*)`,
  A: String.raw`(?<!\d)(\d[\d,]*)`,
  B: String.raw`(?<!\d)(\d[\d,]*)`,
} as const;
type Slot = keyof typeof SLOTS;

/** ชื่อช่องที่ผู้ใช้พิมพ์ได้ → ช่องจริง */
const SLOT_NAMES: Record<string, Slot> = {
  n: "N",
  เลข: "N",
  ເລກ: "N",
  a: "A",
  ยอด: "A",
  ຍອດ: "A",
  b: "B",
  ยอด2: "B",
  ຍອດ2: "B",
};

/** {N} / * — ทุกอย่างนอกจากนี้เป็นตัวอักษรตรงตัว */
const TOKEN = /\{([^{}]*)\}|\*/g;
/** เฉพาะช่อง {…} — ใช้กับผลลัพธ์ ที่ * เป็นตัวอักษรธรรมดา */
const SLOT_TOKEN = /\{([^{}]*)\}/g;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const literal = (text: string) =>
  text
    .split(/\s+/)
    .map(escape)
    .join(String.raw`\s*`);

const slotOf = (name: string) => SLOT_NAMES[name.trim().toLowerCase()];

/** ช่องที่พิมพ์ผิด (ไม่รู้จัก) — ว่าง = ใช้ได้ */
export function unknownSlots(text: string) {
  return [...text.matchAll(TOKEN)].filter((m) => m[0] !== "*" && !slotOf(m[1]!)).map((m) => m[0]);
}

/** ช่องที่ใช้ในข้อความ เช่น ["N", "A"] */
export function slotsIn(text: string): Slot[] {
  return [...text.matchAll(TOKEN)].flatMap((m) => (m[0] === "*" ? [] : [slotOf(m[1]!)].filter((s): s is Slot => !!s)));
}

/** มีช่อง {…} หรือ * = เป็นรูปแบบ (ต้องตรงทั้งบรรทัด) */
export const isPattern = (text: string) => /\{[^{}]*\}|\*/.test(text);

type Compiled = { regex: RegExp; slots: Slot[] };

/**
 * รูปแบบ → regex ที่ต้องตรงทั้งบรรทัด · null = รูปแบบใช้ไม่ได้ (ช่องไม่รู้จัก / ช่องซ้ำ)
 * รอบช่อง {…} และ * มีช่องว่างหรือไม่มีก็ได้เสมอ — "x{A}" ตรงกับทั้ง "x100" และ "x 100"
 */
export function compilePattern(pattern: string): Compiled | null {
  const text = pattern.trim();
  const slots: Slot[] = [];
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    parts.push(literal(text.slice(last, match.index).trim()));
    last = match.index! + match[0].length;
    if (match[0] === "*") {
      parts.push(".*?");
      continue;
    }
    const slot = slotOf(match[1]!);
    if (!slot || slots.includes(slot)) return null;
    slots.push(slot);
    parts.push(SLOTS[slot]);
  }
  parts.push(literal(text.slice(last).trim()));
  const source = parts.filter(Boolean).join(String.raw`\s*`);
  return { regex: new RegExp(`^\\s*${source}\\s*$`, "iu"), slots };
}

type Prepared =
  | { kind: "SKIP"; test: (line: string) => boolean }
  | { kind: "REPLACE"; find: RegExp; replace: string }
  | { kind: "PATTERN"; compiled: Compiled; replace: string };

/** เตรียมเงื่อนไขครั้งเดียวใช้กับทุกบรรทัด — เงื่อนไขที่ใช้ไม่ได้ถูกข้ามไป (ไม่ทำให้อ่านโพยพัง) */
export function prepareReadRules(rules: readonly ReadRuleSpec[]): Prepared[] {
  const prepared = rules.flatMap((rule): Prepared[] => {
    const find = rule.find.trim();
    if (!find) return [];
    if (rule.kind === "SKIP") {
      if (!isPattern(find)) {
        const needle = find.toLowerCase();
        return [{ kind: "SKIP", test: (line) => line.toLowerCase().includes(needle) }];
      }
      const compiled = compilePattern(find);
      return compiled ? [{ kind: "SKIP", test: (line) => compiled.regex.test(line) }] : [];
    }
    if (rule.kind === "REPLACE") {
      return [{ kind: "REPLACE", find: new RegExp(escape(find), "giu"), replace: rule.replace.replace(/\$/g, "$$$$") }];
    }
    const compiled = compilePattern(find);
    return compiled ? [{ kind: "PATTERN", compiled, replace: rule.replace }] : [];
  });
  // ลำดับ: ข้าม → แทนคำ → รูปแบบ (sort คงลำดับเดิมภายในชนิดเดียวกัน)
  return prepared.sort((a, b) => READ_RULE_KINDS.indexOf(a.kind) - READ_RULE_KINDS.indexOf(b.kind));
}

/** บรรทัดหนึ่งบรรทัด → บรรทัดที่แปลงแล้ว · null = ข้ามบรรทัดนี้ */
export function applyReadRules(line: string, prepared: readonly Prepared[]): string | null {
  let text = line;
  for (const rule of prepared) {
    if (rule.kind === "SKIP") {
      if (rule.test(text)) return null;
    } else if (rule.kind === "REPLACE") {
      text = text.replace(rule.find, rule.replace);
    } else {
      const match = text.match(rule.compiled.regex);
      if (!match) continue;
      const values = Object.fromEntries(rule.compiled.slots.map((slot, i) => [slot, match[i + 1] ?? ""]));
      // ในผลลัพธ์ * เป็นตัวอักษรธรรมดา (บน*ล่าง) — ใส่ได้เฉพาะช่อง {…}
      return rule.replace
        .replace(SLOT_TOKEN, (token, name: string) => {
          const slot = slotOf(name);
          return slot ? (values[slot] ?? "") : token;
        })
        .trim();
    }
  }
  return text.trim();
}
