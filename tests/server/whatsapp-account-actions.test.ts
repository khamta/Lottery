import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module whatsapp — เว็บเขียนเฉพาะ "สิ่งที่ต้องการ" ให้บอททำตาม
 * กติกาหลัก: เฉพาะผู้ดูแลระบบ (role ทั้งใน session และในฐานข้อมูล) จัดการบัญชี WhatsApp ได้
 * ผู้ดูแลเลือกว่าบัญชีผูกกับผู้ใช้คนไหน และกลุ่มผูกได้เฉพาะกับแม่หวยของผู้ใช้คนนั้น
 */
type Row = Record<string, unknown>;

const db = {
  accounts: new Map<string, Row>(),
  groups: new Map<string, Row>(),
  dealers: new Map<string, Row>(),
  users: new Map<string, { role: "ADMIN" | "USER"; isActive: boolean }>(),
  auditRows: [] as Row[],
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "admin-1", role: "ADMIN" };
let nextId = 1;

const tx = {
  whatsappAccount: {
    create: async ({ data }: { data: Row }) => {
      const account = { id: `wa-${nextId++}`, enabled: true, command: null, status: "STARTING", qr: null, ...data };
      db.accounts.set(account.id, account);
      return account;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.accounts.get(where.id)!, ...data };
      db.accounts.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.accounts.get(where.id)!;
      db.accounts.delete(where.id);
      return existing;
    },
    findFirst: async ({ where }: { where: { id: string } }) => db.accounts.get(where.id) ?? null,
  },
  whatsappGroup: {
    findFirst: async ({ where }: { where: { id: string } }) => {
      const group = db.groups.get(where.id);
      const account = group ? db.accounts.get(group.accountId as string) : undefined;
      return group && account ? { ...group, account: { ownerId: account.ownerId } } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.groups.get(where.id)!, ...data };
      db.groups.set(where.id, updated);
      return updated;
    },
    updateMany: async ({ where, data }: { where: { accountId: string }; data: Row }) => {
      let count = 0;
      for (const [id, group] of db.groups) {
        if (group.accountId !== where.accountId || group.dealerId === null) continue;
        db.groups.set(id, { ...group, ...data });
        count++;
      }
      return { count };
    },
  },
  dealer: {
    findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => {
      const dealer = db.dealers.get(where.id);
      return dealer && dealer.ownerId === where.ownerId ? dealer : null;
    },
  },
  auditLog: {
    create: async ({ data }: { data: Row }) => {
      db.auditRows.push(data);
      return data;
    },
  },
  // src/lottery/access.ts อ่าน role/isActive จากฐานข้อมูล · findFirst = เช็คผู้ใช้ที่จะผูกบัญชี
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null,
    findFirst: async ({ where }: { where: { id: string; isActive: boolean } }) => {
      const user = db.users.get(where.id);
      return user && user.isActive === where.isActive ? { id: where.id } : null;
    },
  },
};

mock.module("@/lib/prisma", () => ({
  prisma: { ...tx, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) },
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

mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { createWhatsappAccount, updateWhatsappAccount, deleteWhatsappAccount, sendWhatsappCommand, assignWhatsappGroup } =
  await import("@/app/(dashboard)/whatsapp/actions");

const valid = { name: "เบอร์บอท 1", pairingPhone: "", ownerId: "user-1" };

/** ผู้ดูแลสร้างบัญชีผูกกับผู้ใช้ owner */
async function account(owner = "user-1") {
  const result = await createWhatsappAccount({ ...valid, ownerId: owner });
  db.auditRows = [];
  return result.ok ? result.data.id : "";
}

beforeEach(() => {
  db.accounts.clear();
  db.groups.clear();
  db.dealers.clear();
  db.dealers.set("dealer-1", { id: "dealer-1", ownerId: "user-1" });
  db.dealers.set("dealer-x", { id: "dealer-x", ownerId: "user-2" });
  db.dealers.set("dealer-admin", { id: "dealer-admin", ownerId: "admin-1" });
  db.users.clear();
  db.users.set("admin-1", { role: "ADMIN", isActive: true });
  db.users.set("user-1", { role: "USER", isActive: true });
  db.users.set("user-2", { role: "USER", isActive: true });
  db.users.set("user-off", { role: "USER", isActive: false });
  db.auditRows = [];
  revalidated.length = 0;
  currentUser = { id: "admin-1", role: "ADMIN" };
  nextId = 1;
});

describe("เฉพาะผู้ดูแลระบบ", () => {
  test("ผู้ใช้ทั่วไป สร้าง/แก้/ลบ/สั่งงาน/ผูกกลุ่ม ไม่ได้ — แม้บัญชีจะผูกกับตัวเอง", async () => {
    const id = await account("user-1");
    db.groups.set("group-1", { id: "group-1", accountId: id, name: "หวยงวดนี้", dealerId: null });
    currentUser = { id: "user-1", role: "USER" };

    const results = [
      await createWhatsappAccount(valid),
      await updateWhatsappAccount({ id, ...valid, name: "ยึด" }),
      await deleteWhatsappAccount({ id }),
      await sendWhatsappCommand({ id, command: "logout" }),
      await assignWhatsappGroup({ id: "group-1", dealerId: "dealer-1" }),
    ];

    for (const result of results) expect(result.ok).toBe(false);
    expect(db.accounts.size).toBe(1);
    expect(db.accounts.get(id)).toMatchObject({ name: valid.name, command: null });
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: null });
    expect(db.auditRows).toHaveLength(0);
  });

  test("role ADMIN ใน session แต่ถูกลดสิทธิ์ในฐานข้อมูลแล้ว → ทำไม่ได้", async () => {
    db.users.set("admin-1", { role: "USER", isActive: true });

    const result = await createWhatsappAccount(valid);

    expect(result.ok).toBe(false);
    expect(db.accounts.size).toBe(0);
  });
});

