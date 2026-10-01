-- อัตราจ่ายย้ายไปตั้งที่แม่หวย — งวดยังเก็บสำเนาของตัวเองไว้คิดรางวัล
-- แม่หวยเดิมรับอัตราจากงวดล่าสุดของตัวเอง (ยังไม่มีงวด = 0 ต้องไปตั้งที่หน้าแม่หวยก่อนเปิดงวด)

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "rate2Top" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "rate2Bottom" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "rate3Top" DECIMAL(8,2) NOT NULL DEFAULT 0;

UPDATE "dealers" AS d
SET "rate2Top" = latest."rate2Top",
    "rate2Bottom" = latest."rate2Bottom",
    "rate3Top" = latest."rate3Top"
FROM (
  SELECT DISTINCT ON ("dealerId") "dealerId", "rate2Top", "rate2Bottom", "rate3Top"
  FROM "draws"
  ORDER BY "dealerId", "createdAt" DESC
) AS latest
WHERE latest."dealerId" = d."id";

ALTER TABLE "dealers" ALTER COLUMN "rate2Top" DROP DEFAULT,
ALTER COLUMN "rate2Bottom" DROP DEFAULT,
ALTER COLUMN "rate3Top" DROP DEFAULT;
