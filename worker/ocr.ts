/**
 * คิวอ่านรูปโพยของบอท — รูปถูกบันทึกเป็นไฟล์และเข้าตารางแล้ว (ingestImage) คิวนี้ค่อยอ่านทีละรูป
 *
 *   ไฟล์รูปใน uploads (path ใน ticket_images) → AI (src/lottery/image-ai.ts) ได้ข้อความโพยตรง ๆ
 *     → applyOcr (ตัวแยกข้อความชุดเดียวกับข้อความปกติ)
 *
 * อ่านรูปด้วย AI อย่างเดียว — Claude (ANTHROPIC_API_KEY) และ/หรือ Ollama Cloud (OLLAMA_API_KEY)
 *   ไม่ได้ตั้ง key ของรุ่นที่ใช้ = รูปนั้นอ่านไม่ได้ ให้คนดูรูปเอง
 *   รุ่นหลัก (OCR_MODEL) อ่านก่อน อ่านไม่ผ่านจึงให้รุ่นอ่านซ้ำ (OCR_STRONG_MODEL) อ่านอีกครั้ง
 *   แม่หวยเลือกเองได้ที่หน้าแม่หวย (dealers.ocrModel / ocrStrongModel) — อ่านทุกรูปใหม่ ไม่ต้องรีสตาร์ตบอท
 *   อ่านพร้อมกันได้หลายรูป (OCR_CONCURRENCY ค่าเริ่มต้น 4) เพราะรอเครือข่าย ไม่ได้ใช้ CPU เครื่องนี้
 *   AI อ่านรูปไหนไม่ได้ (ปฏิเสธ/รูปเสีย) → รูปนั้นอ่านไม่ได้ ให้คนดูรูปแล้วพิมพ์เองในโพยรอตรวจ
 *   ผู้ให้บริการใช้ไม่ได้ทั้งระบบ (เครดิตหมด / key ผิด) → พักเฉพาะผู้ให้บริการนั้น (ดู PAUSE_MS)
 *     ระหว่างพัก รุ่นอ่านซ้ำของอีกผู้ให้บริการอ่านแทน · ไม่มีรุ่นให้อ่าน = รูปค้างเป็น PENDING รอในคิว
 *     ครบเวลาแล้วลองใหม่เอง — เติมเครดิตแล้วไม่ต้องรีสตาร์ตบอท
 *   ล่ม / rate limit ชั่วคราว → ลองใหม่เป็นระยะ ไม่ตัดสินว่าอ่านไม่ได้ทันที
 * บอทรีสตาร์ต → รูปที่ยังไม่ได้อ่าน (ocrStatus = PENDING) กลับเข้าคิวเอง (resumeOcr)
 *
 * กลุ่มที่ตั้งไม่ให้อ่านรูป (whatsapp_groups.readImages = false) ไม่เข้าคิวนี้ — รูปถูกเก็บเป็น SKIPPED รอคนตรวจ
 *
 * อ่านโพยรอตรวจใหม่จากหน้าโพย (requestImageReread) → รูปกลับเป็น PENDING พร้อม ocrEngine = AI
 *   บอทดึงคำสั่งเข้าคิวทุก REQUEST_POLL_MS · คนสั่งเอง = ใช้รุ่นแม่นเลย
 */
import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { AI_PROVIDER_LABELS, providerOf, resolveOcrModels, type AiProvider, type OcrModels } from "@/lottery/ai-models";
import {
  AI_MODEL,
  AI_STRONG_MODEL,
  aiFailure,
  failureProvider,
  readSlipImage,
  unusableModel,
  type AiClients,
  type AiFailure,
  type AiRead,
} from "@/lottery/image-ai";
import { readTicketImage } from "@/lottery/image-store";
import { applyOcr } from "@/lottery/ingest";
import { createOllamaClient } from "@/lottery/ollama";

const clients: AiClients = {
  claude: process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null,
  ollama: process.env.OLLAMA_API_KEY ? createOllamaClient(process.env.OLLAMA_API_KEY, process.env.OLLAMA_HOST || undefined) : null,
};
/** จำนวนรูปที่อ่านพร้อมกัน */
const CONCURRENCY = Math.max(1, Number(process.env.OCR_CONCURRENCY) || 4);
const AUTO = AI_STRONG_MODEL && AI_STRONG_MODEL !== AI_MODEL ? `${AI_MODEL} → ${AI_STRONG_MODEL}` : AI_MODEL;
/** ผู้ให้บริการใช้ไม่ได้ทั้งระบบ → พักไว้เท่านี้ก่อนลองใหม่ (เครดิตหมด/key ผิดต้องรอคนแก้ จึงพักนานกว่า) */
const PAUSE_MS: Record<Exclude<AiFailure, "image">, number> = { account: 30 * 60 * 1000, outage: 2 * 60 * 1000 };

