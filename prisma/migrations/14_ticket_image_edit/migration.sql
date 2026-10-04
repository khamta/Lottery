-- แก้รูปโพย (ครอป / ยางลบ / หมุน) จากหน้าโพยก่อนสั่งอ่านใหม่: เก็บ path ของรูปต้นฉบับไว้ให้ย้อนกลับได้
-- + เวลาที่แก้ล่าสุด (ต่อท้าย URL รูปไม่ให้ติด cache) — รูปที่มีอยู่แล้วเป็น null ทั้งหมด (ยังไม่เคยแก้)

-- AlterTable
ALTER TABLE "ticket_images" ADD COLUMN "originalPath" TEXT,
ADD COLUMN "editedAt" TIMESTAMP(3);
