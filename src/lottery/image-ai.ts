/**
 * อ่านรูปโพยด้วย AI (vision) → ข้อความโพยรูปแบบเดียวกับที่ลูกค้าพิมพ์ในแชต แล้วให้ตัวแยกข้อความ (parser.ts) อ่านต่อ
 * ผู้ให้บริการ: Claude (ANTHROPIC_API_KEY) หรือ Ollama Cloud (OLLAMA_API_KEY · ollama.ts) — เลือกตามรุ่น (ai-models.ts) · ดู worker/ocr.ts
 *
 *   ลายมือ                         →  ข้อความโพย
 *   612=5 แล้วเส้นโยงลงถึง 11=5     →  612=5 / 652=5 / … / 11=5   (กระจายยอดของเส้นโยงลงทุกบรรทัด)
 *   32 - 3∝3                       →  32=3*3                      (บน × ล่าง)
 *   10 20 30 50/5ບລ                →  10=5ບລ / 20=5ບລ / 30=5ບລ / 50=5ບລ   (หลายเลขในแถวเดียว ยอดเดียว)
 *   ขีด | / ที่คั่นเลขหรือโยงเส้น       →  ไม่ใช่เลข 1                  (50/5 = 50=5 ไม่ใช่ 50=15)
 *   คอลัมน์หัว B                    →  732=80฿
 *   ໓໒:15 (เลขลาว)                 →  32=15
 *   45.000 ใต้เส้นท้ายโพย           →  ລວມ45000
 *   ລາວ ใต้วันที่ / หัวชุด            →  ไม่มีคำกำกับ (ชื่อหวย ไม่ใช่ ບລ)
 *   หัว ບົນ + ລ. 20.000 ท้ายโพย        →  39=5ບົນ … ລວມ20000          (ບົນ อย่างเดียว ไม่ใช่ ບລ · ລ. = ລວມ)
 *   ตัวเลขที่อ่านไม่ชัด               →  2?=3*3                      (parser ติดเป็นบรรทัดที่อ่านไม่ออก ให้คนตรวจกับรูป)
 *
 * ตัวอ่านไม่เดา: ตัวไหนไม่แน่ใจเขียน ? แทน — โพยที่อ่านครบและยอดรวมตรงจึงนับยอดได้เลย นอกนั้นรอตรวจตามเดิม
 * กติกาใหม่ที่ผู้ใช้บอก → เพิ่มใน SLIP_PROMPT (ไม่ต้องเขียนตัวแปลงเพิ่ม)
 *
 * สองรุ่นเพื่อประหยัด: รุ่นถูก (AI_MODEL) อ่านทุกรูปก่อน → ผลอ่านไม่ผ่าน (escalationReason) จึงให้รุ่นแม่น (AI_STRONG_MODEL) อ่านซ้ำ
 *   ไม่ผ่าน = มีบรรทัดที่ parser อ่านไม่ออก (? / ไม่มียอด) · ยอดรวมไม่ตรง · ไม่เจอโพย · โพยยาวที่ไม่มียอดรวมให้เทียบ
 *   คนสั่งอ่านใหม่ด้วย AI จากหน้าโพย → ใช้รุ่นแม่นเลย (strong)
 *   แม่หวยเลือกรุ่นเองได้ที่หน้าแม่หวย (ดู ai-models.ts) — ไม่เลือก = ใช้ค่าจาก env
 */
import Anthropic from "@anthropic-ai/sdk";

import { AI_MODEL, AI_STRONG_MODEL, providerOf, type AiProvider, type OcrModels } from "./ai-models";
import { enhanceSlipImage } from "./image-enhance";
import { OllamaError, type OllamaClient } from "./ollama";
import { parseTicket } from "./parser";

export { AI_MODEL, AI_STRONG_MODEL };

/**
 * ผลอ่านรูปของ AI — เก็บใน ticket_images.ocr แทนผลดิบของบริการ OCR · engine = ผู้ให้บริการของรุ่นที่อ่านจริง
 * escalated = รุ่นแรกอ่านไม่ผ่านจึงให้รุ่นแม่นอ่านซ้ำ (เก็บผลของรุ่นแรกไว้เทียบว่ารุ่นถูกพอไหม)
 */
export type AiRead = {
  engine: AiProvider;
  model: string;
  text: string;
  escalated?: { model: string; reason: string; text: string };
};

