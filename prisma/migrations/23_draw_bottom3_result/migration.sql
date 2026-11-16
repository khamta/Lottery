-- เลข 3 ตัวล่างที่ออก (ไม่บังคับ) — ใช้ตรวจรางวัลของโพยจากกลุ่มที่เปิด "3 ตัว บน-ล่าง" (whatsapp_groups.threeDigitBottom)
-- ว่าง = ไม่มีผล 3 ตัวล่าง แทง 3 ตัวล่างไม่ถูกรางวัล · อัตราจ่ายเท่ากับ 3 ตัวบน

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "bottom3Result" TEXT;
