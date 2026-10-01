-- แยกข้อมูลตามแม่หวย + บัญชี/กลุ่ม WhatsApp ที่จัดการจากหน้าเว็บ
-- ข้อมูลเดิม (งวด / ลูกค้า / เลขอั้น) ถูกย้ายเข้า "แม่หวยหลัก" ของผู้ใช้คนแรก (ADMIN ก่อน) ให้อัตโนมัติ

-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('STARTING', 'QR', 'CONNECTED', 'DISCONNECTED', 'LOGGED_OUT');

-- CreateTable
CREATE TABLE "dealers" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: เพิ่มแบบว่างได้ก่อน เติมค่าแล้วค่อยบังคับ NOT NULL
ALTER TABLE "customers" ADD COLUMN "dealerId" TEXT;
ALTER TABLE "draws" ADD COLUMN "dealerId" TEXT;
ALTER TABLE "number_limits" ADD COLUMN "dealerId" TEXT;

-- ย้ายข้อมูลเดิมเข้าแม่หวยหลัก (ฐานข้อมูลใหม่ที่ยังว่างจะข้ามขั้นนี้)
INSERT INTO "dealers" ("id", "ownerId", "name", "createdAt", "updatedAt")
SELECT 'dealer-default', u."id", 'แม่หวยหลัก', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT "id" FROM "users" ORDER BY ("role" = 'ADMIN') DESC, "createdAt" ASC LIMIT 1) AS u
WHERE EXISTS (SELECT 1 FROM "draws")
   OR EXISTS (SELECT 1 FROM "customers")
   OR EXISTS (SELECT 1 FROM "number_limits");

UPDATE "draws" SET "dealerId" = 'dealer-default' WHERE "dealerId" IS NULL;
UPDATE "customers" SET "dealerId" = 'dealer-default' WHERE "dealerId" IS NULL;
UPDATE "number_limits" SET "dealerId" = 'dealer-default' WHERE "dealerId" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "dealerId" SET NOT NULL;
ALTER TABLE "draws" ALTER COLUMN "dealerId" SET NOT NULL;
ALTER TABLE "number_limits" ALTER COLUMN "dealerId" SET NOT NULL;

-- DropIndex: ค่าที่ไม่ซ้ำเปลี่ยนเป็น "ไม่ซ้ำภายในแม่หวยเดียวกัน"
DROP INDEX "customers_name_key";
DROP INDEX "customers_phone_key";
DROP INDEX "draws_name_key";
DROP INDEX "draws_status_drawDate_idx";
DROP INDEX "number_limits_digits_number_position_currency_key";

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "command" TEXT,
    "pairingPhone" TEXT,
    "status" "WhatsappStatus" NOT NULL DEFAULT 'STARTING',
    "qr" TEXT,
    "pairingCode" TEXT,
    "phone" TEXT,
    "waName" TEXT,
    "lastError" TEXT,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_groups" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dealerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealers_ownerId_name_key" ON "dealers"("ownerId", "name");
CREATE UNIQUE INDEX "whatsapp_accounts_ownerId_name_key" ON "whatsapp_accounts"("ownerId", "name");
CREATE INDEX "whatsapp_groups_dealerId_idx" ON "whatsapp_groups"("dealerId");
CREATE UNIQUE INDEX "whatsapp_groups_accountId_jid_key" ON "whatsapp_groups"("accountId", "jid");
CREATE UNIQUE INDEX "customers_dealerId_name_key" ON "customers"("dealerId", "name");
CREATE UNIQUE INDEX "customers_dealerId_phone_key" ON "customers"("dealerId", "phone");
CREATE INDEX "draws_dealerId_status_drawDate_idx" ON "draws"("dealerId", "status", "drawDate");
CREATE UNIQUE INDEX "draws_dealerId_name_key" ON "draws"("dealerId", "name");
CREATE UNIQUE INDEX "number_limits_dealerId_digits_number_position_currency_key" ON "number_limits"("dealerId", "digits", "number", "position", "currency");

-- AddForeignKey
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "draws" ADD CONSTRAINT "draws_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "number_limits" ADD CONSTRAINT "number_limits_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
