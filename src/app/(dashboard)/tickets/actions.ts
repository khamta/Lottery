"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import { requireAdminAccess } from "@/lottery/access";
import { acceptsTickets } from "@/lottery/draw-status";
import { nextBillNo } from "@/lottery/bill";
import { requireDealerId } from "@/lottery/dealer";
import { DEFAULT_LAK_MULTIPLIER } from "@/lottery/parser";
import { removeTicketImage, saveTicketImage } from "@/lottery/image-store";
import { replaceImageAndReread, requestImageReread, rulesOf, type RereadSkip } from "@/lottery/ingest";
import { readTicketText } from "@/lottery/ticket";
import {
  createTicketSchema,
  deleteTicketSchema,
  deleteTicketsSchema,
  editTicketImageSchema,
  rereadDrawImagesSchema,
  rereadTicketImageSchema,
  updateTicketSchema,
  type EditedImageMime,
  type TicketInput,
} from "@/lib/validations/ticket";
import { REREAD_DRAW_MAX, rereadableWhere } from "./filters";

/**
 * โพย = ข้อความ 1 ข้อความ — server แยกรายการจากข้อความเองทุกครั้ง (ไม่เชื่อผลที่ client แยก)
 * รายการแทง (bets) มีเฉพาะของโพยที่นับยอดแล้ว: แก้โพย = ลบรายการเดิมแล้วสร้างใหม่จากข้อความ
 * เขียนได้เฉพาะงวดที่ยังเปิดรับ — งวดที่ปิดแล้วยอดต้องนิ่ง
 * โพย งวด และลูกค้า ต้องเป็นของแม่หวยที่เลือกอยู่ทั้งหมด (โพยเป็นของแม่หวยผ่านงวด)
 */

/** ข้อความโพย → ข้อมูลที่จะบันทึก + รายการแทงที่นับยอด */
async function readTicket(tx: Prisma.TransactionClient, input: TicketInput, dealerId: string) {
  const draw = await tx.draw.findFirst({ where: { id: input.drawId, dealerId }, select: { status: true, closesAt: true } });
  if (!draw) throw new Error("tickets.drawNotFound");
  if (!acceptsTickets(draw)) throw new Error("tickets.drawNotOpen");

  const customer = input.customerId
    ? await tx.customer.findFirst({
        where: { id: input.customerId, dealerId },
        select: { id: true, lakMultiplier: true },
      })
    : null;
  if (input.customerId && !customer) throw new Error("tickets.customerNotFound");

  // เงื่อนไขอ่านโพยที่ผู้ใช้กำหนดเองของแม่หวย (หน้า /read-rules)
  const rules = await rulesOf(tx, dealerId);
  const read = readTicketText(input.text, { lakMultiplier: customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER, rules }, input.force);
  if (!read) throw new Error("tickets.noBets");

  return {
    data: {
      ...read.fields,
      drawId: input.drawId,
      customerId: customer?.id ?? null,
      note: input.note || null,
    },
    bets: read.bets.map((bet) => ({ ...bet, drawId: input.drawId })),
  };
}

/** ป้ายใน audit log = บรรทัดแรกของข้อความ */
const summaryOf = (ticket: { rawText: string }) => ticket.rawText.split("\n")[0]!.slice(0, 60);

/** ยอดโพยมีผลกับรายงาน dashboard และจำนวนโพยในหน้างวด/ลูกค้า */
function revalidateTickets() {
  for (const path of ["/tickets", "/reports", "/dashboard", "/draws", "/customers"]) revalidatePath(path);
}

export const createTicket = createAction(
  createTicketSchema,
  async (input) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const ticket = await prisma.$transaction(async (tx) => {
      const { data, bets } = await readTicket(tx, input, dealerId);

      const billNo = await nextBillNo(tx);
      const ticket = await tx.ticket.create({ data: { ...data, billNo, source: "MANUAL", createdById: user.id } });
      if (bets.length > 0) {
        await tx.bet.createMany({ data: bets.map((bet) => ({ ...bet, ticketId: ticket.id })) });
      }

      await logAudit(tx, {
        action: "CREATE",
        entity: "Ticket",
        entityId: ticket.id,
        summary: summaryOf(ticket),
        after: ticket,
        user,
      });

      return ticket;
    });

    revalidateTickets();
    return { id: ticket.id, status: ticket.status };
  },
  { successMessage: "tickets.created" },
);

