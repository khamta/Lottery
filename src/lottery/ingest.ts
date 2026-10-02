import type { Prisma, PrismaClient } from "@prisma/client";

import { logAudit } from "@/lib/audit";
import { DEFAULT_LAK_MULTIPLIER, parseTicket } from "./parser";
import { isTicketMessage, readImageTicketText, readTicketText, type TicketRecord, type TicketStatusValue } from "./ticket";

/**
 * นำข้อความจากกลุ่ม WhatsApp เข้าระบบเป็นโพย — บอท (worker/whatsapp.ts) เรียกใช้
 * ไม่ผูกกับไลบรารี WhatsApp: รับข้อความที่แปลงเป็นรูปแบบกลางแล้ว จึงเทสต์ได้โดยไม่ต้องต่อ WhatsApp จริง
 *
 * กติกา
 *  - ข้อความเป็นของแม่หวยที่กลุ่มนั้นผูกไว้ (dealerId) — งวดและลูกค้าที่จับคู่มาจากแม่หวยนั้นเท่านั้น
 *  - ข้อความลงงวดที่เปิดรับล่าสุดของแม่หวยเท่านั้น (ไม่มีงวดเปิด = ไม่นำเข้า)
 *  - อ่านได้ไม่ครบ = โพยรอตรวจ ยังไม่นับยอด (บอทไม่เดา และไม่ยืนยันแทนคน)
 *  - ข้อความที่มีแต่ยอดรวม (ລວມ150) ต่อท้ายโพยล่าสุดของคนเดิม เพื่อใช้ตรวจยอด
 *  - ข้อความที่ WhatsApp ถอดรหัสไม่ได้ = โพยรอตรวจที่ข้อความว่าง ให้คนดูแชตแล้ววางข้อความเอง
 *    (ไม่ปล่อยให้โพยหายเงียบ ๆ) — ถ้าข้อความจริงตามมาทีหลัง ระบบเติมให้เอง
 *  - รูปโพย: เก็บรูปเข้าระบบก่อน (โพยรอตรวจ ข้อความ = คำบรรยายรูป) แล้วบอทค่อยอ่านรูปด้วย OCR ตามคิว
 *    ได้ข้อความแล้วอ่านเหมือนข้อความในแชตทั่วไป: อ่านได้ครบ = นับยอดเลย · มีบรรทัดที่อ่านไม่ออก = รอตรวจกับรูป
 *  - audit log บันทึกในนาม "ระบบ" (ไม่มี user)
 */

export type MessageSender = {
  /** JID ของคนส่งในกลุ่ม */
  senderId: string;
  /** เบอร์คนส่ง ตัวเลขล้วน (null = WhatsApp ไม่เปิดเผยเบอร์) — ใช้จับคู่กับลูกค้า */
  senderPhone: string | null;
  senderName: string | null;
};

type MessageMeta = MessageSender & {
  /** รหัสข้อความ WhatsApp — กันนำเข้าซ้ำ */
  id: string;
  /** แม่หวยที่กลุ่มของข้อความนี้ผูกไว้ */
  dealerId: string;
  /** เวลาที่ส่งในแชต — ไม่ระบุ = ตอนนี้ */
  sentAt?: Date;
  /** ข้อความที่ส่งมาระหว่างบอทไม่ได้ออนไลน์ (WhatsApp ส่งตามมาตอนต่อใหม่) */
  offline?: boolean;
};

export type IncomingMessage = MessageMeta & { text: string };

export type IncomingImage = MessageMeta & {
  image: { data: Uint8Array<ArrayBuffer>; mimeType: string };
  /** คำบรรยายใต้รูป (ว่างได้) — ต่อท้ายข้อความที่อ่านจากรูป */
  caption: string;
};

/** ผลอ่านรูปจากบริการ OCR — text = ข้อความโพยที่แปลงแล้ว (ดู image-text.ts) */
export type OcrOutcome = { text: string; ocr: Prisma.InputJsonValue } | { error: string };

export type SkipReason =
  | "not-ticket"
  | "duplicate"
  | "no-open-draw"
  /** ข้อความค้างส่งที่ส่งมาก่อนงวดปัจจุบันจะเปิด — เป็นของงวดก่อน */
  | "before-draw"
  | "unknown-message"
  | "draw-closed";

