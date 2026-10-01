import { beforeEach, describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";

import {
  TOTAL_WINDOW_MS,
  editMessage,
  ingestMessage,
  ingestUndecryptable,
  revokeMessage,
} from "@/lottery/ingest";

/**
 * เทสต์การนำข้อความจากกลุ่ม WhatsApp เข้าเป็นโพย — ใช้ฐานข้อมูลจำลองในหน่วยความจำ
 * (ingest รับ db เป็นพารามิเตอร์ จึงไม่ต้อง mock module และไม่ต้องต่อ WhatsApp จริง)
 */
type Row = Record<string, unknown>;

const state = {
  draws: [] as Array<{ id: string; dealerId: string; status: string; drawDate: Date; createdAt: Date }>,
  customers: [] as Array<{ id: string; dealerId: string; phone: string; lakMultiplier: number }>,
  tickets: new Map<string, Row>(),
  bets: [] as Row[],
  auditRows: [] as Row[],
};
let nextId = 1;

const drawOf = (ticket: Row) => state.draws.find((draw) => draw.id === ticket.drawId)!;

const tx = {
  draw: {
    // งวดที่เปิดรับล่าสุดของแม่หวย
    findFirst: async ({ where }: { where: { dealerId: string; status: string } }) =>
      state.draws
        .filter((draw) => draw.dealerId === where.dealerId && draw.status === where.status)
        .sort((a, b) => +b.drawDate - +a.drawDate)[0] ?? null,
  },
  customer: {
    findUnique: async ({ where }: { where: { dealerId_phone: { dealerId: string; phone: string } } }) =>
      state.customers.find(
        (customer) =>
          customer.dealerId === where.dealerId_phone.dealerId && customer.phone === where.dealerId_phone.phone,
      ) ?? null,
  },
  ticket: {
    create: async ({ data }: { data: Row }) => {
      const ticket = { id: `ticket-${nextId++}`, createdAt: new Date(), ...data };
      state.tickets.set(ticket.id, ticket);
      return ticket;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...state.tickets.get(where.id)!, ...data };
      state.tickets.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      state.tickets.delete(where.id);
      state.bets = state.bets.filter((bet) => bet.ticketId !== where.id);
    },
    findUnique: async ({ where, include }: { where: { waMessageId: string }; include?: unknown }) => {
      const ticket = [...state.tickets.values()].find((row) => row.waMessageId === where.waMessageId);
      if (!ticket) return null;
      return include ? { ...ticket, draw: drawOf(ticket) } : ticket;
    },
    // โพย WhatsApp ล่าสุดของคนส่งคนนี้ ในงวดที่เปิดรับ ภายในช่วงเวลาที่กำหนด
    findFirst: async ({
      where,
    }: {
      where: { senderId: string; createdAt: { gte: Date }; draw: { dealerId: string; status: string } };
    }) =>
      [...state.tickets.values()]
        .filter(
          (row) =>
            row.source === "WHATSAPP" &&
            row.senderId === where.senderId &&
            (row.createdAt as Date) >= where.createdAt.gte &&
            drawOf(row).dealerId === where.draw.dealerId &&
            drawOf(row).status === where.draw.status,
        )
        .sort((a, b) => +(b.createdAt as Date) - +(a.createdAt as Date))[0] ?? null,
  },
  bet: {
    createMany: async ({ data }: { data: Row[] }) => {
      state.bets.push(...data);
    },
    deleteMany: async ({ where }: { where: { ticketId: string } }) => {
      state.bets = state.bets.filter((bet) => bet.ticketId !== where.ticketId);
    },
  },
  auditLog: {
    create: async ({ data }: { data: Row }) => {
      state.auditRows.push(data);
    },
  },
};

const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;

const message = (id: string, text: string, overrides: Partial<Parameters<typeof ingestMessage>[1]> = {}) => ({
  id,
  text,
  dealerId: "dealer-1",
  senderId: "111@lid",
  senderPhone: null,
  senderName: "Noy",
  ...overrides,
});

