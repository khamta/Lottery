import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";

import { timeOf, zonedDateTime } from "@/lottery/date";
import { closeExpiredDraws } from "@/lottery/draw-close";
import { acceptsTickets } from "@/lottery/draw-status";

/** เวลาออกผลของงวด + ปิดรับอัตโนมัติเมื่อเลยเวลา (src/lottery/draw-close.ts) */
describe("เวลาออกผล (เวลาลาว UTC+7)", () => {
  test("วันที่ + เวลา HH:mm → เวลาจริง · และแปลงกลับเป็น HH:mm ได้ตรง", () => {
    const at = zonedDateTime("2026-10-03", "18:30", "Asia/Vientiane");
    expect(at.toISOString()).toBe("2026-10-03T11:30:00.000Z");
    expect(timeOf(at, "Asia/Vientiane")).toBe("18:30");
    // หลังเที่ยงคืนเวลาลาว = ยังเป็นวันก่อนหน้าใน UTC
    expect(zonedDateTime("2026-10-03", "05:00", "Asia/Vientiane").toISOString()).toBe("2026-10-02T22:00:00.000Z");
  });

  test("รับโพยได้เฉพาะงวดที่เปิดรับและยังไม่ถึงเวลาออกผล · ไม่ตั้งเวลา = รับจนกว่าจะปิดเอง", () => {
    const now = new Date("2026-10-03T11:00:00Z");
    const closesAt = new Date("2026-10-03T11:30:00Z");
    expect(acceptsTickets({ status: "OPEN", closesAt }, now)).toBe(true);
    expect(acceptsTickets({ status: "OPEN", closesAt }, closesAt)).toBe(false);
    expect(acceptsTickets({ status: "OPEN", closesAt: null }, now)).toBe(true);
    expect(acceptsTickets({ status: "CLOSED", closesAt: null }, now)).toBe(false);
  });
});

describe("closeExpiredDraws", () => {
  function fakeDb(draws: { id: string; dealerId: string; status: string; closesAt: Date | null; name: string }[]) {
    const audit: Record<string, unknown>[] = [];
    const tx = {
      draw: {
        updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
          const draw = draws.find((item) => item.id === where.id && item.status === where.status);
          if (!draw) return { count: 0 };
          draw.status = data.status;
          return { count: 1 };
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => draws.find((item) => item.id === where.id)!,
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => audit.push(data) },
    };
    const db = {
      draw: {
        findMany: async ({ where }: { where: { status: string; closesAt: { lte: Date }; dealerId?: string } }) =>
          draws.filter(
            (draw) =>
              draw.status === where.status &&
              draw.closesAt !== null &&
              draw.closesAt <= where.closesAt.lte &&
              (!where.dealerId || draw.dealerId === where.dealerId),
          ),
      },
      $transaction: async (fn: (client: typeof tx) => Promise<number>) => fn(tx),
    };
    return { db: db as unknown as PrismaClient, audit, draws };
  }

  test("ปิดรับเฉพาะงวดที่เปิดรับและเลยเวลาออกผลแล้ว พร้อม audit log · งวดที่ยังไม่ถึงเวลา/ไม่ตั้งเวลาไม่แตะ", async () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const { db, audit, draws } = fakeDb([
      { id: "v3", dealerId: "d1", status: "OPEN", closesAt: new Date("2026-10-03T11:30:00Z"), name: "V3" },
      { id: "v4", dealerId: "d1", status: "OPEN", closesAt: new Date("2026-10-03T13:30:00Z"), name: "V4" },
      { id: "lao", dealerId: "d1", status: "OPEN", closesAt: null, name: "LAO" },
      { id: "other", dealerId: "d2", status: "OPEN", closesAt: new Date("2026-10-03T10:00:00Z"), name: "V5" },
    ]);

    expect(await closeExpiredDraws(db, { dealerId: "d1", now })).toBe(1);
    expect(draws.map((draw) => [draw.id, draw.status])).toEqual([
      ["v3", "CLOSED"],
      ["v4", "OPEN"],
      ["lao", "OPEN"],
      ["other", "OPEN"],
    ]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "UPDATE", entity: "Draw", entityId: "v3" });

    // บอทเรียกแบบไม่ระบุแม่หวย = ทุกแม่หวย
    expect(await closeExpiredDraws(db, { now })).toBe(1);
    expect(draws.find((draw) => draw.id === "other")!.status).toBe("CLOSED");
  });
});
