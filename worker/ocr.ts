/**
 * คิวอ่านรูปโพยของบอท — รูปถูกบันทึกเป็นไฟล์และเข้าตารางแล้ว (ingestImage) คิวนี้ค่อยอ่านทีละรูป
 *
 *   ไฟล์รูปใน uploads (path ใน ticket_images) → บริการ OCR (ocr/server.py)
 *     → ขั้นที่ 1 transcribeImage (ทุกอย่างที่อ่านได้) + ขั้นที่ 2 imageToTicketText (กรองตามกติกา) → applyOcr (ตัวแยกข้อความชุดเดียวกับข้อความปกติ)
 *   กติกาเปลี่ยน → bun run ocr:reapply อ่านรูปเก่าใหม่จากผล OCR ที่เก็บไว้ (worker/ocr-reapply.ts)
 *
 * ตั้ง ANTHROPIC_API_KEY ไว้ → อ่านด้วย Claude ก่อน (src/lottery/image-ai.ts): ได้ข้อความโพยตรง ๆ แล้ว applyOcr เหมือนเดิม
 *   อ่านพร้อมกันได้หลายรูป (OCR_CONCURRENCY ค่าเริ่มต้น 4) เพราะรอเครือข่าย ไม่ได้ใช้ CPU เครื่องนี้
 *   Claude อ่านรูปไหนไม่ได้ → รูปนั้นอ่านด้วยบริการ OCR แทนทันที
 *   Claude ใช้ไม่ได้ทั้งระบบ (เครดิตหมด / key ผิด / ล่ม / rate limit) → พัก Claude ไว้ (ดู PAUSE_MS) ระหว่างนั้นทุกรูปใช้บริการ OCR
 *     ครบเวลาแล้วลอง Claude ใหม่เอง — เติมเครดิตแล้วไม่ต้องรีสตาร์ตบอท
 *
 * บริการ OCR อ่านทีละรูปตามลำดับเสมอ เพราะใช้ CPU เต็มที่อยู่แล้ว (~5-10 วินาที/รูป) และไม่ให้ข้อความปกติต้องรอรูป
 * บริการ OCR ยังไม่พร้อม/ล่ม → ลองใหม่เป็นระยะ ไม่ตัดสินว่าอ่านไม่ได้ทันที
 * บอทรีสตาร์ต → รูปที่ยังไม่ได้อ่าน (ocrStatus = PENDING) กลับเข้าคิวเอง (resumeOcr)
 *
 * อ่านโพยรอตรวจใหม่จากหน้าโพย (requestImageReread) → รูปกลับเป็น PENDING พร้อมตัวอ่านที่คนเลือก (ocrEngine)
 *   บอทดึงคำสั่งเข้าคิวทุก REQUEST_POLL_MS · AI = Claude เท่านั้น (ไม่ใช้บริการ OCR แทน) · OCR = บริการ OCR เท่านั้น
 */
import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { AI_MODEL, claudeFailure, readSlipImage, type ClaudeFailure } from "@/lottery/image-ai";
import { readTicketImage } from "@/lottery/image-store";
import { imageToTicketText, type OcrResult } from "@/lottery/image-text";
import { applyOcr, type ImageEngine, type OcrOutcome } from "@/lottery/ingest";

/** ผลอ่านรูปที่อ่านได้ (ไม่ใช่ error) */
type OcrRead = Exclude<OcrOutcome, { error: string }>;

const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
/** จำนวนรูปที่อ่านพร้อมกัน — ไม่มี Claude อ่านทีละรูป (บริการ OCR อ่านทีละรูปอยู่แล้ว) */
const CONCURRENCY = claude ? Math.max(1, Number(process.env.OCR_CONCURRENCY) || 4) : 1;
const CLAUDE = `Claude (${AI_MODEL})`;
const OCR_SERVICE = "บริการ OCR";
/** Claude ใช้ไม่ได้ทั้งระบบ → พักไว้เท่านี้ก่อนลองใหม่ (เครดิตหมด/key ผิดต้องรอคนแก้ จึงพักนานกว่า) */
const PAUSE_MS: Record<Exclude<ClaudeFailure, "image">, number> = { account: 30 * 60 * 1000, outage: 2 * 60 * 1000 };

