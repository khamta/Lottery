import { prisma } from "@/lib/prisma";
import { addMoney, emptyMoney, type LimitRule, type MoneyPair, type StakeGroup, type WinningKey } from "./report";

/**
 * คิวรีที่ dashboard กับรายงานใช้ร่วมกัน — รวมยอดที่ฐานข้อมูล (groupBy) ไม่ดึงรายการแทงทีละแถว
 * ตาราง bets มีเฉพาะรายการของโพยที่นับยอดแล้ว จึงไม่ต้องกรองสถานะโพยซ้ำ
 */

/** จำนวนเพดานสูงสุดที่อ่านมาคิด (เลข 2+3 ตัว × ฝั่ง × สกุลเงิน ไม่เกินนี้) */
const LIMIT_RULES_MAX = 5000;
/** จำนวนงวดในตัวเลือกของตัวกรอง */
export const DRAW_OPTIONS_MAX = 30;

/** ยอดรวมต่อ เลข / ฝั่ง / สกุลเงิน ของงวด — ไม่เกิน 100 + 1,000 เลข × ฝั่ง × สกุลเงิน */
export async function getDrawStakes(drawId: string): Promise<StakeGroup[]> {
  const groups = await prisma.bet.groupBy({
    by: ["number", "digits", "position", "currency"],
    where: { drawId },
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
export async function getWinningBets(drawId: string, keys: WinningKey[]): Promise<WinningBet[]> {
  const bets = await prisma.bet.findMany({
    where: { drawId, OR: keys },
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
export async function getTicketCounts(drawId: string) {
  const [confirmed, review] = await Promise.all([
    prisma.ticket.count({ where: { drawId, status: "CONFIRMED" } }),
    prisma.ticket.count({ where: { drawId, status: "REVIEW" } }),
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
export async function getCustomerSummary(drawId: string, keys: WinningKey[] | null): Promise<CustomerSummary[]> {
  const [groups, winners] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["customerId"],
      where: { drawId, status: "CONFIRMED" },
      _sum: { totalLak: true, totalThb: true },
      _count: { _all: true },
      orderBy: { _sum: { totalLak: "desc" } },
      take: CUSTOMER_SUMMARY_MAX,
    }),
    keys ? getWinningBets(drawId, keys) : [],
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
