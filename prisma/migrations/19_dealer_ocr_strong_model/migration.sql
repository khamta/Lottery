-- แม่หวยเลือกรุ่นอ่านซ้ำเองได้ (Claude หรือ Ollama Cloud · src/lottery/ai-models.ts) — null = ไม่อ่านซ้ำ

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "ocrStrongModel" TEXT;