const OCR_URL = (process.env.OCR_URL || "http://localhost:8000").replace(/\/$/, "");
/** รูปใหญ่/ลายมือแน่นอ่านช้าบน CPU — เผื่อไว้ */
const OCR_TIMEOUT_MS = 3 * 60 * 1000;
/** บริการ OCR ไม่ตอบ → รอเท่านี้แล้วลองใหม่ */
const RETRY_MS = 30_000;
/** ลองครบเท่านี้แล้วยังไม่ได้ → อ่านไม่ได้ ให้คนดูรูปแล้วพิมพ์เอง (ราว 10 นาที) */
const MAX_ATTEMPTS = 20;
/** ดึงคำสั่งอ่านรูปใหม่จากหน้าโพยทุกเท่านี้ (คิวรูปอยู่ในบอท เว็บสั่งผ่านตารางได้อย่างเดียว) */
const REQUEST_POLL_MS = 5_000;

type Log = (...args: unknown[]) => void;

const queue: string[] = [];
/** รูปที่กำลังอ่านอยู่ — อ่านพร้อมกันหลายรูปแล้ว ต้องกันรูปเดียวกันถูกอ่านซ้อน */
const reading = new Set<string>();
const attempts = new Map<string, number>();
/** รูปที่รอลองใหม่ (บริการอ่านรูปไม่ตอบ) — ยังเป็น PENDING ในตาราง แต่ตั้งเวลาเข้าคิวไว้แล้ว */
const retrying = new Set<string>();
/** เวลาที่จะกลับไปลอง Claude (0 = ใช้ได้) */
let claudePausedUntil = 0;
/** คิวของบริการ OCR — ให้อ่านทีละรูปแม้คิวรูปจะอ่านพร้อมกันหลายรูป */
let ocrServiceTurn: Promise<unknown> = Promise.resolve();
let log: Log = console.log;

/** ความผิดพลาดที่ลองใหม่ไปก็ไม่หาย (รูปเสีย/ใหญ่เกิน) — ต่างจากบริการ OCR ยังไม่พร้อม */
class BadImageError extends Error {}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readImage(data: Uint8Array, mimeType: string): Promise<OcrResult> {
  const response = await fetch(`${OCR_URL}/ocr`, {
    method: "POST",
    body: new Uint8Array(data),
    headers: { "Content-Type": mimeType },
    signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
  });
  if (response.status === 413) throw new BadImageError("image too large");
  if (!response.ok) throw new Error(`OCR HTTP ${response.status}`);

  const result = (await response.json()) as OcrResult;
  // ทั้งสองเครื่องมือเปิดรูปไม่ได้ = รูปเสีย
  if (result.paddle.length === 0 && result.tesseract.length === 0 && result.errors?.length) {
    throw new BadImageError(result.errors.join("; "));
  }
  return result;
}

async function readWithOcrService(data: Uint8Array, mimeType: string): Promise<OcrRead> {
  const run = ocrServiceTurn.then(() => readImage(data, mimeType));
  ocrServiceTurn = run.catch(() => undefined);
  const ocr = await run;
  return { text: imageToTicketText(ocr), ocr };
}

function pauseClaude(failure: Exclude<ClaudeFailure, "image">, message: string) {
  const wasPaused = Date.now() < claudePausedUntil;
  claudePausedUntil = Date.now() + PAUSE_MS[failure];
  if (wasPaused) return;
  const why = failure === "account" ? "เครดิตหมดหรือ key ใช้ไม่ได้" : "ติดต่อไม่ได้";
  console.warn(`[OCR] ! ${CLAUDE} ${why} (${message}) — ใช้${OCR_SERVICE}แทน ลอง Claude ใหม่ใน ${PAUSE_MS[failure] / 60_000} นาที`);
}

