/**
 * คิวอ่านรูปโพยของบอท — รูปถูกเก็บเข้าฐานข้อมูลแล้ว (ingestImage) คิวนี้ค่อยอ่านทีละรูป
 *
 *   รูปในฐานข้อมูล → บริการ OCR (ocr/server.py) → imageToTicketText → applyOcr (ตัวแยกข้อความชุดเดียวกับข้อความปกติ)
 *
 * อ่านทีละรูปตามลำดับ เพราะ OCR ใช้ CPU เต็มที่อยู่แล้ว (~5-10 วินาที/รูป) และไม่ให้ข้อความปกติต้องรอรูป
 * บริการ OCR ยังไม่พร้อม/ล่ม → ลองใหม่เป็นระยะ ไม่ตัดสินว่าอ่านไม่ได้ทันที
 * บอทรีสตาร์ต → รูปที่ยังไม่ได้อ่าน (ocrStatus = PENDING) กลับเข้าคิวเอง (resumeOcr)
 */
import { prisma } from "@/lib/prisma";
import { applyOcr } from "@/lottery/ingest";
import { imageToTicketText, type OcrResult } from "@/lottery/image-text";

const OCR_URL = (process.env.OCR_URL || "http://localhost:8000").replace(/\/$/, "");
/** รูปใหญ่/ลายมือแน่นอ่านช้าบน CPU — เผื่อไว้ */
const OCR_TIMEOUT_MS = 3 * 60 * 1000;
/** บริการ OCR ไม่ตอบ → รอเท่านี้แล้วลองใหม่ */
const RETRY_MS = 30_000;
/** ลองครบเท่านี้แล้วยังไม่ได้ → อ่านไม่ได้ ให้คนดูรูปแล้วพิมพ์เอง (ราว 10 นาที) */
const MAX_ATTEMPTS = 20;

type Log = (...args: unknown[]) => void;

const queue: string[] = [];
const attempts = new Map<string, number>();
let running = false;
let log: Log = console.log;

/** ความผิดพลาดที่ลองใหม่ไปก็ไม่หาย (รูปเสีย/ใหญ่เกิน) — ต่างจากบริการ OCR ยังไม่พร้อม */
class BadImageError extends Error {}

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

async function readTicketImage(ticketId: string) {
  const image = await prisma.ticketImage.findUnique({
    where: { ticketId },
    select: { data: true, mimeType: true, ocrStatus: true },
  });
  if (!image || image.ocrStatus !== "PENDING") return;

  try {
    const started = Date.now();
    const ocr = await readImage(image.data, image.mimeType);
    const text = imageToTicketText(ocr);
    const result = await applyOcr(prisma, ticketId, { text, ocr });
    attempts.delete(ticketId);
    const lines = text ? text.split("\n").filter(Boolean).length : 0;
    log(`[OCR] อ่านรูปของโพย ${ticketId} แล้ว ${lines} บรรทัด (${((Date.now() - started) / 1000).toFixed(1)} วินาที) — ${result.action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tried = (attempts.get(ticketId) ?? 0) + 1;

    if (error instanceof BadImageError || tried >= MAX_ATTEMPTS) {
      attempts.delete(ticketId);
      await applyOcr(prisma, ticketId, { error: message });
      console.warn(`[OCR] ! อ่านรูปของโพย ${ticketId} ไม่ได้ (${message}) — ต้องดูรูปแล้วพิมพ์เองในโพยรอตรวจ`);
      return;
    }

    attempts.set(ticketId, tried);
    console.warn(`[OCR] ติดต่อบริการ OCR ไม่ได้ (${message}) — ลองใหม่ใน ${RETRY_MS / 1000} วินาที (ครั้งที่ ${tried})`);
    setTimeout(() => enqueueOcr(ticketId), RETRY_MS);
  }
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const ticketId = queue.shift()!;
      // รูปเดียวพังต้องไม่ทำให้คิวหยุด
      await readTicketImage(ticketId).catch((error) => console.error(`[OCR] อ่านรูปของโพย ${ticketId} ไม่สำเร็จ`, error));
    }
  } finally {
    running = false;
  }
}

export function enqueueOcr(ticketId: string) {
  if (!queue.includes(ticketId)) queue.push(ticketId);
  void drain();
}

/** ตอนบอทเริ่ม: รูปที่เก็บไว้แต่ยังไม่ได้อ่าน (บอทปิดไประหว่างรอคิว) กลับเข้าคิวตามลำดับเวลาที่ส่ง */
export async function resumeOcr(logger: Log) {
  log = logger;
  const pending = await prisma.ticketImage.findMany({
    where: { ocrStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { ticketId: true },
  });
  if (pending.length > 0) log(`[OCR] มีรูปค้างอ่าน ${pending.length} รูป — อ่านต่อ`);
  for (const { ticketId } of pending) enqueueOcr(ticketId);
}