/** โพยที่ยาวเท่านี้ขึ้นไปและไม่มียอดรวมให้เทียบ → ให้รุ่นแม่นอ่านซ้ำ (ผิดตัวเดียวก็ไม่มีอะไรจับได้) */
const LONG_SLIP_LINES = 30;
/** client ของแต่ละผู้ให้บริการ — ไม่ได้ตั้ง key = null (รุ่นของผู้ให้บริการนั้นอ่านไม่ได้) */
export type AiClients = { claude?: Anthropic | null; ollama?: OllamaClient | null };

/** ใบใหญ่หลายคอลัมน์มีเกือบร้อยบรรทัด + เวลาคิดของโมเดล — เผื่อไว้ */
const MAX_TOKENS = 32_000;
/** ชนิดรูปที่ API รับ */
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/** รูปที่อ่านไปก็ไม่ได้อะไร (ชนิดไฟล์ไม่รองรับ / โมเดลปฏิเสธ / ข้อความยาวเกิน) — ให้คนดูรูปแล้วพิมพ์เอง ไม่ต้องลองใหม่ */
export class AiImageError extends Error {}

/**
 * AI อ่านรูปไม่ได้เพราะอะไร — ต่างกันที่รูปถัดไป (worker/ocr.ts)
 *   "image"   รูปนี้รูปเดียว (ชนิดไฟล์ไม่รองรับ / รูปเสีย / ใหญ่เกิน / โมเดลปฏิเสธ / ไม่ได้ตั้ง key) — รูปถัดไปยังใช้ผู้ให้บริการนี้
 *   "account" เครดิตหมด / key ผิดหรือถูกปิด / ชื่อรุ่นผิด — พักผู้ให้บริการนั้นนาน จนกว่าจะเติมเครดิตหรือแก้ค่า
 *   "outage"  ล่ม / ติด rate limit / ต่อเครือข่ายไม่ได้ — พักสั้น ๆ
 */
export type AiFailure = "image" | "account" | "outage";

/** ความผิดพลาดนี้มาจากผู้ให้บริการไหน (worker พักเฉพาะผู้ให้บริการนั้น) — null = ไม่เกี่ยวกับผู้ให้บริการ (รูปเสีย) */
export function failureProvider(error: unknown): AiProvider | null {
  if (error instanceof AiImageError) return null;
  return error instanceof OllamaError ? "ollama" : "claude";
}

/**
 * ใช้ไม่ได้เฉพาะรุ่นนี้ (ไม่ใช่ทั้งบัญชี) → ชื่อรุ่น ให้ worker พักแค่รุ่นนี้ · null = พักทั้งผู้ให้บริการ
 * เช่น Ollama แผน Free เรียกรุ่นที่ไม่อยู่ในแผน (402 "this model is not included in your free usage") / ชื่อรุ่นผิด (404)
 * — รุ่นอื่นของ Ollama ยังใช้ได้ แม่หวยที่เลือกรุ่นอื่นต้องไม่โดนพักไปด้วย
 */
export function unusableModel(error: unknown): string | null {
  if (!(error instanceof OllamaError) || !error.model) return null;
  if (error.status === 404 || /this model|not included|model .*not found/i.test(error.message)) return error.model;
  return null;
}

export function aiFailure(error: unknown): AiFailure {
  if (error instanceof AiImageError) return "image";
  if (error instanceof OllamaError) return ollamaFailure(error);
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) return "outage";
  const body = error.error as { error?: { type?: string } } | undefined;
  const billing = body?.error?.type === "billing_error" || /credit balance/i.test(error.message);
  if (billing || [401, 402, 403, 404].includes(error.status)) return "account";
  if ([400, 413, 422].includes(error.status)) return "image";
  return "outage";
}

function ollamaFailure(error: OllamaError): AiFailure {
  if (error.status === undefined) return "outage";
  const billing = /credit|quota|balance|usage limit|subscription/i.test(error.message);
  if (billing || [401, 402, 403, 404].includes(error.status)) return "account";
  if ([400, 413, 422].includes(error.status)) return "image";
  return "outage";
}

export const isAiRead = (ocr: unknown): ocr is AiRead => {
  const engine = typeof ocr === "object" && ocr !== null ? (ocr as { engine?: unknown }).engine : undefined;
  return engine === "claude" || engine === "ollama";
};

