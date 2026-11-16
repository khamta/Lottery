import { describe, expect, test } from "bun:test";

import { drawSchema } from "@/lib/validations/draw";
import {
  bottom3Of,
  buildSettlement,
  pivotThreeDigit,
  totalWinningStake,
  winningKeys,
  type StakeGroup,
} from "@/lottery/report";

/** 3 ตัวล่าง — มีเฉพาะโพยจากกลุ่มที่เปิด "3 ตัว บน-ล่าง" · ถูกเมื่อตรงกับผล 3 ตัวล่างที่กรอกในงวด */
const stakes: StakeGroup[] = [
  { number: "123", digits: 3, position: "TOP", currency: "LAK", amount: 10_000 },
  { number: "123", digits: 3, position: "BOTTOM", currency: "LAK", amount: 5_000 },
  { number: "456", digits: 3, position: "BOTTOM", currency: "THB", amount: 20 },
];

describe("ผล 3 ตัวล่าง", () => {
  test("ไม่ได้กรอก = 3 ตัวล่างไม่ถูก (key เดิม 3 ตัว)", () => {
    const keys = winningKeys({ topResult: "123", bottomResult: "45" })!;
    expect(keys).toHaveLength(3);
    expect(bottom3Of(keys)).toBeNull();
    expect(totalWinningStake(stakes, keys)).toEqual({ lak: 10_000, thb: 0 });
  });

  test("กรอกแล้ว = 3 ตัวล่างที่ตรงถูกรางวัล · 3 ตัวบนเลขเดียวกันไม่ถูกเพราะฝั่งล่าง", () => {
    const keys = winningKeys({ topResult: "999", bottomResult: "45", bottom3Result: "123" })!;
    expect(keys[3]).toEqual({ digits: 3, position: "BOTTOM", number: "123" });
    expect(bottom3Of(keys)).toBe("123");
    expect(totalWinningStake(stakes, keys)).toEqual({ lak: 5_000, thb: 0 });
  });

  test("จ่ายอัตราเดียวกับ 3 ตัวบน (rate3Top) และนับใน win3", () => {
    const keys = winningKeys({ topResult: "999", bottomResult: "45", bottom3Result: "456" });
    const settlement = buildSettlement(
      [{ lottery: "LAO", keys, rates: { rate2Top: 80, rate2Bottom: 80, rate3Top: 500 }, stakes }],
      { left: 0, right: 0 },
    );
    expect(settlement.win3).toEqual({ lak: 0, thb: 20 * 500 });
  });

  test("ตารางเลข 3 ตัวแยกบน/ล่าง ไม่รวมยอดกัน", () => {
    expect(pivotThreeDigit(stakes)).toEqual([{ number: "123", lak: 10_000, thb: 0 }]);
    expect(pivotThreeDigit(stakes, "BOTTOM")).toEqual([
      { number: "123", lak: 5_000, thb: 0 },
      { number: "456", lak: 0, thb: 20 },
    ]);
  });

  test("ฟอร์มงวด: 3 ตัวล่างไม่บังคับ · ต้องเป็นเลข 3 หลัก · ต้องมีผลหลักก่อน", () => {
    const base = { name: "ງວດ 01/10", lottery: "LAO", drawDate: "2026-10-01", topResult: "123", bottomResult: "45" };
    expect(drawSchema.safeParse(base).success).toBe(true);
    expect(drawSchema.safeParse({ ...base, bottom3Result: "678" }).success).toBe(true);
    expect(drawSchema.safeParse({ ...base, bottom3Result: "67" }).success).toBe(false);
    expect(
      drawSchema.safeParse({ ...base, topResult: "", bottomResult: "", bottom3Result: "678" }).success,
    ).toBe(false);
  });
});
