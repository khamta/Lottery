import { describe, expect, test } from "bun:test";

import {
  groupParamValue,
  groupWhere,
  isUnread,
  readGroupParam,
  readRememberedParams,
  rememberedQuery,
  resolveGroups,
} from "@/app/(dashboard)/tickets/groups";
import { ticketWhere } from "@/app/(dashboard)/tickets/filters";

describe("กลุ่มของหน้าโพย (?group=)", () => {
  const options = [{ key: "g-latest" }, { key: "g-old" }, { key: "none" }];

  test("อ่าน ?group= : all · หลายกลุ่มคั่นด้วย , (ตัดซ้ำ/ช่องว่าง) · ไม่ระบุ = null", () => {
    expect(readGroupParam({ group: "all" })).toBe("all");
    expect(readGroupParam({ group: "a, b,,a" })).toEqual(["a", "b"]);
    expect(readGroupParam({ group: "" })).toBeNull();
    expect(readGroupParam({})).toBeNull();
  });

  test("ไม่ระบุ = กลุ่มที่มีโพยล่าสุด (ตัวเลือกแรก) · all = ทุกกลุ่ม (null)", () => {
    expect(resolveGroups(null, options)).toEqual(["g-latest"]);
    expect(resolveGroups("all", options)).toBeNull();
  });

  test("รวมหลายกลุ่มได้ · กลุ่มที่ไม่อยู่ในตัวเลือก (ของงวด/แม่หวยอื่น) ถูกตัดทิ้ง · ไม่เหลือเลย = กลุ่มเริ่มต้น", () => {
    expect(resolveGroups(["g-old", "none"], options)).toEqual(["g-old", "none"]);
    expect(resolveGroups(["g-old", "other-dealer"], options)).toEqual(["g-old"]);
    expect(resolveGroups(["other-dealer"], options)).toEqual(["g-latest"]);
    expect(resolveGroups(null, [])).toEqual(["none"]);
  });

  test("ค่า ?group= ที่เขียนกลับลง URL อ่านแล้วได้กลุ่มเดิม (redirect ไม่วน)", () => {
    for (const groups of [["g-old", "none"], ["g-latest"], null]) {
      const value = groupParamValue(groups);
      expect(resolveGroups(readGroupParam({ group: value }), options)).toEqual(groups);
    }
  });

  test("where: กลุ่มจริง = groupId in · none = groupId เป็น null · ผสมกัน = OR", () => {
    expect(groupWhere(["a", "b"])).toEqual({ groupId: { in: ["a", "b"] } });
    expect(groupWhere(["none"])).toEqual({ groupId: null });
    expect(groupWhere(["a", "none"])).toEqual({ OR: [{ groupId: { in: ["a"] } }, { groupId: null }] });
  });

  test("ticketWhere กรองกลุ่มต่อจากเงื่อนไขอื่น · ไม่มี groups = ไม่กรองกลุ่ม", () => {
    const base = { drawId: "d1", status: null, oddLak: false };
    expect(ticketWhere("dealer-1", { ...base, groups: ["a"] }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }, { groupId: { in: ["a"] } }],
    });
    expect(ticketWhere("dealer-1", { ...base, groups: null }, "")).toEqual({
      AND: [{ draw: { dealerId: "dealer-1" } }, { drawId: "d1" }],
    });
  });
});

describe("โพยที่ยังไม่ได้ดู", () => {
  const seenAt = new Date("2026-10-05T10:00:00Z");

  test("เข้ามาหลังเวลาที่กด ดูทั้งหมดแล้ว = ยังไม่ได้ดู · ก่อน/ตรงเวลา = ดูแล้ว · ไม่เคยกด = ยังไม่ได้ดู", () => {
    expect(isUnread(new Date("2026-10-05T10:00:01Z"), seenAt)).toBe(true);
    expect(isUnread(new Date("2026-10-05T10:00:00Z"), seenAt)).toBe(false);
    expect(isUnread(new Date("2026-10-05T09:00:00Z"), seenAt)).toBe(false);
    expect(isUnread(new Date("2026-10-05T09:00:00Z"), undefined)).toBe(true);
  });
});

describe("จำตัวกรองของหน้าโพย", () => {
  test("เก็บเฉพาะตัวกรองที่จำ — ไม่จำเลขหน้า และไม่เก็บค่าว่าง", () => {
    const current = new URLSearchParams("draw=d1&group=a,none&status=REVIEW&q=&page=3&pageSize=20&foo=bar");
    expect(rememberedQuery(current)).toBe("draw=d1&group=a%2Cnone&status=REVIEW&pageSize=20");
  });

  test("อ่านค่าที่จำไว้ (ทั้งแบบถอดแล้วและยังไม่ถอด) · รับเฉพาะคีย์ที่รู้จัก · ว่าง/เสีย = null", () => {
    const saved = "draw=d1&group=a%2Cnone&q=%E0%B8%81&evil=1";
    const expected = { draw: "d1", group: "a,none", q: "ก" };
    expect(readRememberedParams(saved)).toEqual(expected);
    expect(readRememberedParams(encodeURIComponent(saved))).toEqual(expected);
    expect(readRememberedParams("")).toBeNull();
    expect(readRememberedParams(undefined)).toBeNull();
    expect(readRememberedParams("evil=1")).toBeNull();
    expect(readRememberedParams("%E0%A4%A")).toBeNull();
  });
});
