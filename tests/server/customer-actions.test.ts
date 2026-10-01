import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module customers — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * (แบบเดียวกับ tests/server/product-actions.test.ts)
 */
const db = {
  customers: new Map<string, Record<string, unknown>>(),
  auditRows: [] as Record<string, unknown>[],
  throwOnCreate: null as unknown,
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;

const tx = {
  customer: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (db.throwOnCreate) throw db.throwOnCreate;
      const customer = { id: `customer-${nextId++}`, ...data };
      db.customers.set(customer.id, customer);
      return customer;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const updated = { ...db.customers.get(where.id)!, ...data };
      db.customers.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.customers.get(where.id)!;
      db.customers.delete(where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      for (const id of where.id.in) db.customers.delete(id);
      return { count: where.id.in.length };
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.customers.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const row = db.customers.get(where.id);
      return row && row.dealerId === where.dealerId ? row : null;
    },
    findMany: async ({ where }: { where: { id: { in: string[] }; dealerId: string } }) =>
      where.id.in
        .map((id) => db.customers.get(id))
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

const { createCustomer, updateCustomer, deleteCustomer, deleteCustomers } = await import(
  "@/app/(dashboard)/customers/actions"
);

const valid = { name: "ເອື້ອຍນ້ອຍ", phone: "8562055512345", lakMultiplier: 1000, note: "" };

beforeEach(() => {
  currentDealerId = "dealer-1";
  db.customers.clear();
  db.auditRows = [];
  db.throwOnCreate = null;
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  nextId = 1;
});

describe("createCustomer", () => {
  test("บันทึกสำเร็จและ revalidate หน้า /customers", async () => {
    const result = await createCustomer(valid);

    expect(result.ok).toBe(true);
    expect([...db.customers.values()][0]).toMatchObject({ name: valid.name, phone: valid.phone, lakMultiplier: 1000 });
    expect(revalidated).toContain("/customers");
  });

  test("เบอร์และหมายเหตุว่างถูกเก็บเป็น null (เบอร์ว่างหลายคนจึงไม่ชน unique)", async () => {
    await createCustomer({ ...valid, phone: "", note: "" });
    const customer = [...db.customers.values()][0]!;
    expect(customer.phone).toBeNull();
    expect(customer.note).toBeNull();
  });

  test("ข้อมูลไม่ผ่าน validation → ไม่แตะฐานข้อมูล", async () => {
    const result = await createCustomer({ ...valid, phone: "020-5551" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.customers.size).toBe(0);
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await createCustomer(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  test("ชื่อหรือเบอร์ซ้ำ (Prisma P2002) → CONFLICT", async () => {
    db.throwOnCreate = { code: "P2002" };
    const result = await createCustomer(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("เขียน audit log action CREATE พร้อม userId ของคนสร้าง", async () => {
    await createCustomer(valid);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "CREATE", entity: "Customer", userId: "user-1" });
  });
});

describe("updateCustomer", () => {
  test("เปลี่ยนวิธีอ่านยอดกีบ: audit log เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง", async () => {
    const created = await createCustomer(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await updateCustomer({ ...valid, id, lakMultiplier: 1 });

    expect(result.ok).toBe(true);
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0].changes).toEqual({ lakMultiplier: { from: 1000, to: 1 } });
  });

  test("แก้ไขแบบค่าเดิมทุกอย่าง → ไม่เขียน audit log", async () => {
    const created = await createCustomer(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    await updateCustomer({ ...valid, id });

    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteCustomer", () => {
  test("ลบตาม id ที่ส่งมา และเขียน audit log action DELETE", async () => {
    const created = await createCustomer(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await deleteCustomer({ id });

    expect(result.ok).toBe(true);
    expect(db.customers.has(id)).toBe(false);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Customer", entityId: id, userId: "user-1" });
  });

  test("id ว่าง → VALIDATION", async () => {
    const result = await deleteCustomer({ id: "" });
    expect(result.ok).toBe(false);
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("แยกตามแม่หวย", () => {
  test("ลูกค้าใหม่เป็นของแม่หวยที่เลือกอยู่", async () => {
    await createCustomer(valid);
    expect([...db.customers.values()][0]!.dealerId).toBe("dealer-1");
  });

  test("ลูกค้าของแม่หวยอื่น แก้/ลบไม่ได้ — ลบหลายรายการข้าม id ของแม่หวยอื่น", async () => {
    const created = await createCustomer(valid);
    const id = created.ok ? created.data.id : "";
    currentDealerId = "dealer-2";
    db.auditRows = [];

    const updated = await updateCustomer({ ...valid, id, name: "x" });
    const deleted = await deleteCustomer({ id });
    const bulk = await deleteCustomers({ ids: [id] });

    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.message).toBe("customers.notFound");
    expect(deleted.ok).toBe(false);
    expect(bulk.ok && bulk.data.count).toBe(0);
    expect(db.customers.has(id)).toBe(true);
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteCustomers (ลบที่เลือก)", () => {
  test("ลบทุก id ในคำสั่งเดียวและคืนจำนวนที่ลบ พร้อม audit หนึ่งแถวต่อคน", async () => {
    const a = await createCustomer({ ...valid, name: "A", phone: "" });
    const b = await createCustomer({ ...valid, name: "B", phone: "" });
    db.auditRows = [];
    const ids = [a, b].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteCustomers({ ids });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(2);
    expect(db.customers.size).toBe(0);
    expect(db.auditRows).toHaveLength(2);
    expect(db.auditRows.every((row) => row.action === "DELETE")).toBe(true);
  });

  test("ไม่ได้เลือกอะไร → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await deleteCustomers({ ids: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });

  test("เกิน 100 รายการ → VALIDATION", async () => {
    const result = await deleteCustomers({ ids: Array.from({ length: 101 }, (_, i) => `c-${i}`) });
    expect(result.ok).toBe(false);
  });
});