/** เวลาที่งวดปัจจุบันถูกเปิด — ใช้แยกข้อความค้างส่งของงวดก่อน */
const DRAW_OPENED_AT = new Date("2026-09-30T02:00:00.000Z");

const briefBets = () => state.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);
const onlyTicket = () => [...state.tickets.values()][0]!;

beforeEach(() => {
  state.draws = [
    { id: "draw-1", dealerId: "dealer-1", status: "OPEN", drawDate: new Date("2026-09-30"), createdAt: DRAW_OPENED_AT },
  ];
  state.customers = [{ id: "customer-1", dealerId: "dealer-1", phone: "8562055512345", lakMultiplier: 1 }];
  state.tickets.clear();
  state.bets = [];
  state.auditRows = [];
  nextId = 1;
});

describe("ingestMessage", () => {
  test("ข้อความโพย → โพยจาก WhatsApp ในงวดที่เปิดรับ นับยอดทันที", async () => {
    const result = await ingestMessage(db, message("wa-1", "32.72=300\n30.70=100ລ່າງ"));

    expect(result).toEqual({ action: "created", ticketId: "ticket-1", status: "CONFIRMED" });
    expect(onlyTicket()).toMatchObject({
      drawId: "draw-1",
      source: "WHATSAPP",
      waMessageId: "wa-1",
      senderId: "111@lid",
      senderName: "Noy",
      customerId: null,
      totalLak: 800_000,
    });
    expect(briefBets()).toEqual([
      "32 TOP LAK 300000",
      "72 TOP LAK 300000",
      "30 BOTTOM LAK 100000",
      "70 BOTTOM LAK 100000",
    ]);
  });

  test("audit log บันทึกในนามระบบ (ไม่มี user)", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));

    expect(state.auditRows).toHaveLength(1);
    expect(state.auditRows[0]).toMatchObject({ action: "CREATE", entity: "Ticket", entityId: "ticket-1", userId: null });
  });

  test("เบอร์คนส่งตรงกับลูกค้า → ผูกลูกค้าและใช้ตัวคูณกีบของลูกค้า", async () => {
    await ingestMessage(db, message("wa-1", "32=150000", { senderPhone: "8562055512345" }));

    expect(onlyTicket()).toMatchObject({ customerId: "customer-1", lakMultiplier: 1, totalLak: 150_000 });
  });

  test("อ่านได้ไม่ครบ → โพยรอตรวจ ยังไม่นับยอด (บอทไม่ยืนยันแทนคน)", async () => {
    const result = await ingestMessage(db, message("wa-1", "772;5\n399"));

    expect(result).toMatchObject({ action: "created", status: "REVIEW" });
    expect(state.bets).toEqual([]);
  });

  test("ข้อความคุยทั่วไป → ข้าม ไม่สร้างโพย", async () => {
    expect(await ingestMessage(db, message("wa-1", "ຂອບໃຈເດີ"))).toEqual({ action: "skipped", reason: "not-ticket" });
    expect(state.tickets.size).toBe(0);
  });

  test("ข้อความเดิมถูกส่งมาอีกรอบ → ไม่นำเข้าซ้ำ", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));
    const again = await ingestMessage(db, message("wa-1", "32=300"));

    expect(again).toEqual({ action: "skipped", reason: "duplicate" });
    expect(state.tickets.size).toBe(1);
    expect(state.bets).toHaveLength(1);
  });

  test("ไม่มีงวดที่เปิดรับ → ไม่นำเข้า", async () => {
    state.draws[0]!.status = "CLOSED";

    expect(await ingestMessage(db, message("wa-1", "32=300"))).toEqual({ action: "skipped", reason: "no-open-draw" });
    expect(state.tickets.size).toBe(0);
  });

  test("มีหลายงวดเปิดพร้อมกัน → ลงงวดที่วันออกล่าสุด", async () => {
    state.draws.push({
      id: "draw-2",
      dealerId: "dealer-1",
      status: "OPEN",
      drawDate: new Date("2026-10-01"),
      createdAt: DRAW_OPENED_AT,
    });
    await ingestMessage(db, message("wa-1", "32=300"));

    expect(onlyTicket().drawId).toBe("draw-2");
  });

  test("เวลาของโพย = เวลาที่ส่งในแชต", async () => {
    const sentAt = new Date("2026-09-30T08:15:00.000Z");
    await ingestMessage(db, message("wa-1", "32=300", { sentAt }));

    expect(onlyTicket().createdAt).toEqual(sentAt);
  });
});

