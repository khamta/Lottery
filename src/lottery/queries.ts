import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addMoney, emptyMoney, type LimitRule, type MoneyPair, type StakeGroup, type WinningKey } from "./report";

/**
 * คิวรีที่ dashboard กับรายงานใช้ร่วมกัน — รวมยอดที่ฐานข้อมูล (groupBy) ไม่ดึงรายการแทงทีละแถว
 * ตาราง bets มีเฉพาะรายการของโพยที่นับยอดแล้ว จึงไม่ต้องกรองสถานะโพยซ้ำ
 * ticket (ไม่บังคับ) = กรองเฉพาะโพยบางส่วน เช่น กลุ่ม WhatsApp ที่เลือกในหน้ารายงาน — ไม่ระบุ = ทั้งงวด
 */

/** จำนวนเพดานสูงสุดที่อ่านมาคิด (เลข 2+3 ตัว × ฝั่ง × สกุลเงิน ไม่เกินนี้) */
const LIMIT_RULES_MAX = 5000;
/** จำนวนงวดในตัวเลือกของตัวกรอง */
export const DRAW_OPTIONS_MAX = 30;

/** ยอดรวมต่อ เลข / ฝั่ง / สกุลเงิน ของงวด — ไม่เกิน 100 + 1,000 เลข × ฝั่ง × สกุลเงิน */
export async function getDrawStakes(drawId: string, ticket?: Prisma.TicketWhereInput): Promise<StakeGroup[]> {
  const groups = await prisma.bet.groupBy({
    by: ["number", "digits", "position", "currency"],
    where: { drawId, ...(ticket ? { ticket } : {}) },
    _sum: { amount: true },
  });

  return groups.map((group) => ({
    number: group.number,
    digits: group.digits,
    position: group.position,
    currency: group.currency,
    amount: Number(group._sum.amount ?? 0),
  }));
}

/** เพดานอั้นของแม่หวย */
export async function getLimitRules(dealerId: string): Promise<LimitRule[]> {
  const limits = await prisma.limit.findMany({
    where: { dealerId },
    take: LIMIT_RULES_MAX,
    select: { digits: true, number: true, position: true, currency: true, maxAmount: true },
  });
  return limits.map((limit) => ({ ...limit, maxAmount: Number(limit.maxAmount) }));
}

/** จำนวนรายการถูกรางวัลที่ดึงมาแสดงรายตัว — ยอดจ่ายรวมของงวดคิดจาก getDrawStakes จึงตรงเสมอแม้เกินจำนวนนี้ */
export const WINNING_BETS_MAX = 1000;

export type WinningBet = StakeGroup & { id: string; customerId: string | null; customerName: string | null };

/** รายการแทงที่ถูกรางวัล พร้อมเจ้าของโพย เรียงตามยอดแทงมากไปน้อย */
export async function getWinningBets(
  drawId: string,
  keys: WinningKey[],
  ticket?: Prisma.TicketWhereInput,
): Promise<WinningBet[]> {
  const bets = await prisma.bet.findMany({
    where: { drawId, OR: keys, ...(ticket ? { ticket } : {}) },
    orderBy: { amount: "desc" },
    take: WINNING_BETS_MAX,
    select: {
      id: true,
      number: true,
      digits: true,
      position: true,
      currency: true,
      amount: true,
      ticket: { select: { customerId: true, senderName: true, customer: { select: { name: true } } } },
    },
  });

  return bets.map(({ ticket, amount, ...bet }) => ({
    ...bet,
    amount: Number(amount),
    customerId: ticket.customerId,
    customerName: ticket.customer?.name ?? ticket.senderName,
  }));
}

/** จำนวนโพยของงวด แยกที่นับยอดแล้วกับที่รอตรวจ */
export async function getTicketCounts(drawId: string, ticket?: Prisma.TicketWhereInput) {
  const [confirmed, review] = await Promise.all([
    prisma.ticket.count({ where: { ...ticket, drawId, status: "CONFIRMED" } }),
    prisma.ticket.count({ where: { ...ticket, drawId, status: "REVIEW" } }),
  ]);
  return { confirmed, review };
}

/** จำนวนลูกค้าในรายงานตามลูกค้า — เรียงตามยอดซื้อกีบมากไปน้อย */
export const CUSTOMER_SUMMARY_MAX = 200;

export type CustomerSummary = {
  /** null = โพยที่ไม่ระบุลูกค้า (รวมเป็นแถวเดียว) */
  customerId: string | null;
  name: string | null;
  tickets: number;
  stake: MoneyPair;
  /** ยอดแทงของเลขที่ถูก (ยอดจริง ยังไม่คูณอัตราจ่าย) — งวดที่ยังไม่กรอกผลเป็น 0 */
  won: MoneyPair;
};