export const SLIP_PROMPT = `You transcribe photos of handwritten Lao lottery betting slips (ໂພຍ) into plain text lines for a downstream parser. Output only the lines.

OUTPUT FORMAT — one bet per line:
- NUMBER=AMOUNT                 e.g. 612=5
- top × bottom: NUMBER=TOP*BOTTOM   e.g. 32=3*3   (handwritten as ∝, α, x, ×)
- top only: NUMBER=AMOUNTບົນ
- top and bottom, one amount: NUMBER=AMOUNTບລ
- bottom only: NUMBER=AMOUNTລ່າງ
- baht: append ฿, e.g. 732=80฿ . Kip has no suffix.
- declared total: ລວມ followed by digits only, e.g. ລວມ45000
- several numbers on one row followed by one amount = every number gets that amount and its mark (ບົນ / ບລ / ລ່າງ / ฿).
  Write one line per number: 10 20 30 50/5ບລ → 10=5ບລ, 20=5ບລ, 30=5ບລ, 50=5ບລ (each on its own line)
- 3-digit numbers have no bottom bet — the parser handles that. Still write the mark exactly as written (590=5ບລ); do not drop it or the number.

READING RULES
1. Lao digits ໐໑໒໓໔໕໖໗໘໙ are 0-9. The photo may be rotated or upside down.
2. The separator between number and amount varies: = - . : ; / | or a space. All mean "=". Numbers have 2 or 3 digits; keep leading zeros (01, 079).
3. A vertical line, bracket, wavy line or arrow drawn beside several rows means those rows share the amount written on the row where the line starts or ends (top, bottom, or both). Write that amount on every row of the group. A row without an amount between the end of such a line and the next row with an amount belongs to the group.
4. Strokes are not digits. A vertical stroke |, a slash / or a dash used as a separator (between numbers, or between a number and its amount), and any grouping line drawn beside rows, is NEVER the digit 1 — do not write it. A 1 is a digit only when it is written inside a number, about the same height as the digits next to it. Never add a 1 to a number or an amount because of a stroke: 50/5 is 50=5, not 50=15 or 501=5; 26|10 is 26=10, not 261=10.
   A plain straight vertical stroke | standing alone where the amount should be (in the amount column, after the separator) is a ditto mark, NOT the amount 1: it means "same amount as the row above" (and usually the row below has that amount too) — write that amount. A 1 written as an amount has a head: a flag or hook at the top-left (often a small foot too), like the 1s elsewhere on the slip. No head = not a 1. Example: 09-5, 49 |, 89-5 → 09=5, 49=5, 89=5 (not 49=1).
5. An amount written once as ໂຕN / ຕົວN / ປ່ອງN / ຮູN (Thai ตัวN / ป่องN; N per number, e.g. ໂຕ2 = 2 each) — often written sideways, under a column, between two columns, or beside an arrow — applies to every row without its own amount in the column it sits under or next to, AND in each neighbouring column (left and right) that has no amounts of its own, stopping at a column that has its own amounts. Write NUMBER=N on every one of those rows. Example: columns 09 00 19 … 74 and 24 84 28 … 61 with ໂຕ2 written below/between them → 09=2 … 74=2, 24=2 … 61=2.
   The amount may be a word instead of a digit: ປ່ອງລະພັນ / ໂຕລະພັນ / ຮູລະພັນ / ป่องละพัน (ພັນ = one thousand, no digit) means 1 each → NUMBER=1; ໂຕສອງພັນ → NUMBER=2.
   Such a note is often written sideways along the edge of a block of columns (e.g. ປ່ອງລະພັນ beside the leftmost column). It applies to every column of that block that has no amounts of its own, up to a long dividing line drawn between blocks or a column with its own amounts.
   A row that still has no amount after rules 3 and 5: write the number alone (no =), so a person fills it in.
6. B or ฿ written as a column header, or written below the column / at the bottom of the slip, = baht for every row in that column (on a single-column slip, for every row). Header K or no B anywhere = kip. Header ບົນ alone = top only (ບົນ on every row). Header ລ່າງ alone = bottom only. Header ບົນ+ລ່າງ or ບລ = top and bottom. With several columns, transcribe column by column, left to right, each top to bottom.
   ລາວ (Lao lottery) is NOT ບລ. Writers often put ລາວ under the date or above a block to name the lottery; it adds no mark — write the rows with no suffix. In handwriting ລາວ is a whole word of three letters (ລ, a tall loop າ, then ວ), often wider than the numbers; ບລ is two short letters, usually right after an amount on the same row. Write ບລ only when ບລ / ບົນລ່າງ / ບົນ+ລ່າງ is clearly written. No ບລ / ບົນລ່າງ written anywhere = never ບລ: ບົນ alone stays ບົນ, and a ລ elsewhere on the slip does not turn ບົນ into ບລ.
   ລ / ລ. / ລ: written before the number under the bottom rule is short for ລວມ (the total), NOT ລ່າງ and NOT part of ບລ — it applies to no bet row. If you cannot tell ລາວ from ບລ, add no mark and keep the total as written — a person checks it against the total.
7. Write amounts exactly as written (5 stays 5, 80 stays 80). Do not multiply, do not add thousands separators.
8. Keep duplicate rows — each one is a separate bet. Keep the slip's order.
9. Skip dates (2.10.26), names, signatures, notes and anything that is not a bet or the total. Text printed on the table or background is not part of the slip.
10. The total is usually under a horizontal rule at the bottom: 45.000 → ລວມ45000, ລ: 30.000 → ລວມ30000, 48 → ລວມ48. Write it exactly as written, even if it does not match the sum of the bets.
11. Never guess. Replace every digit you cannot read with certain with ? (2?=3*3, 516=?0). Look-alike digits you cannot decide between (1/7/9, 3/8, 5/6, 0/6) also become ?. A stroke that may be a separator is not a doubtful 1 — apply rule 4. If a whole row is illegible, write ? for that row.
   1 versus 7: many writers make the 1 with a short flag or hook at the top-left, often curled ("ɿ", "⌐1"), and add a small foot. That is a 1, not a 7. A 7 has a long, straight horizontal bar across the top that reaches clearly to the RIGHT, and a stem that slants down to the left. Compare with the other digits on the same slip: if this writer's 1s all carry the flag, read them as 1. If you still cannot tell 1 from 7, write ? (911 you are unsure of → 9??), never 7 by default.
12. If the image contains no betting slip, output exactly NONE.
13. No explanations, no markdown, no code fences.

EXAMPLES
Slip: date 2.10.26; 612=5; rows 652, 692, 12, 52, 92, 91, 51 joined by a vertical line down to 11=5; a rule; 45.000; a name.
Output:
612=5
652=5
692=5
12=5
52=5
92=5
91=5
51=5
11=5
ລວມ45000

Slip: 10 20 30 50/5ບລ; 26|10; 47 and 74 joined by a vertical line down to 74=20.
Output:
10=5ບລ
20=5ບລ
30=5ບລ
50=5ບລ
26=10
47=20
74=20

Slip: 909-3; 949 with a short plain stroke | as its amount; 989-3.
Output:
909=3
949=3
989=3

Slip: date 7.10.26; a boxed header ບົນ at the top right; 39=5, then 79 and 739 joined by a vertical line down to 779=5; a rule; ລ. 20.000ກ; a name.
Output:
39=5ບົນ
79=5ບົນ
739=5ບົນ
779=5ບົນ
ລວມ20000`;

