import { describe, expect, test } from "bun:test";

import { billQueryPrefix, ticketWhere } from "@/app/(dashboard)/tickets/filters";
import { billStamp, nextFreeBillNo } from "@/lottery/bill";

/** เลขบิลแบบ ปีเดือนวันเวลา (src/lottery/bill.ts) + การค้นหาด้วยเลขบิลในหน้าโพย */
describe("เลขบิล", () => {
  test("ปีเดือนวันเวลา yyMMddHHmmss ตามเวลาลาว (UTC+7) — ข้ามวันตามเวลาลาว ไม่ใช่ UTC", () => {
    expect(billStamp(new Date("2026-10-02T07:30:15Z"))).toBe("261002143015");
    expect(billStamp(new Date("2026-10-02T17:05:09Z"))).toBe("261003000509");
  });

  test("ไม่ชน = เวลาล้วน · ชน = ต่อท้าย -2, -3 … ต่อจากเลขสูงสุด (แม้ใบกลางถูกลบไป)", () => {
    expect(nextFreeBillNo("261002143015", [])).toBe("261002143015");
    expect(nextFreeBillNo("261002143015", ["261002143015"])).toBe("261002143015-2");
    expect(nextFreeBillNo("261002143015", ["261002143015", "261002143015-3"])).toBe("261002143015-4");
  });

  test("เรียงแบบข้อความ = เรียงตามเวลา", () => {
    const bills = ["261002143016", "261002143015-2", "261002143015", "261002143015-3"];
    expect(bills.sort()).toEqual(["261002143015", "261002143015-2", "261002143015-3", "261002143016"]);
  });
});

describe("ค้นหาด้วยเลขบิล (tickets/filters.ts)", () => {
  test("ตัวเลข 6 หลักขึ้นไป (+ -2 ท้ายได้) = เลขบิล · สั้นกว่านั้นหรือมีตัวอื่นปน = ไม่ใช่", () => {
    expect(billQueryPrefix("261002")).toBe("261002");
    expect(billQueryPrefix(" 261002143015-2 ")).toBe("261002143015-2");
    expect(billQueryPrefix("2610")).toBeNull();
    expect(billQueryPrefix("#261002")).toBeNull();
    expect(billQueryPrefix("32.72=300")).toBeNull();
  });

  test("เลขบิล → ค้นแบบขึ้นต้นด้วย (261002 = ทุกบิลของวันนั้น) และยังค้นในข้อความโพยด้วย", () => {
    const where = ticketWhere("dealer-1", { drawId: null, status: null }, "261002");
    const or = (where.AND as { OR?: unknown[] }[])[1]!.OR!;
    expect(or[0]).toEqual({ billNo: { startsWith: "261002" } });
    expect(or[1]).toEqual({ rawText: { contains: "261002", mode: "insensitive" } });
  });

  test("คำค้นธรรมดาไม่มีเงื่อนไขเลขบิล", () => {
    const where = ticketWhere("dealer-1", { drawId: "draw-1", status: "REVIEW" }, "ສົມ");
    const conditions = where.AND as Record<string, unknown>[];
    expect(conditions.slice(0, 3)).toEqual([{ draw: { dealerId: "dealer-1" } }, { drawId: "draw-1" }, { status: "REVIEW" }]);
    expect((conditions[3]!.OR as Record<string, unknown>[]).some((condition) => "billNo" in condition)).toBe(false);
  });
});
