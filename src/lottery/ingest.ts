import type { Prisma, PrismaClient } from "@prisma/client";

import { logAudit } from "@/lib/audit";
import { nextBillNo } from "./bill";
import { acceptsTickets } from "./draw-status";
import type { LotteryTypeValue } from "./labels";
import { imageToTicketText, transcribeImage, type OcrResult } from "./image-text";
import { DEFAULT_LAK_MULTIPLIER, parseTicket } from "./parser";
import { READ_RULES_MAX, type ReadRuleSpec } from "./read-rules";
import {
  isTicketMessage,
  readImageTicketText,
  readTicketText,
  type ReadOptions,
  type TicketRecord,
  type TicketStatusValue,
} from "./ticket";

/**
 * นำข้อความจากกลุ่ม WhatsApp เข้าระบบเป็นโพย — บอท (worker/whatsapp.ts) เรียกใช้
 * ไม่ผูกกับไลบรารี WhatsApp: รับข้อความที่แปลงเป็นรูปแบบกลางแล้ว จึงเทสต์ได้โดยไม่ต้องต่อ WhatsApp จริง
 *
 * กติกา
 *  - ข้อความเป็นของแม่หวยที่กลุ่มนั้นผูกไว้ (dealerId) — งวดและลูกค้าที่จับคู่มาจากแม่หวยนั้นเท่านั้น
 *  - ข้อความลงงวดที่เปิดรับล่าสุดของแม่หวย ประเภทหวยเดียวกับกลุ่ม (ไม่มีงวดเปิด = ไม่นำเข้า)
 *    หวยเวียดนามวันเดียวเปิดได้หลายงวด (V3–V9) — กลุ่มหนึ่งผูกกับประเภทเดียว จึงไม่ปนกัน
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
  /** กลุ่ม WhatsApp (whatsapp_groups.id) ที่ข้อความนี้มา — รายงานตามบิลจัดกลุ่มตามนี้ */
  groupId?: string | null;
  /** ประเภทหวยที่กลุ่มผูกไว้ — ลงงวดที่เปิดรับของประเภทนี้ (ไม่ระบุ = หวยลาว) */
  lottery?: LotteryTypeValue;
  /** เวลาที่ส่งในแชต — ไม่ระบุ = ตอนนี้ */
  sentAt?: Date;
  /** ข้อความที่ส่งมาระหว่างบอทไม่ได้ออนไลน์ (WhatsApp ส่งตามมาตอนต่อใหม่) */
  offline?: boolean;
};

export type IncomingMessage = MessageMeta & { text: string };

export type IncomingImage = MessageMeta & {
  /** ไฟล์รูปที่บอทบันทึกลงโฟลเดอร์ uploads แล้ว (image-store.ts) — ตารางเก็บแค่ path */
  image: { path: string; mimeType: string };
  /** คำบรรยายใต้รูป (ว่างได้) — ต่อท้ายข้อความที่อ่านจากรูป */
  caption: string;
};

/** ผลอ่านรูปจากบริการ OCR — text = ข้อความโพยที่กรองตามกติกาแล้ว (ขั้นที่ 2 ของ image-text.ts) */
export type OcrOutcome = { text: string; ocr: OcrResult } | { error: string };

export type SkipReason =
  | "not-ticket"
  | "duplicate"
  | "no-open-draw"
  /** ข้อความค้างส่งที่ส่งมาก่อนงวดปัจจุบันจะเปิด — เป็นของงวดก่อน */
  | "before-draw"
  | "unknown-message"
  | "draw-closed"
  /** อ่านรูปใหม่ (reapplyOcr): คนแก้หรือยืนยันโพยนี้แล้ว — ไม่ทับงานของคน */
  | "edited-by-user"
  /** อ่านรูปใหม่ (reapplyOcr): กติกาใหม่ได้ข้อความเท่าเดิม */
  | "unchanged";

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
const reread = (text: string, options: ReadOptions, imagePending: boolean) =>
  imagePending ? readImageTicketText(text, options) : readTicketText(text, options);

const hasIssue = (issues: Prisma.JsonValue, code: string) =>
  Array.isArray(issues) && issues.some((issue) => (issue as { code?: string } | null)?.code === code);

/** บรรทัดยอดรวมที่ image-text.ts ใส่ไว้ท้ายข้อความ */
const withoutTotal = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("ລວມ"))
    .join("\n")
    .trim();

/**
 * ข้อความที่อ่านจากรูป + ข้อความที่มากับโพย (คำบรรยายใต้รูป / ยอดรวมที่ส่งตามมา)
 * ยอดรวมที่ส่งเป็นข้อความเชื่อได้กว่ายอดที่ OCR อ่านจากรูป — ไม่ให้นับยอดรวมซ้ำสองครั้ง
 */
