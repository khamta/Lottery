/**
 * เตรียมฐานข้อมูลก่อนเปิดเว็บและบอท — service "migrate" ใน docker-compose.yml รันครั้งเดียวแล้วจบ
 *
 *  1. ฐานข้อมูลเดิมที่สร้างด้วย `prisma db push` (มีตารางแต่ไม่มีประวัติ migration)
 *     → บันทึกว่า migration 0_init ทำไปแล้ว ไม่สร้างตารางซ้ำ
 *  2. `prisma migrate deploy` — ทำ migration ที่ยังไม่ได้ทำ (ไม่ลบข้อมูล)
 *  3. ฐานข้อมูลใหม่ที่ยังไม่มีผู้ใช้ → สร้างบัญชีแรกด้วย prisma/seed.ts
 *     (ไม่ seed ซ้ำเมื่อมีผู้ใช้แล้ว กันบัญชีตัวอย่างกลับมาหลังถูกลบ)
 *  4. รูปโพยที่ยังเก็บในฐานข้อมูล (รูปแบบเดิม) → ย้ายเป็นไฟล์ใน uploads (ต้อง mount โฟลเดอร์ uploads ให้ service นี้)
 */
import { $ } from "bun";
import { PrismaClient } from "@prisma/client";

import { saveTicketImage, UPLOAD_ROOT } from "@/lottery/image-store";

const prisma = new PrismaClient();
const prismaCli = "node_modules/.bin/prisma";

async function main() {
  const [state] = await prisma.$queryRaw<Array<{ hasTables: boolean; hasHistory: boolean }>>`
    SELECT to_regclass('public.users') IS NOT NULL AS "hasTables",
           to_regclass('public._prisma_migrations') IS NOT NULL AS "hasHistory"`;

  if (state?.hasTables && !state.hasHistory) {
    console.log("ฐานข้อมูลเดิมจาก db push — บันทึก 0_init เป็นทำแล้ว");
    await $`${prismaCli} migrate resolve --applied 0_init`;
  }

  await $`${prismaCli} migrate deploy`;

  const users = await prisma.user.count();
  if (users === 0) {
    console.log("ยังไม่มีผู้ใช้ — สร้างบัญชีแรก");
    await $`bun prisma/seed.ts`;
  }

  await moveImagesToFiles();
}

/**
 * รูปโพยแบบเดิมที่เก็บไฟล์ในฐานข้อมูล (ticket_images.data) → เขียนเป็นไฟล์ใน uploads แล้วเก็บแค่ path
 * ทำทีละชุดเล็ก ๆ ไม่ดึงรูปทั้งหมดเข้าหน่วยความจำพร้อมกัน · ไม่มีรูปค้าง = ไม่ทำอะไร (รันซ้ำได้ทุกครั้งที่เริ่มระบบ)
 */
async function moveImagesToFiles() {
  let moved = 0;
  for (;;) {
    const rows = await prisma.ticketImage.findMany({
      where: { data: { not: null } },
      select: { id: true, data: true, mimeType: true, createdAt: true },
      take: 20,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const path = await saveTicketImage(new Uint8Array(row.data!), row.mimeType, row.createdAt);
      await prisma.ticketImage.update({ where: { id: row.id }, data: { path, data: null } });
      moved++;
    }
  }
  if (moved > 0) console.log(`ย้ายรูปโพยออกจากฐานข้อมูลเป็นไฟล์ใน ${UPLOAD_ROOT} แล้ว ${moved} รูป`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
