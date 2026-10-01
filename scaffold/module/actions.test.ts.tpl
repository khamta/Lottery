import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * ตัวอย่างการเทสต์ server action:
 * mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * ใช้เป็นแม่แบบสำหรับ module อื่น ๆ ได้เลย
 *
 * ทุก action เขียนข้อมูลผ่าน `prisma.$transaction(async (tx) => ...)` แล้วเรียก `logAudit`/`logAuditMany`
 * ใน tx เดียวกัน — mock `$transaction` แค่เรียก callback ด้วยตัว db จำลองตัวเดียวกันก็พอ (ไม่ต้องจำลอง isolation จริง)
 */
const db = {
  products: new Map<string, Record<string, unknown>>(),
  auditRows: [] as Record<string, unknown>[],
  throwOnCreate: null as unknown,
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "ADMIN" };
let nextId = 1;

const tx = {
  product: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (db.throwOnCreate) throw db.throwOnCreate;
      const product = { id: `product-${nextId++}`, description: null, ...data };
      db.products.set(product.id as string, product);
      return product;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = db.products.get(where.id)!;
      const updated = { ...existing, ...data };
      db.products.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.products.get(where.id)!;
      db.products.delete(where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      for (const id of where.id.in) db.products.delete(id);
      return { count: where.id.in.length };
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.products.get(where.id) ?? null,
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => db.products.get(id)).filter((p): p is Record<string, unknown> => !!p),
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
  requireRole: async () => currentUser,
}));

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { createProduct, updateProduct, deleteProduct, deleteProducts } = await import(
  "@/app/(dashboard)/products/actions"
);

const valid = { name: "สินค้าใหม่", sku: "SKU-9001", price: 199, stock: 10, status: "ACTIVE" as const };

beforeEach(() => {
  db.products.clear();
  db.auditRows = [];
  db.throwOnCreate = null;
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "ADMIN" };
  nextId = 1;
});

describe("createProduct", () => {
  test("บันทึกสำเร็จและ revalidate หน้า /products", async () => {
    const result = await createProduct(valid);

    expect(result.ok).toBe(true);
    expect(db.products.size).toBe(1);
    expect(revalidated).toContain("/products");
  });

  test("description ว่างถูกเก็บเป็น null", async () => {
    await createProduct({ ...valid, description: "" });
    const product = [...db.products.values()][0] as { description: string | null };
    expect(product.description).toBeNull();
  });

  test("ข้อมูลไม่ผ่าน validation → ไม่แตะฐานข้อมูล", async () => {
    const result = await createProduct({ ...valid, sku: "!!" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.products.size).toBe(0);
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await createProduct(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  test("SKU ซ้ำ (Prisma P2002) → CONFLICT", async () => {
    db.throwOnCreate = { code: "P2002" };
    const result = await createProduct(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("เขียน audit log action CREATE พร้อม userId ของคนสร้าง", async () => {
    await createProduct(valid);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({
      action: "CREATE",
      entity: "Product",
      userId: "user-1",
    });
    expect((db.auditRows[0].changes as Record<string, unknown>).name).toEqual({ to: valid.name });
  });
});

describe("updateProduct", () => {
  test("แก้ไขแล้ว audit log เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง", async () => {
    const created = await createProduct(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = []; // ล้าง audit ของ create ทิ้ง สนใจแค่ของ update

    const result = await updateProduct({ id, ...valid, name: "สินค้าใหม่ (แก้ไข)" });

    expect(result.ok).toBe(true);
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "Product", entityId: id });
    expect(db.auditRows[0].changes).toEqual({ name: { from: valid.name, to: "สินค้าใหม่ (แก้ไข)" } });
  });

  test("แก้ไขแบบค่าเดิมทุกอย่าง → ไม่เขียน audit log", async () => {
    const created = await createProduct(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    await updateProduct({ id, ...valid });

    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteProduct", () => {
  test("ลบตาม id ที่ส่งมา และเขียน audit log action DELETE", async () => {
    const created = await createProduct(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await deleteProduct({ id });

    expect(result.ok).toBe(true);
    expect(db.products.has(id)).toBe(false);
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Product", entityId: id, userId: "user-1" });
  });

  test("id ว่าง → VALIDATION", async () => {
    const result = await deleteProduct({ id: "" });
    expect(result.ok).toBe(false);
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteProducts (ลบที่เลือก)", () => {
  test("ลบทุก id ในคำสั่งเดียวและคืนจำนวนที่ลบ พร้อม audit หนึ่งแถวต่อชิ้น", async () => {
    const a = await createProduct({ ...valid, sku: "SKU-A" });
    const b = await createProduct({ ...valid, sku: "SKU-B" });
    const c = await createProduct({ ...valid, sku: "SKU-C" });
    db.auditRows = [];
    const ids = [a, b, c].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteProducts({ ids });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(3);
    expect(db.products.size).toBe(0);
    expect(revalidated).toContain("/products");

    expect(db.auditRows).toHaveLength(3);
    expect(db.auditRows.every((row) => row.action === "DELETE")).toBe(true);
  });

  test("ไม่ได้เลือกอะไร → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await deleteProducts({ ids: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.auditRows).toHaveLength(0);
  });

  test("เกิน 100 รายการ → VALIDATION", async () => {
    const result = await deleteProducts({ ids: Array.from({ length: 101 }, (_, i) => `p-${i}`) });
    expect(result.ok).toBe(false);
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await deleteProducts({ ids: ["a"] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });
});
