-- สวิตช์ "นับยอดอัตโนมัติ" ที่หน้าโพย: เปิด = โพยที่ AI อ่านได้ครบนับยอดเลย · ปิด = รอคนตรวจ นับยอดเมื่อกดบันทึก

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "aiAutoCount" BOOLEAN NOT NULL DEFAULT true;