/** ข้อความที่โมเดลตอบ → ข้อความโพย: ตัด code fence / บรรทัดว่าง · NONE = ไม่ใช่รูปโพย (ข้อความว่าง ให้คนดูรูป) */
export function slipTextOf(raw: string): string {
  const lines = raw
    .replace(/```[a-z]*/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0]!.toUpperCase() === "NONE") return "";
  return lines.join("\n");
}

/** ผลอ่านของรุ่นแรกต้องให้รุ่นแม่นอ่านซ้ำเพราะอะไร — null = ใช้ได้เลย */
export function escalationReason(text: string): string | null {
  if (!text) return "no slip found";
  const parsed = parseTicket(text);
  if (parsed.issues.length > 0) return [...new Set(parsed.issues.map((issue) => issue.code))].join(",");
  if (parsed.declaredTotal === null && text.split("\n").length >= LONG_SLIP_LINES) return "long slip without total";
  return null;
}

function mediaTypeOf(mimeType: string): MediaType {
  const type = mimeType.toLowerCase().split(";")[0]!.trim();
  if ((MEDIA_TYPES as readonly string[]).includes(type)) return type as MediaType;
  throw new AiImageError(`unsupported image type: ${mimeType}`);
}

/**
 * อ่านรูปโพย — รุ่นถูกก่อน ไม่ผ่านจึงให้รุ่นแม่นอ่านซ้ำ · strong = ใช้รุ่นแม่นเลย
 * onModel = เรียกก่อนเริ่มอ่านด้วยแต่ละรุ่น (บอทบันทึกไว้ให้หน้าโพยขึ้นว่ากำลังอ่านด้วยรุ่นไหน)
 * รุ่นแม่นติดต่อไม่ได้ชั่วคราว → ใช้ผลของรุ่นแรก (โพยรอคนตรวจตามเดิม) ดีกว่าทิ้งไปอ่านด้วยบริการ OCR
 * models = รุ่นที่แม่หวยเลือก (resolveOcrModels) — ไม่ส่ง = ค่าเริ่มต้นจาก env · สองรุ่นเป็นคนละผู้ให้บริการได้
 * ส่งรูปต้นฉบับ ไม่ปรับ (ใหญ่เกินจึงย่อ) (image-enhance.ts) — ทั้งสองรุ่นอ่านรูปเดียวกัน
 */
export async function readSlipImage(
  clients: AiClients,
  data: Uint8Array,
  mimeType: string,
  {
    strong = false,
    onModel,
    models = { model: AI_MODEL, strongModel: AI_STRONG_MODEL },
  }: { strong?: boolean; onModel?: (model: string) => unknown; models?: OcrModels } = {},
): Promise<AiRead> {
  mediaTypeOf(mimeType);
  const enhanced = await enhanceSlipImage(data, mimeType);
  const image = { mediaType: mediaTypeOf(enhanced.mimeType), data: Buffer.from(enhanced.data).toString("base64") };
  const read = async (model: string) => {
    await onModel?.(model);
    return readWith(clients, model, image);
  };
  const { model } = models;
  const strongModel = models.strongModel && models.strongModel !== model ? models.strongModel : null;
  if (!strongModel) return read(model);
  if (strong) return read(strongModel);

  let first: AiRead;
  try {
    first = await read(model);
  } catch (error) {
    // ปฏิเสธ / ข้อความยาวเกิน → รุ่นแม่นลองอีกที
    if (!(error instanceof AiImageError)) throw error;
    return { ...(await read(strongModel)), escalated: { model, reason: error.message, text: "" } };
  }

  const reason = escalationReason(first.text);
  if (!reason) return first;
  try {
    const second = await read(strongModel);
    return { ...second, escalated: { model: first.model, reason, text: first.text } };
  } catch (error) {
    if (aiFailure(error) === "account") throw error;
    return first;
  }
}

type SlipImage = { mediaType: MediaType; data: string };

async function readWith(clients: AiClients, model: string, image: SlipImage): Promise<AiRead> {
  if (providerOf(model) === "ollama") {
    if (!clients.ollama) throw new AiImageError(`OLLAMA_API_KEY is not set (model ${model})`);
    return readWithOllama(clients.ollama, model, image);
  }
  if (!clients.claude) throw new AiImageError(`ANTHROPIC_API_KEY is not set (model ${model})`);
  return readWithClaude(clients.claude, model, image);
}

async function readWithClaude(client: Anthropic, model: string, image: SlipImage): Promise<AiRead> {
  const stream = client.beta.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    // อ่านตัวเลขให้แม่นสำคัญกว่าความเร็ว
    output_config: { effort: "high" },
    // โมเดลปฏิเสธ (ตัวกรองความปลอดภัยเข้าใจผิด) → ให้โมเดลสำรองอ่านต่อในคำขอเดียวกัน
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // prompt เหมือนกันทุกรูป — cache ไว้ จ่ายส่วนนี้ถูกลงมาก
    system: [{ type: "text", text: SLIP_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: image.mediaType, data: image.data },
          },
          { type: "text", text: "Transcribe this slip." },
        ],
      },
    ],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new AiImageError("model refused to read the image");
  if (message.stop_reason === "max_tokens") throw new AiImageError("transcript too long");

  const raw = message.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  return { engine: "claude", model: message.model, text: slipTextOf(raw) };
}

/** Ollama ไม่มี cache / fallback / effort แบบ Claude — ใช้ prompt ชุดเดียวกัน temperature 0 ให้อ่านตรงที่สุด */
async function readWithOllama(client: OllamaClient, model: string, image: SlipImage): Promise<AiRead> {
  const response = await client.chat({
    model,
    stream: false,
    options: { temperature: 0, num_predict: MAX_TOKENS },
    messages: [
      { role: "system", content: SLIP_PROMPT },
      { role: "user", content: "Transcribe this slip.", images: [image.data] },
    ],
  });
  if (response.done_reason === "length") throw new AiImageError("transcript too long");
  return { engine: "ollama", model: response.model || model, text: slipTextOf(response.message?.content ?? "") };
}
