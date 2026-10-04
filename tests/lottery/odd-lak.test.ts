import { describe, expect, test } from "bun:test";

import { readTicketFilters, ticketWhere } from "@/app/(dashboard)/tickets/filters";
import { isOddLak, oddLakTicketIds } from "@/lottery/odd-lak";

describe("ยอดกีบแปลก (ไม่ลงท้าย 000)", () => {
  test("หลักพันเต็ม = ปกติ · มีเศษหลักร้อย/สิบ/หน่วย = แปลก", () => {
    for (const amount of [1000, 300_000, 1_000_000, 0]) expect(isOddLak(amount)).toBe(false);
    for (const amount of [12_112, 5110, 1158, 500, 1000.5]) expect(isOddLak(amount)).toBe(true);
  });

  test("?odd=1 → เปิดตัวกรอง · ค่าอื่น/ไม่มี = ปิด", () => {
    const draws = [{ id: "d1", status: "OPEN" as const }];
    expect(readTicketFilters({ odd: "1" }, draws).oddLak).toBe(true);
    expect(readTicketFilters({ odd: "yes" }, draws).oddLak).toBe(false);
    expect(readTicketFilters({}, draws).oddLak).toBe(false);
  });

  test("เปิดตัวกรอง → where เหลือเฉพาะโพยที่หาเจอ (ไม่เจอเลย = ไม่มีโพย ไม่ใช่ทุกโพย)", () => {
    const on = { drawId: "d1", status: null, oddLak: true };
    expect(ticketWhere("dealer-1", on, "", ["t1", "t2"])).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { id: { in: ["t1", "t2"] } }],
    });
    expect(ticketWhere("dealer-1", on, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { id: { in: [] } }],
    });
    // ปิดตัวกรอง → ไม่สน id ที่ส่งมา
    expect(ticketWhere("dealer-1", { ...on, oddLak: false }, "", ["t1"])).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }],
    });
  });

  test("ค้นเฉพาะแม่หวยนี้ · ระบุงวด = กรองงวดด้วย · ทุกงวด = ไม่กรองงวด", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      $queryRaw: (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const { Prisma } = await import("@prisma/client");
        const query = Prisma.sql(strings, ...values);
        calls.push({ sql: query.sql, values: query.values });
        return [{ id: "t1" }, { id: "t2" }];
      }) as never,
    };

    expect(await oddLakTicketIds(db, "dealer-1", "d1")).toEqual(["t1", "t2"]);
    await oddLakTicketIds(db, "dealer-1", null);

    expect(calls[0]!.sql).toContain(`AND b."drawId" =`);
    expect(calls[0]!.values.slice(0, 2)).toEqual(["dealer-1", "d1"]);
    expect(calls[1]!.sql).not.toContain(`b."drawId" =`);
    expect(calls[1]!.values[0]).toBe("dealer-1");
    for (const call of calls) expect(call.sql).toContain("MOD(b.amount");
  });
});
