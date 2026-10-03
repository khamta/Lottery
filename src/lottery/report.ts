import type { Currency, Position } from "./parser";

/**
 * คำนวณรายงานจากยอดที่ฐานข้อมูลรวมมาแล้ว (groupBy) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * กีบกับบาทแยกคอลัมน์เสมอ ไม่แปลงสกุลรวมกัน
 */

/** ยอดรวมของเลขหนึ่งตัวในฝั่ง/สกุลเงินหนึ่ง */
export type StakeGroup = {
  number: string;
  digits: number;
  position: Position;
  currency: Currency;
  amount: number;
};

export type TwoDigitRow = {
  number: string;
  topLak: number;
  bottomLak: number;
  topThb: number;
  bottomThb: number;
};

export type ThreeDigitRow = { number: string; lak: number; thb: number };

/** เลข 2 ตัว: หนึ่งแถวต่อเลข เรียงตามยอดกีบบน+ล่าง (เท่ากันดูยอดบาท แล้วเรียงตามเลข) */
export function pivotTwoDigit(groups: StakeGroup[]): TwoDigitRow[] {
  const rows = new Map<string, TwoDigitRow>();

  for (const group of groups) {
    if (group.digits !== 2) continue;
    const row = rows.get(group.number) ?? { number: group.number, topLak: 0, bottomLak: 0, topThb: 0, bottomThb: 0 };
    if (group.currency === "LAK") row[group.position === "TOP" ? "topLak" : "bottomLak"] += group.amount;
    else row[group.position === "TOP" ? "topThb" : "bottomThb"] += group.amount;
    rows.set(group.number, row);
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.topLak + b.bottomLak - (a.topLak + a.bottomLak) ||
      b.topThb + b.bottomThb - (a.topThb + a.bottomThb) ||
      a.number.localeCompare(b.number),
  );
}

/** ยอดรวมของทุกแถว — ใช้เป็นแถวรวมท้ายตาราง */
export function sumTwoDigit(rows: TwoDigitRow[]): Omit<TwoDigitRow, "number"> {
  return rows.reduce(
    (sum, row) => ({
      topLak: sum.topLak + row.topLak,
      bottomLak: sum.bottomLak + row.bottomLak,
      topThb: sum.topThb + row.topThb,
      bottomThb: sum.bottomThb + row.bottomThb,
    }),
    { topLak: 0, bottomLak: 0, topThb: 0, bottomThb: 0 },
  );
}

/** เลข 3 ตัวบน: หนึ่งแถวต่อเลข เรียงตามยอดกีบ */
export function pivotThreeDigit(groups: StakeGroup[]): ThreeDigitRow[] {
  const rows = new Map<string, ThreeDigitRow>();

  for (const group of groups) {
    if (group.digits !== 3) continue;
    const row = rows.get(group.number) ?? { number: group.number, lak: 0, thb: 0 };
    row[group.currency === "LAK" ? "lak" : "thb"] += group.amount;
    rows.set(group.number, row);
  }

  return [...rows.values()].sort((a, b) => b.lak - a.lak || b.thb - a.thb || a.number.localeCompare(b.number));
}

/** เพดานอั้น — number ว่าง = ใช้กับทุกเลขของประเภทนั้น */
export type LimitRule = {
  digits: number;
  number: string;
  position: Position;
  currency: Currency;
  maxAmount: number;
};

export type OverLimitRow = StakeGroup & { limit: number; excess: number };

/** เพดานของเลขนี้: กฎที่ระบุเลขชนะกฎทั่วไป — ไม่มีกฎ = ไม่อั้น (null) */
export function resolveLimit(
  limits: LimitRule[],
  target: Pick<StakeGroup, "number" | "digits" | "position" | "currency">,
): number | null {
  const candidates = limits.filter(
    (rule) => rule.digits === target.digits && rule.position === target.position && rule.currency === target.currency,
  );
  const rule = candidates.find((r) => r.number === target.number) ?? candidates.find((r) => r.number === "");
  return rule ? rule.maxAmount : null;
}

/** เลขที่ยอดรับเกินเพดาน เรียงตามส่วนเกินมากไปน้อย (กีบก่อนบาท เพราะหน่วยต่างกัน) */
export function findOverLimits(groups: StakeGroup[], limits: LimitRule[]): OverLimitRow[] {
  return groups
    .flatMap((group) => {
      const limit = resolveLimit(limits, group);
      return limit !== null && group.amount > limit ? [{ ...group, limit, excess: group.amount - limit }] : [];
    })
    .sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) || b.excess - a.excess || a.number.localeCompare(b.number),
    );
}

export type DrawResult = { topResult: string | null; bottomResult: string | null };
export type WinningKey = { digits: number; position: Position; number: string };

