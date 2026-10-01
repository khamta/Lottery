import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module limits — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * (แบบเดียวกับ tests/server/product-actions.test.ts)
 */
const db = {
  limits: new Map<string, Record<string, unknown>>(),
  auditRows: [] as Record<string, unknown>[],
  throwOnCreate: null as unknown,
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;

const tx = {
  limit: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (db.throwOnCreate) throw db.throwOnCreate;
      const limit = { id: `limit-${nextId++}`, ...data };
      db.limits.set(limit.id, limit);
      return limit;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const updated = { ...db.limits.get(where.id)!, ...data };
      db.limits.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.limits.get(where.id)!;
      db.limits.delete(where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      for (const id of where.id.in) db.limits.delete(id);
      return { count: where.id.in.length };
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.limits.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const row = db.limits.get(where.id);
      return row && row.dealerId === where.dealerId ? row : null;
    },
    findMany: async ({ where }: { where: { id: { in: string[] }; dealerId: string } }) =>
      where.id.in
        .map((id) => db.limits.get(id))
        .filter((c): c is Record<string, unknown> => !!c && c.dealerId === where.dealerId),
  },
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      db.auditRows.push(data);
      return data;
    },
    createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
      db.auditRows.push(...data);
      return { count: data.length };
    },
  },
};

mock.module("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  },
}));

mock.module("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error("UNAUTHORIZED");
    return currentUser;
  },
  requireRole: async (roles: string[]) => {
    if (!currentUser) throw new Error("UNAUTHORIZED");
    if (!roles.includes(currentUser.role)) throw new Error("FORBIDDEN");
    return currentUser;
  },
}));

mock.module("@/lottery/dealer", () => ({
  DEALER_COOKIE: "dealer",
  requireDealerId: async () => {
    if (!currentDealerId) throw new Error("dealers.required");
    return currentDealerId;
  },
}));

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { createLimit, updateLimit, deleteLimit, deleteLimits } = await import("@/app/(dashboard)/limits/actions");

const valid = { digits: 2, number: "32", position: "TOP" as const, currency: "LAK" as const, maxAmount: 500_000 };

beforeEach(() => {
  currentDealerId = "dealer-1";
  db.limits.clear();
  db.auditRows = [];
  db.throwOnCreate = null;
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  nextId = 1;
});

describe("createLimit", () => {
  test("บันทึกสำเร็จและ revalidate หน้าที่ใช้เพดาน", async () => {
    const result = await createLimit(valid);

    expect(result.ok).toBe(true);
    expect([...db.limits.values()][0]).toMatchObject(valid);
    expect(revalidated).toEqual(expect.arrayContaining(["/limits", "/reports", "/dashboard"]));
  });

  test("เพดานของทุกเลข: เลขว่างเก็บเป็นข้อความว่าง", async () => {
    await createLimit({ ...valid, number: "" });
    expect([...db.limits.values()][0]!.number).toBe("");
  });

  test("เลข 3 ตัวฝั่งล่าง → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await createLimit({ ...valid, digits: 3, number: "243", position: "BOTTOM" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.limits.size).toBe(0);
  });

  test("เพดานใหม่เป็นของแม่หวยที่เลือกอยู่ · ไม่มีแม่หวย → dealers.required", async () => {
    await createLimit(valid);
    expect([...db.limits.values()][0]!.dealerId).toBe("dealer-1");

    currentDealerId = null;
    const result = await createLimit({ ...valid, number: "72" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("dealers.required");
    expect(db.limits.size).toBe(1);
  });

  test("เพดานของแม่หวยอื่น แก้/ลบไม่ได้ — ลบหลายรายการข้าม id ของแม่หวยอื่น", async () => {
    const created = await createLimit(valid);
    const id = created.ok ? created.data.id : "";
    currentDealerId = "dealer-2";

    const updated = await updateLimit({ ...valid, id, maxAmount: 1 });
    const deleted = await deleteLimit({ id });
    const bulk = await deleteLimits({ ids: [id] });

    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.message).toBe("limits.notFound");
    expect(deleted.ok).toBe(false);
    expect(bulk.ok && bulk.data.count).toBe(0);
    expect(db.limits.get(id)).toMatchObject({ maxAmount: 500_000 });
  });

  test("เพดานซ้ำ เลข/ฝั่ง/สกุลเงินเดียวกัน (Prisma P2002) → CONFLICT", async () => {
    db.throwOnCreate = { code: "P2002" };
    const result = await createLimit(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("เขียน audit log action CREATE พร้อมป้ายที่อ่านรู้เรื่อง", async () => {
    await createLimit(valid);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({
      action: "CREATE",
      entity: "Limit",
      userId: "user-1",
      summary: "2 · 32 · TOP · LAK",
    });
  });
});

describe("updateLimit", () => {
  test("แก้ยอด: audit log เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง", async () => {
    const created = await createLimit(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await updateLimit({ ...valid, id, maxAmount: 0 });

    expect(result.ok).toBe(true);
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0].changes).toEqual({ maxAmount: { from: 500_000, to: 0 } });
  });

  test("แก้ไขแบบค่าเดิมทุกอย่าง → ไม่เขียน audit log", async () => {
    const created = await createLimit(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    await updateLimit({ ...valid, id });

    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteLimit / deleteLimits", () => {
  test("ลบตาม id ที่ส่งมา และเขียน audit log action DELETE", async () => {
    const created = await createLimit(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await deleteLimit({ id });

    expect(result.ok).toBe(true);
    expect(db.limits.has(id)).toBe(false);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Limit", entityId: id, userId: "user-1" });
  });

  test("ลบที่เลือกในคำสั่งเดียว พร้อม audit หนึ่งแถวต่อรายการ", async () => {
    const a = await createLimit(valid);
    const b = await createLimit({ ...valid, number: "72" });
    db.auditRows = [];
    const ids = [a, b].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteLimits({ ids });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(2);
    expect(db.limits.size).toBe(0);
    expect(db.auditRows).toHaveLength(2);
  });

  test("ไม่ได้เลือกอะไร → VALIDATION", async () => {
    const result = await deleteLimits({ ids: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});
