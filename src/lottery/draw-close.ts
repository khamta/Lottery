import type { Prisma, PrismaClient } from "@prisma/client";

import { logAudit } from "@/lib/audit";

/** ปิดได้มากสุดต่อรอบ — เกินนี้รอบถัดไปปิดต่อ */
const CLOSE_BATCH = 100;

/**
 * ปิดรับงวดที่เลยเวลาออกผลแล้ว (เปิดรับ → ปิดรับ) พร้อม audit log ในนาม "ระบบ"
 * บอท WhatsApp เรียกทุกรอบ (ไม่กี่วินาที) และหน้าเว็บเรียกตอนเปิดหน้า เผื่อบอทไม่ได้ทำงาน
 * ระหว่างนั้นโพยใหม่ถูกกันด้วย acceptsTickets() อยู่แล้ว จึงไม่มีโพยหลุดเข้างวดที่เลยเวลา
 */
export async function closeExpiredDraws(
  db: PrismaClient,
  options: { dealerId?: string; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const expired = await db.draw.findMany({
    where: { status: "OPEN", closesAt: { lte: now }, ...(options.dealerId ? { dealerId: options.dealerId } : {}) },
    take: CLOSE_BATCH,
    select: { id: true },
  });

  let closed = 0;
  for (const { id } of expired) {
    closed += await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // เปลี่ยนเฉพาะที่ยังเปิดอยู่ — กันชนกับคนที่กดเปลี่ยนสถานะพร้อมกัน
      const { count } = await tx.draw.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLOSED" } });
      if (count === 0) return 0;
      const draw = await tx.draw.findUniqueOrThrow({ where: { id } });
      await logAudit(tx, {
        action: "UPDATE",
        entity: "Draw",
        entityId: id,
        summary: draw.name,
        before: { status: "OPEN" },
        after: { status: "CLOSED", closesAt: draw.closesAt },
      });
      return 1;
    });
  }
  return closed;
}
