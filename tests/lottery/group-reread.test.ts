import { beforeEach, describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";

import { rereadGroupTickets } from "@/lottery/ingest";
import { readTicketText } from "@/lottery/ticket";

/**
 * เปลี่ยนตั้งค่าการอ่านของกลุ่ม (สกุลเงินเริ่มต้น / 3 ตัวล่าง) → โพยของกลุ่มในงวดที่เปิดรับอ่านใหม่ทันที
 * รวมโพยที่นับยอดแล้ว (ยังนับยอดอยู่ แต่ใช้สกุลเงินใหม่) · งวดที่ปิดแล้วไม่แตะ
 */
type Row = Record<string, unknown>;

const state = {
  group: { threeDigitBottom: false, currency: "LAK" as "LAK" | "THB" },
  draws: new Map<string, { dealerId: string; status: string; closesAt: Date | null }>(),
  tickets: new Map<string, Row>(),
  bets: [] as Row[],
  audits: [] as Row[],
};

const tx = {
  whatsappGroup: { findUnique: async () => state.group },
  readRule: { findMany: async () => [] },
  ticket: {
    findMany: async ({ where }: { where: { groupId: string; draw: { status: string } } }) =>
      [...state.tickets.values()]
        .filter((ticket) => ticket.groupId === where.groupId && state.draws.get(ticket.drawId as string)!.status === where.draw.status)
        .map((ticket) => ({ ...ticket, image: null, draw: state.draws.get(ticket.drawId as string)! })),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...state.tickets.get(where.id)!, ...data };
      state.tickets.set(where.id, updated);
      return updated;
    },
  },
  bet: {
    findMany: async ({ where }: { where: { ticketId: string } }) => state.bets.filter((bet) => bet.ticketId === where.ticketId),
    deleteMany: async ({ where }: { where: { ticketId: string } }) => {
      state.bets = state.bets.filter((bet) => bet.ticketId !== where.ticketId);
    },
    createMany: async ({ data }: { data: Row[] }) => {
      state.bets.push(...data);
    },
  },
  auditLog: {
    create: async ({ data }: { data: Row }) => {
      state.audits.push(data);
    },
  },
};
const db = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;

/** โพยที่อ่านด้วยตั้งค่าเดิม (กีบ) — force = คนยืนยันให้นับเฉพาะบรรทัดที่อ่านได้ */
function addTicket(id: string, drawId: string, text: string, force = false) {
  const read = readTicketText(text, { lakMultiplier: 1000 }, force)!;
  state.tickets.set(id, { id, drawId, groupId: "group-1", ...read.fields });
  state.bets.push(...read.bets.map((bet) => ({ ...bet, ticketId: id, drawId })));
}

const betsOf = (id: string) =>
  state.bets.filter((bet) => bet.ticketId === id).map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);

beforeEach(() => {
  state.group = { threeDigitBottom: false, currency: "LAK" };
  state.draws = new Map([
    ["open", { dealerId: "dealer-1", status: "OPEN", closesAt: null }],
    ["closed", { dealerId: "dealer-1", status: "CLOSED", closesAt: null }],
  ]);
  state.tickets.clear();
  state.bets = [];
  state.audits = [];
});

describe("rereadGroupTickets", () => {
  test("เปลี่ยนเป็นบาท → โพยที่นับยอดแล้วเปลี่ยนเป็นบาท ยังนับยอดอยู่ · ยอดรวมของโพยเปลี่ยนตาม", async () => {
    addTicket("t1", "open", "12=10\n34=20");
    state.group = { threeDigitBottom: false, currency: "THB" };

    expect(await rereadGroupTickets(db, "group-1", { id: "admin-1" })).toBe(1);
    expect(state.tickets.get("t1")).toMatchObject({ status: "CONFIRMED", totalLak: 0, totalThb: 30 });
    expect(betsOf("t1")).toEqual(["12 TOP THB 10", "34 TOP THB 20"]);
    expect(state.audits[0]).toMatchObject({ userId: "admin-1" });
  });

  test("โพยที่ระบุสกุลเงินเอง ไม่เปลี่ยน · งวดที่ปิดแล้วไม่แตะ", async () => {
    addTicket("own", "open", "12=10ກີບ");
    addTicket("old", "closed", "12=10");
    state.group = { threeDigitBottom: false, currency: "THB" };

    expect(await rereadGroupTickets(db, "group-1", null)).toBe(0);
    expect(betsOf("own")).toEqual(["12 TOP LAK 10000"]);
    expect(betsOf("old")).toEqual(["12 TOP LAK 10000"]);
  });

  test("โพยที่คนยืนยันนับบางบรรทัด (มีบรรทัดอ่านไม่ออก) ยังนับยอดอยู่หลังเปลี่ยนสกุล", async () => {
    addTicket("forced", "open", "12=10\nabc=?", true);
    state.group = { threeDigitBottom: false, currency: "THB" };

    await rereadGroupTickets(db, "group-1", null);
    expect(state.tickets.get("forced")).toMatchObject({ status: "CONFIRMED", totalThb: 10 });
  });

  test("เปลี่ยนกลับเป็นกีบ → กลับเป็นกีบเหมือนเดิม", async () => {
    state.group = { threeDigitBottom: false, currency: "THB" };
    addTicket("t1", "open", "12=10");
    state.group = { threeDigitBottom: false, currency: "THB" };
    await rereadGroupTickets(db, "group-1", null);
    state.group = { threeDigitBottom: false, currency: "LAK" };
    await rereadGroupTickets(db, "group-1", null);
    expect(betsOf("t1")).toEqual(["12 TOP LAK 10000"]);
  });
});