export type IngestResult =
  | {
      action: "created" | "recovered" | "undecryptable" | "total-attached" | "edited" | "image" | "ocr" | "ocr-failed";
      ticketId: string;
      status: TicketStatusValue;
    }
  | { action: "revoked"; ticketId: string }
  | { action: "skipped"; reason: SkipReason };

/** ข้อความยอดรวมต้องตามหลังโพยไม่เกินเท่านี้ จึงถือว่าเป็นของโพยนั้น */
export const TOTAL_WINDOW_MS = 10 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type Read = TicketRecord;

const summaryOf = (text: string) => text.split("\n")[0]!.slice(0, 60);

/** โพยที่บอทสร้างไว้แทนข้อความที่ถอดรหัสไม่ได้: รอตรวจ + ข้อความว่าง (โพยจากรูปที่ยังไม่ได้อ่านก็ข้อความว่าง จึงต้องเช็ครูปด้วย) */
const isPlaceholder = (ticket: { status: string; rawText: string }, hasImage = false) =>
  !hasImage && ticket.status === "REVIEW" && ticket.rawText === "";

/** โพยจากรูปที่ OCR ยังไม่ได้อ่าน ต้องคงสถานะรอรูปไว้ — นอกนั้น (รวมโพยจากรูปที่อ่านแล้ว) อ่านตามข้อความปกติ */
const reread = (text: string, lakMultiplier: number, imagePending: boolean) =>
  imagePending ? readImageTicketText(text, lakMultiplier) : readTicketText(text, lakMultiplier);

const hasIssue = (issues: Prisma.JsonValue, code: string) =>
  Array.isArray(issues) && issues.some((issue) => (issue as { code?: string } | null)?.code === code);

/** บรรทัดยอดรวมที่ image-text.ts ใส่ไว้ท้ายข้อความ */
const withoutTotal = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("ລວມ"))
    .join("\n")
    .trim();

/** แทนที่รายการแทงของโพยด้วยผลการอ่านข้อความใหม่ */
async function rewriteTicket(tx: Tx, ticket: { id: string; drawId: string }, fields: Read["fields"], bets: Read["bets"]) {
  await tx.bet.deleteMany({ where: { ticketId: ticket.id } });
  const updated = await tx.ticket.update({ where: { id: ticket.id }, data: fields });
  if (bets.length > 0) {
    await tx.bet.createMany({ data: bets.map((bet) => ({ ...bet, ticketId: ticket.id, drawId: ticket.drawId })) });
  }
  return updated;
}

/** โพยรอตรวจที่ไม่มีรายการแทง — text ว่าง = ข้อความที่ถอดรหัสไม่ได้ */
function unreadable(text: string, lakMultiplier: number): Read {
  return {
    fields: {
      status: "REVIEW",
      rawText: text,
      lakMultiplier,
      issues: [{ code: "UNREADABLE", line: 0, text: summaryOf(text) }],
      totalLak: 0,
      totalThb: 0,
      betCount: 0,
    },
    bets: [],
  };
}

/** งวดที่จะลงโพย + ลูกค้าที่ตรงกับเบอร์คนส่ง (ของแม่หวยเดียวกัน) — คืนเหตุผลเมื่อไม่ควรนำเข้า */
async function findTarget(tx: Tx, message: MessageMeta) {
  const draw = await tx.draw.findFirst({
    where: { dealerId: message.dealerId, status: "OPEN" },
    orderBy: { drawDate: "desc" },
    select: { id: true, createdAt: true },
  });
  if (!draw) return { skip: "no-open-draw" } as const;
  if (message.offline && message.sentAt && message.sentAt < draw.createdAt) return { skip: "before-draw" } as const;

  const customer = message.senderPhone
    ? await tx.customer.findUnique({
        where: { dealerId_phone: { dealerId: message.dealerId, phone: message.senderPhone } },
        select: { id: true, lakMultiplier: true },
      })
    : null;

  return { skip: null, draw, customer };
}

