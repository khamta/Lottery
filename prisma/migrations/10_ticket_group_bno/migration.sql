-- 1) โพยจำกลุ่ม WhatsApp ที่ส่งมา — รายงานตามบิลจัดกลุ่มตามนี้ (โพยเดิม/คีย์เอง = null)
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "tickets_drawId_groupId_createdAt_idx" ON "tickets"("drawId", "groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "whatsapp_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) เลขบิลแบบ BNO + yyMMddHHmmss ไม่มี "-" (เดิม 261002143015 / 261002143015-2)
-- เลขที่ซ้ำได้เลขถัดไป: ภายในวันเดียวกัน เลขใหม่ = max(เวลาของตัวเอง, เลขก่อนหน้า + 1) ตามลำดับเวลา (ดู src/lottery/bill.ts)
-- ตั้งเลขชั่วคราวก่อน (กันชนกับ unique index ระหว่างอัปเดต) แล้วค่อยตั้งเลขจริง
UPDATE "tickets" SET "billNo" = 'tmp-' || "id";

-- no(n) = max(stamp(n), no(n-1) + 1) เขียนแบบไม่วนซ้ำได้เป็น n + max(stamp(k) - k) ของ k ≤ n (window function รอบเดียว)
UPDATE "tickets" AS t
SET "billNo" = 'BNO' || lpad(numbered.no::text, 12, '0')
FROM (
  SELECT "id", n + MAX(stamp - n) OVER (PARTITION BY day ORDER BY n ROWS UNBOUNDED PRECEDING) AS no
  FROM (
    SELECT "id", day, stamp, ROW_NUMBER() OVER (PARTITION BY day ORDER BY "createdAt", "id") AS n
    FROM (
      SELECT "id", "createdAt",
             to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Vientiane', 'YYMMDD') AS day,
             to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Vientiane', 'YYMMDDHH24MISS')::bigint AS stamp
      FROM "tickets"
    ) AS stamped
  ) AS ordered
) AS numbered
WHERE t."id" = numbered."id";
