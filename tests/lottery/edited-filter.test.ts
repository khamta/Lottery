import { describe, expect, test } from "bun:test";

import { readTicketFilters, ticketWhere } from "@/app/(dashboard)/tickets/filters";
import { REMEMBERED_TICKET_PARAMS } from "@/app/(dashboard)/tickets/types";

describe("ตัวกรองโพยที่แก้ไขล่าสุด (?edited=1)", () => {
  const draws = [{ id: "d1", status: "OPEN" as const }];

  test("?edited=1 → เปิดตัวกรอง · ค่าอื่น/ไม่มี = ปิด", () => {
    expect(readTicketFilters({ edited: "1" }, draws).edited).toBe(true);
    expect(readTicketFilters({ edited: "yes" }, draws).edited).toBe(false);
    expect(readTicketFilters({}, draws).edited).toBe(false);
  });

  test("เปิดตัวกรอง → where เหลือเฉพาะโพยที่คนแก้แล้ว · ปิด = ไม่กรอง", () => {
    const base = { drawId: "d1", status: null, oddLak: false };
    expect(ticketWhere("dealer-1", { ...base, edited: true }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { editedAt: { not: null } }],
    });
    expect(ticketWhere("dealer-1", { ...base, edited: false }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }],
    });
  });

  test("หน้าโพยจำตัวกรองนี้ไว้เหมือนตัวกรองอื่น", () => {
    expect(REMEMBERED_TICKET_PARAMS).toContain("edited");
  });
});