/** สร้างโพยจาก WhatsApp พร้อมรายการแทงและ audit log */
async function createTicket(tx: Tx, message: MessageMeta, drawId: string, customerId: string | null, read: Read) {
  const ticket = await tx.ticket.create({
    data: {
      ...read.fields,
      drawId,
      customerId,
      source: "WHATSAPP",
      waMessageId: message.id,
      senderId: message.senderId,
      senderName: message.senderName ?? message.senderPhone,
      // เวลาของโพย = เวลาที่ส่งในแชต (ข้อความค้างส่งจะไม่ถูกลงเวลาเป็นตอนที่บอทกลับมาออนไลน์)
      ...(message.sentAt ? { createdAt: message.sentAt } : {}),
    },
  });
  if (read.bets.length > 0) {
    await tx.bet.createMany({ data: read.bets.map((bet) => ({ ...bet, ticketId: ticket.id, drawId })) });
  }

  await logAudit(tx, {
    action: "CREATE",
    entity: "Ticket",
    entityId: ticket.id,
    summary: summaryOf(ticket.rawText) || ticket.senderName,
    after: ticket,
  });

  return ticket;
}

export async function ingestMessage(db: PrismaClient, message: IncomingMessage): Promise<IngestResult> {
  const probe = parseTicket(message.text);
  const isTicket = isTicketMessage(probe);

  const result = await db.$transaction(async (tx): Promise<IngestResult | null> => {
    const existing = await tx.ticket.findUnique({
      where: { waMessageId: message.id },
      include: { draw: { select: { status: true } } },
    });

    if (existing) {
      const { draw, ...before } = existing;
      if (!isPlaceholder(before)) return { action: "skipped", reason: "duplicate" };
      if (draw.status !== "OPEN") return { action: "skipped", reason: "draw-closed" };

      // ข้อความจริงของโพยที่เคยถอดรหัสไม่ได้มาถึงแล้ว
      if (!isTicket) {
        await tx.ticket.delete({ where: { id: before.id } });
        await logAudit(tx, {
          action: "DELETE",
          entity: "Ticket",
          entityId: before.id,
          summary: before.senderName,
          before,
        });
        return null;
      }

      // isTicket ไม่ขึ้นกับตัวคูณ จึงไม่มีทางเป็น null ตรงนี้
      const read = readTicketText(message.text, before.lakMultiplier)!;
      const ticket = await rewriteTicket(tx, before, read.fields, read.bets);
      await logAudit(tx, {
        action: "UPDATE",
        entity: "Ticket",
        entityId: ticket.id,
        summary: summaryOf(ticket.rawText),
        before,
        after: ticket,
      });
      return { action: "recovered", ticketId: ticket.id, status: ticket.status };
    }

    if (!isTicket) return null;

    const target = await findTarget(tx, message);
    if (target.skip) return { action: "skipped", reason: target.skip };

    const read = readTicketText(message.text, target.customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER)!;
    const ticket = await createTicket(tx, message, target.draw.id, target.customer?.id ?? null, read);
    return { action: "created", ticketId: ticket.id, status: ticket.status };
  });

  if (result) return result;
  return probe.declaredTotal !== null ? attachTotal(db, message) : { action: "skipped", reason: "not-ticket" };
}

/**
 * WhatsApp ถอดรหัสข้อความนี้ไม่ได้ (และขอส่งใหม่แล้วไม่สำเร็จ) → สร้างโพยรอตรวจที่ข้อความว่าง
 * เพื่อให้คนเห็นในคิวรอตรวจ แล้วดูข้อความจริงในแชตมาวางเอง
 */
export async function ingestUndecryptable(db: PrismaClient, message: MessageMeta): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const duplicate = await tx.ticket.findUnique({ where: { waMessageId: message.id }, select: { id: true } });
    if (duplicate) return { action: "skipped", reason: "duplicate" };

    const target = await findTarget(tx, message);
    if (target.skip) return { action: "skipped", reason: target.skip };

    const read = unreadable("", target.customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER);
    const ticket = await createTicket(tx, message, target.draw.id, target.customer?.id ?? null, read);
    return { action: "undecryptable", ticketId: ticket.id, status: ticket.status };
  });
}

/**
 * รูปโพยจากกลุ่ม → เก็บรูปเข้าระบบก่อน เป็นโพยรอตรวจที่ข้อความ = คำบรรยายรูป (OCR ยังไม่ได้อ่าน)
 * บอทส่งรูปเข้าคิว OCR ต่อเอง แล้วเรียก applyOcr เมื่ออ่านเสร็จ — รูปจึงไม่หายแม้บริการ OCR ล่มหรือบอทรีสตาร์ต
 */
