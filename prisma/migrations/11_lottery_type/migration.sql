-- ประเภทหวย: ลาว / ไทย / หวยเวียดนาม V3–V9 — วันเดียวมีหลายงวด · กลุ่ม WhatsApp ผูกกับประเภทหวย
-- งวดและกลุ่มเดิมทั้งหมดเป็น LAO

-- CreateEnum
CREATE TYPE "LotteryType" AS ENUM ('LAO', 'THAI', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9');

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "lottery" "LotteryType" NOT NULL DEFAULT 'LAO';
ALTER TABLE "whatsapp_groups" ADD COLUMN "lottery" "LotteryType" NOT NULL DEFAULT 'LAO';

-- CreateIndex
CREATE INDEX "draws_dealerId_lottery_status_idx" ON "draws"("dealerId", "lottery", "status");
