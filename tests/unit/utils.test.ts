import { describe, expect, test } from "bun:test";

import {
  cn,
  formatAmount,
  formatAmountInput,
  formatCurrency,
  formatDate,
  parseAmount,
  slugify,
} from "@/lib/utils";

describe("cn", () => {
  test("รวม class และตัดตัวที่ชนกันตัวหลังชนะ", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-medium")).toBe("text-sm font-medium");
  });
});

describe("formatCurrency", () => {
  test("แสดงค่าเป็นสกุลเงินบาท", () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain("1,234.5");
    expect(result).toMatch(/฿|THB/);
  });

  test("รับค่าที่เป็น string ได้ (เช่น Prisma Decimal ที่แปลงมา)", () => {
    expect(formatCurrency("990")).toContain("990");
  });
});

describe("formatAmountInput / formatAmount / parseAmount", () => {
  test("คั่นหลักพันด้วย . ระหว่างพิมพ์", () => {
    expect(formatAmountInput("1000")).toBe("1.000");
    expect(formatAmountInput("10000")).toBe("10.000");
    expect(formatAmountInput("100000")).toBe("100.000");
    expect(formatAmountInput("1000000")).toBe("1.000.000");
    expect(formatAmountInput("1.0000")).toBe("10.000");
  });

  test("ทศนิยมใช้ , และจำกัดจำนวนหลัก", () => {
    expect(formatAmountInput("1000,")).toBe("1.000,");
    expect(formatAmountInput("1000,256")).toBe("1.000,25");
    expect(formatAmountInput(",5")).toBe("0,5");
    expect(formatAmountInput("12,5", 0)).toBe("125");
  });

  test("ตัดตัวอักษรอื่นและศูนย์นำหน้าทิ้ง", () => {
    expect(formatAmountInput("00a12b3")).toBe("123");
    expect(formatAmountInput("")).toBe("");
  });

  test("แปลงไป-กลับระหว่างตัวเลขกับข้อความ", () => {
    expect(formatAmount(1500000.5)).toBe("1.500.000,5");
    expect(formatAmount(990)).toBe("990");
    expect(parseAmount("1.500.000,5")).toBe(1500000.5);
    expect(parseAmount("")).toBe(0);
  });
});

describe("formatDate", () => {
  test("คืนค่าเป็นข้อความที่อ่านได้", () => {
    expect(formatDate("2026-01-15T03:00:00.000Z")).toBeString();
    expect(formatDate(new Date("2026-01-15T03:00:00.000Z")).length).toBeGreaterThan(0);
  });

  test("รูปแบบเปลี่ยนตามภาษาที่เลือก", () => {
    const value = "2026-09-24T14:05:00.000Z"; // = 21:05 เวลาเวียงจันทน์
    expect(formatDate(value, "th-TH")).toBe("24 ก.ย. 2569 21:05");
    expect(formatDate(value, "lo-LA")).toBe("24 ກ.ຍ. 2026, 21:05");
    expect(formatDate(value, "en-US")).toBe("Sep 24, 2026, 9:05 PM");
    expect(formatDate(value, "zh-CN")).toBe("2026年9月24日 21:05");
  });

  test("แสดงเฉพาะวันที่ หรือเฉพาะเวลาได้", () => {
    const value = "2026-09-24T14:05:00.000Z";
    expect(formatDate(value, "en-US", "date")).toBe("Sep 24, 2026");
    expect(formatDate(value, "zh-CN", "time")).toBe("21:05");
    expect(formatDate(value, "lo-LA", "date")).toBe("24 ກ.ຍ. 2026");
    expect(formatDate(value, "lo-LA", "time")).toBe("21:05");
  });

  test("ภาษาลาวได้ผลเดียวกับ ICU เต็มทุกเดือน (เบราว์เซอร์ไม่มีข้อมูลลาวก็ไม่ถอยไปเป็นอังกฤษ)", () => {
    const icu = new Intl.DateTimeFormat("lo-LA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Vientiane",
    });
    for (let m = 0; m < 12; m++) {
      const value = new Date(Date.UTC(2026, m, 3, 1, 7));
      expect(formatDate(value, "lo-LA")).toBe(icu.format(value));
    }
  });
});

describe("slugify", () => {
  test("แปลงเป็นตัวพิมพ์เล็กและใช้ขีดกลางแทนช่องว่าง", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("รองรับภาษาไทย", () => {
    expect(slugify("สินค้า ใหม่")).toBe("สินค้า-ใหม่");
  });

  test("ตัดอักขระพิเศษทิ้ง", () => {
    expect(slugify("A/B & C!")).toBe("ab-c");
  });
});
