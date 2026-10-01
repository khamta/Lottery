-- ยังไม่ใช้อัตราจ่าย: รายงานคิดตามยอดแทงจริงที่รับ — คอลัมน์ยังอยู่ (ค่าเดิมไม่หาย) แต่ไม่ต้องกรอกแล้ว

-- AlterTable
ALTER TABLE "dealers" ALTER COLUMN "rate2Top" SET DEFAULT 0,
ALTER COLUMN "rate2Bottom" SET DEFAULT 0,
ALTER COLUMN "rate3Top" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "draws" ALTER COLUMN "rate2Top" SET DEFAULT 0,
ALTER COLUMN "rate2Bottom" SET DEFAULT 0,
ALTER COLUMN "rate3Top" SET DEFAULT 0;