/** AI ติดต่อไม่ได้ชั่วคราว → รอเท่านี้แล้วลองใหม่ */
const RETRY_MS = 30_000;
/** ลองครบเท่านี้แล้วยังไม่ได้ → อ่านไม่ได้ ให้คนดูรูปแล้วพิมพ์เอง (ราว 10 นาที) — ไม่นับรอบที่พักผู้ให้บริการไว้เพราะเครดิตหมด */
const MAX_ATTEMPTS = 20;
/** ดึงคำสั่งอ่านรูปใหม่จากหน้าโพยทุกเท่านี้ (คิวรูปอยู่ในบอท เว็บสั่งผ่านตารางได้อย่างเดียว) */
const REQUEST_POLL_MS = 5_000;

type Log = (...args: unknown[]) => void;

const queue: string[] = [];
/** รูปที่กำลังอ่านอยู่ — อ่านพร้อมกันหลายรูปแล้ว ต้องกันรูปเดียวกันถูกอ่านซ้อน */
const reading = new Set<string>();
const attempts = new Map<string, number>();
/** รูปที่รอลองใหม่ — ยังเป็น PENDING ในตาราง แต่ตั้งเวลาเข้าคิวไว้แล้ว */
const retrying = new Set<string>();
/** เวลาที่จะกลับไปลองผู้ให้บริการแต่ละราย (0 = ใช้ได้) */
const pausedUntil: Record<AiProvider, number> = { claude: 0, ollama: 0 };
/** รุ่นที่ใช้ไม่ได้เฉพาะรุ่น (ไม่อยู่ในแผน / ชื่อผิด) → เวลาที่จะกลับไปลอง — รุ่นอื่นของผู้ให้บริการเดียวกันยังใช้ได้ */
const modelPausedUntil = new Map<string, number>();
let log: Log = console.log;

/** ความผิดพลาดที่ลองใหม่ไปก็ไม่หาย (รูปเสีย/AI ปฏิเสธ/ไม่ได้ตั้ง key) — ต่างจากผู้ให้บริการล่มชั่วคราว */
class BadImageError extends Error {}
/** ผู้ให้บริการที่ต้องใช้ถูกพักอยู่ (เครดิตหมด/key ผิด) — รูปรอจนพักเสร็จ ไม่นับเป็นรอบที่ลองแล้ว */
class PausedError extends Error {}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pauseEnd = (model: string) => Math.max(pausedUntil[providerOf(model)], modelPausedUntil.get(model) ?? 0);
const isPaused = (model: string) => Date.now() < pauseEnd(model);

/** ชื่อตัวอ่านใน log — รุ่นที่อ่านจริง และรุ่นแรกที่อ่านไม่ผ่าน (ถ้ามี) */
const readerOf = (read: AiRead) =>
  read.escalated ? `AI (${read.escalated.model} อ่านไม่ผ่าน: ${read.escalated.reason} → ${read.model})` : `AI (${read.model})`;

function pauseModel(model: string, message: string) {
  const wasPaused = Date.now() < (modelPausedUntil.get(model) ?? 0);
  modelPausedUntil.set(model, Date.now() + PAUSE_MS.account);
  if (wasPaused) return;
  console.warn(`[OCR] ! รุ่น ${model} ใช้ไม่ได้ (${message}) — พักรุ่นนี้ ${PAUSE_MS.account / 60_000} นาที (รุ่นอื่นใช้ได้ตามปกติ)`);
}

function pauseProvider(provider: AiProvider, failure: Exclude<AiFailure, "image">, message: string) {
  const wasPaused = Date.now() < pausedUntil[provider];
  pausedUntil[provider] = Date.now() + PAUSE_MS[failure];
  if (wasPaused) return;
  const name = AI_PROVIDER_LABELS[provider];
  const why = failure === "account" ? "เครดิตหมดหรือ key ใช้ไม่ได้" : "ติดต่อไม่ได้";
  console.warn(`[OCR] ! ${name} ${why} (${message}) — พัก ${name} ${PAUSE_MS[failure] / 60_000} นาที`);
}

/** ตัดรุ่นของผู้ให้บริการที่พักอยู่ออก — รุ่นหลักถูกพัก = รุ่นอ่านซ้ำอ่านแทน · ไม่เหลือรุ่น = null */
function usableModels({ model, strongModel }: OcrModels): OcrModels | null {
  const strong = strongModel && strongModel !== model && !isPaused(strongModel) ? strongModel : "";
  if (!isPaused(model)) return { model, strongModel: strong };
  return strong ? { model: strong, strongModel: "" } : null;
}

