import type { Prisma } from "@prisma/client";

import { siteConfig } from "@/config/site";

/**
 * เลขบิล = "BNO" + ปีเดือนวันเวลาของโพย yyMMddHHmmss ตามเวลาของระบบ (siteConfig.timeZone) เช่น BNO261002143015
 * ไม่ซ้ำทั้งระบบ — เลขที่ถูกใช้ไปแล้ว (หลายกลุ่ม WhatsApp / หลายคนคีย์ในวินาทีเดียวกัน) ได้เลขถัดไป BNO261002143016 …
 * ไม่มี "-" · เรียงเลขบิลแบบข้อความ = เรียงตามลำดับที่เข้ามา
 */
export const BILL_PREFIX = "BNO";

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

/** ส่วนเวลาของเลขบิล (12 หลัก ไม่รวม BNO) */
export function billStamp(at: Date): string {
  const part = Object.fromEntries(stampFormat.formatToParts(at).map(({ type, value }) => [type, value]));
  return `${part.year}${part.month}${part.day}${part.hour}${part.minute}${part.second}`;
}

/**
 * เลขบิลของ stamp นี้ เมื่อ latest = เลขบิลล่าสุดของวันเดียวกัน (null = ยังไม่มี)
 * เลขยังว่าง = ใช้ stamp ตรง ๆ · ถูกใช้ไปแล้ว (หรือเลขล่าสุดเลยไปแล้ว) = เลขล่าสุด + 1
 */
export function nextFreeBillNo(stamp: string, latest: string | null): string {
  const own = Number(stamp);
  const last = latest ? Number(latest.slice(BILL_PREFIX.length)) : Number.NaN;
  const next = Number.isFinite(last) && last >= own ? last + 1 : own;
  return BILL_PREFIX + String(next).padStart(stamp.length, "0");
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
  // เลขล่าสุดของวันเดียวกัน — เลขบิลยาวเท่ากันทุกใบ เรียงแบบข้อความจึงเท่ากับเรียงตามตัวเลข
  const latest = await tx.ticket.findFirst({
    where: { billNo: { startsWith: BILL_PREFIX + stamp.slice(0, 6) } },
    orderBy: { billNo: "desc" },
    select: { billNo: true },
  });
  return nextFreeBillNo(stamp, latest?.billNo ?? null);
}
