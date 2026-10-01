import { beforeEach, describe, expect, mock, test } from "bun:test";
import bcrypt from "bcryptjs";

/**
 * เทสต์ action หน้าโปรไฟล์ — แก้ได้เฉพาะบัญชีตัวเอง (id มาจาก session เสมอ)
 * ทุก action เขียนข้อมูลผ่าน `prisma.$transaction(async (tx) => ...)` แล้วเรียก `logAudit` ใน tx เดียวกัน
 * — mock `$transaction` แค่เรียก callback ด้วยตัว db จำลองตัวเดียวกันก็พอ
 */
const db = {
  updates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
  auditRows: [] as Record<string, unknown>[],
  password: null as string | null,
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER"; name: string | null; email: string } | null = {
  id: "user-1",
  role: "USER",
  name: "สมชาย",
  email: "somchai@example.com",
};

const tx = {
  user: {
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      db.updates.push(args);
      return { id: args.where.id, ...args.data };
    },
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
    user: {
      findUnique: async () => ({ password: db.password }),
    },
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

const { updateProfile, updateAvatar, removeAvatar, changePassword } = await import(
  "@/app/(dashboard)/profile/actions"
);

const png = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(async () => {
  db.updates = [];
  db.auditRows = [];
  db.password = await bcrypt.hash("oldpass123", 4);
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER", name: "สมชาย", email: "somchai@example.com" };
});

describe("updateProfile", () => {
  test("แก้ชื่อของผู้ใช้ใน session และ revalidate layout", async () => {
    const result = await updateProfile({ name: "สมหญิง" });

    expect(result.ok).toBe(true);
    expect(db.updates[0]).toEqual({ where: { id: "user-1" }, data: { name: "สมหญิง" } });
    expect(revalidated).toContain("/");
  });

  test("เขียน audit log entity User พร้อมชื่อเก่า/ใหม่", async () => {
    await updateProfile({ name: "สมหญิง" });

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "User", entityId: "user-1", userId: "user-1" });
    expect(db.auditRows[0].changes).toEqual({ name: { from: "สมชาย", to: "สมหญิง" } });
  });

  test("ยังไม่ login → UNAUTHORIZED ไม่แตะฐานข้อมูล", async () => {
    currentUser = null;
    const result = await updateProfile({ name: "สมหญิง" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
    expect(db.updates).toHaveLength(0);
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("updateAvatar", () => {
  test("เก็บ bytes + ชนิดไฟล์ และตั้ง image เป็น URL ที่มีเวอร์ชัน", async () => {
    const result = await updateAvatar({ image: png });

    expect(result.ok).toBe(true);
    const data = db.updates[0].data;
    expect(data.avatarType).toBe("image/png");
    expect(Buffer.isBuffer(data.avatar)).toBe(true);
    expect(data.image).toMatch(/^\/api\/avatar\/user-1\?v=\d+$/);
    if (result.ok) expect(result.data.image).toBe(data.image as string);
  });

  test("audit log เก็บแค่ flag ว่าเปลี่ยนรูป ไม่เก็บ bytes จริง", async () => {
    await updateAvatar({ image: png });

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "User", entityId: "user-1" });
    const changes = db.auditRows[0].changes as Record<string, unknown>;
    expect(changes.avatar).toBeDefined();
    expect(JSON.stringify(changes)).not.toContain("iVBORw0KGgo");
  });

  test("ไม่ใช่ data URL ของรูป → VALIDATION", async () => {
    const result = await updateAvatar({ image: "data:text/html;base64,PGgxPg==" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.updates).toHaveLength(0);
    expect(db.auditRows).toHaveLength(0);
  });
});

describe("removeAvatar", () => {
  test("ล้างทั้งไฟล์และ URL", async () => {
    const result = await removeAvatar({});

    expect(result.ok).toBe(true);
    expect(db.updates[0].data).toEqual({ avatar: null, avatarType: null, image: null });
  });

  test("เขียน audit log ว่ารูปถูกลบ", async () => {
    await removeAvatar({});
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "User" });
  });
});

describe("changePassword", () => {
  const input = { currentPassword: "oldpass123", newPassword: "newpass123", confirmPassword: "newpass123" };

  test("รหัสผ่านเดิมถูก → บันทึก hash ใหม่", async () => {
    const result = await changePassword(input);

    expect(result.ok).toBe(true);
    const hash = db.updates[0].data.password as string;
    expect(await bcrypt.compare("newpass123", hash)).toBe(true);
  });

  test("audit log บันทึกว่ารหัสผ่านเปลี่ยน แต่ redact ค่าจริงทั้งสองด้าน", async () => {
    await changePassword(input);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "User", userId: "user-1" });
    expect(db.auditRows[0].changes).toEqual({ password: { from: "[redacted]", to: "[redacted]" } });
  });

  test("รหัสผ่านเดิมผิด → profile.wrongPassword ไม่แตะฐานข้อมูล", async () => {
    const result = await changePassword({ ...input, currentPassword: "wrong" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("profile.wrongPassword");
    expect(db.updates).toHaveLength(0);
    expect(db.auditRows).toHaveLength(0);
  });

  test("บัญชีที่ไม่มีรหัสผ่าน (OAuth) → profile.noPassword", async () => {
    db.password = null;
    const result = await changePassword(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("profile.noPassword");
  });
});
