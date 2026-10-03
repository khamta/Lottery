import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module draws — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * (แบบเดียวกับ tests/server/product-actions.test.ts)
 */
const db = {
  draws: new Map<string, Record<string, unknown>>(),
  ticketCount: 0,
  auditRows: [] as Record<string, unknown>[],
  throwOnCreate: null as unknown,
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;

const tx = {
  draw: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (db.throwOnCreate) throw db.throwOnCreate;
      const draw = { id: `draw-${nextId++}`, ...data };
      db.draws.set(draw.id, draw);
      return draw;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const updated = { ...db.draws.get(where.id)!, ...data };
      db.draws.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.draws.get(where.id)!;
      db.draws.delete(where.id);
      return existing;
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.draws.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const draw = db.draws.get(where.id);
      return draw && draw.dealerId === where.dealerId ? draw : null;
    },
  },
  ticket: {
    count: async () => db.ticketCount,
  },
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      db.auditRows.push(data);
      return data;
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

const { createDraw, updateDraw, setDrawStatus, deleteDraw } = await import("@/app/(dashboard)/draws/actions");

const valid = {
  name: "งวด 30/09/2026",
  drawDate: "2026-09-30",
  topResult: "",
  bottomResult: "",
};

async function created(input: Parameters<typeof createDraw>[0] = valid) {
  const result = await createDraw(input);
  db.auditRows = [];
  return result.ok ? result.data.id : "";
}

beforeEach(() => {
  db.draws.clear();
  db.ticketCount = 0;
  db.auditRows = [];
  db.throwOnCreate = null;
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  currentDealerId = "dealer-1";
  nextId = 1;
});