export const updateTicket = createAction(
  updateTicketSchema,
  async ({ id, ...input }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const ticket = await prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findFirst({
        where: { id, draw: { dealerId } },
        include: { draw: { select: { status: true, closesAt: true } } },
      });
      if (!existing) throw new Error("tickets.notFound");
      const { draw, ...before } = existing;
      if (!acceptsTickets(draw)) throw new Error("tickets.drawNotOpen");

      const { data, bets } = await readTicket(tx, input, dealerId);

      await tx.bet.deleteMany({ where: { ticketId: id } });
      const ticket = await tx.ticket.update({ where: { id }, data });
      if (bets.length > 0) {
        await tx.bet.createMany({ data: bets.map((bet) => ({ ...bet, ticketId: id })) });
      }

      await logAudit(tx, {
        action: "UPDATE",
        entity: "Ticket",
        entityId: ticket.id,
        summary: summaryOf(ticket),
        before,
        after: ticket,
        user,
      });

      return ticket;
    });

    revalidateTickets();
    return { id: ticket.id, status: ticket.status };
  },
  { successMessage: "tickets.updated" },
);

export const deleteTicket = createAction(
  deleteTicketSchema,
  async ({ id }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findFirst({
        where: { id, draw: { dealerId } },
        include: { draw: { select: { status: true, closesAt: true } } },
      });
      if (!existing) throw new Error("tickets.notFound");
      const { draw, ...before } = existing;
      if (!acceptsTickets(draw)) throw new Error("tickets.drawNotOpen");

      // รายการแทงของโพยถูกลบตาม (onDelete: Cascade)
      await tx.ticket.delete({ where: { id } });

      await logAudit(tx, {
        action: "DELETE",
        entity: "Ticket",
        entityId: id,
        summary: summaryOf(before),
        before,
        user,
      });
    });

    revalidateTickets();
    return { id };
  },
  { successMessage: "tickets.deleted" },
);

/** เหตุที่อ่านรูปใหม่ไม่ได้ → คีย์ i18n */
const rereadErrorKey: Record<RereadSkip, string> = {
  "not-found": "tickets.notFound",
  "no-image": "tickets.rereadNoImage",
  "not-review": "tickets.rereadNotReview",
  reading: "tickets.rereadReading",
  "draw-closed": "tickets.drawNotOpen",
};

/**
 * อ่านรูปของโพยรอตรวจใบเดียวใหม่ (ผู้ใช้ทุกคน) — รูปกลับเข้าคิวของบอทด้วยตัวอ่านที่เลือก แล้วข้อความขึ้นเองเมื่ออ่านเสร็จ
 * AI มีค่าใช้จ่าย — หน้าโพยถามยืนยันก่อนส่งมาที่นี่
 */
export const rereadTicketImage = createAction(
  rereadTicketImageSchema,
  async ({ id, engine }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const skip = await requestImageReread(prisma, id, dealerId, engine, user);
    if (skip) throw new Error(rereadErrorKey[skip]);

    revalidateTickets();
    return { id };
  },
  { successMessage: "tickets.rereadQueued" },
);

/** ไบต์แรกของไฟล์ต้องตรงกับชนิดที่บอกมา — กันไฟล์อื่นปลอมเป็นรูป */
const IMAGE_SIGNATURES: Record<EditedImageMime, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
};

