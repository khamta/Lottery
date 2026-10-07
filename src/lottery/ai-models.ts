/**
 * รุ่น AI ที่ใช้อ่านรูปโพย — แยกจาก image-ai.ts (ไม่ import SDK) เพื่อให้ฟอร์มฝั่ง client ใช้รายการเดียวกันได้
 *
 * มีสองผู้ให้บริการ: Claude (ANTHROPIC_API_KEY) และ Ollama Cloud (OLLAMA_API_KEY) — ผสมกันได้ เช่น Ollama อ่านก่อน Claude อ่านซ้ำ
 *   Claude  เลือกได้เฉพาะรุ่นในรายการ OCR_MODELS
 *   Ollama  เลือกได้ทุกรุ่นบน Ollama Cloud ที่อ่านรูปได้ — หน้าแม่หวยดึงรายการสด (listOllamaVisionModels ใน ollama.ts)
 *           รุ่น Ollama ใน OCR_MODELS เป็นแค่ชื่อที่แสดงสวย ๆ และรายการสำรองเมื่อดึงไม่ได้
 *
 * แม่หวยแต่ละรายเลือกเองที่หน้าแม่หวย — มีผลกับรูปถัดไป ไม่ต้องแก้ env หรือรีสตาร์ตบอท
 *   รุ่นหลัก (dealers.ocrModel)          null = อัตโนมัติ: รุ่นหลักและรุ่นอ่านซ้ำตาม env (OCR_MODEL → OCR_STRONG_MODEL)
 *                                       ชื่อรุ่น = รุ่นนั้นอ่านทุกรูปก่อน
 *   รุ่นอ่านซ้ำ (dealers.ocrStrongModel)  ใช้เมื่อเลือกรุ่นหลักเอง — รุ่นหลักอ่านไม่ผ่านจึงให้รุ่นนี้อ่านซ้ำ
 *                                       (รวมถึงตอนสั่งอ่านใหม่จากหน้าโพย) · null = ไม่อ่านซ้ำ ใช้รุ่นหลักรุ่นเดียว
 */

export type AiProvider = "claude" | "ollama";

/** รุ่นที่รู้จัก — ชื่อรุ่นเป็นชื่อเฉพาะ ไม่ต้องแปล · Ollama ใช้ชื่อตาม https://ollama.com/api/tags (เฉพาะรุ่นที่อ่านรูปได้) */
export const OCR_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "claude" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "claude" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", provider: "claude" },
  { id: "gemma4:31b", label: "Gemma 4 31B", provider: "ollama" },
  { id: "glm-5.3-flash", label: "GLM 5.3 Flash", provider: "ollama" },
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", provider: "ollama" },
  { id: "mistral-large-4", label: "Mistral Large 4", provider: "ollama" },
  { id: "kimi-k3", label: "Kimi K3", provider: "ollama" },
] as const satisfies ReadonlyArray<{ id: string; label: string; provider: AiProvider }>;

export const AI_PROVIDERS = ["claude", "ollama"] as const satisfies readonly AiProvider[];
/** ชื่อผู้ให้บริการ (หัวกลุ่มในตัวเลือก) — ชื่อเฉพาะ ไม่ต้องแปล */
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = { claude: "Claude (Anthropic)", ollama: "Ollama Cloud" };

/** รุ่น Ollama ที่รู้จัก — รายการสำรองเมื่อดึงรายการสดจาก Ollama Cloud ไม่ได้ */
export const OLLAMA_FALLBACK_MODELS: string[] = OCR_MODELS.filter((model) => model.provider === "ollama").map((model) => model.id);

/** ค่าในฟอร์ม: อัตโนมัติ (เก็บเป็น null ในตาราง) */
export const OCR_MODEL_AUTO = "auto";
/** "auto" หรือชื่อรุ่น */
export type OcrModelField = string;
/** ค่าในฟอร์มของรุ่นอ่านซ้ำ: ไม่อ่านซ้ำ (เก็บเป็น null ในตาราง) */
export const OCR_REREAD_NONE = "none";
/** "none" หรือชื่อรุ่น */
export type OcrStrongModelField = string;

