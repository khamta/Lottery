-- เลขบิลแบบ ปีเดือนวันเวลา: yyMMddHHmmss ตามเวลาลาว เช่น 261002143015 · ไม่ซ้ำทั้งระบบ (เดิมนับ 1, 2, 3 แยกตามงวด)
-- โพยที่เวลาตรงกันถึงวินาทีต่อท้าย -2, -3 … ตามลำดับที่เข้ามา (ดู src/lottery/bill.ts)
-- โพยที่มีอยู่แล้วได้เลขใหม่จากเวลาของโพย (createdAt เก็บเป็น UTC → แปลงเป็นเวลาลาว)

-- DropIndex
DROP INDEX "tickets_drawId_billNo_key";

-- AlterTable
ALTER TABLE "tickets" ALTER COLUMN "billNo" SET DATA TYPE TEXT USING "billNo"::text;

UPDATE "tickets" AS t
SET "billNo" = numbered.base || CASE WHEN numbered.n > 1 THEN '-' || numbered.n ELSE '' END
FROM (
  SELECT "id", base, ROW_NUMBER() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS n
  FROM (
    SELECT "id", "createdAt",
           to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Vientiane', 'YYMMDDHH24MISS') AS base
    FROM "tickets"
  ) AS stamped
) AS numbered
WHERE t."id" = numbered."id";

-- CreateIndex
CREATE UNIQUE INDEX "tickets_billNo_key" ON "tickets"("billNo");

-- ตัวนับเลขบิลรายงวดไม่ใช้แล้ว
ALTER TABLE "draws" DROP COLUMN "billSeq";
