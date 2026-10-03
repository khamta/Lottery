-- อ่านรูปโพยเป็น 2 ขั้น (ดู src/lottery/image-text.ts)
--   transcript = ขั้นที่ 1 ทุกอย่างที่ OCR อ่านได้จากรูป ไม่ตัดอะไรทิ้ง
--   ocrText    = ขั้นที่ 2 ข้อความโพยที่กรองตามกติกาแล้วใส่ไว้หน้าข้อความของโพย — ใช้รู้ว่าคนยังไม่ได้แก้ส่วนนี้ (bun run ocr:reapply)

-- AlterTable
ALTER TABLE "ticket_images" ADD COLUMN "transcript" TEXT,
ADD COLUMN "ocrText" TEXT;
