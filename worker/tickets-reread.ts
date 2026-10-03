/**
 * อ่านโพยที่รับไว้แล้วใหม่ด้วยตัวแยกข้อความรุ่นปัจจุบัน (src/lottery/parser.ts) — `bun run tickets:reread`
 *
 * รันหลังอัปเดตตัวแยกข้อความให้อ่านรูปแบบใหม่ได้ (เช่น ຫລັກ2-9=5) โพยที่เคยค้างรอตรวจจะถูกอ่านใหม่
 * ใช้ข้อความที่เก็บไว้ ไม่แก้ข้อความ · ไม่ทับโพยที่คนยืนยันแล้ว และไม่แตะงวดที่ปิดแล้ว (ดู rereadTickets ใน ingest.ts)
 */
import { prisma } from "@/lib/prisma";
import { rereadTickets, rulesOf } from "@/lottery/ingest";

const dealers = await prisma.dealer.findMany({ where: { draws: { some: { status: "OPEN" } } }, select: { id: true } });

let changed = 0;
for (const { id } of dealers) changed += await rereadTickets(prisma, id, null, await rulesOf(prisma, id));

console.log(`อ่านโพยใหม่แล้ว ผลเปลี่ยน ${changed} ใบ`);
await prisma.$disconnect();
