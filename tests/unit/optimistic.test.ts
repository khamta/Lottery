import { describe, expect, test } from "bun:test";

import { applyOptimisticPatch } from "@/hooks/use-optimistic-list";

type Row = { id: string; name: string };

const rows: Row[] = [
  { id: "1", name: "A" },
  { id: "2", name: "B" },
];

describe("applyOptimisticPatch", () => {
  test("create: แทรกไว้บนสุดพร้อมธง __optimistic", () => {
    const next = applyOptimisticPatch(rows, { type: "create", item: { id: "tmp", name: "ใหม่" } });

    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ id: "tmp", name: "ใหม่", __optimistic: "create" });
  });

  test("update: แทนที่เฉพาะแถวที่ id ตรง", () => {
    const next = applyOptimisticPatch(rows, { type: "update", item: { id: "2", name: "B แก้แล้ว" } });

    expect(next[0]).toEqual(rows[0]);
    expect(next[1]).toMatchObject({ id: "2", name: "B แก้แล้ว", __optimistic: "update" });
  });

  test("delete: หายจากรายการทันที", () => {
    const next = applyOptimisticPatch(rows, { type: "delete", id: "1" });

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("2");
  });

  test("delete-many: ลบทุกแถวที่เลือกออกพร้อมกัน", () => {
    const next = applyOptimisticPatch([...rows, { id: "3", name: "C" }], {
      type: "delete-many",
      ids: ["1", "3", "ไม่มีอยู่จริง"],
    });

    expect(next.map((row) => row.id)).toEqual(["2"]);
  });

  test("ไม่แก้ไข array เดิม (immutable)", () => {
    applyOptimisticPatch(rows, { type: "delete", id: "1" });
    expect(rows).toHaveLength(2);
  });
});