describe("บัญชี WhatsApp", () => {
  test("ผู้ดูแลสร้างบัญชีผูกกับผู้ใช้ที่เลือก — เบอร์จับคู่ว่างเก็บเป็น null และ audit ไม่เก็บ QR", async () => {
    const result = await createWhatsappAccount(valid);

    expect(result.ok).toBe(true);
    expect([...db.accounts.values()][0]).toMatchObject({ ownerId: "user-1", pairingPhone: null });
    expect(db.auditRows[0]).toMatchObject({ action: "CREATE", entity: "WhatsappAccount", userId: "admin-1" });
    expect(JSON.stringify(db.auditRows[0]!.changes)).not.toContain("qr");
  });

  test("ไม่เลือกผู้ใช้ / เบอร์จับคู่ไม่ใช่ตัวเลข → VALIDATION", async () => {
    for (const input of [
      { ...valid, ownerId: "" },
      { ...valid, pairingPhone: "+856 20" },
    ]) {
      const result = await createWhatsappAccount(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
    }
    expect(db.accounts.size).toBe(0);
  });

  test("ผูกกับผู้ใช้ที่ไม่มีอยู่หรือถูกปิดใช้งานไม่ได้", async () => {
    for (const ownerId of ["ghost", "user-off"]) {
      const result = await createWhatsappAccount({ ...valid, ownerId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe("whatsapp.ownerNotFound");
    }
    expect(db.accounts.size).toBe(0);
  });

  test("แก้ชื่อโดยไม่เปลี่ยนเจ้าของ — การผูกกลุ่มเดิมยังอยู่", async () => {
    const id = await account("user-1");
    db.groups.set("group-1", { id: "group-1", accountId: id, name: "หวย", dealerId: "dealer-1" });

    expect((await updateWhatsappAccount({ id, ...valid, name: "เปลี่ยนชื่อ" })).ok).toBe(true);
    expect(db.accounts.get(id)).toMatchObject({ ownerId: "user-1", name: "เปลี่ยนชื่อ" });
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: "dealer-1" });
  });

  test("ย้ายบัญชีไปให้ผู้ใช้อื่น → กลุ่มที่ผูกกับแม่หวยของเจ้าของเดิมกลับเป็นไม่อ่าน", async () => {
    const id = await account("user-1");
    db.groups.set("group-1", { id: "group-1", accountId: id, name: "หวย", dealerId: "dealer-1" });

    const result = await updateWhatsappAccount({ id, ...valid, ownerId: "user-2" });

    expect(result.ok).toBe(true);
    expect(db.accounts.get(id)).toMatchObject({ ownerId: "user-2" });
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: null });
    expect(db.auditRows[0]).toMatchObject({ changes: { ownerId: { from: "user-1", to: "user-2" } } });
  });

  test("ย้ายไปให้ผู้ใช้ที่ถูกปิดใช้งานไม่ได้ — ไม่มีอะไรเปลี่ยน", async () => {
    const id = await account("user-1");
    db.groups.set("group-1", { id: "group-1", accountId: id, name: "หวย", dealerId: "dealer-1" });

    const result = await updateWhatsappAccount({ id, ...valid, ownerId: "user-off" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("whatsapp.ownerNotFound");
    expect(db.accounts.get(id)).toMatchObject({ ownerId: "user-1" });
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: "dealer-1" });
  });

  test("เจ้าของเดิมถูกปิดใช้งาน แต่ยังแก้ชื่อบัญชีได้ (ไม่ได้เปลี่ยนเจ้าของ)", async () => {
    const id = await account("user-1");
    db.users.set("user-1", { role: "USER", isActive: false });

    expect((await updateWhatsappAccount({ id, ...valid, name: "ใหม่" })).ok).toBe(true);
  });

  test("ไม่พบบัญชี → whatsapp.notFound", async () => {
    const result = await deleteWhatsappAccount({ id: "nope" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("whatsapp.notFound");
  });
});

describe("sendWhatsappCommand", () => {
  test("logout / sync → ฝากคำสั่งให้บอท", async () => {
    const id = await account();

    await sendWhatsappCommand({ id, command: "logout" });
    expect(db.accounts.get(id)).toMatchObject({ command: "LOGOUT" });

    await sendWhatsappCommand({ id, command: "sync" });
    expect(db.accounts.get(id)).toMatchObject({ command: "SYNC" });
  });

  test("connect → เปิดใช้บัญชีอีกครั้ง (หลัง QR หมดอายุ/เลิกเชื่อมต่อ) และล้างคำสั่งค้าง", async () => {
    const id = await account();
    db.accounts.set(id, { ...db.accounts.get(id)!, enabled: false, command: "LOGOUT", lastError: "qr-timeout" });

    const result = await sendWhatsappCommand({ id, command: "connect" });

    expect(result.ok).toBe(true);
    expect(db.accounts.get(id)).toMatchObject({ enabled: true, command: null, lastError: null });
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "WhatsappAccount" });
  });
});

