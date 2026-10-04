import { describe, expect, test } from "bun:test";

import { ocrStatusText, readerName } from "@/app/(dashboard)/tickets/types";

/** สถานะการอ่านรูปในหน้าโพยบอกตัวอ่านด้วย — t ปลอมคืนคีย์ + ค่าที่แทน */
const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${vars.reader}` : key);

describe("readerName — ชื่อตัวอ่านที่แสดง", () => {
  test("ชื่อรุ่น Claude → ตระกูล + เลขรุ่น", () => {
    expect(readerName("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(readerName("claude-opus-5-5")).toBe("Opus 5.5");
    expect(readerName("claude-haiku-4-5")).toBe("Haiku 4.5");
  });

  test("บริการ OCR / ชื่อแปลก ๆ", () => {
    expect(readerName("ocr")).toBe("OCR");
    expect(readerName("custom")).toBe("custom");
  });
});

describe("ocrStatusText", () => {
  test("ยังรอคิว (ไม่มีตัวอ่าน) → สถานะเดิม", () => {
    expect(ocrStatusText({ ocrStatus: "PENDING", ocrReader: null }, t)).toBe("tickets.ocrPENDING");
  });

  test("กำลังอ่าน / อ่านแล้ว → บอกรุ่น", () => {
    expect(ocrStatusText({ ocrStatus: "PENDING", ocrReader: "claude-sonnet-5-5" }, t)).toBe("tickets.ocrReadingBy:Sonnet 5.5");
    expect(ocrStatusText({ ocrStatus: "DONE", ocrReader: "claude-opus-5-5" }, t)).toBe("tickets.ocrDoneBy:Opus 5.5");
  });

  test("อ่านไม่ได้ → สถานะเดิม ไม่บอกรุ่น", () => {
    expect(ocrStatusText({ ocrStatus: "FAILED", ocrReader: "ocr" }, t)).toBe("tickets.ocrFAILED");
  });
});
