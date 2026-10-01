import { describe, expect, test } from "bun:test";

import { customerSchema } from "@/lib/validations/customer";
import { drawSchema } from "@/lib/validations/draw";
import { limitSchema } from "@/lib/validations/limit";
import { ticketSchema } from "@/lib/validations/ticket";

/** ข้อความ error (คีย์ i18n) ของฟิลด์ที่ไม่ผ่าน */
function errorsOf(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));
}

describe("drawSchema", () => {
  const valid = {
    name: "งวด 30/09/2026",
    drawDate: "2026-09-30",
    topResult: "",
    bottomResult: "",
  };

  test("ยังไม่มีผลได้", () => {
    expect(drawSchema.safeParse(valid).success).toBe(true);
  });

  test("ผลต้องเป็นตัวเลข 3 หลัก / 2 หลัก", () => {
    expect(errorsOf(drawSchema.safeParse({ ...valid, topResult: "24", bottomResult: "723" }))).toEqual({
      topResult: "draws.validation.topResult",
      bottomResult: "draws.validation.bottomResult",
    });
  });

  test("เลขที่ออกต้องกรอกครบทั้งคู่หรือว่างทั้งคู่", () => {
    expect(errorsOf(drawSchema.safeParse({ ...valid, topResult: "243" }))).toEqual({
      bottomResult: "draws.validation.resultPair",
    });
    expect(errorsOf(drawSchema.safeParse({ ...valid, bottomResult: "72" }))).toEqual({
      topResult: "draws.validation.resultPair",
    });
    expect(drawSchema.safeParse({ ...valid, topResult: "243", bottomResult: "72" }).success).toBe(true);
  });

  test("วันที่ต้องเป็น YYYY-MM-DD", () => {
    expect(errorsOf(drawSchema.safeParse({ ...valid, drawDate: "30/09/2026" }))).toEqual({
      drawDate: "draws.validation.dateInvalid",
    });
  });
});

describe("customerSchema", () => {
  const valid = { name: "ເອື້ອຍນ້ອຍ", phone: "", lakMultiplier: 1000, note: "" };

  test("เบอร์และหมายเหตุว่างได้", () => {
    expect(customerSchema.safeParse(valid).success).toBe(true);
  });

  test("เบอร์ต้องเป็นตัวเลขล้วนรวมรหัสประเทศ", () => {
    expect(customerSchema.safeParse({ ...valid, phone: "8562055512345" }).success).toBe(true);
    expect(errorsOf(customerSchema.safeParse({ ...valid, phone: "+856 20 555" }))).toEqual({
      phone: "customers.validation.phone",
    });
  });

  test("ตัวคูณกีบเลือกได้เฉพาะ 1 หรือ 1000", () => {
    expect(customerSchema.safeParse({ ...valid, lakMultiplier: "1" }).success).toBe(true);
    expect(errorsOf(customerSchema.safeParse({ ...valid, lakMultiplier: 100 }))).toEqual({
      lakMultiplier: "customers.validation.multiplier",
    });
  });

  test("ต้องมีชื่อ", () => {
    expect(errorsOf(customerSchema.safeParse({ ...valid, name: "  " }))).toEqual({
      name: "customers.validation.nameRequired",
    });
  });
});

describe("ticketSchema", () => {
  const valid = { drawId: "draw-1", customerId: "", text: "32=100", note: "", force: false };

  test("ไม่ระบุลูกค้าได้", () => {
    expect(ticketSchema.safeParse(valid).success).toBe(true);
  });

  test("ต้องเลือกงวดและมีข้อความ", () => {
    expect(errorsOf(ticketSchema.safeParse({ ...valid, drawId: "", text: "   " }))).toEqual({
      drawId: "tickets.validation.drawRequired",
      text: "tickets.validation.textRequired",
    });
  });

  test("ข้อความยาวเกิน 5,000 ตัวอักษรไม่รับ", () => {
    expect(errorsOf(ticketSchema.safeParse({ ...valid, text: "1".repeat(5001) }))).toEqual({
      text: "tickets.validation.textMax",
    });
  });
});

describe("limitSchema", () => {
  const valid = { digits: 2, number: "", position: "TOP" as const, currency: "LAK" as const, maxAmount: 500_000 };

  test("เลขว่าง = เพดานของทุกเลข", () => {
    expect(limitSchema.safeParse(valid).success).toBe(true);
  });

  test("จำนวนหลักของเลขต้องตรงกับประเภท", () => {
    expect(limitSchema.safeParse({ ...valid, number: "32" }).success).toBe(true);
    expect(errorsOf(limitSchema.safeParse({ ...valid, number: "243" }))).toEqual({
      number: "limits.validation.numberLength",
    });
  });

  test("เลข 3 ตัวมีเฉพาะฝั่งบน", () => {
    expect(errorsOf(limitSchema.safeParse({ ...valid, digits: 3, position: "BOTTOM" }))).toEqual({
      position: "limits.validation.threeTopOnly",
    });
  });

  test("ยอด 0 = ปิดรับ ใช้ได้ แต่ติดลบไม่ได้", () => {
    expect(limitSchema.safeParse({ ...valid, maxAmount: 0 }).success).toBe(true);
    expect(errorsOf(limitSchema.safeParse({ ...valid, maxAmount: -1 }))).toEqual({
      maxAmount: "limits.validation.amountMin",
    });
  });

  test("ประเภทต้องเป็น 2 หรือ 3 ตัว", () => {
    expect(errorsOf(limitSchema.safeParse({ ...valid, digits: 4 }))).toEqual({
      digits: "limits.validation.digits",
    });
  });
});
