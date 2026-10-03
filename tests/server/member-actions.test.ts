import { beforeEach, describe, expect, mock, test } from "bun:test";
import bcrypt from "bcryptjs";

/**
 * เทสต์ server action ของ module members (จัดการบัญชีผู้ใช้) — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * กติกาหลัก: เฉพาะผู้ดูแลที่ใช้งานอยู่ (เช็คจากฐานข้อมูล) · ห้ามล็อกตัวเอง · ลบบัญชีที่ยังมีข้อมูลไม่ได้
 */
type Row = Record<string, unknown> & { id: string; email: string; role: string; isActive: boolean };

const db = {
  users: new Map<string, Row>(),
  /** จำนวนแม่หวย / บัญชี WhatsApp ของแต่ละผู้ใช้ (สำหรับ _count ตอนลบ) */
  owned: new Map<string, { dealers: number; whatsappAccounts: number }>(),
  auditRows: [] as Record<string, unknown>[],
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = null;
let nextId = 1;

const userTable = {
  findUnique: async ({ where }: { where: { id?: string; email?: string; username?: string } }) => {
    const row = where.id
      ? db.users.get(where.id)
      : [...db.users.values()].find((user) =>
          where.username !== undefined ? user.username === where.username : user.email === where.email,
        );
    if (!row) return null;
    return { ...row, _count: db.owned.get(row.id) ?? { dealers: 0, whatsappAccounts: 0 } };
  },
  create: async ({ data }: { data: Record<string, unknown> }) => {
    const user = { id: `user-${nextId++}`, lastSeenAt: null, ...data } as unknown as Row;
    db.users.set(user.id, user);
    return user;
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const updated = { ...db.users.get(where.id)!, ...data };
    db.users.set(where.id, updated);
    return updated;
  },
  delete: async ({ where }: { where: { id: string } }) => {
    const existing = db.users.get(where.id)!;
    db.users.delete(where.id);
    return existing;
  },
};

const tx = {
  user: userTable,
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
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

const { createMember, updateMember, setMemberActive, resetMemberPassword, deleteMember } = await import(
  "@/app/(dashboard)/members/actions"
);
const { createMemberSchema, updateMemberSchema } = await import("@/lib/validations/member");

function seed(id: string, data: Partial<Row> = {}) {
  db.users.set(id, { id, name: id, username: id, email: `${id}@test.local`, role: "USER", isActive: true, password: "x", ...data });
}

const newUser = {
  name: "สมชาย ใจดี",
  username: " Somchai ",
  email: "Somchai@Test.Local ",
  role: "USER" as const,
  isActive: true,
  password: "secret123",
  confirmPassword: "secret123",
};

beforeEach(() => {
  db.users.clear();
  db.owned.clear();
  db.auditRows = [];
  revalidated.length = 0;
  nextId = 1;
  seed("admin", { role: "ADMIN" });
  seed("user-a");
  currentUser = { id: "admin", role: "ADMIN" };
});

describe("schema", () => {
  test("อีเมลถูกตัดช่องว่างและแปลงเป็นตัวเล็ก", () => {
    const parsed = createMemberSchema.parse(newUser);
    expect(parsed.email).toBe("somchai@test.local");
  });

  test("ชื่อผู้ใช้ถูกตัดช่องว่างและแปลงเป็นตัวเล็ก", () => {
    expect(createMemberSchema.parse(newUser).username).toBe("somchai");
  });

  test("ชื่อผู้ใช้สั้นเกิน / มีช่องว่าง / มี @ ไม่ผ่าน", () => {
    for (const username of ["ab", "som chai", "som@chai"]) {
      expect(createMemberSchema.safeParse({ ...newUser, username }).success).toBe(false);
    }
  });

  test("รหัสผ่านไม่ตรงกัน / สั้นเกินไป ไม่ผ่าน", () => {
    expect(createMemberSchema.safeParse({ ...newUser, confirmPassword: "other123" }).success).toBe(false);
    expect(createMemberSchema.safeParse({ ...newUser, password: "a1", confirmPassword: "a1" }).success).toBe(false);
  });

  test("แก้ไขไม่ต้องมีรหัสผ่าน", () => {
    const { password: _p, confirmPassword: _c, ...rest } = newUser;
    expect(updateMemberSchema.safeParse({ ...rest, id: "user-a" }).success).toBe(true);
  });
});

describe("สิทธิ์", () => {
  test("ผู้ใช้ทั่วไปเรียกไม่ได้", async () => {
    currentUser = { id: "user-a", role: "USER" };
    const result = await createMember(newUser);
    expect(result.ok).toBe(false);
    expect(db.users.size).toBe(2);
  });

  test("ผู้ดูแลที่ถูกลดสิทธิ์ในฐานข้อมูลแล้ว (JWT ยังเป็น ADMIN) เรียกไม่ได้ทันที", async () => {
    db.users.get("admin")!.role = "USER";
    const result = await createMember(newUser);
    expect(result.ok).toBe(false);
  });

  test("ผู้ดูแลที่ถูกปิดใช้งานแล้วเรียกไม่ได้", async () => {
    db.users.get("admin")!.isActive = false;
    const result = await setMemberActive({ id: "user-a", isActive: false });
    expect(result.ok).toBe(false);
    expect(db.users.get("user-a")!.isActive).toBe(true);
  });
});

describe("createMember", () => {
  test("สร้างบัญชี + hash รหัสผ่าน + audit log ไม่มีรหัสผ่าน", async () => {
    const result = await createMember(newUser);
    expect(result.ok).toBe(true);

    const created = [...db.users.values()].find((user) => user.email === "somchai@test.local")!;
    expect(created.role).toBe("USER");
    expect(created.password).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", created.password as string)).toBe(true);
    expect(created).not.toHaveProperty("confirmPassword");

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "CREATE", entity: "User", entityId: created.id, userId: "admin" });
    expect(JSON.stringify(db.auditRows[0])).not.toContain(created.password as string);
    expect(revalidated).toContain("/members");
  });

  test("อีเมลซ้ำ = error และไม่สร้าง", async () => {
    const result = await createMember({ ...newUser, email: "user-a@test.local" });
    expect(result.ok).toBe(false);
    expect(db.users.size).toBe(2);
    expect(db.auditRows).toHaveLength(0);
  });

  test("ชื่อผู้ใช้ซ้ำ = error และไม่สร้าง", async () => {
    const result = await createMember({ ...newUser, username: "User-A" });
    expect(result.ok).toBe(false);
    expect(db.users.size).toBe(2);
  });
});

