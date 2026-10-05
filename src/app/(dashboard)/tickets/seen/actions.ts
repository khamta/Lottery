"use server";

/**
 * @audit-exempt — "ดูโพยแล้ว" (ทั้งทีละใบและทั้งกลุ่ม) เป็นที่คั่นการอ่านส่วนตัวของผู้ใช้ (เหมือนจุดอ่านแล้วของแอปแชท)
 * ไม่ใช่ข้อมูลธุรกิจ และเกิดบ่อยมาก ถ้าบันทึกลง audit log จะกลบประวัติการแก้โพยจริงจนหาไม่เจอ
 * แยกไฟล์ไว้ให้ป้ายนี้ไม่ครอบ action ของโพยใน ../actions.ts (ซึ่งต้องมี audit log ทุกตัว)
 */
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { requireDealerId } from "@/lottery/dealer";
import { markTicketReadSchema, markTicketsSeenSchema } from "@/lib/validations/ticket";
import { groupWhere } from "../groups";

/**
 * กด "ดูทั้งหมดแล้ว" — จำเวลาที่ดูของแต่ละกลุ่ม (ของผู้ใช้คนนี้ ในแม่หวยที่เลือกอยู่)
 * เวลาที่ส่งมาเกินเวลาปัจจุบันถูกตัดเหลือเวลาปัจจุบัน · ไม่ถอยเวลาที่เคยดูไปแล้วกลับ (กดจากแท็บเก่าก็ไม่ทำให้โพยกลับมาเป็นยังไม่ได้ดู)
 * โพยที่เคยเปิดดูทีละใบ (TicketRead) ที่เวลานี้ครอบคลุมแล้วลบทิ้ง — ไม่ต้องใช้อีก
 */
export const markTicketsSeen = createAction(
  markTicketsSeenSchema,
  async ({ groupKeys, seenAt }) => {
    const user = await requireUser();
    const dealerId = await requireDealerId(user.id);
    const at = new Date(Math.min(new Date(seenAt).getTime(), Date.now()));
    const keys = [...new Set(groupKeys)];

    await prisma.$transaction(async (tx) => {
      const existing = await tx.ticketSeen.findMany({
        where: { userId: user.id, dealerId, groupKey: { in: keys } },
        select: { groupKey: true, seenAt: true },
      });
      const seen = new Map(existing.map((row) => [row.groupKey, row.seenAt]));
      for (const groupKey of keys) {
        const before = seen.get(groupKey);
        if (before && before >= at) continue;
        await tx.ticketSeen.upsert({
          where: { userId_dealerId_groupKey: { userId: user.id, dealerId, groupKey } },
          create: { userId: user.id, dealerId, groupKey, seenAt: at },
          update: { seenAt: at },
        });
      }
      await tx.ticketRead.deleteMany({
        where: {
          userId: user.id,
          ticket: { AND: [{ draw: { dealerId } }, { createdAt: { lte: at } }, groupWhere(keys)] },
        },
      });
    });

    revalidatePath("/tickets");
    return { count: keys.length };
  },
  { successMessage: "tickets.seenAll" },
);

/**
 * เปิดหน้าตรวจโพยใบที่ยังไม่ได้ดู = ดูใบนั้นแล้ว (เฉพาะผู้ใช้คนนี้) — ไม่ revalidate:
 * หน้าโพยลดตัวนับบนจอเอง และ refresh ระหว่างที่หน้าต่างตรวจโพยเปิดอยู่ไม่จำเป็น (ครั้งถัดไปที่ server render ก็ได้ค่าจริง)
 * โพยต้องเป็นของแม่หวยที่เลือกอยู่ · เปิดซ้ำได้ไม่ error
 */
export const markTicketRead = createAction(markTicketReadSchema, async ({ id }) => {
  const user = await requireUser();
  const dealerId = await requireDealerId(user.id);

  const ticket = await prisma.ticket.findFirst({ where: { id, draw: { dealerId } }, select: { id: true } });
  if (!ticket) throw new Error("tickets.notFound");

  await prisma.ticketRead.upsert({
    where: { userId_ticketId: { userId: user.id, ticketId: ticket.id } },
    create: { userId: user.id, ticketId: ticket.id },
    update: {},
  });
  return { id: ticket.id };
});