/** เลขที่ถูกรางวัลของงวด — ยังกรอกผลไม่ครบคืน null */
export function winningKeys(result: DrawResult): WinningKey[] | null {
  if (!result.topResult || !result.bottomResult) return null;
  return [
    { digits: 3, position: "TOP", number: result.topResult },
    { digits: 2, position: "TOP", number: result.topResult.slice(-2) },
    { digits: 2, position: "BOTTOM", number: result.bottomResult },
  ];
}

export function isWinning(keys: WinningKey[], bet: Pick<StakeGroup, "number" | "digits" | "position">) {
  return keys.some(
    (key) => key.digits === bet.digits && key.position === bet.position && key.number === bet.number,
  );
}

export type MoneyPair = { lak: number; thb: number };

export const emptyMoney = (): MoneyPair => ({ lak: 0, thb: 0 });

export function addMoney(target: MoneyPair, currency: Currency, amount: number) {
  if (currency === "LAK") target.lak += amount;
  else target.thb += amount;
  return target;
}

/** ยอดรับรวมของงวด แยกสกุลเงิน */
export function totalStake(groups: StakeGroup[]): MoneyPair {
  return groups.reduce((sum, group) => addMoney(sum, group.currency, group.amount), emptyMoney());
}

/** ยอดแทงจริงของเลขที่ถูก แยกสกุลเงิน — ยังไม่คูณอัตราจ่าย (ระบบยังไม่ใช้อัตราจ่าย) */
export function totalWinningStake(groups: StakeGroup[], keys: WinningKey[]): MoneyPair {
  return groups
    .filter((group) => isWinning(keys, group))
    .reduce((sum, group) => addMoney(sum, group.currency, group.amount), emptyMoney());
}

/** อัตราจ่ายต่อ 1 หน่วยของงวด — 0 = ยังไม่ตั้ง (คิดตามยอดแทงจริงของเลขที่ถูก) */
export type PayoutRates = { rate2Top: number; rate2Bottom: number; rate3Top: number };

export type SettlementRow = { number: string; lak: number; thb: number };

/** สรุปแบบใบส่งแม่หวย: ยอดรวม → หักเปอร์เซ็นต์ → เหลือ → หักยอดถูก 2 ตัว / 3 ตัว → ส่งแม่ */
export type Settlement = {
  percent: number;
  total: MoneyPair;
  commission: MoneyPair;
  net: MoneyPair;
  win2: MoneyPair;
  win3: MoneyPair;
  send: MoneyPair;
  /** เลข 00–99 เรียงตามเลข: ยอดบน+ล่าง แยกกีบ/บาท (เลขที่ไม่มียอดเป็น 0) */
  rows: SettlementRow[];
  /** ผลรวมของ rows (เฉพาะเลข 2 ตัว) */
  rowsTotal: MoneyPair;
};

/** ปัดเป็นจำนวนเต็ม — เงินกีบ/บาทในใบสรุปไม่มีเศษ */
const roundMoney = (pair: MoneyPair): MoneyPair => ({ lak: Math.round(pair.lak), thb: Math.round(pair.thb) });
const minus = (a: MoneyPair, b: MoneyPair): MoneyPair => ({ lak: a.lak - b.lak, thb: a.thb - b.thb });

export function buildSettlement(
  groups: StakeGroup[],
  keys: WinningKey[] | null,
  rates: PayoutRates,
  percent: number,
): Settlement {
  const total = totalStake(groups);
  const commission = roundMoney({ lak: (total.lak * percent) / 100, thb: (total.thb * percent) / 100 });
  const net = minus(total, commission);

  const win2 = emptyMoney();
  const win3 = emptyMoney();
  for (const group of keys ? groups.filter((g) => isWinning(keys, g)) : []) {
    const rate = group.digits === 3 ? rates.rate3Top : group.position === "TOP" ? rates.rate2Top : rates.rate2Bottom;
    addMoney(group.digits === 3 ? win3 : win2, group.currency, group.amount * (rate > 0 ? rate : 1));
  }

  const byNumber = new Map<string, SettlementRow>();
  for (let n = 0; n < 100; n++) {
    const number = String(n).padStart(2, "0");
    byNumber.set(number, { number, lak: 0, thb: 0 });
  }
  for (const group of groups) {
    const row = group.digits === 2 ? byNumber.get(group.number) : undefined;
    if (row) row[group.currency === "LAK" ? "lak" : "thb"] += group.amount;
  }
  const rows = [...byNumber.values()];

  const wins = roundMoney({ lak: win2.lak + win3.lak, thb: win2.thb + win3.thb });
  return {
    percent,
    total,
    commission,
    net,
    win2: roundMoney(win2),
    win3: roundMoney(win3),
    send: minus(net, wins),
    rows,
    rowsTotal: rows.reduce((sum, row) => ({ lak: sum.lak + row.lak, thb: sum.thb + row.thb }), emptyMoney()),
  };
}