describe("หลายแม่หวย", () => {
  beforeEach(() => {
    state.draws.push({
      id: "draw-b",
      dealerId: "dealer-2",
      status: "OPEN",
      drawDate: new Date("2026-10-05"),
      createdAt: DRAW_OPENED_AT,
    });
    state.customers.push({ id: "customer-b", dealerId: "dealer-2", phone: "8562055512345", lakMultiplier: 1000 });
  });

  test("ข้อความลงงวดของแม่หวยที่กลุ่มผูกไว้ ไม่ใช่งวดที่ใหม่กว่าของแม่หวยอื่น", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));

    expect(onlyTicket().drawId).toBe("draw-1");
  });

  test("เบอร์เดียวกันเป็นลูกค้าของหลายแม่หวย → จับคู่กับลูกค้าของแม่หวยนั้น", async () => {
    await ingestMessage(db, message("wa-1", "32=300", { dealerId: "dealer-2", senderPhone: "8562055512345" }));

    expect(onlyTicket()).toMatchObject({ drawId: "draw-b", customerId: "customer-b", lakMultiplier: 1000 });
  });

  test("แม่หวยที่ไม่มีงวดเปิดรับ → ไม่นำเข้า แม้แม่หวยอื่นจะเปิดอยู่", async () => {
    state.draws[0]!.status = "CLOSED";

    expect(await ingestMessage(db, message("wa-1", "32=300"))).toEqual({ action: "skipped", reason: "no-open-draw" });
  });

  test("ยอดรวมจากกลุ่มของแม่หวยอื่น ไม่ถูกต่อเข้าโพยนี้", async () => {
    await ingestMessage(db, message("wa-1", "32=150"));

    expect(await ingestMessage(db, message("wa-2", "ລວມ150", { dealerId: "dealer-2" }))).toEqual({
      action: "skipped",
      reason: "not-ticket",
    });
    expect(onlyTicket().rawText).toBe("32=150");
  });
});

describe("ข้อความที่ส่งมาระหว่างบอทออฟไลน์", () => {
  test("ส่งหลังงวดปัจจุบันเปิด → นำเข้าตามปกติ", async () => {
    const sentAt = new Date(DRAW_OPENED_AT.getTime() + 60_000);
    const result = await ingestMessage(db, message("wa-1", "32=300", { offline: true, sentAt }));

    expect(result).toMatchObject({ action: "created", status: "CONFIRMED" });
  });

  test("ส่งก่อนงวดปัจจุบันเปิด → เป็นของงวดก่อน ไม่นำเข้า", async () => {
    const sentAt = new Date(DRAW_OPENED_AT.getTime() - 60_000);
    const result = await ingestMessage(db, message("wa-1", "32=300", { offline: true, sentAt }));

    expect(result).toEqual({ action: "skipped", reason: "before-draw" });
    expect(state.tickets.size).toBe(0);
  });
});