function withImageText(ocrText: string, rest: string, options: ReadOptions, separator = "\n\n") {
  const fromImage = parseTicket(rest, options).declaredTotal !== null ? withoutTotal(ocrText) : ocrText;
  return { fromImage, text: fromImage && rest ? `${fromImage}${separator}${rest}` : fromImage || rest };
}

type RulesClient = Pick<Tx, "readRule">;

/** เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเองของแม่หวย (read-rules.ts) — ใช้ทุกครั้งที่อ่านข้อความโพย */
export function rulesOf(client: RulesClient, dealerId: string): Promise<ReadRuleSpec[]> {
  return client.readRule.findMany({
    where: { dealerId, isActive: true },
    orderBy: { createdAt: "asc" },
    take: READ_RULES_MAX,
    select: { kind: true, find: true, replace: true },
  });
}

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
    where: {
      dealerId: message.dealerId,
      status: "OPEN",
      lottery: message.lottery ?? "LAO",
      // ยังไม่ถึงเวลาออกผล ณ เวลาที่ส่งข้อความ (บอทปิดสถานะให้ตามมาไม่กี่วินาที)
      OR: [{ closesAt: null }, { closesAt: { gt: message.sentAt ?? new Date() } }],
    },
    orderBy: [{ drawDate: "desc" }, { createdAt: "desc" }],
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
      // เลขบิลตามเวลาเดียวกับเวลาของโพย
      billNo: await nextBillNo(tx, message.sentAt ?? new Date()),
      customerId,
      source: "WHATSAPP",
      waMessageId: message.id,
      senderId: message.senderId,
      senderName: message.senderName ?? message.senderPhone,
      groupId: message.groupId ?? null,
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
  const rules = await rulesOf(db, message.dealerId);
  const probe = parseTicket(message.text, { rules });
  const isTicket = isTicketMessage(probe);

  const result = await db.$transaction(async (tx): Promise<IngestResult | null> => {
    const existing = await tx.ticket.findUnique({
      where: { waMessageId: message.id },
      include: { draw: { select: { status: true, closesAt: true } } },
    });

    if (existing) {
      const { draw, ...before } = existing;
      if (!isPlaceholder(before)) return { action: "skipped", reason: "duplicate" };
      if (!acceptsTickets(draw)) return { action: "skipped", reason: "draw-closed" };

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
      const read = readTicketText(message.text, { lakMultiplier: before.lakMultiplier, rules })!;
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

    const read = readTicketText(message.text, {
      lakMultiplier: target.customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER,
      rules,
    })!;
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
 * บอทบันทึกไฟล์รูปไว้ก่อนเรียกฟังก์ชันนี้ — ผลที่ไม่ใช่ image/recovered แปลว่าไม่ได้ใช้ไฟล์นั้น บอทลบทิ้งเอง
 */
export async function ingestImage(db: PrismaClient, message: IncomingImage): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const rules = await rulesOf(tx, message.dealerId);
    const imageData = { mimeType: message.image.mimeType, path: message.image.path };
    const existing = await tx.ticket.findUnique({
      where: { waMessageId: message.id },
      include: { draw: { select: { status: true, closesAt: true } }, image: { select: { id: true } } },
    });

    if (existing) {
      const { draw, image, ...before } = existing;
      if (!isPlaceholder(before, !!image)) return { action: "skipped", reason: "duplicate" };
      if (!acceptsTickets(draw)) return { action: "skipped", reason: "draw-closed" };

      // ข้อความที่เคยถอดรหัสไม่ได้ จริง ๆ แล้วเป็นรูป
      const read = readImageTicketText(message.caption, { lakMultiplier: before.lakMultiplier, rules });
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

    const read = readImageTicketText(message.caption, {
      lakMultiplier: target.customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER,
      rules,
    });
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
      include: { draw: { select: { status: true, closesAt: true, dealerId: true } }, image: { select: { ocrStatus: true } } },
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

    const done = {
      ocrStatus: "DONE" as const,
      ocr: outcome.ocr as Prisma.InputJsonValue,
      transcript: transcribeImage(outcome.ocr),
      ocrError: null,
      ocrAt,
    };
    // คนบันทึกผ่านหน้าโพยแล้ว = อ่านด้วยกติกาข้อความปกติ issue FROM_IMAGE จึงหายไป
    const untouched = image.ocrStatus === "PENDING" && hasIssue(before.issues, "FROM_IMAGE") && draw.status === "OPEN";
    if (!untouched || !outcome.text.trim()) {
      // ocrText = "" บอกว่าข้อความของโพยยังไม่มีส่วนจากรูป — กติกาใหม่อ่านรูปได้เมื่อไหร่ reapplyOcr เติมให้
      await tx.ticketImage.update({ where: { ticketId }, data: { ...done, ocrText: untouched ? "" : null } });
      return { action: "ocr", ticketId, status: before.status };
    }

    const options = { lakMultiplier: before.lakMultiplier, rules: await rulesOf(tx, draw.dealerId) };
    const { fromImage, text } = withImageText(outcome.text, before.rawText, options);
    await tx.ticketImage.update({ where: { ticketId }, data: { ...done, ocrText: fromImage } });
    const read = readTicketText(text, options) ?? readImageTicketText(text, options);
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

/** ส่วนท้ายของข้อความโพยต่อจากข้อความที่อ่านจากรูป — null = ข้อความไม่ได้ขึ้นต้นด้วยข้อความจากรูป (คนแก้แล้ว) */
function afterImageText(rawText: string, ocrText: string) {
  if (!ocrText) return { separator: "\n\n", rest: rawText };
  if (rawText !== ocrText && !rawText.startsWith(`${ocrText}\n`)) return null;
  const tail = rawText.slice(ocrText.length);
  const separator = tail.match(/^\n*/)![0];
  return { separator, rest: tail.slice(separator.length) };
}

/**
 * กติกากรองรูปเปลี่ยน (image-text.ts) → อ่านรูปที่เก็บไว้แล้วใหม่จากผล OCR เดิม ไม่ต้องให้ OCR อ่านรูปซ้ำ — `bun run ocr:reapply`
 * ขั้นที่ 1 (transcript) อัปเดตทุกรูป · ข้อความโพยเขียนทับเฉพาะโพยที่ยังเป็นของระบบล้วน ๆ:
 * งวดยังเปิด · ไม่มีคนแก้หรือยืนยัน (audit log ที่มี user) · ข้อความยังขึ้นต้นด้วยข้อความจากรูปที่ระบบใส่ไว้ครั้งก่อน
 * ส่วนท้าย (คำบรรยายใต้รูป / ยอดรวมที่ส่งตามมา) คงไว้ตามเดิม
 */
export async function reapplyOcr(db: PrismaClient, ticketId: string): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    const existing = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        draw: { select: { status: true, closesAt: true, dealerId: true } },
        image: { select: { ocrStatus: true, ocr: true, ocrText: true } },
      },
    });
    if (!existing?.image?.ocr || existing.image.ocrStatus !== "DONE") return { action: "skipped", reason: "unknown-message" };
    const { draw, image, ...before } = existing;
    const ocr = image.ocr as unknown as OcrResult;
    const ocrText = imageToTicketText(ocr);

    await tx.ticketImage.update({ where: { ticketId }, data: { transcript: transcribeImage(ocr) } });
    if (!acceptsTickets(draw)) return { action: "skipped", reason: "draw-closed" };

    const byUser = await tx.auditLog.findFirst({
      where: { entity: "Ticket", entityId: ticketId, userId: { not: null } },
      select: { id: true },
    });
    // โพยที่อ่านก่อนมีคอลัมน์ ocrText: ข้อความจากรูปครั้งก่อน = ผลของกติกาชุดที่ใช้ตอนนั้น
    // (ใช้ได้ถ้ารันครั้งแรกก่อนเปลี่ยนกติกา) — ไม่ตรง = ถือว่าคนแก้แล้ว ไม่ทับ
    const previous =
      image.ocrText ?? [ocrText, withoutTotal(ocrText)].find((text) => afterImageText(before.rawText, text) !== null);
    const after = byUser || previous === undefined ? null : afterImageText(before.rawText, previous);
    if (!after) return { action: "skipped", reason: "edited-by-user" };

    const options = { lakMultiplier: before.lakMultiplier, rules: await rulesOf(tx, draw.dealerId) };
    const { fromImage, text } = withImageText(ocrText, after.rest, options, after.separator || "\n\n");
    await tx.ticketImage.update({ where: { ticketId }, data: { ocrText: fromImage } });
    if (text === before.rawText) return { action: "skipped", reason: "unchanged" };

    const read = readTicketText(text, options) ?? readImageTicketText(text, options);
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
    const options = { lakMultiplier: before.lakMultiplier, rules: await rulesOf(tx, message.dealerId) };
    // โพยนั้นยังไม่มีข้อความ (ถอดรหัสไม่ได้) หรือมียอดรวมอยู่แล้ว → ไม่ใช่ยอดรวมของโพยนี้
    // โพยจากรูปต่อได้แม้ยังไม่ได้อ่านรูป — ยอดรวมมักส่งตามรูปมาทันที ก่อน OCR อ่านเสร็จ
    if (isPlaceholder(before, !!image) || parseTicket(before.rawText, options).declaredTotal !== null) {
      return { action: "skipped", reason: "not-ticket" };
    }

    const text = before.rawText ? `${before.rawText}\n${message.text}` : message.text;
    const read = reread(text, options, !!image && hasIssue(before.issues, "FROM_IMAGE"));
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
      include: { draw: { select: { status: true, closesAt: true, dealerId: true } } },
    });
    if (!existing) return { action: "skipped", reason: "unknown-message" };
    const { draw, ...before } = existing;
    if (!acceptsTickets(draw)) return { action: "skipped", reason: "draw-closed" };

    // แก้จนไม่เหลือรายการแทง → เก็บเป็นโพยรอตรวจให้คนตัดสินใจ ไม่ลบเอง
    const options = { lakMultiplier: before.lakMultiplier, rules: await rulesOf(tx, draw.dealerId) };
    const read = readTicketText(text, options) ?? unreadable(text, before.lakMultiplier);
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
      include: { draw: { select: { status: true, closesAt: true } } },
    });
    if (!existing) return { action: "skipped", reason: "unknown-message" };
    const { draw, ...before } = existing;
    if (!acceptsTickets(draw)) return { action: "skipped", reason: "draw-closed" };

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

