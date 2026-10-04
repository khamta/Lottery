import { describe, expect, test } from "bun:test";

import { billQueryPrefix, ticketWhere } from "@/app/(dashboard)/tickets/filters";
import { billStamp, nextFreeBillNo } from "@/lottery/bill";

/** เลขบิลแบบ BNO + ปีเดือนวันเวลา (src/lottery/bill.ts) + การค้นหาด้วยเลขบิลในหน้าโพย */
describe("เลขบิล", () => {
  test("ปีเดือนวันเวลา yyMMddHHmmss ตามเวลาลาว (UTC+7) — ข้ามวันตามเวลาลาว ไม่ใช่ UTC", () => {
    expect(billStamp(new Date("2026-10-02T07:30:15Z"))).toBe("261002143015");
    expect(billStamp(new Date("2026-10-02T17:05:09Z"))).toBe("261003000509");
  });

  test("BNO + เวลา ไม่มี - · เลขถูกใช้แล้ว = เลขถัดไปต่อจากเลขล่าสุดของวัน", () => {
    expect(nextFreeBillNo("261002143015", null)).toBe("BNO261002143015");
    expect(nextFreeBillNo("261002143015", "BNO261002120000")).toBe("BNO261002143015");
    expect(nextFreeBillNo("261002143015", "BNO261002143015")).toBe("BNO261002143016");
    // หลายใบในวินาทีเดียวกันดันเลขไปข้างหน้าแล้ว — ใบถัดมาต่อจากเลขล่าสุด ไม่ย้อนกลับไปชน
    expect(nextFreeBillNo("261002143016", "BNO261002143017")).toBe("BNO261002143018");
  });

  test("เรียงแบบข้อความ = เรียงตามลำดับที่เข้ามา", () => {
    const bills = ["BNO261002143017", "BNO261002143015", "BNO261002143016"];
    expect(bills.sort()).toEqual(["BNO261002143015", "BNO261002143016", "BNO261002143017"]);
  });
});

describe("ค้นหาด้วยเลขบิล (tickets/filters.ts)", () => {
  test("ตัวเลข 6–12 หลัก มี BNO หรือไม่ก็ได้ = เลขบิล · สั้นกว่านั้นหรือมีตัวอื่นปน = ไม่ใช่", () => {
    expect(billQueryPrefix("261002")).toBe("BNO261002");
    expect(billQueryPrefix(" bno261002143015 ")).toBe("BNO261002143015");
    expect(billQueryPrefix("BNO261002143015")).toBe("BNO261002143015");
    expect(billQueryPrefix("2610")).toBeNull();
    expect(billQueryPrefix("#261002")).toBeNull();
    expect(billQueryPrefix("32.72=300")).toBeNull();
  });

  test("เลขบิล → ค้นแบบขึ้นต้นด้วย (261002 = ทุกบิลของวันนั้น) และยังค้นในข้อความโพยด้วย", () => {
    const where = ticketWhere("dealer-1", { drawId: null, status: null, oddLak: false }, "261002");
    const or = (where.AND as { OR?: unknown[] }[])[1]!.OR!;
    expect(or[0]).toEqual({ billNo: { startsWith: "BNO261002" } });
    expect(or[1]).toEqual({ rawText: { contains: "261002", mode: "insensitive" } });
  });

  test("คำค้นธรรมดาไม่มีเงื่อนไขเลขบิล", () => {
    const where = ticketWhere("dealer-1", { drawId: "draw-1", status: "REVIEW", oddLak: false }, "ສົມ");
    const conditions = where.AND as Record<string, unknown>[];
    expect(conditions.slice(0, 3)).toEqual([{ draw: { dealerId: "dealer-1" } }, { drawId: "draw-1" }, { status: "REVIEW" }]);
    expect((conditions[3]!.OR as Record<string, unknown>[]).some((condition) => "billNo" in condition)).toBe(false);
  });
});
