import type { Prisma } from "@prisma/client";

import { siteConfig } from "@/config/site";

/**
 * เลขบิล = ปีเดือนวันเวลาของโพย yyMMddHHmmss ตามเวลาของระบบ (siteConfig.timeZone) เช่น 261002143015
 * ไม่ซ้ำทั้งระบบ — โพยที่เข้ามาในวินาทีเดียวกัน (หลายกลุ่ม WhatsApp / หลายคนคีย์พร้อมกัน) ต่อท้าย -2, -3 …
 * เรียงเลขบิลแบบข้อความ = เรียงตามเวลา ("-" มาก่อนตัวเลข: 261002143015 < 261002143015-2 < 261002143016)
 */
const stampFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: siteConfig.timeZone,
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** ส่วนเวลาของเลขบิล (12 หลัก) */
export function billStamp(at: Date): string {
  const part = Object.fromEntries(stampFormat.formatToParts(at).map(({ type, value }) => [type, value]));
  return `${part.year}${part.month}${part.day}${part.hour}${part.minute}${part.second}`;
}

/** เลขบิลถัดไปเมื่อ taken = เลขบิลที่ขึ้นต้นด้วย stamp นี้ซึ่งออกไปแล้ว */
export function nextFreeBillNo(stamp: string, taken: string[]): string {
  if (taken.length === 0) return stamp;
  const last = Math.max(1, ...taken.map((billNo) => Number(billNo.slice(stamp.length + 1)) || 1));
  return `${stamp}-${last + 1}`;
}

/**
 * เลขบิลของโพยที่สร้างเวลา at — ต้องเรียกใน transaction เดียวกับที่สร้างโพย
 * advisory lock ล็อกการออกเลขบิลไว้จน commit: ข้อความที่เข้าพร้อมกันจึงเห็นเลขของกันและกันและไม่ชน
 * (ถ้าสร้างโพยไม่สำเร็จ เลขนั้นก็ไม่ถูกใช้)
 */
export async function nextBillNo(tx: Prisma.TransactionClient, at: Date = new Date()): Promise<string> {
  // 7240311 = กุญแจล็อกของการออกเลขบิล (ค่าคงที่ ใช้ที่นี่ที่เดียว)
  await tx.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(7240311)`;
  const stamp = billStamp(at);
  const taken = await tx.ticket.findMany({ where: { billNo: { startsWith: stamp } }, select: { billNo: true } });
  return nextFreeBillNo(
    stamp,
    taken.map((ticket) => ticket.billNo),
  );
}
