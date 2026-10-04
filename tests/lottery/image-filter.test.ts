import { describe, expect, test } from "bun:test";

import { readTicketFilters, ticketWhere } from "@/app/(dashboard)/tickets/filters";

describe("ตัวกรองโพยที่มีรูป (?image=1)", () => {
  const draws = [{ id: "d1", status: "OPEN" as const }];

  test("?image=1 → เปิดตัวกรอง · ค่าอื่น/ไม่มี = ปิด", () => {
    expect(readTicketFilters({ image: "1" }, draws).image).toBe(true);
    expect(readTicketFilters({ image: "yes" }, draws).image).toBe(false);
    expect(readTicketFilters({}, draws).image).toBe(false);
  });

  test("เปิดตัวกรอง → where เหลือเฉพาะโพยที่มีรูป · ปิด = ไม่กรอง", () => {
    const base = { drawId: "d1", status: null, oddLak: false };
    expect(ticketWhere("dealer-1", { ...base, image: true }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { image: { isNot: null } }],
    });
    expect(ticketWhere("dealer-1", { ...base, image: false }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }],
    });
  });
});
