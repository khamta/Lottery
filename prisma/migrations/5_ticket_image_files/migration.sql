-- รูปโพยย้ายจากฐานข้อมูลไปเป็นไฟล์ในโฟลเดอร์ uploads — ตารางเก็บแค่ path (ดู src/lottery/image-store.ts)
-- รูปเดิมยังอยู่ในคอลัมน์ data จนกว่า docker/migrate.ts จะย้ายออกเป็นไฟล์ (ไม่ลบข้อมูลใน migration นี้)

-- AlterTable
ALTER TABLE "ticket_images" ADD COLUMN "path" TEXT,
ALTER COLUMN "data" DROP NOT NULL;