describe("updateMember", () => {
  const edit = {
    name: "ผู้ใช้ เอ",
    username: "user-a",
    email: "user-a@test.local",
    role: "ADMIN" as const,
    isActive: true,
  };

  test("เปลี่ยนสิทธิ์เป็นผู้ดูแล + audit before/after", async () => {
    const result = await updateMember({ ...edit, id: "user-a" });
    expect(result.ok).toBe(true);
    expect(db.users.get("user-a")!.role).toBe("ADMIN");
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "User", entityId: "user-a" });
  });

  test("ลดสิทธิ์ตัวเองไม่ได้ แต่แก้ชื่อตัวเองได้", async () => {
    const demote = await updateMember({ ...edit, username: "admin", email: "admin@test.local", role: "USER", id: "admin" });
    expect(demote.ok).toBe(false);
    expect(db.users.get("admin")!.role).toBe("ADMIN");

    const rename = await updateMember({
      ...edit,
      username: "admin",
      email: "admin@test.local",
      name: "หัวหน้า",
      id: "admin",
    });
    expect(rename.ok).toBe(true);
    expect(db.users.get("admin")!.name).toBe("หัวหน้า");
  });

  test("เปลี่ยนอีเมลไปซ้ำกับบัญชีอื่นไม่ได้", async () => {
    const result = await updateMember({ ...edit, email: "admin@test.local", id: "user-a" });
    expect(result.ok).toBe(false);
    expect(db.users.get("user-a")!.email).toBe("user-a@test.local");
  });

  test("เปลี่ยนชื่อผู้ใช้ไปซ้ำกับบัญชีอื่นไม่ได้", async () => {
    const result = await updateMember({ ...edit, username: "admin", id: "user-a" });
    expect(result.ok).toBe(false);
    expect(db.users.get("user-a")!.username).toBe("user-a");
  });

  test("ไม่พบบัญชี", async () => {
    const result = await updateMember({ ...edit, id: "missing" });
    expect(result.ok).toBe(false);
  });
});

describe("setMemberActive", () => {
  test("ปิดใช้งาน = หลุดจากรายชื่อออนไลน์ทันที", async () => {
    db.users.get("user-a")!.lastSeenAt = new Date();
    const result = await setMemberActive({ id: "user-a", isActive: false });
    expect(result.ok).toBe(true);
    expect(db.users.get("user-a")).toMatchObject({ isActive: false, lastSeenAt: null });
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entityId: "user-a" });
  });

  test("ปิดใช้งานตัวเองไม่ได้", async () => {
    const result = await setMemberActive({ id: "admin", isActive: false });
    expect(result.ok).toBe(false);
    expect(db.users.get("admin")!.isActive).toBe(true);
  });
});

describe("resetMemberPassword", () => {
  test("ตั้งรหัสใหม่โดยไม่ต้องรู้รหัสเดิม + audit ไม่มี hash", async () => {
    const result = await resetMemberPassword({ id: "user-a", password: "newpass99", confirmPassword: "newpass99" });
    expect(result.ok).toBe(true);
    const hash = db.users.get("user-a")!.password as string;
    expect(await bcrypt.compare("newpass99", hash)).toBe(true);
    expect(JSON.stringify(db.auditRows[0])).not.toContain(hash);
  });
});

describe("deleteMember", () => {
  test("ลบบัญชีที่ไม่มีข้อมูล + audit", async () => {
    const result = await deleteMember({ id: "user-a" });
    expect(result.ok).toBe(true);
    expect(db.users.has("user-a")).toBe(false);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "User", entityId: "user-a" });
  });

  test("ยังมีแม่หวยหรือบัญชี WhatsApp ลบไม่ได้", async () => {
    db.owned.set("user-a", { dealers: 1, whatsappAccounts: 0 });
    expect((await deleteMember({ id: "user-a" })).ok).toBe(false);
    db.owned.set("user-a", { dealers: 0, whatsappAccounts: 2 });
    expect((await deleteMember({ id: "user-a" })).ok).toBe(false);
    expect(db.users.has("user-a")).toBe(true);
    expect(db.auditRows).toHaveLength(0);
  });

  test("ลบตัวเองไม่ได้", async () => {
    const result = await deleteMember({ id: "admin" });
    expect(result.ok).toBe(false);
    expect(db.users.has("admin")).toBe(true);
  });
});