/**
 * คนสั่งอ่านใหม่ด้วย Claude (หน้าโพย) — ไม่ใช้บริการ OCR แทน เพราะคนเลือก AI เอง (ยอมจ่ายแล้ว)
 * ลองแม้ Claude พักอยู่ · รูปนี้อ่านไม่ได้ / เครดิตหมด / ไม่ได้ตั้ง key = อ่านไม่ได้ (คนสั่งอ่านใหม่ด้วยตัวอ่านปกติได้) · ล่มชั่วคราว = ลองใหม่ตามคิว
 */
async function readWithClaudeOnly(data: Uint8Array, mimeType: string): Promise<OcrRead> {
  if (!claude) throw new BadImageError("AI requested but ANTHROPIC_API_KEY is not set");
  try {
    const read = await readSlipImage(claude, data, mimeType);
    return { text: read.text, ocr: read };
  } catch (error) {
    const failure = claudeFailure(error);
    if (failure === "outage") throw error;
    if (failure === "account") pauseClaude(failure, messageOf(error));
    throw new BadImageError(`${CLAUDE}: ${messageOf(error)}`);
  }
}

/**
 * ตัวอ่านตามที่คนสั่ง (ocrEngine) — ไม่ระบุ = อ่านด้วย Claude ก่อน (ถ้าตั้งไว้และไม่ได้พักอยู่) ไม่ได้ก็อ่านด้วยบริการ OCR
 */
async function readTicketImageText(
  data: Uint8Array,
  mimeType: string,
  requested: ImageEngine | null,
): Promise<{ outcome: OcrRead; engine: string }> {
  if (requested === "AI") return { outcome: await readWithClaudeOnly(data, mimeType), engine: CLAUDE };
  if (requested !== "OCR" && claude && Date.now() >= claudePausedUntil) {
    try {
      const read = await readSlipImage(claude, data, mimeType);
      return { outcome: { text: read.text, ocr: read }, engine: CLAUDE };
    } catch (error) {
      const failure = claudeFailure(error);
      if (failure === "image") log(`[OCR] ${CLAUDE} อ่านรูปนี้ไม่ได้ (${messageOf(error)}) — ลองด้วย${OCR_SERVICE}`);
      else pauseClaude(failure, messageOf(error));
    }
  }
  return { outcome: await readWithOcrService(data, mimeType), engine: OCR_SERVICE };
}

async function ocrTicketImage(ticketId: string) {
  const image = await prisma.ticketImage.findUnique({
    where: { ticketId },
    select: { path: true, mimeType: true, ocrStatus: true, ocrEngine: true },
  });
  if (!image || image.ocrStatus !== "PENDING") return;

  try {
    const started = Date.now();
    const data = image.path ? await readTicketImage(image.path) : null;
    if (!data) throw new BadImageError(`image file missing: ${image.path ?? "(no path)"}`);
    const { outcome, engine } = await readTicketImageText(data, image.mimeType, image.ocrEngine);
    const result = await applyOcr(prisma, ticketId, outcome);
    attempts.delete(ticketId);
    const lines = outcome.text ? outcome.text.split("\n").filter(Boolean).length : 0;
    log(
      `[OCR] ${engine} อ่านรูปของโพย ${ticketId} แล้ว ${lines} บรรทัด (${((Date.now() - started) / 1000).toFixed(1)} วินาที) — ${result.action}`,
    );
  } catch (error) {
    const message = messageOf(error);
    const tried = (attempts.get(ticketId) ?? 0) + 1;

    if (error instanceof BadImageError || tried >= MAX_ATTEMPTS) {
      attempts.delete(ticketId);
      await applyOcr(prisma, ticketId, { error: message });
      console.warn(`[OCR] ! อ่านรูปของโพย ${ticketId} ไม่ได้ (${message}) — ต้องดูรูปแล้วพิมพ์เองในโพยรอตรวจ`);
      return;
    }

    attempts.set(ticketId, tried);
    const service = image.ocrEngine === "AI" ? CLAUDE : OCR_SERVICE;
    console.warn(`[OCR] ติดต่อ${service}ไม่ได้ (${message}) — ลองใหม่ใน ${RETRY_MS / 1000} วินาที (ครั้งที่ ${tried})`);
    // ระหว่างรอลองใหม่ ไม่ให้รอบดึงคำสั่งจากหน้าเว็บ (pollRequests) หยิบรูปนี้เข้าคิวก่อนเวลา
    retrying.add(ticketId);
    setTimeout(() => {
      retrying.delete(ticketId);
      enqueueOcr(ticketId);
    }, RETRY_MS);
  }
}

