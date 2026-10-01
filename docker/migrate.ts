/**
 * เตรียมฐานข้อมูลก่อนเปิดเว็บและบอท — service "migrate" ใน docker-compose.yml รันครั้งเดียวแล้วจบ
 *
 *  1. ฐานข้อมูลเดิมที่สร้างด้วย `prisma db push` (มีตารางแต่ไม่มีประวัติ migration)
 *     → บันทึกว่า migration 0_init ทำไปแล้ว ไม่สร้างตารางซ้ำ
 *  2. `prisma migrate deploy` — ทำ migration ที่ยังไม่ได้ทำ (ไม่ลบข้อมูล)
 *  3. ฐานข้อมูลใหม่ที่ยังไม่มีผู้ใช้ → สร้างบัญชีแรกด้วย prisma/seed.ts
 *     (ไม่ seed ซ้ำเมื่อมีผู้ใช้แล้ว กันบัญชีตัวอย่างกลับมาหลังถูกลบ)
 */
import { $ } from "bun";
import { PrismaClient } from "@prisma/client";

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
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
