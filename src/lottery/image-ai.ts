/**
 * อ่านรูปโพยด้วย Claude (vision) → ข้อความโพยรูปแบบเดียวกับที่ลูกค้าพิมพ์ในแชต แล้วให้ตัวแยกข้อความ (parser.ts) อ่านต่อ
 * ใช้แทนบริการ OCR (ocr/server.py + image-text.ts) เมื่อตั้ง ANTHROPIC_API_KEY ไว้ — ดู worker/ocr.ts
 *
 *   ลายมือ                         →  ข้อความโพย
 *   612=5 แล้วเส้นโยงลงถึง 11=5     →  612=5 / 652=5 / … / 11=5   (กระจายยอดของเส้นโยงลงทุกบรรทัด)
 *   32 - 3∝3                       →  32=3*3                      (บน × ล่าง)
 *   คอลัมน์หัว B                    →  732=80฿
 *   ໓໒:15 (เลขลาว)                 →  32=15
 *   45.000 ใต้เส้นท้ายโพย           →  ລວມ45000
 *   ตัวเลขที่อ่านไม่ชัด               →  2?=3*3                      (parser ติดเป็นบรรทัดที่อ่านไม่ออก ให้คนตรวจกับรูป)
 *
 * ตัวอ่านไม่เดา: ตัวไหนไม่แน่ใจเขียน ? แทน — โพยที่อ่านครบและยอดรวมตรงจึงนับยอดได้เลย นอกนั้นรอตรวจตามเดิม
 * กติกาใหม่ที่ผู้ใช้บอก → เพิ่มใน SLIP_PROMPT (ไม่ต้องเขียนตัวแปลงเพิ่ม)
 */
import Anthropic from "@anthropic-ai/sdk";

/** ผลอ่านรูปของ Claude — เก็บใน ticket_images.ocr แทนผลดิบของบริการ OCR */
export type AiRead = { engine: "claude"; model: string; text: string };

export const AI_MODEL = process.env.CLAUDE_OCR_MODEL || "claude-opus-5-5";
/** ใบใหญ่หลายคอลัมน์มีเกือบร้อยบรรทัด + เวลาคิดของโมเดล — เผื่อไว้ */
const MAX_TOKENS = 32_000;
/** ชนิดรูปที่ API รับ */
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/** รูปที่อ่านไปก็ไม่ได้อะไร (ชนิดไฟล์ไม่รองรับ / โมเดลปฏิเสธ / ข้อความยาวเกิน) — ให้คนดูรูปแล้วพิมพ์เอง ไม่ต้องลองใหม่ */
export class AiImageError extends Error {}

/**
 * Claude อ่านรูปไม่ได้เพราะอะไร — ทุกกรณีรูปนั้นไปอ่านด้วยบริการ OCR แทน ต่างกันที่รูปถัดไป (worker/ocr.ts)
 *   "image"   รูปนี้รูปเดียว (ชนิดไฟล์ไม่รองรับ / รูปเสีย / ใหญ่เกิน / โมเดลปฏิเสธ) — รูปถัดไปยังใช้ Claude
 *   "account" เครดิตหมด / key ผิดหรือถูกปิด / ชื่อรุ่นผิด — พัก Claude นาน จนกว่าจะเติมเครดิตหรือแก้ค่า
 *   "outage"  ล่ม / ติด rate limit / ต่อเครือข่ายไม่ได้ — พัก Claude สั้น ๆ
 */
export type ClaudeFailure = "image" | "account" | "outage";

export function claudeFailure(error: unknown): ClaudeFailure {
  if (error instanceof AiImageError) return "image";
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) return "outage";
  const body = error.error as { error?: { type?: string } } | undefined;
  const billing = body?.error?.type === "billing_error" || /credit balance/i.test(error.message);
  if (billing || [401, 402, 403, 404].includes(error.status)) return "account";
  if ([400, 413, 422].includes(error.status)) return "image";
  return "outage";
}

export const isAiRead = (ocr: unknown): ocr is AiRead =>
  typeof ocr === "object" && ocr !== null && (ocr as { engine?: unknown }).engine === "claude";

export const SLIP_PROMPT = `You transcribe photos of handwritten Lao lottery betting slips (ໂພຍ) into plain text lines for a downstream parser. Output only the lines.

OUTPUT FORMAT — one bet per line:
- NUMBER=AMOUNT                 e.g. 612=5
- top × bottom: NUMBER=TOP*BOTTOM   e.g. 32=3*3   (handwritten as ∝, α, x, ×)
- top and bottom, one amount: NUMBER=AMOUNTບລ
- bottom only: NUMBER=AMOUNTລ່າງ
- baht: append ฿, e.g. 732=80฿ . Kip has no suffix.
- declared total: ລວມ followed by digits only, e.g. ລວມ45000

READING RULES
1. Lao digits ໐໑໒໓໔໕໖໗໘໙ are 0-9. The photo may be rotated or upside down.
2. The separator between number and amount varies: = - . : ; or a space. All mean "=". Numbers have 2 or 3 digits; keep leading zeros (01, 079).
3. A vertical line, bracket, wavy line or arrow drawn beside several rows means those rows share the amount written on the row where the line starts or ends (top, bottom, or both). Write that amount on every row of the group. A row without an amount between the end of such a line and the next row with an amount belongs to the group.
4. Column header B or ฿ = baht for every row in that column. Header K or no header = kip. Header ບົນ+ລ່າງ or ບລ = top and bottom. With several columns, transcribe column by column, left to right, each top to bottom.
5. Write amounts exactly as written (5 stays 5, 80 stays 80). Do not multiply, do not add thousands separators.
6. Keep duplicate rows — each one is a separate bet. Keep the slip's order.
7. Skip dates (2.10.26), names, signatures, notes and anything that is not a bet or the total. Text printed on the table or background is not part of the slip.
8. The total is usually under a horizontal rule at the bottom: 45.000 → ລວມ45000, ລ: 30.000 → ລວມ30000, 48 → ລວມ48. Write it exactly as written, even if it does not match the sum of the bets.
9. Never guess. Replace every digit you cannot read with certain with ? (2?=3*3, 516=?0). Look-alike digits you cannot decide between (1/7/9, 3/8, 5/6, 0/6) also become ?. If a whole row is illegible, write ? for that row.
10. If the image contains no betting slip, output exactly NONE.
11. No explanations, no markdown, no code fences.

EXAMPLE
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
ລວມ45000`;

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

function mediaTypeOf(mimeType: string): MediaType {
  const type = mimeType.toLowerCase().split(";")[0]!.trim();
  if ((MEDIA_TYPES as readonly string[]).includes(type)) return type as MediaType;
  throw new AiImageError(`unsupported image type: ${mimeType}`);
}

export async function readSlipImage(client: Anthropic, data: Uint8Array, mimeType: string): Promise<AiRead> {
  const stream = client.beta.messages.stream({
    model: AI_MODEL,
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
            source: { type: "base64", media_type: mediaTypeOf(mimeType), data: Buffer.from(data).toString("base64") },
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
