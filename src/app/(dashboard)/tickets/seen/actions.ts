"use server";

/**
 * @audit-exempt — "ดูโพยถึงเวลาไหนแล้ว" เป็นที่คั่นการอ่านส่วนตัวของผู้ใช้ (เหมือนจุดอ่านแล้วของแอปแชท)
 * ไม่ใช่ข้อมูลธุรกิจ และถูกกดบ่อยมาก ถ้าบันทึกลง audit log จะกลบประวัติการแก้โพยจริงจนหาไม่เจอ
 * แยกไฟล์ไว้ให้ป้ายนี้ไม่ครอบ action ของโพยใน ../actions.ts (ซึ่งต้องมี audit log ทุกตัว)
 */
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAction } from "@/lib/action";
import { requireDealerId } from "@/lottery/dealer";
import { markTicketsSeenSchema } from "@/lib/validations/ticket";

/**
 * กด "ดูทั้งหมดแล้ว" — จำเวลาที่ดูของแต่ละกลุ่ม (ของผู้ใช้คนนี้ ในแม่หวยที่เลือกอยู่)
 * เวลาที่ส่งมาเกินเวลาปัจจุบันถูกตัดเหลือเวลาปัจจุบัน · ไม่ถอยเวลาที่เคยดูไปแล้วกลับ (กดจากแท็บเก่าก็ไม่ทำให้โพยกลับมาเป็นยังไม่ได้ดู)
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
    });

    revalidatePath("/tickets");
    return { count: keys.length };
  },
  { successMessage: "tickets.seenAll" },
);
