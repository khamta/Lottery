-- เลขบิล: 1 โพย = 1 บิล · นับใหม่ทุกงวด (ดู src/lottery/bill.ts)
-- โพยที่มีอยู่แล้วได้เลขตามลำดับเวลาที่ส่ง แล้วตั้งตัวนับของงวดต่อจากเลขสุดท้าย

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "billSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tickets" ADD COLUMN "billNo" INTEGER;

UPDATE "tickets" AS t
SET "billNo" = numbered.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "drawId" ORDER BY "createdAt", "id") AS n
  FROM "tickets"
) AS numbered
WHERE t."id" = numbered."id";

UPDATE "draws" AS d
SET "billSeq" = counted.last
FROM (SELECT "drawId", MAX("billNo") AS last FROM "tickets" GROUP BY "drawId") AS counted
WHERE d."id" = counted."drawId";

ALTER TABLE "tickets" ALTER COLUMN "billNo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tickets_drawId_billNo_key" ON "tickets"("drawId", "billNo");