export async function ingestImage(db: PrismaClient, message: IncomingImage): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const imageData = { mimeType: message.image.mimeType, data: message.image.data };
    const existing = await tx.ticket.findUnique({
      where: { waMessageId: message.id },
      include: { draw: { select: { status: true } }, image: { select: { id: true } } },
    });

    if (existing) {
      const { draw, image, ...before } = existing;
      if (!isPlaceholder(before, !!image)) return { action: "skipped", reason: "duplicate" };
      if (draw.status !== "OPEN") return { action: "skipped", reason: "draw-closed" };

      // ข้อความที่เคยถอดรหัสไม่ได้ จริง ๆ แล้วเป็นรูป
      const read = readImageTicketText(message.caption, before.lakMultiplier);
      const ticket = await rewriteTicket(tx, before, read.fields, read.bets);
      await tx.ticketImage.create({ data: { ...imageData, ticketId: ticket.id } });
      await logAudit(tx, {
        action: "UPDATE",
        entity: "Ticket",
        entityId: ticket.id,
        summary: summaryOf(ticket.rawText) || ticket.senderName,
        before,
        after: ticket,
      });
      return { action: "recovered", ticketId: ticket.id, status: ticket.status };
    }

    const target = await findTarget(tx, message);
    if (target.skip) return { action: "skipped", reason: target.skip };

    const read = readImageTicketText(message.caption, target.customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER);
    const ticket = await createTicket(tx, message, target.draw.id, target.customer?.id ?? null, read);
    await tx.ticketImage.create({ data: { ...imageData, ticketId: ticket.id } });
    return { action: "image", ticketId: ticket.id, status: ticket.status };
  });
}

/**
 * OCR อ่านรูปเสร็จ → เอาข้อความที่แปลงได้ใส่หน้าข้อความเดิมของโพย (คำบรรยายรูป / ยอดรวมที่ส่งตามมา)
 * แล้วอ่านเหมือนข้อความในแชตทั่วไป: อ่านได้ครบทุกบรรทัด = นับยอดเลย · มีบรรทัดที่อ่านไม่ออก/ยอดรวมไม่ตรง = รอตรวจกับรูป
 * ไม่ได้อะไรที่เป็นโพยเลย = ยังรอคนดูรูป
 * คนบันทึกโพยไปก่อนแล้ว (พิมพ์เองระหว่างรอคิว) หรืองวดปิดแล้ว → เก็บผล OCR ไว้เฉย ๆ ไม่แตะข้อความที่คนแก้
 */
export async function applyOcr(db: PrismaClient, ticketId: string, outcome: OcrOutcome): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: { draw: { select: { status: true } }, image: { select: { ocrStatus: true } } },
    });
    if (!existing?.image) return { action: "skipped", reason: "unknown-message" };
    const { draw, image, ...before } = existing;
    const ocrAt = new Date();

    if ("error" in outcome) {
      await tx.ticketImage.update({
        where: { ticketId },
        data: { ocrStatus: "FAILED", ocrError: outcome.error.slice(0, 500), ocrAt },
      });
      return { action: "ocr-failed", ticketId, status: before.status };
    }

    await tx.ticketImage.update({
      where: { ticketId },
      data: { ocrStatus: "DONE", ocr: outcome.ocr, ocrError: null, ocrAt },
    });
    // คนบันทึกผ่านหน้าโพยแล้ว = อ่านด้วยกติกาข้อความปกติ issue FROM_IMAGE จึงหายไป
    const untouched = image.ocrStatus === "PENDING" && hasIssue(before.issues, "FROM_IMAGE") && draw.status === "OPEN";
    if (!untouched || !outcome.text.trim()) return { action: "ocr", ticketId, status: before.status };

    // ยอดรวมที่ส่งตามรูปมาเป็นข้อความเชื่อได้กว่ายอดที่ OCR อ่านจากรูป — ไม่ให้นับยอดรวมซ้ำสองครั้ง
    const fromImage = parseTicket(before.rawText).declaredTotal !== null ? withoutTotal(outcome.text) : outcome.text;
    const text = [fromImage, before.rawText].filter(Boolean).join("\n\n");
    const read = readTicketText(text, before.lakMultiplier) ?? readImageTicketText(text, before.lakMultiplier);
    const ticket = await rewriteTicket(tx, before, read.fields, read.bets);

    await logAudit(tx, {
      action: "UPDATE",
      entity: "Ticket",
      entityId: ticket.id,
      summary: summaryOf(ticket.rawText),
      before,
      after: ticket,
    });

    return { action: "ocr", ticketId: ticket.id, status: ticket.status };
  });
}

