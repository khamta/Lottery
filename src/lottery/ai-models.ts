/**
 * รุ่น Claude ที่ใช้อ่านรูปโพย — แยกจาก image-ai.ts (ไม่ import SDK) เพื่อให้ฟอร์มฝั่ง client ใช้รายการเดียวกันได้
 *
 * แม่หวยแต่ละรายเลือกเองที่หน้าแม่หวย (dealers.ocrModel) — มีผลกับรูปถัดไป ไม่ต้องแก้ env หรือรีสตาร์ตบอท
 *   อัตโนมัติ (null)  รุ่นถูก (CLAUDE_OCR_MODEL) อ่านก่อน อ่านไม่ผ่านจึงให้รุ่นแม่น (CLAUDE_OCR_STRONG_MODEL) อ่านซ้ำ
 *   ชื่อรุ่น          ใช้รุ่นนั้นรุ่นเดียวทุกรูป ไม่สลับรุ่น (รวมถึงตอนสั่งอ่านใหม่จากหน้าโพย)
 */

/** รุ่นที่ให้เลือก — ชื่อรุ่นเป็นชื่อเฉพาะ ไม่ต้องแปล */
export const OCR_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
] as const;

export type OcrModelId = (typeof OCR_MODELS)[number]["id"];
export const OCR_MODEL_IDS = OCR_MODELS.map((model) => model.id) as [OcrModelId, ...OcrModelId[]];

/** ค่าในฟอร์ม: อัตโนมัติ (เก็บเป็น null ในตาราง) */
export const OCR_MODEL_AUTO = "auto";
export type OcrModelField = typeof OCR_MODEL_AUTO | OcrModelId;

export const ocrModelLabel = (id: string) => OCR_MODELS.find((model) => model.id === id)?.label ?? id;
const isOcrModelId = (value: string): value is OcrModelId => (OCR_MODEL_IDS as string[]).includes(value);

/** รุ่นที่อ่านทุกรูปก่อนในโหมดอัตโนมัติ */
export const AI_MODEL = process.env.CLAUDE_OCR_MODEL || "claude-sonnet-5-5";
/** รุ่นที่อ่านซ้ำเมื่อรุ่นแรกอ่านไม่ผ่านในโหมดอัตโนมัติ — ค่าว่าง (หรือรุ่นเดียวกับ AI_MODEL) = ไม่อ่านซ้ำ */
export const AI_STRONG_MODEL = process.env.CLAUDE_OCR_STRONG_MODEL ?? "claude-opus-5-5";

/** ค่าในตาราง → ค่าในฟอร์ม (null / รุ่นที่เลิกให้เลือกแล้ว = อัตโนมัติ) */
export const ocrModelField = (value: string | null): OcrModelField =>
  value && isOcrModelId(value) ? value : OCR_MODEL_AUTO;

/** ค่าในฟอร์ม → ค่าในตาราง */
export const ocrModelColumn = (value: OcrModelField) => (value === OCR_MODEL_AUTO ? null : value);

export type OcrModels = { model: string; strongModel: string };

/** รุ่นที่แม่หวยเลือก → รุ่นที่ใช้อ่านจริง — อ่านผ่านค่าในฟอร์มเพื่อให้ตรงกับที่หน้าแม่หวยแสดง */
export function resolveOcrModels(dealer?: { ocrModel: string | null } | null): OcrModels {
  const model = ocrModelField(dealer?.ocrModel ?? null);
  if (model === OCR_MODEL_AUTO) return { model: AI_MODEL, strongModel: AI_STRONG_MODEL };
  return { model, strongModel: "" };
}
