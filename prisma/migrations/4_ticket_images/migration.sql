-- รูปโพยจาก WhatsApp: บอทเก็บรูปก่อน แล้วค่อยอ่านด้วย OCR ตามคิว (ดู src/lottery/image-text.ts)

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "ticket_images" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'PENDING',
    "ocr" JSONB,
    "ocrError" TEXT,
    "ocrAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_images_ticketId_key" ON "ticket_images"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_images_ocrStatus_createdAt_idx" ON "ticket_images"("ocrStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "ticket_images" ADD CONSTRAINT "ticket_images_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