describe("createDraw", () => {
  test("เปิดงวดสำเร็จ: วันที่เก็บเป็น Date ผลว่างเก็บเป็น null และ revalidate หน้าที่ใช้งวด", async () => {
    const result = await createDraw(valid);

    expect(result.ok).toBe(true);
    const draw = [...db.draws.values()][0]!;
    expect(draw.drawDate).toEqual(new Date("2026-09-30T00:00:00.000Z"));
    expect(draw.topResult).toBeNull();
    expect(draw.bottomResult).toBeNull();
    expect(revalidated).toEqual(expect.arrayContaining(["/draws", "/tickets", "/reports", "/dashboard"]));
  });

  test("เวลาออกผล (เวลาลาว) เก็บเป็นเวลาจริงของวันที่งวด · ไม่กรอก = null (ไม่ปิดเอง)", async () => {
    await createDraw({ ...valid, lottery: "V3", closeTime: "18:30" });
    await createDraw({ ...valid, name: "งวดไม่มีเวลา" });

    const [timed, untimed] = [...db.draws.values()];
    expect(timed).toMatchObject({ lottery: "V3", closesAt: new Date("2026-09-30T11:30:00.000Z") });
    expect(untimed).toMatchObject({ lottery: "LAO", closesAt: null });
  });

  test("เวลาออกผลผิดรูปแบบ → VALIDATION", async () => {
    const result = await createDraw({ ...valid, closeTime: "25:00" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.draws.size).toBe(0);
  });

  test("งวดใหม่ที่ยังไม่มีผล → เปิดรับ", async () => {
    await createDraw(valid);

    expect([...db.draws.values()][0]).toMatchObject({ status: "OPEN" });
  });

  test("กรอกเลขที่ออกครบตั้งแต่เปิดงวด → ออกผลแล้ว", async () => {
    await createDraw({ ...valid, topResult: "243", bottomResult: "72" });

    expect([...db.draws.values()][0]).toMatchObject({ status: "SETTLED", topResult: "243", bottomResult: "72" });
  });

  test("กรอกเลขที่ออกช่องเดียว → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await createDraw({ ...valid, topResult: "243" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.bottomResult).toEqual(["draws.validation.resultPair"]);
    expect(db.draws.size).toBe(0);
  });

  test("งวดใหม่เป็นของแม่หวยที่เลือกอยู่", async () => {
    await createDraw(valid);

    expect([...db.draws.values()][0]!.dealerId).toBe("dealer-1");
  });

  test("บัญชียังไม่มีแม่หวย → dealers.required ไม่แตะฐานข้อมูล", async () => {
    currentDealerId = null;
    const result = await createDraw(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("dealers.required");
    expect(db.draws.size).toBe(0);
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await createDraw(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  test("ชื่องวดซ้ำ (Prisma P2002) → CONFLICT", async () => {
    db.throwOnCreate = { code: "P2002" };
    const result = await createDraw(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFLICT");
  });

  test("เขียน audit log action CREATE พร้อม userId ของคนสร้าง", async () => {
    await createDraw(valid);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "CREATE", entity: "Draw", userId: "user-1", summary: valid.name });
  });
});

describe("updateDraw", () => {
  test("กรอกเลขที่ออก → ออกผลแล้วอัตโนมัติ: audit log เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง", async () => {
    const id = await created();

    const result = await updateDraw({ ...valid, id, topResult: "243", bottomResult: "72" });

    expect(result.ok).toBe(true);
    expect(db.draws.get(id)).toMatchObject({ status: "SETTLED", topResult: "243", bottomResult: "72" });
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0].changes).toEqual({
      status: { from: "OPEN", to: "SETTLED" },
      topResult: { from: null, to: "243" },
      bottomResult: { from: null, to: "72" },
    });
  });

  test("แก้ไขแบบค่าเดิมทุกอย่าง → ไม่เขียน audit log", async () => {
    const id = await created();

    await updateDraw({ ...valid, id });

    expect(db.auditRows).toHaveLength(0);
  });

  test("งวดที่ปิดรับอยู่ แก้ชื่อแล้วยังปิดรับ", async () => {
    const id = await created();
    await setDrawStatus({ id, status: "CLOSED" });

    await updateDraw({ ...valid, id, name: "งวดพิเศษ" });

    expect(db.draws.get(id)).toMatchObject({ name: "งวดพิเศษ", status: "CLOSED" });
  });

  test("ลบเลขที่ออกของงวดที่ออกผลแล้ว → ปิดรับ (ไม่กลับไปรับโพยเอง)", async () => {
    const id = await created({ ...valid, topResult: "243", bottomResult: "72" });

    await updateDraw({ ...valid, id });

    expect(db.draws.get(id)).toMatchObject({ status: "CLOSED", topResult: null, bottomResult: null });
  });
});

describe("setDrawStatus", () => {
  test("ปิดรับ แล้วเปิดรับอีกครั้ง — เขียน audit log ทุกครั้ง", async () => {
    const id = await created();

    const closed = await setDrawStatus({ id, status: "CLOSED" });
    expect(closed.ok).toBe(true);
    expect(db.draws.get(id)).toMatchObject({ status: "CLOSED" });

    await setDrawStatus({ id, status: "OPEN" });
    expect(db.draws.get(id)).toMatchObject({ status: "OPEN" });
    expect(db.auditRows.map((row) => row.changes)).toEqual([
      { status: { from: "OPEN", to: "CLOSED" } },
      { status: { from: "CLOSED", to: "OPEN" } },
    ]);
  });

  test("งวดที่ออกผลแล้ว เปลี่ยนสถานะจากเมนูไม่ได้", async () => {
    const id = await created({ ...valid, topResult: "243", bottomResult: "72" });

    const result = await setDrawStatus({ id, status: "OPEN" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("draws.alreadySettled");
    expect(db.draws.get(id)).toMatchObject({ status: "SETTLED" });
    expect(db.auditRows).toHaveLength(0);
  });

  test("เลยเวลาออกผลแล้ว เปิดรับอีกครั้งไม่ได้ (ต้องแก้เวลาก่อน)", async () => {
    const id = await created({ ...valid, closeTime: "08:00" }); // 30/09/2026 08:00 เวลาลาว ผ่านไปแล้ว
    db.draws.set(id, { ...db.draws.get(id)!, status: "CLOSED" });

    const result = await setDrawStatus({ id, status: "OPEN" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("draws.closeTimePassed");
    expect(db.draws.get(id)).toMatchObject({ status: "CLOSED" });
  });

  test("ตั้งสถานะออกผลแล้วตรง ๆ ไม่ได้ → VALIDATION", async () => {
    const id = await created();

    const result = await setDrawStatus({ id, status: "SETTLED" as "OPEN" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.draws.get(id)).toMatchObject({ status: "OPEN" });
  });
});

describe("แยกตามแม่หวย", () => {
  test("งวดของแม่หวยอื่น แก้และลบไม่ได้", async () => {
    const created = await createDraw(valid);
    const id = created.ok ? created.data.id : "";
    currentDealerId = "dealer-2";
    db.auditRows = [];

    const updated = await updateDraw({ ...valid, id, name: "ยึด" });
    const closed = await setDrawStatus({ id, status: "CLOSED" });
    const deleted = await deleteDraw({ id });

    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.message).toBe("draws.notFound");
    expect(closed.ok).toBe(false);
    expect(deleted.ok).toBe(false);
    expect(db.draws.get(id)).toMatchObject({ status: "OPEN" });
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("deleteDraw", () => {
  test("งวดที่ยังไม่มีโพย ลบได้ และเขียน audit log action DELETE", async () => {
    const created = await createDraw(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await deleteDraw({ id });

    expect(result.ok).toBe(true);
    expect(db.draws.has(id)).toBe(false);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Draw", entityId: id, userId: "user-1" });
  });

  test("งวดที่มีโพยแล้ว ลบไม่ได้", async () => {
    const created = await createDraw(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];
    db.ticketCount = 3;

    const result = await deleteDraw({ id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("draws.hasTickets");
    expect(db.draws.has(id)).toBe(true);
    expect(db.auditRows).toHaveLength(0);
  });

  test("id ว่าง → VALIDATION", async () => {
    const result = await deleteDraw({ id: "" });
    expect(result.ok).toBe(false);
    expect(db.auditRows).toHaveLength(0);
  });
});