function drain() {
  while (reading.size < CONCURRENCY && queue.length > 0) {
    const ticketId = queue.shift()!;
    reading.add(ticketId);
    // รูปเดียวพังต้องไม่ทำให้คิวหยุด
    void ocrTicketImage(ticketId)
      .catch((error) => console.error(`[OCR] อ่านรูปของโพย ${ticketId} ไม่สำเร็จ`, error))
      .finally(() => {
        reading.delete(ticketId);
        drain();
      });
  }
}

export function enqueueOcr(ticketId: string) {
  if (!queue.includes(ticketId) && !reading.has(ticketId)) queue.push(ticketId);
  drain();
}

/** ตอนบอทเริ่ม: รูปที่เก็บไว้แต่ยังไม่ได้อ่าน (บอทปิดไประหว่างรอคิว) กลับเข้าคิวตามลำดับเวลาที่ส่ง */
export async function resumeOcr(logger: Log) {
  log = logger;
  const pending = await prisma.ticketImage.findMany({
    where: { ocrStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { ticketId: true },
  });
  log(
    claude
      ? `[OCR] อ่านรูปด้วย ${CLAUDE} พร้อมกัน ${CONCURRENCY} รูป — อ่านไม่ได้/เครดิตหมด ใช้${OCR_SERVICE}แทน`
      : `[OCR] อ่านรูปด้วย${OCR_SERVICE} (ไม่ได้ตั้ง ANTHROPIC_API_KEY)`,
  );
  if (pending.length > 0) log(`[OCR] มีรูปค้างอ่าน ${pending.length} รูป — อ่านต่อ`);
  for (const { ticketId } of pending) enqueueOcr(ticketId);
  setInterval(() => void pollRequests(), REQUEST_POLL_MS);
}

/**
 * คำสั่ง "อ่านรูปใหม่" จากหน้าโพย — เว็บเปลี่ยนรูปกลับเป็น PENDING ในตาราง (requestImageReread) แต่เข้าคิวในบอทไม่ได้
 * จึงดึงรูปที่ PENDING แต่ยังไม่อยู่ในคิว/กำลังอ่าน/รอลองใหม่ มาเข้าคิวเป็นระยะ ตามลำดับเวลาที่ส่ง
 */
async function pollRequests() {
  try {
    const pending = await prisma.ticketImage.findMany({
      where: { ocrStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { ticketId: true },
    });
    const fresh = pending.filter(
      ({ ticketId }) => !queue.includes(ticketId) && !reading.has(ticketId) && !retrying.has(ticketId),
    );
    if (fresh.length === 0) return;
    log(`[OCR] มีคำสั่งอ่านรูปใหม่ ${fresh.length} รูป — เข้าคิว`);
    for (const { ticketId } of fresh) enqueueOcr(ticketId);
  } catch (error) {
    console.error("[OCR] ดึงคำสั่งอ่านรูปใหม่ไม่สำเร็จ", error);
  }
}
