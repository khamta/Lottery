/**
 * อ่านรูปโพยที่เก็บไว้แล้วใหม่ด้วยกติกากรองชุดปัจจุบัน (src/lottery/image-text.ts) — `bun run ocr:reapply`
 *
 * ใช้ผล OCR ที่เก็บไว้ในตาราง ticket_images (ไม่ส่งรูปให้บริการ OCR อ่านซ้ำ) จึงเร็วและรันซ้ำได้เสมอ
 * รันทุกครั้งที่เพิ่ม/แก้กติกา ให้กติกาใหม่ใช้กับรูปเก่าด้วย ไม่ใช่แค่รูปที่เข้ามาใหม่
 * ไม่ทับโพยที่คนแก้หรือยืนยันแล้ว และไม่แตะงวดที่ปิดแล้ว (ดู reapplyOcr ใน ingest.ts)
 *
 *   bun run ocr:reapply            ทุกรูปที่อ่านแล้ว
 *   bun run ocr:reapply <ticketId> เฉพาะโพยที่ระบุ
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { reapplyOcr } from "@/lottery/ingest";

const only = process.argv.slice(2);
const images = await prisma.ticketImage
  .findMany({
    where: { ocrStatus: "DONE", ...(only.length > 0 ? { ticketId: { in: only } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { ticketId: true, transcript: true, ocrText: true },
  })
  .catch(async (error) => {
    // ฐานข้อมูลยังไม่มีคอลัมน์ใหม่ (P2022) = ยังไม่ได้ทำ migration — ไม่ต้องโชว์ error ยาวของ Prisma
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      console.error("ฐานข้อมูลยังไม่ได้อัปเดต — รัน `docker compose up -d migrate` (หรือ `bunx prisma migrate deploy`) ก่อน แล้วค่อยรันคำสั่งนี้ใหม่");
      await prisma.$disconnect();
      process.exit(1);
    }
    throw error;
  });

const tally = new Map<string, number>();
for (const { ticketId } of images) {
  const result = await reapplyOcr(prisma, ticketId);
  const label =
    result.action === "skipped" ? result.reason : result.action === "revoked" ? result.action : `อ่านใหม่ → ${result.status}`;
  tally.set(label, (tally.get(label) ?? 0) + 1);
  if (result.action !== "skipped") console.log(`  ${ticketId}  ${label}`);
}

console.log(`อ่านรูปใหม่ ${images.length} รูป`);
for (const [label, count] of tally) console.log(`  ${label}: ${count}`);
await prisma.$disconnect();
