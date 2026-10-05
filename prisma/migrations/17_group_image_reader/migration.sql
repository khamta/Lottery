-- แต่ละกลุ่ม WhatsApp เลือกตัวอ่านรูปโพยได้: AI = Claude ก่อน (เหมือนเดิม) · OCR = บริการ OCR ในเครื่องเท่านั้น
-- กลุ่มที่มีอยู่แล้วเป็น AI ทั้งหมด — ทำงานเหมือนก่อนเพิ่มคอลัมน์นี้

-- AlterTable
ALTER TABLE "whatsapp_groups" ADD COLUMN "imageReader" "OcrEngine" NOT NULL DEFAULT 'AI';
