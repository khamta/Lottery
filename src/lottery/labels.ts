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

/** ประเภทหวย (ตรงกับ enum LotteryType ใน prisma) — ลำดับนี้ใช้ในตัวเลือกทุกที่ */
export const LOTTERY_TYPES = ["LAO", "THAI", "V3", "V4", "V5", "V6", "V7", "V8", "V9"] as const;
export type LotteryTypeValue = (typeof LOTTERY_TYPES)[number];

export function isLotteryType(value: unknown): value is LotteryTypeValue {
  return (LOTTERY_TYPES as readonly unknown[]).includes(value);
}

/** ชื่อประเภทหวยที่แสดงบนจอ: V3–V9 = รหัสเดิม (เหมือนในใบ) ต่อท้ายด้วยคำว่าหวยเวียดนาม · ลาว/ไทย แปลตามภาษา */
export const lotteryKey: Record<LotteryTypeValue, string> = {
  LAO: "lottery.typeLAO",
  THAI: "lottery.typeTHAI",
  V3: "lottery.typeV",
  V4: "lottery.typeV",
  V5: "lottery.typeV",
  V6: "lottery.typeV",
  V7: "lottery.typeV",
  V8: "lottery.typeV",
  V9: "lottery.typeV",
};

/** ป้ายสั้นของประเภทหวย เช่น "V3 · หวยเวียดนาม" / "หวยลาว" */
export function lotteryLabel(type: LotteryTypeValue, t: (key: string, params?: Record<string, string | number>) => string) {
  return t(lotteryKey[type], { code: type });
}