/** สรุปตามลูกค้าของงวด: ยอดซื้อ · ยอดแทงของเลขที่ถูก — หน้ารายงานและไฟล์ส่งออกใช้ชุดเดียวกัน */
export async function getCustomerSummary(
  drawId: string,
  keys: WinningKey[] | null,
  ticket?: Prisma.TicketWhereInput,
): Promise<CustomerSummary[]> {
  const [groups, winners] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["customerId"],
      where: { ...ticket, drawId, status: "CONFIRMED" },
      _sum: { totalLak: true, totalThb: true },
      _count: { _all: true },
      orderBy: { _sum: { totalLak: "desc" } },
      take: CUSTOMER_SUMMARY_MAX,
    }),
    keys ? getWinningBets(drawId, keys, ticket) : [],
  ]);
  if (groups.length === 0) return [];

  const ids = groups.flatMap((group) => (group.customerId ? [group.customerId] : []));
  const customers = await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameOf = new Map(customers.map((customer) => [customer.id, customer.name]));

  const won = new Map<string | null, MoneyPair>();
  for (const bet of winners) won.set(bet.customerId, addMoney(won.get(bet.customerId) ?? emptyMoney(), bet.currency, bet.amount));

  return groups.map((group) => ({
    customerId: group.customerId,
    name: group.customerId ? (nameOf.get(group.customerId) ?? null) : null,
    tickets: group._count._all,
    stake: { lak: Number(group._sum.totalLak ?? 0), thb: Number(group._sum.totalThb ?? 0) },
    won: won.get(group.customerId) ?? emptyMoney(),
  }));
}

/** จำนวนบิลสูงสุดในรายงานตามบิล (ต่องวด) — เกินนี้แสดงเฉพาะบิลแรก ๆ ตามเวลา */
export const DRAW_BILLS_MAX = 2000;

export type BillRow = {
  id: string;
  billNo: string;
  createdAt: Date;
  status: "CONFIRMED" | "REVIEW";
  /** ลูกค้าที่จับคู่ได้ ไม่มีก็ชื่อ/เบอร์คนส่งในกลุ่ม */
  name: string | null;
  betCount: number;
  lak: number;
  thb: number;
};

/** กลุ่มของบิล: กลุ่ม WhatsApp จริง · "whatsapp" = มาจาก WhatsApp แต่ไม่รู้กลุ่ม (โพยก่อนเริ่มเก็บกลุ่ม) · "manual" = คีย์เอง */
export type BillGroup = {
  key: string;
  kind: "group" | "whatsapp" | "manual";
  name: string | null;
  bills: BillRow[];
  total: MoneyPair;
};

/**
 * บิลของงวดจัดกลุ่มตามกลุ่ม WhatsApp ที่ส่งมา — ในกลุ่มเรียงตามวันเวลาของบิล
 * กลุ่มจริงเรียงตามชื่อ ตามด้วย WhatsApp ที่ไม่รู้กลุ่ม แล้วคีย์เอง · หน้ารายงานและไฟล์ส่งออกใช้ชุดเดียวกัน
 */
export async function getDrawBills(drawId: string, ticket?: Prisma.TicketWhereInput): Promise<BillGroup[]> {
  const tickets = await prisma.ticket.findMany({
    where: { ...ticket, drawId },
    orderBy: [{ createdAt: "asc" }, { billNo: "asc" }],
    take: DRAW_BILLS_MAX,
    select: {
      id: true,
      billNo: true,
      createdAt: true,
      status: true,
      source: true,
      senderName: true,
      betCount: true,
      totalLak: true,
      totalThb: true,
      customer: { select: { name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  const groups = new Map<string, BillGroup>();
  for (const ticket of tickets) {
    const kind = ticket.group ? "group" : ticket.source === "WHATSAPP" ? "whatsapp" : "manual";
    const key = ticket.group?.id ?? kind;
    const group = groups.get(key) ?? { key, kind, name: ticket.group?.name ?? null, bills: [], total: emptyMoney() };
    const bill: BillRow = {
      id: ticket.id,
      billNo: ticket.billNo,
      createdAt: ticket.createdAt,
      status: ticket.status,
      name: ticket.customer?.name ?? ticket.senderName,
      betCount: ticket.betCount,
      lak: Number(ticket.totalLak),
      thb: Number(ticket.totalThb),
    };
    group.bills.push(bill);
    group.total.lak += bill.lak;
    group.total.thb += bill.thb;
    groups.set(key, group);
  }

  const rank = { group: 0, whatsapp: 1, manual: 2 } as const;
  return [...groups.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || (a.name ?? "").localeCompare(b.name ?? ""));
}
