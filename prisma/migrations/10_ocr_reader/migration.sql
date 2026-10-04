-- ตัวอ่านรูปที่กำลังอ่าน / อ่านครั้งล่าสุด (ชื่อรุ่น Claude หรือ "ocr") — แสดงในหน้าโพย ดู worker/ocr.ts

-- AlterTable
ALTER TABLE "ticket_images" ADD COLUMN "ocrReader" TEXT;
