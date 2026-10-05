import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";

/**
 * เทสต์ action "ดูทั้งหมดแล้ว" ของหน้าโพย (tickets/seen/actions.ts) — mock prisma / auth / แม่หวย ก่อน import ตัว action
 */
type SeenRow = { userId: string; dealerId: string; groupKey: string; seenAt: Date };

const rows: SeenRow[] = [];
const revalidated: string[] = [];
let currentUser: { id: string; role: "USER" } | null = { id: "user-1", role: "USER" };
const currentDealerId = "dealer-1";

const find = (key: { userId: string; dealerId: string; groupKey: string }) =>
  rows.find((row) => row.userId === key.userId && row.dealerId === key.dealerId && row.groupKey === key.groupKey);

const tx = {
  ticketSeen: {
    findMany: async ({ where }: { where: { userId: string; dealerId: string; groupKey: { in: string[] } } }) =>
      rows.filter(
        (row) => row.userId === where.userId && row.dealerId === where.dealerId && where.groupKey.in.includes(row.groupKey),
      ),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId_dealerId_groupKey: { userId: string; dealerId: string; groupKey: string } };
      create: SeenRow;
      update: { seenAt: Date };
    }) => {
      const row = find(where.userId_dealerId_groupKey);
      if (row) row.seenAt = update.seenAt;
      else rows.push({ ...create });
    },
  },
};

mock.module("@/lib/prisma", () => ({
  prisma: { ...tx, $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx) },
}));
mock.module("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentUser) throw new Error("UNAUTHORIZED");
    return currentUser;
  },
}));
mock.module("@/lottery/dealer", () => ({
  DEALER_COOKIE: "dealer",
  requireDealerId: async () => currentDealerId,
}));
mock.module("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

const { markTicketsSeen } = await import("@/app/(dashboard)/tickets/seen/actions");
const { markTicketsSeenSchema } = await import("@/lib/validations/ticket");

const NOW = new Date("2026-10-05T10:00:00Z");

beforeEach(() => {
  rows.length = 0;
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  setSystemTime(NOW);
});

describe("markTicketsSeenSchema", () => {
  test("ต้องมีอย่างน้อย 1 กลุ่ม และเวลาเป็น ISO", () => {
    expect(markTicketsSeenSchema.safeParse({ groupKeys: [], seenAt: NOW.toISOString() }).success).toBe(false);
    expect(markTicketsSeenSchema.safeParse({ groupKeys: ["a"], seenAt: "yesterday" }).success).toBe(false);
    expect(markTicketsSeenSchema.safeParse({ groupKeys: ["a", "none"], seenAt: NOW.toISOString() }).success).toBe(true);
  });
});

describe("markTicketsSeen", () => {
  test("จำเวลาที่ดูของทุกกลุ่มที่ส่งมา (ของผู้ใช้ + แม่หวยที่เลือกอยู่) แล้ว revalidate หน้าโพย", async () => {
    const at = "2026-10-05T09:59:00.000Z";
    const result = await markTicketsSeen({ groupKeys: ["a", "none", "a"], seenAt: at });

    expect(result.ok).toBe(true);
    expect(rows).toEqual([
      { userId: "user-1", dealerId: "dealer-1", groupKey: "a", seenAt: new Date(at) },
      { userId: "user-1", dealerId: "dealer-1", groupKey: "none", seenAt: new Date(at) },
    ]);
    expect(revalidated).toContain("/tickets");
  });

  test("เวลาในอนาคตถูกตัดเหลือเวลาปัจจุบัน (กันโพยที่ยังไม่เข้ามาถูกนับว่าดูแล้ว)", async () => {
    await markTicketsSeen({ groupKeys: ["a"], seenAt: "2027-01-01T00:00:00.000Z" });
    expect(rows[0]?.seenAt).toEqual(NOW);
  });

  test("ไม่ถอยเวลาที่เคยดูแล้วกลับ (กดจากแท็บเก่า)", async () => {
    rows.push({ userId: "user-1", dealerId: "dealer-1", groupKey: "a", seenAt: new Date("2026-10-05T09:59:00Z") });
    await markTicketsSeen({ groupKeys: ["a"], seenAt: "2026-10-05T08:00:00.000Z" });
    expect(rows[0]?.seenAt).toEqual(new Date("2026-10-05T09:59:00Z"));
  });

  test("ยังไม่ได้เข้าสู่ระบบ = ไม่สำเร็จ และไม่บันทึกอะไร", async () => {
    currentUser = null;
    const result = await markTicketsSeen({ groupKeys: ["a"], seenAt: NOW.toISOString() });
    expect(result.ok).toBe(false);
    expect(rows).toEqual([]);
  });
});
