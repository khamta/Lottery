import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * ยอดกีบ "แปลก" = ไม่ลงท้ายด้วย 000 (เช่น 12,112 / 5,110 / 1,158) — เงินกีบที่แทงจริงเป็นหลักพันเต็มเสมอ
 * เจอแบบนี้มักเป็นตัวอ่านรูปอ่านผิด หรือพิมพ์ผิด แต่ตัวแยกข้อความอ่านผ่านและนับยอดไปแล้ว — หน้าโพยกรองให้ตรวจซ้ำ
 */
export const LAK_ROUND = 1000;

export const isOddLak = (amount: number) => amount % LAK_ROUND !== 0;

/** หาได้ครั้งละไม่เกินเท่านี้ใบ — กันรายการ id ยาวเกินไปใน where */
export const ODD_LAK_MAX = 1000;

/**
 * รหัสโพยของแม่หวยที่มีรายการแทงกีบยอดแปลกอย่างน้อย 1 รายการ (drawId null = ทุกงวด)
 * ดูจากตาราง bets — มีเฉพาะโพยที่นับยอดแล้ว (โพยรอตรวจยังไม่มีรายการแทง)
 * Prisma กรองด้วยการหารเอาเศษไม่ได้ จึงใช้ SQL ตรง ๆ
 */
export async function oddLakTicketIds(
  db: Pick<PrismaClient, "$queryRaw">,
  dealerId: string,
  drawId: string | null,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT b."ticketId" AS id
    FROM bets b
    JOIN draws d ON d.id = b."drawId"
    WHERE d."dealerId" = ${dealerId}
      ${drawId ? Prisma.sql`AND b."drawId" = ${drawId}` : Prisma.empty}
      AND b.currency = 'LAK'
      AND MOD(b.amount, ${LAK_ROUND}) <> 0
    LIMIT ${ODD_LAK_MAX}
  `;
  return rows.map((row) => row.id);
}
