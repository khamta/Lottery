import { describe, expect, test } from "bun:test";

import { parseAmountQuery, readTicketFilters, ticketWhere } from "@/app/(dashboard)/tickets/filters";

describe("ค้นตามยอดต่อตัว (?amount=)", () => {
  test("ตัวเลข / มีจุลภาค / เว้นวรรค / ทศนิยม 2 ตำแหน่ง = ค้นได้", () => {
    expect(parseAmountQuery("5000")).toBe(5000);
    expect(parseAmountQuery("5,000")).toBe(5000);
    expect(parseAmountQuery(" 1 000 000 ")).toBe(1_000_000);
    expect(parseAmountQuery("20.5")).toBe(20.5);
  });

  test("ว่าง / ไม่ใช่ตัวเลข / ≤ 0 / เกินเพดาน = ไม่กรอง", () => {
    for (const value of [undefined, "", "abc", "5k", "-100", "0", "1.234", "9999999999999"]) {
      expect(parseAmountQuery(value)).toBeNull();
    }
  });

  test("อ่านจาก URL", () => {
    const draws = [{ id: "d1", status: "OPEN" as const }];
    expect(readTicketFilters({ amount: "10,000" }, draws).amount).toBe(10_000);
    expect(readTicketFilters({}, draws).amount).toBeNull();
  });

  test("where = มีรายการแทงยอดเท่านี้อย่างน้อย 1 รายการ · ไม่ระบุ = ไม่กรอง", () => {
    const base = { drawId: "d1", status: null, oddLak: false };
    expect(ticketWhere("dealer-1", { ...base, amount: 5000 }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { bets: { some: { amount: 5000 } } }],
    });
    expect(ticketWhere("dealer-1", { ...base, amount: null }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }],
    });
  });
});
