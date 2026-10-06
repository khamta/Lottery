-- อ่านรูปโพยด้วย AI อย่างเดียว — แต่ละกลุ่มเลือกได้ว่าจะอ่านรูปหรือไม่ (readImages)
-- ไม่อ่าน = เก็บรูปไว้เป็นโพยรอตรวจ (ocrStatus = SKIPPED) · กลุ่มที่เคยตั้งเป็น OCR (ไม่มีค่าใช้จ่าย) → ไม่อ่าน

-- AlterEnum
ALTER TYPE "OcrStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "whatsapp_groups" ADD COLUMN "readImages" BOOLEAN NOT NULL DEFAULT true;
UPDATE "whatsapp_groups" SET "readImages" = false WHERE "imageReader" = 'OCR';
ALTER TABLE "whatsapp_groups" DROP COLUMN "imageReader";
