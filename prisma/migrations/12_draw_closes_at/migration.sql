-- เวลาออกผลของงวด — เลยเวลานี้ระบบปิดรับโพยให้เอง (หวยเวียดนามวันละหลายรอบ แต่ละรอบเวลาต่างกัน)
-- งวดเดิมไม่มีเวลา (null) = ไม่ปิดเอง เหมือนเดิม

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "closesAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "draws_status_closesAt_idx" ON "draws"("status", "closesAt");