describe("ข้อความที่ WhatsApp ถอดรหัสไม่ได้", () => {
  const sender = { dealerId: "dealer-1", senderId: "111@lid", senderPhone: "8562055512345", senderName: "Noy" };

  test("สร้างโพยรอตรวจที่ข้อความว่าง ผูกลูกค้าจากเบอร์ — ไม่ปล่อยให้หายเงียบ ๆ", async () => {
    const result = await ingestUndecryptable(db, { id: "wa-1", ...sender });

    expect(result).toEqual({ action: "undecryptable", ticketId: "ticket-1", status: "REVIEW" });
    expect(onlyTicket()).toMatchObject({
      rawText: "",
      status: "REVIEW",
      customerId: "customer-1",
      senderName: "Noy",
      waMessageId: "wa-1",
      betCount: 0,
    });
    expect(state.bets).toEqual([]);
    expect(state.auditRows[0]).toMatchObject({ action: "CREATE", entity: "Ticket", summary: "Noy" });
  });

  test("ข้อความจริงตามมาทีหลัง → เติมลงโพยเดิม ไม่สร้างใบใหม่", async () => {
    await ingestUndecryptable(db, { id: "wa-1", ...sender });
    const result = await ingestMessage(db, message("wa-1", "32=150000", sender));

    expect(result).toEqual({ action: "recovered", ticketId: "ticket-1", status: "CONFIRMED" });
    expect(state.tickets.size).toBe(1);
    // ใช้ตัวคูณกีบของลูกค้าที่ผูกไว้ตอนสร้างโพย (ลูกค้ารายนี้พิมพ์ยอดเต็ม)
    expect(briefBets()).toEqual(["32 TOP LAK 150000"]);
  });

  test("ข้อความจริงเป็นแค่ข้อความคุย → ลบโพยรอตรวจนั้นทิ้ง", async () => {
    await ingestUndecryptable(db, { id: "wa-1", ...sender });
    const result = await ingestMessage(db, message("wa-1", "ຂອບໃຈເດີ", sender));

    expect(result).toEqual({ action: "skipped", reason: "not-ticket" });
    expect(state.tickets.size).toBe(0);
  });

  test("คนตรวจวางข้อความเองไปแล้ว → ข้อความจริงที่ตามมาไม่ทับของที่ตรวจแล้ว", async () => {
    await ingestUndecryptable(db, { id: "wa-1", ...sender });
    Object.assign(onlyTicket(), { rawText: "32=100", status: "CONFIRMED" });

    expect(await ingestMessage(db, message("wa-1", "32=999", sender))).toEqual({
      action: "skipped",
      reason: "duplicate",
    });
    expect(onlyTicket().rawText).toBe("32=100");
  });

  test("ข้อความเดิมถอดรหัสไม่ได้ซ้ำ หรือได้ข้อความจริงไปแล้ว → ไม่สร้างซ้ำ", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));

    expect(await ingestUndecryptable(db, { id: "wa-1", ...sender })).toEqual({ action: "skipped", reason: "duplicate" });
    expect(state.tickets.size).toBe(1);
  });

  test("ข้อความยอดรวมไม่ถูกต่อเข้าโพยที่ยังไม่มีข้อความ", async () => {
    await ingestUndecryptable(db, { id: "wa-1", ...sender });

    expect(await ingestMessage(db, message("wa-2", "ລວມ150", sender))).toEqual({ action: "skipped", reason: "not-ticket" });
    expect(onlyTicket().rawText).toBe("");
  });

  test("ไม่มีงวดที่เปิดรับ → ไม่สร้างโพย", async () => {
    state.draws[0]!.status = "CLOSED";

    expect(await ingestUndecryptable(db, { id: "wa-1", ...sender })).toEqual({ action: "skipped", reason: "no-open-draw" });
  });
});