/** ผลการอ่านที่เทียบกันได้ — ข้อความเหมือนกันแต่ผลต่างกัน = เงื่อนไขที่เปลี่ยนมีผลกับโพยนี้ */
const readKey = (read: Read | null) => (read ? JSON.stringify([read.fields, read.bets]) : "");

/**
 * เงื่อนไขอ่านโพยของแม่หวยเปลี่ยน (หน้า /read-rules) → อ่านโพยในงวดที่เปิดรับใหม่ด้วยเงื่อนไขชุดใหม่
 * ข้อความของโพยไม่ถูกแก้ — เงื่อนไขใช้ตอนอ่านเท่านั้น จึงเปลี่ยนกลับได้เสมอ
 *
 * อ่านใหม่: โพยรอตรวจทุกใบ + โพยที่นับยอดแล้วที่ไม่มีคนแก้/ยืนยัน (คนยืนยันแล้ว = คนตัดสินแล้ว ไม่ทับ)
 * ไม่แตะ: งวดที่ปิดแล้ว · โพยข้อความว่าง (ถอดรหัสไม่ได้ / รูปที่ยังรอ OCR) · โพยที่เงื่อนไขใหม่ทำให้ไม่เหลืออะไรเป็นโพย
 * เขียนเฉพาะโพยที่ผลการอ่านเปลี่ยนจริง และ audit ในนามระบบ (โพยจึงยังนับว่าไม่มีคนแตะ อ่านใหม่ได้อีกเมื่อเงื่อนไขเปลี่ยน)
 * คืนจำนวนโพยที่ผลเปลี่ยน
 */
