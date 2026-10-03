-- ชื่อผู้ใช้ (username) ใช้เข้าสู่ระบบแทนอีเมลได้ — เก็บเป็นตัวเล็กเสมอ
-- บัญชีที่มีอยู่แล้วได้ username จากส่วนหน้า @ ของอีเมล (ตัดอักขระที่ไม่อนุญาตออก)
-- ถ้าซ้ำกันให้คนที่สร้างก่อนได้ไป ที่เหลือ/สั้นเกิน 3 ตัวเว้นว่างไว้ ให้ผู้ดูแลตั้งเองที่หน้าผู้ใช้งาน

-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" TEXT;

UPDATE "users" AS u
SET "username" = candidate.base
FROM (
  SELECT "id", base, ROW_NUMBER() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS n
  FROM (
    SELECT "id", "createdAt",
           left(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g'), 30) AS base
    FROM "users"
  ) AS cleaned
) AS candidate
WHERE u."id" = candidate."id" AND candidate.n = 1 AND length(candidate.base) >= 3;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
