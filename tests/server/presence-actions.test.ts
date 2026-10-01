import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * heartbeat เขียน lastSeenAt ของ "ผู้ใช้ใน session" เท่านั้น และไม่เขียน audit log (ดูเหตุผลใน actions.ts)
 */
const db = {
  updates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
  auditRows: [] as Record<string, unknown>[],
};

let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };

mock.module("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        db.updates.push(args);
        return { id: args.where.id };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.auditRows.push(data);
        return data;
      },
    },
  },
}));

mock.module("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error("UNAUTHORIZED");
    return currentUser;
  },
  requireRole: async () => currentUser,
}));

const { heartbeat } = await import("@/app/(dashboard)/actions");

beforeEach(() => {
  db.updates = [];
  db.auditRows = [];
  currentUser = { id: "user-1", role: "USER" };
});

describe("heartbeat", () => {
  test("อัปเดต lastSeenAt ของผู้ใช้ใน session เป็นเวลาปัจจุบัน", async () => {
    const before = Date.now();
    const result = await heartbeat({});

    expect(result.ok).toBe(true);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].where).toEqual({ id: "user-1" });
    const seen = db.updates[0].data.lastSeenAt as Date;
    expect(seen).toBeInstanceOf(Date);
    expect(seen.getTime()).toBeGreaterThanOrEqual(before);
  });

  test("ไม่เขียน audit log", async () => {
    await heartbeat({});
    expect(db.auditRows).toHaveLength(0);
  });

  test("ยังไม่ login → UNAUTHORIZED ไม่แตะฐานข้อมูล", async () => {
    currentUser = null;
    const result = await heartbeat({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
    expect(db.updates).toHaveLength(0);
  });
});
