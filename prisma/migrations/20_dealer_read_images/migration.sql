-- สวิตช์หลักต่อแม่หวย: ปิด = ทุกกลุ่มของแม่หวยนี้ไม่อ่านรูปด้วย AI (เก็บรูปไว้รอตรวจ) โดยไม่แก้ค่าของแต่ละกลุ่ม

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "readImages" BOOLEAN NOT NULL DEFAULT true;