/** ชื่อรุ่นของ Ollama: name หรือ name:tag (ตัวอักษร ตัวเลข . _ -) */
const OLLAMA_NAME = /^[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i;

export const ocrModelLabel = (id: string) => OCR_MODELS.find((model) => model.id === id)?.label ?? id;

/** เลือกรุ่นนี้ได้ไหม — Claude ต้องอยู่ในรายการ · Ollama รับทุกชื่อที่ถูกรูปแบบ (รายการบน Ollama Cloud เปลี่ยนได้ตลอด) */
export function isSelectableModel(value: string): boolean {
  if (value.startsWith("claude-")) return OCR_MODELS.some((model) => model.id === value);
  return value.length <= 100 && OLLAMA_NAME.test(value);
}

/** รุ่นนี้เรียกผ่านผู้ให้บริการไหน — รุ่นนอกรายการ (ตั้งใน env) ดูจากชื่อ: claude-* = Claude นอกนั้น Ollama */
export function providerOf(model: string): AiProvider {
  return OCR_MODELS.find((item) => item.id === model)?.provider ?? (model.startsWith("claude-") ? "claude" : "ollama");
}

/** รุ่นที่อ่านทุกรูปก่อนในโหมดอัตโนมัติ (CLAUDE_OCR_MODEL = ชื่อเดิม ยังใช้ได้) */
export const AI_MODEL = process.env.OCR_MODEL || process.env.CLAUDE_OCR_MODEL || "claude-sonnet-5-5";
/** รุ่นที่อ่านซ้ำเมื่อรุ่นแรกอ่านไม่ผ่านในโหมดอัตโนมัติ — ค่าว่าง (หรือรุ่นเดียวกับ AI_MODEL) = ไม่อ่านซ้ำ */
export const AI_STRONG_MODEL = process.env.OCR_STRONG_MODEL ?? process.env.CLAUDE_OCR_STRONG_MODEL ?? "claude-opus-5-5";

/** ค่าในตาราง → ค่าในฟอร์ม (null / รุ่นที่เลิกให้เลือกแล้ว = อัตโนมัติ) */
export const ocrModelField = (value: string | null): OcrModelField =>
  value && isSelectableModel(value) ? value : OCR_MODEL_AUTO;

/** ค่าในฟอร์ม → ค่าในตาราง */
export const ocrModelColumn = (value: OcrModelField) => (value === OCR_MODEL_AUTO ? null : value);

/** รุ่นอ่านซ้ำ: ค่าในตาราง → ค่าในฟอร์ม (null / รุ่นที่เลิกให้เลือกแล้ว = ไม่อ่านซ้ำ) */
export const ocrStrongModelField = (value: string | null): OcrStrongModelField =>
  value && isSelectableModel(value) ? value : OCR_REREAD_NONE;

/** รุ่นอ่านซ้ำ: ค่าในฟอร์ม → ค่าในตาราง (อัตโนมัติ / รุ่นเดียวกับรุ่นหลัก = ไม่ต้องเก็บ) */
export const ocrStrongModelColumn = (value: OcrStrongModelField, model: OcrModelField) =>
  value === OCR_REREAD_NONE || model === OCR_MODEL_AUTO || value === model ? null : value;

export type OcrModels = { model: string; strongModel: string };

/** รุ่นที่แม่หวยเลือก → รุ่นที่ใช้อ่านจริง — อ่านผ่านค่าในฟอร์มเพื่อให้ตรงกับที่หน้าแม่หวยแสดง */
export function resolveOcrModels(dealer?: { ocrModel: string | null; ocrStrongModel?: string | null } | null): OcrModels {
  const model = ocrModelField(dealer?.ocrModel ?? null);
  if (model === OCR_MODEL_AUTO) return { model: AI_MODEL, strongModel: AI_STRONG_MODEL };
  const strongModel = ocrStrongModelField(dealer?.ocrStrongModel ?? null);
  return { model, strongModel: strongModel === OCR_REREAD_NONE || strongModel === model ? "" : strongModel };
}
