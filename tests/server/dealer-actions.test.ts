import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module dealers (แม่หวย) — mock prisma / auth / next-cache / cookie ไว้ก่อน import ตัว action
 * กติกาหลัก: แม่หวยเป็นของบัญชีที่สร้าง บัญชีอื่นแก้/ลบ/เลือกใช้ไม่ได้แม้รู้ id
 * ยกเว้นผู้ดูแลระบบ (role ในฐานข้อมูล) ที่จัดการแม่หวยของทุกบัญชีได้ · บัญชีที่ถูกปิดใช้งานทำอะไรไม่ได้
 */
type Row = Record<string, unknown>;

const db = {
  dealers: new Map<string, Row>(),
  drawCount: 0,
  auditRows: [] as Row[],
  throwOnCreate: null as unknown,
  disabled: new Set<string>(),
};

const revalidated: string[] = [];
const cookieJar = new Map<string, string>();
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
let nextId = 1;

/** ownerId ไม่ระบุ = ผู้ดูแลระบบ (ไม่จำกัดเจ้าของ) */
const ownedBy = ({ where }: { where: { id: string; ownerId?: string } }) => {
  const dealer = db.dealers.get(where.id);
  return dealer && (where.ownerId === undefined || dealer.ownerId === where.ownerId) ? dealer : null;
};

const tx = {
  dealer: {
    create: async ({ data }: { data: Row }) => {
      if (db.throwOnCreate) throw db.throwOnCreate;
      const dealer = { id: `dealer-${nextId++}`, ...data };
      db.dealers.set(dealer.id, dealer);
      return dealer;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.dealers.get(where.id)!, ...data };
      db.dealers.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.dealers.get(where.id)!;
      db.dealers.delete(where.id);
      return existing;
    },
    findFirst: async (args: { where: { id: string; ownerId?: string } }) => ownedBy(args),
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      currentUser && where.id === currentUser.id
        ? { role: currentUser.role, isActive: !db.disabled.has(where.id) }
        : null,
  },
  draw: {
    count: async () => db.drawCount,
  },
  auditLog: {
    create: async ({ data }: { data: Row }) => {
      db.auditRows.push(data);
      return data;
    },
  },
};

