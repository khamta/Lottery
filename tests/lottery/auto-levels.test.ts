import { describe, expect, test } from "bun:test";

import { autoLevelsPixels, autoLevelsTable } from "@/lottery/auto-levels";

/** ฮิสโตแกรมจากค่าความสว่าง → จำนวนพิกเซล */
const histogramOf = (counts: Record<number, number>) => {
  const histogram = new Uint32Array(256);
  for (const [value, count] of Object.entries(counts)) histogram[Number(value)] = count;
  return histogram;
};

describe("autoLevelsTable", () => {
  test("รูปซีด (หมึก 170 พื้น 200) → ยืดหมึกเป็นดำ พื้นเป็นขาว", () => {
    const table = autoLevelsTable(histogramOf({ 170: 100, 200: 900 }))!;
    expect(table[170]).toBe(0);
    expect(table[200]).toBe(255);
  });

  test("รูปมืด → เพิ่มแสง (ค่ากลางสว่างขึ้น)", () => {
    const table = autoLevelsTable(histogramOf({ 0: 10, 60: 980, 255: 10 }))!;
    expect(table[60]).toBeGreaterThan(60);
  });

  test("รูปพอดีแล้ว (ดำ-ขาวครบ ค่าเฉลี่ยใกล้เป้า) / รูปว่าง / สีเดียว → ไม่ปรับ", () => {
    expect(autoLevelsTable(histogramOf({ 0: 400, 255: 600 }))).toBeNull();
    expect(autoLevelsTable(new Uint32Array(256))).toBeNull();
    expect(autoLevelsTable(histogramOf({ 255: 100 }))).toBeNull();
  });
});

describe("autoLevelsPixels", () => {
  test("ปรับ RGBA ในที่ · alpha ไม่เปลี่ยน", () => {
    const pixels = new Uint8ClampedArray([170, 170, 170, 255, 200, 200, 200, 128, 200, 200, 200, 255]);
    expect(autoLevelsPixels(pixels)).toBe(true);
    expect([...pixels]).toEqual([0, 0, 0, 255, 255, 255, 255, 128, 255, 255, 255, 255]);
  });
});
