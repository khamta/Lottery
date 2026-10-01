import type { Currency, Position } from "./parser";

/** ค่า enum ของระบบหวย -> คีย์ i18n (ข้อความอยู่ใน src/i18n/modules/lottery.ts) */
export const positionKey: Record<Position, string> = {
  TOP: "lottery.positionTOP",
  BOTTOM: "lottery.positionBOTTOM",
};

export const currencyKey: Record<Currency, string> = {
  LAK: "lottery.currencyLAK",
  THB: "lottery.currencyTHB",
};

export const digitsKey: Record<number, string> = {
  2: "lottery.digits2",
  3: "lottery.digits3",
};
