-- เวลาที่คนแก้โพยครั้งล่าสุด — ปุ่ม "แก้ไขล่าสุด" ของหน้าโพย (โพยเดิมยังไม่เคยแก้ = null)

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "editedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_drawId_editedAt_idx" ON "tickets"("drawId", "editedAt");
