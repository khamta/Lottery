import { describe, expect, test } from "bun:test";

import {
  findOverLimits,
  pivotThreeDigit,
  pivotTwoDigit,
  resolveLimit,
  sumTwoDigit,
  totalWinningStake,
  totalStake,
  winningKeys,
  type LimitRule,
  type StakeGroup,
} from "@/lottery/report";

const stake = (
  number: string,
  position: StakeGroup["position"],
  currency: StakeGroup["currency"],
  amount: number,
): StakeGroup => ({ number, digits: number.length, position, currency, amount });

describe("pivotTwoDigit", () => {
  test("หนึ่งแถวต่อเลข แยกบน/ล่าง และกีบ/บาท", () => {
    const rows = pivotTwoDigit([
      stake("32", "TOP", "LAK", 6_421_000),
      stake("32", "BOTTOM", "LAK", 1_753_000),
      stake("32", "TOP", "THB", 750),
      stake("32", "BOTTOM", "THB", 350),
    ]);
    expect(rows).toEqual([{ number: "32", topLak: 6_421_000, bottomLak: 1_753_000, topThb: 750, bottomThb: 350 }]);
  });

  test("เรียงตามยอดกีบบน+ล่าง ไม่เอายอดบาทมารวม (ตามรายงานตัวอย่าง: 26 อยู่เหนือ 66)", () => {
    const rows = pivotTwoDigit([
      stake("66", "TOP", "LAK", 2_815_000),
      stake("66", "BOTTOM", "LAK", 648_000),
      stake("66", "TOP", "THB", 75),
      stake("26", "TOP", "LAK", 2_811_000),
      stake("26", "BOTTOM", "LAK", 703_000),
      stake("51", "TOP", "LAK", 2_663_000),
      stake("51", "TOP", "THB", 440_000), // บาทเยอะแค่ไหนก็ไม่ดันอันดับ
    ]);
    expect(rows.map((row) => row.number)).toEqual(["26", "66", "51"]);
  });

  test("ยอดกีบเท่ากัน → ดูยอดบาท แล้วเรียงตามเลข", () => {
    const rows = pivotTwoDigit([
      stake("09", "TOP", "LAK", 100),
      stake("05", "TOP", "LAK", 100),
      stake("77", "TOP", "LAK", 100),
      stake("77", "TOP", "THB", 10),
    ]);
    expect(rows.map((row) => row.number)).toEqual(["77", "05", "09"]);
  });

  test("ไม่นำเลข 3 ตัวมาปน", () => {
    expect(pivotTwoDigit([stake("243", "TOP", "LAK", 150_000)])).toEqual([]);
  });

  test("sumTwoDigit รวมทุกแถว", () => {
    const rows = pivotTwoDigit([
      stake("32", "TOP", "LAK", 100),
      stake("72", "TOP", "LAK", 50),
      stake("72", "BOTTOM", "THB", 20),
    ]);
    expect(sumTwoDigit(rows)).toEqual({ topLak: 150, bottomLak: 0, topThb: 0, bottomThb: 20 });
  });
});

describe("pivotThreeDigit", () => {
  test("หนึ่งแถวต่อเลข แยกกีบ/บาท เรียงตามยอดกีบ", () => {
    const rows = pivotThreeDigit([
      stake("243", "TOP", "LAK", 150_000),
      stake("788", "TOP", "THB", 300),
      stake("819", "TOP", "LAK", 200_000),
      stake("32", "TOP", "LAK", 999_999), // เลข 2 ตัวไม่นับ
    ]);
    expect(rows).toEqual([
      { number: "819", lak: 200_000, thb: 0 },
      { number: "243", lak: 150_000, thb: 0 },
      { number: "788", lak: 0, thb: 300 },
    ]);
  });
});

describe("เพดานอั้น", () => {
  const limits: LimitRule[] = [
    { digits: 2, number: "", position: "TOP", currency: "LAK", maxAmount: 1_000_000 },
    { digits: 2, number: "32", position: "TOP", currency: "LAK", maxAmount: 500_000 },
    { digits: 2, number: "13", position: "TOP", currency: "LAK", maxAmount: 0 },
  ];

  test("กฎที่ระบุเลขชนะกฎทั่วไป", () => {
    expect(resolveLimit(limits, stake("32", "TOP", "LAK", 0))).toBe(500_000);
    expect(resolveLimit(limits, stake("72", "TOP", "LAK", 0))).toBe(1_000_000);
  });

  test("ไม่มีกฎของฝั่ง/สกุลเงินนั้น = ไม่อั้น", () => {
    expect(resolveLimit(limits, stake("32", "BOTTOM", "LAK", 0))).toBeNull();
    expect(resolveLimit(limits, stake("32", "TOP", "THB", 0))).toBeNull();
    expect(resolveLimit(limits, stake("243", "TOP", "LAK", 0))).toBeNull();
  });

  test("findOverLimits คืนเฉพาะเลขที่เกิน พร้อมส่วนเกิน เรียงตามส่วนเกิน", () => {
    const over = findOverLimits(
      [
        stake("32", "TOP", "LAK", 600_000), // เกินเพดานเฉพาะเลข 100,000
        stake("72", "TOP", "LAK", 1_300_000), // เกินเพดานทั่วไป 300,000
        stake("46", "TOP", "LAK", 1_000_000), // เท่าเพดานพอดี = ไม่เกิน
        stake("13", "TOP", "LAK", 5_000), // เลขปิดรับ
        stake("72", "BOTTOM", "LAK", 9_000_000), // ไม่มีเพดานฝั่งล่าง
      ],
      limits,
    );
    expect(over.map((row) => [row.number, row.limit, row.excess])).toEqual([
      ["72", 1_000_000, 300_000],
      ["32", 500_000, 100_000],
      ["13", 0, 5_000],
    ]);
  });
});

describe("ผลรางวัล", () => {
  test("ยังกรอกผลไม่ครบ → ไม่มีเลขถูกรางวัล", () => {
    expect(winningKeys({ topResult: null, bottomResult: null })).toBeNull();
    expect(winningKeys({ topResult: "243", bottomResult: null })).toBeNull();
  });

  test("2 ตัวบน = 2 หลักท้ายของ 3 ตัวบน", () => {
    expect(winningKeys({ topResult: "243", bottomResult: "72" })).toEqual([
      { digits: 3, position: "TOP", number: "243" },
      { digits: 2, position: "TOP", number: "43" },
      { digits: 2, position: "BOTTOM", number: "72" },
    ]);
  });

  test("ยอดรับ / ยอดแทงของเลขที่ถูก (ยอดจริง ไม่คูณอัตรา) แยกสกุลเงิน", () => {
    const stakes = [
      stake("243", "TOP", "LAK", 150_000), // ถูก 3 ตัวบน
      stake("43", "TOP", "LAK", 20_000), // ถูก 2 ตัวบน
      stake("43", "BOTTOM", "LAK", 20_000), // เลขเดียวกันแต่ฝั่งล่าง ไม่ถูก
      stake("72", "BOTTOM", "THB", 100), // ถูก 2 ตัวล่าง
      stake("72", "TOP", "THB", 100), // ไม่ถูก
    ];
    const keys = winningKeys({ topResult: "243", bottomResult: "72" })!;

    expect(totalStake(stakes)).toEqual({ lak: 190_000, thb: 200 });
    expect(totalWinningStake(stakes, keys)).toEqual({ lak: 150_000 + 20_000, thb: 100 });
  });
});