/** ข้อความที่มีแต่ยอดรวม → ต่อท้ายโพยล่าสุดของคนเดิม แล้วอ่านใหม่ (ยอดไม่ตรง = กลับไปรอตรวจ) */
async function attachTotal(db: PrismaClient, message: IncomingMessage): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const at = message.sentAt ?? new Date();
    const found = await tx.ticket.findFirst({
      where: {
        source: "WHATSAPP",
        senderId: message.senderId,
        createdAt: { gte: new Date(at.getTime() - TOTAL_WINDOW_MS) },
        draw: { dealerId: message.dealerId, status: "OPEN" },
      },
      orderBy: { createdAt: "desc" },
      include: { image: { select: { id: true } } },
    });
    if (!found) return { action: "skipped", reason: "not-ticket" };
    const { image, ...before } = found;
    // โพยนั้นยังไม่มีข้อความ (ถอดรหัสไม่ได้) หรือมียอดรวมอยู่แล้ว → ไม่ใช่ยอดรวมของโพยนี้
    // โพยจากรูปต่อได้แม้ยังไม่ได้อ่านรูป — ยอดรวมมักส่งตามรูปมาทันที ก่อน OCR อ่านเสร็จ
    if (isPlaceholder(before, !!image) || parseTicket(before.rawText).declaredTotal !== null) {
      return { action: "skipped", reason: "not-ticket" };
    }

    const text = before.rawText ? `${before.rawText}\n${message.text}` : message.text;
    const read = reread(text, before.lakMultiplier, !!image && hasIssue(before.issues, "FROM_IMAGE"));
    if (!read) return { action: "skipped", reason: "not-ticket" };
    const ticket = await rewriteTicket(tx, before, read.fields, read.bets);

    await logAudit(tx, {
      action: "UPDATE",
      entity: "Ticket",
      entityId: ticket.id,
      summary: summaryOf(ticket.rawText),
      before,
      after: ticket,
    });

    return { action: "total-attached", ticketId: ticket.id, status: ticket.status };
  });
}

/** ลูกค้าแก้ข้อความในแชต → อ่านโพยใหม่จากข้อความที่แก้แล้ว */
export async function editMessage(db: PrismaClient, waMessageId: string, text: string): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { waMessageId },
      include: { draw: { select: { status: true } } },
    });
    if (!existing) return { action: "skipped", reason: "unknown-message" };
    const { draw, ...before } = existing;
    if (draw.status !== "OPEN") return { action: "skipped", reason: "draw-closed" };

    // แก้จนไม่เหลือรายการแทง → เก็บเป็นโพยรอตรวจให้คนตัดสินใจ ไม่ลบเอง
    const read = readTicketText(text, before.lakMultiplier) ?? unreadable(text, before.lakMultiplier);
    const ticket = await rewriteTicket(tx, before, read.fields, read.bets);

    await logAudit(tx, {
      action: "UPDATE",
      entity: "Ticket",
      entityId: ticket.id,
      summary: summaryOf(ticket.rawText),
      before,
      after: ticket,
    });

    return { action: "edited", ticketId: ticket.id, status: ticket.status };
  });
}

/** ลูกค้าลบข้อความในแชต ("ลบสำหรับทุกคน") → ลบโพยนั้น ถ้างวดยังเปิดรับ */
export async function revokeMessage(db: PrismaClient, waMessageId: string): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { waMessageId },
      include: { draw: { select: { status: true } } },
    });
    if (!existing) return { action: "skipped", reason: "unknown-message" };
    const { draw, ...before } = existing;
    if (draw.status !== "OPEN") return { action: "skipped", reason: "draw-closed" };

    // รายการแทงของโพยถูกลบตาม (onDelete: Cascade)
    await tx.ticket.delete({ where: { id: before.id } });

    await logAudit(tx, {
      action: "DELETE",
      entity: "Ticket",
      entityId: before.id,
      summary: summaryOf(before.rawText) || before.senderName,
      before,
    });

    return { action: "revoked", ticketId: before.id };
  });
}
