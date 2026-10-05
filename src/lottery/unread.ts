import { Prisma, type PrismaClient } from "@prisma/client";

import { NO_GROUP } from "@/app/(dashboard)/tickets/types";

/**
 * จำนวนโพยที่ผู้ใช้ยังไม่ได้ดูของแต่ละแม่หวย — แสดงบนตัวเลือกแม่หวย ให้รู้ว่าแม่หวยไหนมีโพยใหม่เข้ามาโดยไม่ต้องสลับไปดู
 *
 * นับเฉพาะงวดที่ยังเปิดรับ (โพยใหม่เข้าได้แค่งวดเปิดรับ) ทุกประเภทหวย ทุกกลุ่ม ด้วยกติกาเดียวกับหน้าโพย:
 * เข้ามาหลังเวลาที่กด "ดูทั้งหมดแล้ว" ของกลุ่มนั้น (ticket_seen · ไม่เคยกด = ยังไม่ได้ดู) และยังไม่เคยเปิดหน้าตรวจใบนั้น (ticket_reads)
 * ทุกแม่หวยนับใน query เดียว · แม่หวยที่ไม่มีโพยค้างดูไม่อยู่ในผลลัพธ์ (= 0)
 * Prisma เทียบเวลาของโพยกับเวลาที่ดูของกลุ่มเดียวกันข้ามตารางไม่ได้ จึงใช้ SQL ตรง ๆ
 */
export async function dealerUnreadCounts(
  db: Pick<PrismaClient, "$queryRaw">,
  userId: string,
  dealerIds: string[],
): Promise<Record<string, number>> {
  if (!dealerIds.length) return {};
  const rows = await db.$queryRaw<Array<{ dealerId: string; count: bigint }>>`
    SELECT d."dealerId" AS "dealerId", COUNT(*) AS count
    FROM tickets t
    JOIN draws d ON d.id = t."drawId"
    LEFT JOIN ticket_seen s
      ON s."userId" = ${userId}
      AND s."dealerId" = d."dealerId"
      AND s."groupKey" = COALESCE(t."groupId", ${NO_GROUP})
    WHERE d."dealerId" IN (${Prisma.join(dealerIds)})
      AND d.status = 'OPEN'
      AND (s."seenAt" IS NULL OR t."createdAt" > s."seenAt")
      AND NOT EXISTS (SELECT 1 FROM ticket_reads r WHERE r."userId" = ${userId} AND r."ticketId" = t.id)
    GROUP BY d."dealerId"
  `;
  return Object.fromEntries(rows.map((row) => [row.dealerId, Number(row.count)]));
}
