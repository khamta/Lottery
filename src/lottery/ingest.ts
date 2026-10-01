import type { Prisma, PrismaClient } from "@prisma/client";

import { logAudit } from "@/lib/audit";
import { DEFAULT_LAK_MULTIPLIER, parseTicket } from "./parser";
import { isTicketMessage, readTicketText, type TicketStatusValue } from "./ticket";

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
      action: "created" | "recovered" | "undecryptable" | "total-attached" | "edited";
      ticketId: string;
      status: TicketStatusValue;
    }
  | { action: "revoked"; ticketId: string }
  | { action: "skipped"; reason: SkipReason };

/** ข้อความยอดรวมต้องตามหลังโพยไม่เกินเท่านี้ จึงถือว่าเป็นของโพยนั้น */
export const TOTAL_WINDOW_MS = 10 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type Read = NonNullable<ReturnType<typeof readTicketText>>;

const summaryOf = (text: string) => text.split("\n")[0]!.slice(0, 60);

/** โพยที่บอทสร้างไว้แทนข้อความที่ถอดรหัสไม่ได้: รอตรวจ + ข้อความว่าง */
const isPlaceholder = (ticket: { status: string; rawText: string }) =>
  ticket.status === "REVIEW" && ticket.rawText === "";

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

/** ข้อความที่มีแต่ยอดรวม → ต่อท้ายโพยล่าสุดของคนเดิม แล้วอ่านใหม่ (ยอดไม่ตรง = กลับไปรอตรวจ) */
async function attachTotal(db: PrismaClient, message: IncomingMessage): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const at = message.sentAt ?? new Date();
    const before = await tx.ticket.findFirst({
      where: {
        source: "WHATSAPP",
        senderId: message.senderId,
        createdAt: { gte: new Date(at.getTime() - TOTAL_WINDOW_MS) },
        draw: { dealerId: message.dealerId, status: "OPEN" },
      },
      orderBy: { createdAt: "desc" },
    });
    // ไม่มีโพยให้ต่อ, โพยนั้นยังไม่มีข้อความ หรือมียอดรวมอยู่แล้ว → ไม่ใช่ยอดรวมของโพยนี้
    if (!before || isPlaceholder(before) || parseTicket(before.rawText).declaredTotal !== null) {
      return { action: "skipped", reason: "not-ticket" };
    }

    const read = readTicketText(`${before.rawText}\n${message.text}`, before.lakMultiplier);
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