describe("assignWhatsappGroup", () => {
  beforeEach(async () => {
    const id = await account("user-1");
    db.groups.set("group-1", { id: "group-1", accountId: id, name: "หวยงวดนี้", dealerId: null });
  });

  test("ผูกกลุ่มกับแม่หวยของผู้ใช้ที่บัญชีผูกอยู่ แล้วยกเลิกได้ พร้อม audit log", async () => {
    expect((await assignWhatsappGroup({ id: "group-1", dealerId: "dealer-1" })).ok).toBe(true);
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: "dealer-1" });
    expect(db.auditRows[0]).toMatchObject({
      entity: "WhatsappGroup",
      changes: { dealerId: { from: null, to: "dealer-1" } },
    });

    expect((await assignWhatsappGroup({ id: "group-1", dealerId: null })).ok).toBe(true);
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: null });
  });

  test("ผูกกับแม่หวยของผู้ใช้อื่น (รวมถึงของผู้ดูแลเอง) ไม่ได้", async () => {
    for (const dealerId of ["dealer-x", "dealer-admin"]) {
      const result = await assignWhatsappGroup({ id: "group-1", dealerId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe("dealers.notFound");
    }
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: null });
  });

  test("เลือกตัวอ่านรูปของกลุ่มได้ (AI / OCR) พร้อม audit log — ไม่ส่งมา = คงค่าเดิม", async () => {
    db.groups.set("group-1", { ...db.groups.get("group-1")!, dealerId: "dealer-1", imageReader: "AI" });

    expect((await assignWhatsappGroup({ id: "group-1", dealerId: "dealer-1", imageReader: "OCR" })).ok).toBe(true);
    expect(db.groups.get("group-1")).toMatchObject({ dealerId: "dealer-1", imageReader: "OCR" });
    expect(db.auditRows[0]).toMatchObject({ changes: { imageReader: { from: "AI", to: "OCR" } } });

    expect((await assignWhatsappGroup({ id: "group-1", dealerId: "dealer-1" })).ok).toBe(true);
    expect(db.groups.get("group-1")).toMatchObject({ imageReader: "OCR" });
  });

  test("ตัวอ่านรูปที่ไม่รู้จัก → VALIDATION", async () => {
    const result = await assignWhatsappGroup({ id: "group-1", dealerId: null, imageReader: "GPT" as never });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });

  test("ไม่พบกลุ่ม → whatsapp.groupNotFound", async () => {
    const result = await assignWhatsappGroup({ id: "nope", dealerId: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("whatsapp.groupNotFound");
  });
});
