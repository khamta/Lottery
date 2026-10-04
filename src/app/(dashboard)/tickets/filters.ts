import type { Prisma } from "@prisma/client";

import { BILL_PREFIX } from "@/lottery/bill";
import type { SearchParamsInput } from "@/types";
import { isTicketStatus, type DrawOption, type TicketFilterValues } from "./types";

/**
 * ตัวกรองของหน้าโพย (งวด / สถานะ / คำค้นหา รวมเลขบิล) — แยกจาก page.tsx ให้เทสต์ได้โดยไม่ต้องมีฐานข้อมูล
 */

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** ตัวเลข 6–12 หลัก (มี BNO นำหน้าหรือไม่ก็ได้) = ค้นเลขบิลด้วย — สั้นกว่านี้ไม่ใช่เลขบิล (กันไปเจอทุกบิลของปี/เดือน) */
const BILL_QUERY = /^(?:BNO)?(\d{6,12})$/i;

/**
 * คำค้นที่เป็นเลขบิล → ค้นแบบขึ้นต้นด้วย: "261002" / "BNO261002" = ทุกบิลของวันที่ 2 ต.ค. 26 · "BNO261002143015" = บิลนั้น
 * อย่างอื่น = null (ยังค้นในข้อความโพยต่อเสมอ เพราะยอดเงินก็เป็นตัวเลขยาวได้)
 */
export function billQueryPrefix(q: string): string | null {
  const match = BILL_QUERY.exec(q.trim());
  return match ? BILL_PREFIX + match[1] : null;
}

/** ยอดต่อตัวที่ค้นได้สูงสุด — ไม่เกิน Decimal(14, 2) ของ bets.amount */
const AMOUNT_MAX = 999_999_999_999;

/**
 * ยอดต่อตัวที่พิมพ์มา → ตัวเลข: "5000" / "5,000" / "5 000" = 5000 · ทศนิยมได้ 2 ตำแหน่ง
 * ว่าง / ไม่ใช่ตัวเลข / ≤ 0 / เกินเพดาน = null (ไม่กรอง)
 */
export function parseAmountQuery(value: string | undefined): number | null {
  const text = (value ?? "").slice(0, 30).replace(/[,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount > 0 && amount <= AMOUNT_MAX ? amount : null;
}

/** อ่าน ?draw=<id>|all&status=&odd=1&amount= จาก URL — ไม่ระบุงวด = งวดที่เปิดรับล่าสุด (draws เรียงใหม่ → เก่า) */
export function readTicketFilters(raw: SearchParamsInput, draws: Pick<DrawOption, "id" | "status">[]): TicketFilterValues {
  const drawParam = (first(raw.draw) ?? "").slice(0, 50);
  const drawId =
    drawParam === "all" ? null : drawParam || (draws.find((draw) => draw.status === "OPEN")?.id ?? null);
  const statusParam = first(raw.status);
  return {
    drawId,
    status: isTicketStatus(statusParam) ? statusParam : null,
    oddLak: first(raw.odd) === "1",
    amount: parseAmountQuery(first(raw.amount)),
  };
}

/** อ่านรูปใหม่ทั้งงวดได้ครั้งละไม่เกินเท่านี้ใบ — กันคำสั่งเดียวใช้เวลา/ค่า AI มากเกินไป (กดซ้ำเพื่ออ่านส่วนที่เหลือ) */
export const REREAD_DRAW_MAX = 300;

/** โพยที่สั่งอ่านรูปใหม่ได้ในงวดนี้: มีรูป ยังรอตรวจ และรูปไม่ได้อยู่ในคิวอ่าน (ปุ่มของผู้ดูแลนับจำนวนด้วยเงื่อนไขนี้) */
export function rereadableWhere(dealerId: string, drawId: string): Prisma.TicketWhereInput {
  return {
    drawId,
    draw: { dealerId },
    status: "REVIEW",
    image: { is: { ocrStatus: { not: "PENDING" }, path: { not: null } } },
  };
}

/**
 * เงื่อนไข where ของโพย — เป็นของแม่หวยผ่านงวด ?draw= ของแม่หวยอื่นจึงไม่เจออะไร
 * oddLakIds = โพยที่มียอดกีบแปลก (oddLakTicketIds) — ใช้เมื่อเปิดตัวกรอง ?odd=1 · ไม่ส่งมา = ไม่เจออะไร
 * ?amount= = มีรายการแทงยอดต่อตัวเท่านี้อย่างน้อย 1 รายการ — ดูจากตาราง bets จึงเจอเฉพาะโพยที่นับยอดแล้ว
 */
export function ticketWhere(
  dealerId: string,
  filters: TicketFilterValues,
  q: string,
  oddLakIds: string[] = [],
): Prisma.TicketWhereInput {
  const conditions: Prisma.TicketWhereInput[] = [{ draw: { dealerId } }];
  if (filters.drawId) conditions.push({ drawId: filters.drawId });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.oddLak) conditions.push({ id: { in: oddLakIds } });
  if (filters.amount) conditions.push({ bets: { some: { amount: filters.amount } } });
  if (q) {
    const bill = billQueryPrefix(q);
    conditions.push({
      OR: [
        ...(bill ? [{ billNo: { startsWith: bill } }] : []),
        { rawText: { contains: q, mode: "insensitive" as const } },
        { note: { contains: q, mode: "insensitive" as const } },
        { senderName: { contains: q, mode: "insensitive" as const } },
        { customer: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    });
  }
  return { AND: conditions };
}
