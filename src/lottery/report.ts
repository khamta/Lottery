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
