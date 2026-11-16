-- ตั้งค่าการอ่านโพยรายกลุ่ม WhatsApp
-- threeDigitBottom: เลข 3 ตัวแทงล่าง / บนล่างได้ (เดิม 3 ตัวลงได้เฉพาะบน)
-- currency: สกุลเงินเริ่มต้นของโพยที่ไม่ระบุสกุลเงินเลยทั้งใบ

-- AlterTable
ALTER TABLE "whatsapp_groups" ADD COLUMN "threeDigitBottom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_groups" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'LAK';