export async function rereadTickets(
  db: PrismaClient,
  dealerId: string,
  previous: readonly ReadRuleSpec[],
  rules: readonly ReadRuleSpec[],
): Promise<number> {
  const tickets = await db.ticket.findMany({
    where: { draw: { dealerId, status: "OPEN" }, rawText: { not: "" } },
    include: { image: { select: { id: true } } },
  });
  const confirmed = tickets.filter((ticket) => ticket.status === "CONFIRMED").map((ticket) => ticket.id);
  const byUser = new Set(
    confirmed.length === 0
      ? []
      : (
          await db.auditLog.findMany({
            where: { entity: "Ticket", entityId: { in: confirmed }, userId: { not: null } },
            select: { entityId: true },
          })
        ).map((row) => row.entityId),
  );

  let changed = 0;
  for (const { image, ...ticket } of tickets) {
    if (ticket.status === "CONFIRMED" && byUser.has(ticket.id)) continue;
    const imagePending = !!image && hasIssue(ticket.issues, "FROM_IMAGE");
    const read = (list: readonly ReadRuleSpec[]) =>
      reread(ticket.rawText, { lakMultiplier: ticket.lakMultiplier, rules: list }, imagePending);

    const next = read(rules);
    if (!next || readKey(next) === readKey(read(previous))) continue;

    await db.$transaction(async (tx) => {
      const updated = await rewriteTicket(tx, ticket, next.fields, next.bets);
      await logAudit(tx, {
        action: "UPDATE",
        entity: "Ticket",
        entityId: ticket.id,
        summary: summaryOf(ticket.rawText),
        before: ticket,
        after: updated,
      });
    });
    changed++;
  }
  return changed;
}