/**
 * แก้รูปโพยรอตรวจ (ครอป / ยางลบ / หมุน ในหน้าแก้รูป) แล้วอ่านใหม่ด้วยตัวอ่านที่เลือก (ผู้ใช้ทุกคน)
 * บันทึกไฟล์ใหม่ก่อน แล้วเปลี่ยนรูป + เข้าคิวอ่านใน transaction เดียว — สั่งไม่ได้ = ลบไฟล์ใหม่ทิ้ง รูปเดิมไม่ถูกแตะ
 * รูปต้นฉบับเก็บไว้เสมอ (ย้อนกลับไปแก้จากต้นฉบับได้) · AI มีค่าใช้จ่าย — หน้าโพยถามยืนยันก่อนส่งมาที่นี่
 */
export const editTicketImage = createAction(
  editTicketImageSchema,
  async ({ id, engine, mimeType, data }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const bytes = new Uint8Array(Buffer.from(data, "base64"));
    if (!IMAGE_SIGNATURES[mimeType].every((byte, index) => bytes[index] === byte)) {
      throw new Error("tickets.validation.imageInvalid");
    }

    const path = await saveTicketImage(bytes, mimeType);
    let result: Awaited<ReturnType<typeof replaceImageAndReread>>;
    try {
      result = await replaceImageAndReread(prisma, id, dealerId, engine, user, { path, mimeType });
    } catch (error) {
      await removeTicketImage(path).catch(() => undefined);
      throw error;
    }
    if ("skip" in result) {
      await removeTicketImage(path).catch(() => undefined);
      throw new Error(rereadErrorKey[result.skip]);
    }
    if (result.stalePath) await removeTicketImage(result.stalePath).catch(() => undefined);

    revalidateTickets();
    return { id };
  },
  { successMessage: "tickets.imageEditQueued" },
);

/**
 * อ่านรูปของโพยรอตรวจทั้งงวดใหม่ (ผู้ดูแลระบบเท่านั้น) — ทุกใบที่มีรูป ยังรอตรวจ และไม่ได้อยู่ในคิวอ่าน
 * แยก transaction ทีละใบ: ใบที่สถานะเปลี่ยนระหว่างทาง (คนเพิ่งยืนยัน) ข้ามไป ไม่ล้มทั้งชุด
 */
export const rereadDrawImages = createAction(
  rereadDrawImagesSchema,
  async ({ drawId, engine }) => {
    const user = await requireRole(["ADMIN"]);
    await requireAdminAccess(user.id);
    const dealerId = await requireDealerId(user.id);

    const draw = await prisma.draw.findFirst({ where: { id: drawId, dealerId }, select: { status: true, closesAt: true } });
    if (!draw) throw new Error("tickets.drawNotFound");
    if (!acceptsTickets(draw)) throw new Error("tickets.drawNotOpen");

    const tickets = await prisma.ticket.findMany({
      where: rereadableWhere(dealerId, drawId),
      orderBy: { createdAt: "asc" },
      take: REREAD_DRAW_MAX,
      select: { id: true },
    });
    let count = 0;
    for (const { id } of tickets) {
      if (!(await requestImageReread(prisma, id, dealerId, engine, user))) count++;
    }
    if (count === 0) throw new Error("tickets.rereadNone");

    revalidateTickets();
    return { count };
  },
  { successMessage: "tickets.rereadQueuedDraw" },
);

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อโพยหนึ่งใบ */
export const deleteTickets = createAction(
  deleteTicketsSchema,
  async ({ ids }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const count = await prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: { id: { in: ids }, draw: { dealerId } },
        include: { draw: { select: { status: true, closesAt: true } } },
      });
      if (tickets.length === 0) return 0;

      // มีโพยของงวดที่ปิดแล้วปนอยู่ → ไม่ลบเลยสักใบ
      const entries = tickets.map(({ draw, ...ticket }) => {
        if (!acceptsTickets(draw)) throw new Error("tickets.drawNotOpen");
        return {
          action: "DELETE" as const,
          entity: "Ticket",
          entityId: ticket.id,
          summary: summaryOf(ticket),
          before: ticket,
          user,
        };
      });

      await tx.ticket.deleteMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } } });
      await logAuditMany(tx, entries);

      return tickets.length;
    });

    revalidateTickets();
    return { count };
  },
  { successMessage: "tickets.deletedMany" },
);