mock.module("@/lib/prisma", () => ({
  prisma: {
    ...tx,
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

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { createDealer, updateDealer, deleteDealer, selectDealer } = await import("@/app/(dashboard)/dealers/actions");

const valid = { name: "แม่หวยเวียงจันทน์", note: "", ocrModel: "auto" } as const;

async function created(owner = "user-1") {
  currentUser = { id: owner, role: "USER" };
  const result = await createDealer(valid);
  db.auditRows = [];
  return result.ok ? result.data.id : "";
}

beforeEach(() => {
  db.dealers.clear();
  db.drawCount = 0;
  db.auditRows = [];
  db.throwOnCreate = null;
  db.disabled.clear();
  revalidated.length = 0;
  cookieJar.clear();
  currentUser = { id: "user-1", role: "USER" };
  nextId = 1;
});

describe("createDealer", () => {
  test("แม่หวยใหม่เป็นของบัญชีที่สร้าง หมายเหตุว่างเก็บเป็น null", async () => {
    const result = await createDealer(valid);

    expect(result.ok).toBe(true);
    expect([...db.dealers.values()][0]).toMatchObject({ ownerId: "user-1", name: valid.name, note: null });
    expect(db.auditRows[0]).toMatchObject({ action: "CREATE", entity: "Dealer", userId: "user-1" });
  });

  test("รุ่น AI: เลือกเอง = เก็บชื่อรุ่น · อัตโนมัติ = null", async () => {
    await createDealer({ ...valid, ocrModel: "claude-haiku-4-5-20251001" });
    await createDealer({ ...valid, name: "อีกราย" });

    const [picked, auto] = [...db.dealers.values()];
    expect(picked).toMatchObject({ ocrModel: "claude-haiku-4-5-20251001" });
    expect(auto).toMatchObject({ ocrModel: null });
  });

  test("รุ่นที่ไม่อยู่ในรายการ → VALIDATION", async () => {
    const result = await createDealer({ ...valid, ocrModel: "gpt-5" as never });

    expect(result.ok).toBe(false);
    expect(db.dealers.size).toBe(0);
  });

  test("ชื่อว่าง → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await createDealer({ ...valid, name: " " });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.dealers.size).toBe(0);
  });

  test("ชื่อซ้ำในบัญชีเดียวกัน (Prisma P2002) → CONFLICT", async () => {
    db.throwOnCreate = { code: "P2002" };
    const result = await createDealer(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await createDealer(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  test("บัญชีถูกปิดใช้งาน (session ยังค้าง) → UNAUTHORIZED ไม่สร้าง", async () => {
    db.disabled.add("user-1");
    const result = await createDealer(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
    expect(db.dealers.size).toBe(0);
  });
});

describe("updateDealer / deleteDealer", () => {
  test("แก้ชื่อ: audit log เก็บเฉพาะฟิลด์ที่เปลี่ยน", async () => {
    const id = await created();

    const result = await updateDealer({ ...valid, id, name: "ชื่อใหม่" });

    expect(result.ok).toBe(true);
    expect(db.auditRows[0]!.changes).toEqual({ name: { from: valid.name, to: "ชื่อใหม่" } });
  });

  test("ลบแม่หวยที่ยังไม่มีงวดได้", async () => {
    const id = await created();

    const result = await deleteDealer({ id });

    expect(result.ok).toBe(true);
    expect(db.dealers.has(id)).toBe(false);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Dealer", entityId: id });
  });

  test("แม่หวยที่มีงวดแล้ว ลบไม่ได้", async () => {
    const id = await created();
    db.drawCount = 2;

    const result = await deleteDealer({ id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("dealers.hasDraws");
    expect(db.dealers.has(id)).toBe(true);
  });

  test("แม่หวยของบัญชีอื่น แก้/ลบไม่ได้", async () => {
    const id = await created("user-1");
    currentUser = { id: "user-2", role: "USER" };

    const updated = await updateDealer({ ...valid, id, name: "ยึด" });
    const deleted = await deleteDealer({ id });

    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.message).toBe("dealers.notFound");
    expect(deleted.ok).toBe(false);
    expect(db.dealers.get(id)).toMatchObject({ name: valid.name });
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("ผู้ดูแลระบบ", () => {
  test("แก้/ลบแม่หวยของบัญชีอื่นได้ — audit log บันทึกว่าผู้ดูแลเป็นคนทำ", async () => {
    const id = await created("user-1");
    currentUser = { id: "admin-1", role: "ADMIN" };

    const updated = await updateDealer({ ...valid, id, name: "ชื่อใหม่" });
    expect(updated.ok).toBe(true);
    expect(db.dealers.get(id)).toMatchObject({ ownerId: "user-1", name: "ชื่อใหม่" });
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", userId: "admin-1" });

    const deleted = await deleteDealer({ id });
    expect(deleted.ok).toBe(true);
    expect(db.dealers.has(id)).toBe(false);
  });

  test("เลือกแม่หวยของบัญชีอื่นมาทำงานได้", async () => {
    const id = await created("user-1");
    currentUser = { id: "admin-1", role: "ADMIN" };

    const result = await selectDealer({ id });

    expect(result.ok).toBe(true);
    expect(cookieJar.get("dealer")).toBe(id);
  });

  test("แม่หวยที่ผู้ดูแลสร้างเป็นของผู้ดูแลเอง", async () => {
    currentUser = { id: "admin-1", role: "ADMIN" };
    await createDealer(valid);

    expect([...db.dealers.values()][0]).toMatchObject({ ownerId: "admin-1" });
  });
});

describe("selectDealer", () => {
  test("เลือกแม่หวยของตัวเอง → จำไว้ใน cookie", async () => {
    const id = await created();

    const result = await selectDealer({ id });

    expect(result.ok).toBe(true);
    expect(cookieJar.get("dealer")).toBe(id);
  });

  test("เลือกแม่หวยของบัญชีอื่น → ไม่ได้ และ cookie ไม่เปลี่ยน", async () => {
    const id = await created("user-1");
    currentUser = { id: "user-2", role: "USER" };

    const result = await selectDealer({ id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("dealers.notFound");
    expect(cookieJar.has("dealer")).toBe(false);
  });
});
