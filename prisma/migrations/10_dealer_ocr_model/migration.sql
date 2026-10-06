-- แม่หวยเลือกรุ่น Claude ที่อ่านรูปโพยเองได้ (หน้า /dealers · src/lottery/ai-models.ts) — null = อัตโนมัติ

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "ocrModel" TEXT;
