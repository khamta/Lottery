-- อ่านรูปโพยรอตรวจใหม่จากหน้าโพย: คนเลือกตัวอ่านได้ (AI = Claude มีค่าใช้จ่าย · OCR = บริการในเครื่อง)
-- null = บอทเลือกเอง (Claude ก่อน ไม่ได้ใช้บริการ OCR) — รูปที่มีอยู่แล้วเป็น null ทั้งหมด

-- CreateEnum
CREATE TYPE "OcrEngine" AS ENUM ('AI', 'OCR');

-- AlterTable
ALTER TABLE "ticket_images" ADD COLUMN "ocrEngine" "OcrEngine";
