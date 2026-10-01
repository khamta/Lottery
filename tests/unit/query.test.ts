import { describe, expect, test } from "bun:test";

import { buildOrderBy, buildQueryString, paginate, parseListParams } from "@/lib/query";
import { siteConfig } from "@/config/site";

describe("parseListParams", () => {
  test("ค่าเริ่มต้น: หน้า 1 และ 10 รายการต่อหน้า", () => {
    const params = parseListParams({});
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(10);
    expect(params.pageSize).toBe(siteConfig.pagination.defaultPageSize);
  });

  test("อ่านค่าจาก query string", () => {
    const params = parseListParams({ page: "3", pageSize: "50", q: "  เก้าอี้  ", order: "asc" });
    expect(params.page).toBe(3);
    expect(params.pageSize).toBe(50);
    expect(params.q).toBe("เก้าอี้");
    expect(params.order).toBe("asc");
  });

  test("pageSize นอกตัวเลือกที่กำหนด → กลับไปใช้ค่าเริ่มต้น", () => {
    expect(parseListParams({ pageSize: "9999" }).pageSize).toBe(10);
    expect(parseListParams({ pageSize: "abc" }).pageSize).toBe(10);
  });

  test("page ที่ไม่ถูกต้อง → 1", () => {
    expect(parseListParams({ page: "0" }).page).toBe(1);
    expect(parseListParams({ page: "-5" }).page).toBe(1);
    expect(parseListParams({ page: "ไม่ใช่ตัวเลข" }).page).toBe(1);
  });

  test("sort ที่ไม่อยู่ใน whitelist ถูกตัดทิ้ง (กัน orderBy แปลกปลอม)", () => {
    const params = parseListParams(
      { sort: "password" },
      { sortable: ["name", "createdAt"], defaultSort: "createdAt" },
    );
    expect(params.sort).toBe("createdAt");
  });

  test("รับค่าที่เป็น array จาก searchParams ได้ (?page=2&page=5)", () => {
    expect(parseListParams({ page: ["2", "5"] }).page).toBe(2);
  });

  test("ตัดคำค้นที่ยาวเกิน 100 ตัวอักษร", () => {
    expect(parseListParams({ q: "ก".repeat(200) }).q.length).toBe(100);
  });
});

describe("buildOrderBy", () => {
  test("field ปกติ", () => {
    expect(buildOrderBy({ sort: "name", order: "asc" })).toEqual({ name: "asc" });
  });

  test("field ซ้อน (relation)", () => {
    expect(buildOrderBy({ sort: "category.name", order: "desc" })).toEqual({
      category: { name: "desc" },
    });
  });

  test("ไม่มี sort → undefined (ให้ caller ใช้ค่า default ของตัวเอง)", () => {
    expect(buildOrderBy({ sort: "", order: "desc" })).toBeUndefined();
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1) }));

  function fakeModel(total: number) {
    const calls: Record<string, unknown>[] = [];
    return {
      calls,
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return rows;
      },
      count: async () => total,
    };
  }

  test("ส่ง skip/take ให้ Prisma ตามหน้าที่เลือก", async () => {
    const model = fakeModel(95);
    await paginate(model, { params: { page: 3, pageSize: 10, q: "", sort: "", order: "desc" } });

    expect(model.calls[0].skip).toBe(20);
    expect(model.calls[0].take).toBe(10);
  });

  test("คำนวณ pageCount จากจำนวนทั้งหมด", async () => {
    const result = await paginate(fakeModel(95), {
      params: { page: 1, pageSize: 10, q: "", sort: "", order: "desc" },
    });

    expect(result.total).toBe(95);
    expect(result.pageCount).toBe(10);
    expect(result.rows).toHaveLength(10);
  });

  test("ไม่มีข้อมูลเลย → pageCount อย่างน้อย 1 (กันหารศูนย์)", async () => {
    const result = await paginate(
      { findMany: async () => [], count: async () => 0 },
      { params: { page: 1, pageSize: 10, q: "", sort: "", order: "desc" } },
    );
    expect(result.pageCount).toBe(1);
    expect(result.total).toBe(0);
  });

  test("map แปลงค่าที่ส่งข้ามไป client ไม่ได้", async () => {
    const result = await paginate<{ id: string; price: number }, { id: string }>(fakeModel(3), {
      params: { page: 1, pageSize: 10, q: "", sort: "", order: "desc" },
      map: (row) => ({ id: row.id, price: 99 }),
    });

    expect(result.rows[0]).toEqual({ id: "1", price: 99 });
  });
});

describe("buildQueryString", () => {
  test("แก้เฉพาะค่าที่ส่งมา ค่าที่เหลือคงเดิม", () => {
    const current = new URLSearchParams("q=เก้าอี้&pageSize=20&page=4");
    const qs = new URLSearchParams(buildQueryString(current, { page: 1 }));

    expect(qs.get("page")).toBe("1");
    expect(qs.get("q")).toBe("เก้าอี้");
    expect(qs.get("pageSize")).toBe("20");
  });

  test("ค่าว่างถูกลบออกจาก URL", () => {
    const qs = new URLSearchParams(buildQueryString(new URLSearchParams("q=abc&page=2"), { q: "" }));
    expect(qs.has("q")).toBe(false);
  });
});
