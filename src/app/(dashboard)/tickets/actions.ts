"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { logAudit, logAuditMany } from "@/lib/audit";
import { requireDealerId } from "@/lottery/dealer";
import { DEFAULT_LAK_MULTIPLIER } from "@/lottery/parser";
import { readTicketText } from "@/lottery/ticket";
import {
  createTicketSchema,
  deleteTicketSchema,
  deleteTicketsSchema,
  updateTicketSchema,
  type TicketInput,
} from "@/lib/validations/ticket";

/**
 * โพย = ข้อความ 1 ข้อความ — server แยกรายการจากข้อความเองทุกครั้ง (ไม่เชื่อผลที่ client แยก)
 * รายการแทง (bets) มีเฉพาะของโพยที่นับยอดแล้ว: แก้โพย = ลบรายการเดิมแล้วสร้างใหม่จากข้อความ
 * เขียนได้เฉพาะงวดที่ยังเปิดรับ — งวดที่ปิดแล้วยอดต้องนิ่ง
 * โพย งวด และลูกค้า ต้องเป็นของแม่หวยที่เลือกอยู่ทั้งหมด (โพยเป็นของแม่หวยผ่านงวด)
 */

/** ข้อความโพย → ข้อมูลที่จะบันทึก + รายการแทงที่นับยอด */
async function readTicket(tx: Prisma.TransactionClient, input: TicketInput, dealerId: string) {
  const draw = await tx.draw.findFirst({ where: { id: input.drawId, dealerId }, select: { status: true } });
  if (!draw) throw new Error("tickets.drawNotFound");
  if (draw.status !== "OPEN") throw new Error("tickets.drawNotOpen");

  const customer = input.customerId
    ? await tx.customer.findFirst({
        where: { id: input.customerId, dealerId },
        select: { id: true, lakMultiplier: true },
      })
    : null;
  if (input.customerId && !customer) throw new Error("tickets.customerNotFound");

  const read = readTicketText(input.text, customer?.lakMultiplier ?? DEFAULT_LAK_MULTIPLIER, input.force);
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

      const ticket = await tx.ticket.create({ data: { ...data, source: "MANUAL", createdById: user.id } });
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
        include: { draw: { select: { status: true } } },
      });
      if (!existing) throw new Error("tickets.notFound");
      const { draw, ...before } = existing;
      if (draw.status !== "OPEN") throw new Error("tickets.drawNotOpen");

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
        include: { draw: { select: { status: true } } },
      });
      if (!existing) throw new Error("tickets.notFound");
      const { draw, ...before } = existing;
      if (draw.status !== "OPEN") throw new Error("tickets.drawNotOpen");

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

/** ลบรายการที่เลือกจากตาราง (checkbox) ในคำสั่งเดียว — audit หนึ่งแถวต่อโพยหนึ่งใบ */
export const deleteTickets = createAction(
  deleteTicketsSchema,
  async ({ ids }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);

    const count = await prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.findMany({
        where: { id: { in: ids }, draw: { dealerId } },
        include: { draw: { select: { status: true } } },
      });
      if (tickets.length === 0) return 0;

      // มีโพยของงวดที่ปิดแล้วปนอยู่ → ไม่ลบเลยสักใบ
      const entries = tickets.map(({ draw, ...ticket }) => {
        if (draw.status !== "OPEN") throw new Error("tickets.drawNotOpen");
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