/** อ่านรูปด้วย AI — strong = คนสั่งอ่านใหม่จากหน้าโพย (ใช้รุ่นอ่านซ้ำเลย) · models = รุ่นที่แม่หวยเลือก · onModel = เรียกก่อนเริ่มอ่านด้วยแต่ละรุ่น */
async function readWithAi(
  data: Uint8Array,
  mimeType: string,
  strong: boolean,
  models: OcrModels,
  onModel: (model: string) => Promise<void>,
): Promise<AiRead> {
  if (!clients.claude && !clients.ollama) throw new BadImageError("ANTHROPIC_API_KEY / OLLAMA_API_KEY is not set");
  const usable = usableModels(models);
  if (!usable) throw new PausedError(`AI paused (${models.model})`);
  try {
    return await readSlipImage(clients, data, mimeType, { strong, onModel, models: usable });
  } catch (error) {
    const failure = aiFailure(error);
    const provider = failureProvider(error);
    if (failure === "image" || !provider) throw new BadImageError(`AI: ${messageOf(error)}`);
    if (failure === "account") {
      const model = unusableModel(error);
      if (model) pauseModel(model, messageOf(error));
      else pauseProvider(provider, failure, messageOf(error));
      throw new PausedError(messageOf(error));
    }
    throw error;
  }
}

/** รูปที่ติดพัก — รอจนผู้ให้บริการรายแรกที่ใช้ได้พักเสร็จ */
function pauseDelay(models: OcrModels) {
  const ends = [models.model, models.strongModel].filter(Boolean).map(pauseEnd);
  return Math.max(RETRY_MS, Math.min(...ends) - Date.now());
}

/** หน้าโพยขึ้นว่ากำลังอ่านด้วยรุ่นไหน (ticket_images.ocrReader) — บันทึกไม่ได้ก็อ่านต่อ */
async function markReader(ticketId: string, reader: string) {
  try {
    await prisma.ticketImage.updateMany({ where: { ticketId, ocrStatus: "PENDING" }, data: { ocrReader: reader } });
  } catch (error) {
    console.error(`[OCR] บันทึกตัวอ่านของโพย ${ticketId} ไม่สำเร็จ`, error);
  }
}

/** ตั้งเวลาให้รูปกลับเข้าคิว — ระหว่างรอ ไม่ให้รอบดึงคำสั่งจากหน้าเว็บ (pollRequests) หยิบรูปนี้เข้าคิวก่อนเวลา */
function retryLater(ticketId: string, delayMs: number) {
  retrying.add(ticketId);
  setTimeout(() => {
    retrying.delete(ticketId);
    enqueueOcr(ticketId);
  }, delayMs);
}

async function ocrTicketImage(ticketId: string) {
  const image = await prisma.ticketImage.findUnique({
    where: { ticketId },
    select: {
      path: true,
      mimeType: true,
      ocrStatus: true,
      ocrEngine: true,
      ticket: { select: { draw: { select: { dealer: { select: { ocrModel: true, ocrStrongModel: true } } } } } },
    },
  });
  if (!image || image.ocrStatus !== "PENDING") return;

  const models = resolveOcrModels(image.ticket.draw.dealer);
  try {
    const started = Date.now();
    const data = image.path ? await readTicketImage(image.path) : null;
    if (!data) throw new BadImageError(`image file missing: ${image.path ?? "(no path)"}`);
    // คนสั่งอ่านใหม่จากหน้าโพย (ocrEngine ตั้งไว้) = รุ่นอ่านซ้ำเลย
    const read = await readWithAi(data, image.mimeType, image.ocrEngine !== null, models, (model) =>
      markReader(ticketId, model),
    );
    const result = await applyOcr(prisma, ticketId, { text: read.text, ocr: read });
    attempts.delete(ticketId);
    const lines = read.text ? read.text.split("\n").filter(Boolean).length : 0;
    log(
      `[OCR] ${readerOf(read)} อ่านรูปของโพย ${ticketId} แล้ว ${lines} บรรทัด (${((Date.now() - started) / 1000).toFixed(1)} วินาที) — ${result.action}`,
    );
  } catch (error) {
    if (error instanceof PausedError) return retryLater(ticketId, pauseDelay(models));

    const message = messageOf(error);
    const tried = (attempts.get(ticketId) ?? 0) + 1;
    if (error instanceof BadImageError || tried >= MAX_ATTEMPTS) {
      attempts.delete(ticketId);
      await applyOcr(prisma, ticketId, { error: message });
      console.warn(`[OCR] ! อ่านรูปของโพย ${ticketId} ไม่ได้ (${message}) — ต้องดูรูปแล้วพิมพ์เองในโพยรอตรวจ`);
      return;
    }

    attempts.set(ticketId, tried);
    console.warn(`[OCR] ติดต่อ AI (${models.model}) ไม่ได้ (${message}) — ลองใหม่ใน ${RETRY_MS / 1000} วินาที (ครั้งที่ ${tried})`);
    retryLater(ticketId, RETRY_MS);
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
  const ready = (Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).filter((provider) => clients[provider]);
  if (ready.length > 0) {
    const names = ready.map((provider) => AI_PROVIDER_LABELS[provider]).join(" + ");
    log(`[OCR] อ่านรูปด้วย ${names} (ค่าเริ่มต้น ${AUTO}) พร้อมกัน ${CONCURRENCY} รูป`);
  } else {
    console.warn("[OCR] ! ไม่ได้ตั้ง ANTHROPIC_API_KEY หรือ OLLAMA_API_KEY — อ่านรูปโพยไม่ได้ รูปที่เข้าคิวต้องให้คนตรวจเอง");
  }
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