describe("ข้อความยอดรวมที่ส่งแยก (ລວມ150)", () => {
  const bets = ["74=20", "574=10", "47=20", "547=10", "77=20", "577=10", "87=20", "587=10", "78=20", "578=10"].join("\n");

  test("ยอดตรง → ต่อท้ายโพยก่อนหน้าของคนเดิม ยังนับยอดเหมือนเดิม", async () => {
    await ingestMessage(db, message("wa-1", bets));
    const result = await ingestMessage(db, message("wa-2", "ລວມ150"));

    expect(result).toEqual({ action: "total-attached", ticketId: "ticket-1", status: "CONFIRMED" });
    expect(state.tickets.size).toBe(1);
    expect(onlyTicket().rawText).toBe(`${bets}\nລວມ150`);
    expect(state.bets).toHaveLength(10);
  });

  test("ยอดไม่ตรง → โพยกลับไปรอตรวจ ยอดถูกถอนออกจนกว่าคนจะตรวจ", async () => {
    await ingestMessage(db, message("wa-1", bets));
    const result = await ingestMessage(db, message("wa-2", "ລວມ200"));

    expect(result).toMatchObject({ action: "total-attached", status: "REVIEW" });
    expect(state.bets).toEqual([]);
    expect(onlyTicket()).toMatchObject({ totalLak: 0, issues: [{ code: "TOTAL_MISMATCH" }] });
  });

  test("ยอดรวมของคนอื่น ไม่ถูกต่อเข้าโพยนี้", async () => {
    await ingestMessage(db, message("wa-1", bets));
    const result = await ingestMessage(db, message("wa-2", "ລວມ200", { senderId: "222@lid" }));

    expect(result).toEqual({ action: "skipped", reason: "not-ticket" });
    expect(onlyTicket().rawText).toBe(bets);
  });

  test("โพยที่มียอดรวมอยู่แล้ว หรือเก่าเกินช่วงเวลา ไม่ถูกต่อซ้ำ", async () => {
    await ingestMessage(db, message("wa-1", `${bets}\nລວມ150`));
    expect(await ingestMessage(db, message("wa-2", "ລວມ999"))).toEqual({ action: "skipped", reason: "not-ticket" });

    state.tickets.clear();
    await ingestMessage(db, message("wa-3", bets));
    onlyTicket().createdAt = new Date(Date.now() - TOTAL_WINDOW_MS - 1000);
    expect(await ingestMessage(db, message("wa-4", "ລວມ150"))).toEqual({ action: "skipped", reason: "not-ticket" });
  });
});

describe("editMessage / revokeMessage", () => {
  test("ลูกค้าแก้ข้อความ → โพยถูกอ่านใหม่ รายการแทงเดิมถูกแทนที่", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));
    state.auditRows = [];

    const result = await editMessage(db, "wa-1", "32=100\n72=100");

    expect(result).toEqual({ action: "edited", ticketId: "ticket-1", status: "CONFIRMED" });
    expect(briefBets()).toEqual(["32 TOP LAK 100000", "72 TOP LAK 100000"]);
    expect(state.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "Ticket", userId: null });
  });

  test("แก้จนไม่เหลือรายการแทง → เก็บเป็นโพยรอตรวจ ไม่ลบเอง", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));

    const result = await editMessage(db, "wa-1", "ຍົກເລີກ");

    expect(result).toMatchObject({ action: "edited", status: "REVIEW" });
    expect(state.tickets.size).toBe(1);
    expect(state.bets).toEqual([]);
  });

  test("ลูกค้าลบข้อความ → ลบโพยและยอดของโพยนั้น", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));
    state.auditRows = [];

    expect(await revokeMessage(db, "wa-1")).toEqual({ action: "revoked", ticketId: "ticket-1" });
    expect(state.tickets.size).toBe(0);
    expect(state.bets).toEqual([]);
    expect(state.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Ticket", userId: null });
  });

  test("งวดปิดรับแล้ว → แก้/ลบข้อความในแชตไม่มีผลกับโพย", async () => {
    await ingestMessage(db, message("wa-1", "32=300"));
    state.draws[0]!.status = "CLOSED";

    expect(await editMessage(db, "wa-1", "32=1")).toEqual({ action: "skipped", reason: "draw-closed" });
    expect(await revokeMessage(db, "wa-1")).toEqual({ action: "skipped", reason: "draw-closed" });
    expect(briefBets()).toEqual(["32 TOP LAK 300000"]);
  });

  test("ข้อความที่ไม่เคยเป็นโพย → ข้าม", async () => {
    expect(await revokeMessage(db, "wa-x")).toEqual({ action: "skipped", reason: "unknown-message" });
    expect(await editMessage(db, "wa-x", "32=1")).toEqual({ action: "skipped", reason: "unknown-message" });
  });
});
