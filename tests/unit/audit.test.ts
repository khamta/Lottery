import { beforeEach, describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";

import { diffChanges, logAudit, logAuditMany } from "@/lib/audit";

describe("diffChanges", () => {
  test("CREATE เก็บทุกฟิลด์เป็น { to } ยกเว้น id/createdAt/updatedAt", () => {
    const changes = diffChanges("CREATE", null, {
      id: "p1",
      name: "Coffee",
      price: 100,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    expect(changes).toEqual({
      name: { to: "Coffee" },
      price: { to: 100 },
    });
  });

  test("UPDATE เก็บเฉพาะฟิลด์ที่เปลี่ยนจริงเป็น { from, to }", () => {
    const changes = diffChanges(
      "UPDATE",
      { name: "Coffee", price: 100, stock: 5 },
      { name: "Coffee Latte", price: 100, stock: 5 },
    );

    expect(changes).toEqual({ name: { from: "Coffee", to: "Coffee Latte" } });
  });

  test("UPDATE ที่ไม่มีอะไรเปลี่ยน → คืน object ว่าง", () => {
    const changes = diffChanges("UPDATE", { name: "Coffee", price: 100 }, { name: "Coffee", price: 100 });
    expect(changes).toEqual({});
  });

  test("DELETE เก็บทุกฟิลด์เป็น { from }", () => {
    const changes = diffChanges("DELETE", { id: "p1", name: "Coffee", price: 100 }, null);
    expect(changes).toEqual({ name: { from: "Coffee" }, price: { from: 100 } });
  });

  test("Decimal ถูกแปลงเป็น number", () => {
    const changes = diffChanges("CREATE", null, { price: new Prisma.Decimal("199.50") });
    expect(changes).toEqual({ price: { to: 199.5 } });
  });

  test("Date ถูกแปลงเป็น ISO string", () => {
    const date = new Date("2026-03-01T10:00:00.000Z");
    const changes = diffChanges("CREATE", null, { publishedAt: date });
    expect(changes).toEqual({ publishedAt: { to: date.toISOString() } });
  });

  test("Bytes/Buffer ถูกข้ามไปเลย ไม่ถูกเก็บ", () => {
    const changes = diffChanges("CREATE", null, { avatarBinary: Buffer.from("secret-bytes") });
    expect(changes).toEqual({});
  });

  test("ฟิลด์อ่อนไหว (password) ถูก redact ทั้งสองด้าน แต่ยังรู้ว่าเปลี่ยน", () => {
    const changes = diffChanges("UPDATE", { password: "hash-old" }, { password: "hash-new" });
    expect(changes).toEqual({ password: { from: "[redacted]", to: "[redacted]" } });
  });

  test("ฟิลด์อ่อนไหว (accessToken) ถูก redact ด้วย pattern *token*", () => {
    const changes = diffChanges("CREATE", null, { accessToken: "raw-token-value" });
    expect(changes).toEqual({ accessToken: { to: "[redacted]" } });
  });

  test("ฟิลด์ password ที่ไม่เปลี่ยน → ไม่ถูกเก็บ (ไม่ redact ของที่ไม่เปลี่ยน)", () => {
    const changes = diffChanges("UPDATE", { password: "hash-1", name: "A" }, { password: "hash-1", name: "A" });
    expect(changes).toEqual({});
  });

  test("id / createdAt / updatedAt ไม่ถูกเก็บแม้เปลี่ยน", () => {
    const changes = diffChanges(
      "UPDATE",
      { id: "1", createdAt: new Date(0), updatedAt: new Date(0), name: "A" },
      { id: "2", createdAt: new Date(1), updatedAt: new Date(1), name: "A" },
    );
    expect(changes).toEqual({});
  });
});

describe("logAudit / logAuditMany", () => {
  const rows: unknown[] = [];
  let createCalls = 0;
  let createManyCalls = 0;

  const db = {
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        createCalls += 1;
        rows.push(data);
        return data;
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        createManyCalls += 1;
        rows.push(...data);
        return { count: data.length };
      },
    },
    // เพื่อจำลองว่า db เป็น prisma หรือ transaction client ก็เรียกได้เหมือนกัน
  } as never;

  beforeEach(() => {
    rows.length = 0;
    createCalls = 0;
    createManyCalls = 0;
  });

  test("ทำงานได้แม้ไม่มี request context (headers() โยน error) — จับด้วย try/catch", async () => {
    await logAudit(db, {
      action: "CREATE",
      entity: "Product",
      entityId: "p1",
      summary: "SKU-1 · Coffee",
      after: { name: "Coffee" },
      user: { id: "u1", name: "Somchai" },
    });

    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.action).toBe("CREATE");
    expect(row.entity).toBe("Product");
    expect(row.userId).toBe("u1");
    expect(row.userName).toBe("Somchai");
    expect(row.ip).toBeNull();
    expect(row.userAgent).toBeNull();
  });

  test("UPDATE ที่ไม่มีอะไรเปลี่ยน → ไม่เขียนแถว audit เลย", async () => {
    await logAudit(db, {
      action: "UPDATE",
      entity: "Product",
      entityId: "p1",
      before: { name: "Coffee" },
      after: { name: "Coffee" },
      user: { id: "u1" },
    });

    expect(rows).toHaveLength(0);
  });

  test("ไม่มี user (เช่น ระบบอัตโนมัติ) → userId/userName เป็น null", async () => {
    await logAudit(db, {
      action: "DELETE",
      entity: "Product",
      entityId: "p1",
      before: { name: "Coffee" },
    });

    const row = rows[0] as Record<string, unknown>;
    expect(row.userId).toBeNull();
    expect(row.userName).toBeNull();
  });

  test("logAuditMany เขียนหลายแถวในคำสั่งเดียว (createMany) และข้าม UPDATE ที่ไม่เปลี่ยน", async () => {
    await logAuditMany(db, [
      {
        action: "DELETE",
        entity: "Product",
        entityId: "p1",
        before: { name: "Coffee" },
        user: { id: "u1" },
      },
      {
        action: "DELETE",
        entity: "Product",
        entityId: "p2",
        before: { name: "Tea" },
        user: { id: "u1" },
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(createManyCalls).toBe(1);
    expect(createCalls).toBe(0);
  });

  test("logAuditMany กับ entries ว่าง → ไม่เรียก createMany เลย", async () => {
    await logAuditMany(db, []);
    expect(createManyCalls).toBe(0);
    expect(rows).toHaveLength(0);
  });
});
