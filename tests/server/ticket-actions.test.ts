import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module tickets — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * ตัวแยกข้อความ (src/lottery/parser.ts) ใช้ของจริง จึงเทสต์ตั้งแต่ "ข้อความ → ยอดในฐานข้อมูล" ทั้งเส้น
 */
type Row = Record<string, unknown>;

const db = {
  draws: new Map<string, { dealerId: string; status: string }>(),
  customers: new Map<string, { id: string; dealerId: string; lakMultiplier: number }>(),
  tickets: new Map<string, Row>(),
  bets: [] as Row[],
  auditRows: [] as Row[],
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;

/** include: { draw } ของ findUnique / findMany */
const withDraw = (ticket: Row) => ({ ...ticket, draw: db.draws.get(ticket.drawId as string)! });

const ofDealer = (ticket: Row, dealerId: string) => db.draws.get(ticket.drawId as string)?.dealerId === dealerId;

const tx = {
  draw: {
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const draw = db.draws.get(where.id);
      return draw && draw.dealerId === where.dealerId ? draw : null;
    },
  },
  customer: {
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const customer = db.customers.get(where.id);
      return customer && customer.dealerId === where.dealerId ? customer : null;
    },
  },
  ticket: {
    create: async ({ data }: { data: Row }) => {
      const ticket = { id: `ticket-${nextId++}`, ...data };
      db.tickets.set(ticket.id, ticket);
      return ticket;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.tickets.get(where.id)!, ...data };
      db.tickets.set(where.id, updated);
      return updated;
    },
    // onDelete: Cascade — รายการแทงของโพยหายตาม
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.tickets.get(where.id)!;
      db.tickets.delete(where.id);
      db.bets = db.bets.filter((bet) => bet.ticketId !== where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      for (const id of where.id.in) db.tickets.delete(id);
      db.bets = db.bets.filter((bet) => !where.id.in.includes(bet.ticketId as string));
      return { count: where.id.in.length };
    },
    // โพยเป็นของแม่หวยผ่านงวด: where.draw.dealerId
    findFirst: async ({ where }: { where: { id: string; draw: { dealerId: string } } }) => {
      const ticket = db.tickets.get(where.id);
      return ticket && ofDealer(ticket, where.draw.dealerId) ? withDraw(ticket) : null;
    },
    findMany: async ({ where }: { where: { id: { in: string[] }; draw: { dealerId: string } } }) =>
      where.id.in.flatMap((id) => {
        const ticket = db.tickets.get(id);
        return ticket && ofDealer(ticket, where.draw.dealerId) ? [withDraw(ticket)] : [];
      }),
  },
  bet: {
    createMany: async ({ data }: { data: Row[] }) => {
      db.bets.push(...data);
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: { ticketId: string } }) => {
      db.bets = db.bets.filter((bet) => bet.ticketId !== where.ticketId);
      return { count: 0 };
    },
  },
  auditLog: {
    create: async ({ data }: { data: Row }) => {
      db.auditRows.push(data);
      return data;
    },
    createMany: async ({ data }: { data: Row[] }) => {
      db.auditRows.push(...data);
      return { count: data.length };
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

const { createTicket, updateTicket, deleteTicket, deleteTickets } = await import("@/app/(dashboard)/tickets/actions");

const valid = { drawId: "draw-open", customerId: "", text: "32.72=300\n243=150", note: "", force: false };

/** ย่อรายการแทงเป็นข้อความ: "เลข ฝั่ง สกุล ยอด" */
const briefBets = () => db.bets.map((b) => `${b.number} ${b.position} ${b.currency} ${b.amount}`);

beforeEach(() => {
  db.draws.clear();
  db.draws.set("draw-open", { dealerId: "dealer-1", status: "OPEN" });
  db.draws.set("draw-closed", { dealerId: "dealer-1", status: "CLOSED" });
  db.draws.set("draw-other", { dealerId: "dealer-2", status: "OPEN" });
  db.customers.clear();
  db.customers.set("customer-full", { id: "customer-full", dealerId: "dealer-1", lakMultiplier: 1 });
  db.customers.set("customer-other", { id: "customer-other", dealerId: "dealer-2", lakMultiplier: 1 });
  currentDealerId = "dealer-1";
  db.tickets.clear();
  db.bets = [];
  db.auditRows = [];
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  nextId = 1;
});

describe("createTicket", () => {
  test("ข้อความอ่านได้ครบ → นับยอดทันที กีบคูณ 1,000 และสร้างรายการแทงครบ", async () => {
    const result = await createTicket(valid);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("CONFIRMED");
    expect([...db.tickets.values()][0]).toMatchObject({
      drawId: "draw-open",
      customerId: null,
      source: "MANUAL",
      status: "CONFIRMED",
      lakMultiplier: 1000,
      betCount: 3,
      totalLak: 750_000,
      totalThb: 0,
      createdById: "user-1",
    });
    expect(briefBets()).toEqual(["32 TOP LAK 300000", "72 TOP LAK 300000", "243 TOP LAK 150000"]);
    expect(db.bets.every((bet) => bet.ticketId === "ticket-1" && bet.drawId === "draw-open")).toBe(true);
    expect(revalidated).toEqual(expect.arrayContaining(["/tickets", "/reports", "/dashboard"]));
  });

  test("ลูกค้าที่พิมพ์ยอดเต็ม → ไม่คูณ และบาทไม่คูณเสมอ", async () => {
    await createTicket({ ...valid, customerId: "customer-full", text: "32=150000\n72=300฿" });

    expect(briefBets()).toEqual(["32 TOP LAK 150000", "72 TOP THB 300"]);
    expect([...db.tickets.values()][0]).toMatchObject({
      customerId: "customer-full",
      lakMultiplier: 1,
      totalLak: 150_000,
      totalThb: 300,
    });
  });

  test("มีบรรทัดที่อ่านไม่ออก → โพยรอตรวจ ยังไม่นับยอดและไม่มีรายการแทง", async () => {
    const result = await createTicket({ ...valid, text: "32.72=300\n399" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("REVIEW");
    expect([...db.tickets.values()][0]).toMatchObject({
      status: "REVIEW",
      betCount: 0,
      totalLak: 0,
      issues: [{ code: "NO_AMOUNT", line: 2, text: "399" }],
    });
    expect(db.bets).toEqual([]);
  });

  test("force → นับเฉพาะบรรทัดที่อ่านได้", async () => {
    const result = await createTicket({ ...valid, text: "32.72=300\n399", force: true });

    if (result.ok) expect(result.data.status).toBe("CONFIRMED");
    expect(briefBets()).toEqual(["32 TOP LAK 300000", "72 TOP LAK 300000"]);
    expect([...db.tickets.values()][0]).toMatchObject({ totalLak: 600_000, betCount: 2 });
  });

  test("ข้อความที่ไม่มีรายการแทง → ไม่บันทึก", async () => {
    const result = await createTicket({ ...valid, text: "ຂອບໃຈເດີ" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.noBets");
    expect(db.tickets.size).toBe(0);
    expect(db.auditRows).toHaveLength(0);
  });

  test("งวดปิดรับแล้ว → ไม่บันทึก", async () => {
    const result = await createTicket({ ...valid, drawId: "draw-closed" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.drawNotOpen");
    expect(db.tickets.size).toBe(0);
  });

  test("ไม่พบลูกค้าที่เลือก → ไม่บันทึก", async () => {
    const result = await createTicket({ ...valid, customerId: "ghost" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.customerNotFound");
  });

  test("ข้อความว่าง → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    const result = await createTicket({ ...valid, text: "  " });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
    expect(db.tickets.size).toBe(0);
  });

  test("ยังไม่ login → UNAUTHORIZED", async () => {
    currentUser = null;
    const result = await createTicket(valid);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  test("เขียน audit log action CREATE พร้อม userId และบรรทัดแรกของข้อความ", async () => {
    await createTicket(valid);

    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({
      action: "CREATE",
      entity: "Ticket",
      entityId: "ticket-1",
      userId: "user-1",
      summary: "32.72=300",
    });
  });
});

describe("updateTicket", () => {
  test("แก้ข้อความของโพยรอตรวจ → นับยอด และ audit log บอกสถานะที่เปลี่ยน", async () => {
    const created = await createTicket({ ...valid, text: "32.72=300\n399" });
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await updateTicket({ ...valid, id, text: "32.72=300\n399=50" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("CONFIRMED");
    expect(briefBets()).toEqual(["32 TOP LAK 300000", "72 TOP LAK 300000", "399 TOP LAK 50000"]);
    expect(db.auditRows).toHaveLength(1);
    expect(db.auditRows[0]).toMatchObject({ action: "UPDATE", entity: "Ticket", entityId: id });
    expect((db.auditRows[0].changes as Row).status).toEqual({ from: "REVIEW", to: "CONFIRMED" });
  });

  test("แก้โพยที่นับยอดแล้ว → รายการแทงเดิมถูกแทนที่ ไม่ซ้อนยอด", async () => {
    const created = await createTicket(valid);
    const id = created.ok ? created.data.id : "";

    await updateTicket({ ...valid, id, text: "32=100" });

    expect(briefBets()).toEqual(["32 TOP LAK 100000"]);
    expect(db.tickets.get(id)).toMatchObject({ totalLak: 100_000, betCount: 1 });
  });

  test("โพยของงวดที่ปิดรับแล้ว แก้ไม่ได้", async () => {
    const created = await createTicket(valid);
    const id = created.ok ? created.data.id : "";
    db.draws.set("draw-open", { dealerId: "dealer-1", status: "CLOSED" });
    db.auditRows = [];

    const result = await updateTicket({ ...valid, id, text: "32=100" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.drawNotOpen");
    expect(db.tickets.get(id)).toMatchObject({ totalLak: 750_000 });
    expect(db.bets).toHaveLength(3);
    expect(db.auditRows).toHaveLength(0);
  });

  test("ไม่พบโพย → แจ้งว่าอาจถูกลบไปแล้ว", async () => {
    const result = await updateTicket({ ...valid, id: "ghost" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.notFound");
  });
});

describe("deleteTicket", () => {
  test("ลบโพยแล้วยอดหายจากรายการแทง และเขียน audit log action DELETE", async () => {
    const created = await createTicket(valid);
    const id = created.ok ? created.data.id : "";
    db.auditRows = [];

    const result = await deleteTicket({ id });

    expect(result.ok).toBe(true);
    expect(db.tickets.has(id)).toBe(false);
    expect(db.bets).toEqual([]);
    expect(db.auditRows[0]).toMatchObject({ action: "DELETE", entity: "Ticket", entityId: id, userId: "user-1" });
  });

  test("โพยของงวดที่ปิดรับแล้ว ลบไม่ได้", async () => {
    const created = await createTicket(valid);
    const id = created.ok ? created.data.id : "";
    db.draws.set("draw-open", { dealerId: "dealer-1", status: "SETTLED" });

    const result = await deleteTicket({ id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.drawNotOpen");
    expect(db.tickets.has(id)).toBe(true);
  });
});

describe("แยกตามแม่หวย", () => {
  test("งวดหรือลูกค้าของแม่หวยอื่น → ลงโพยไม่ได้", async () => {
    const otherDraw = await createTicket({ ...valid, drawId: "draw-other" });
    const otherCustomer = await createTicket({ ...valid, customerId: "customer-other" });

    expect(otherDraw.ok).toBe(false);
    if (!otherDraw.ok) expect(otherDraw.message).toBe("tickets.drawNotFound");
    expect(otherCustomer.ok).toBe(false);
    if (!otherCustomer.ok) expect(otherCustomer.message).toBe("tickets.customerNotFound");
    expect(db.tickets.size).toBe(0);
  });

  test("โพยของแม่หวยอื่น แก้/ลบไม่ได้ — ลบหลายรายการข้าม id ของแม่หวยอื่น", async () => {
    const created = await createTicket(valid);
    const id = created.ok ? created.data.id : "";
    currentDealerId = "dealer-2";

    const updated = await updateTicket({ ...valid, id, drawId: "draw-other", text: "32=1" });
    const deleted = await deleteTicket({ id });
    const bulk = await deleteTickets({ ids: [id] });

    expect(updated.ok).toBe(false);
    if (!updated.ok) expect(updated.message).toBe("tickets.notFound");
    expect(deleted.ok).toBe(false);
    expect(bulk.ok && bulk.data.count).toBe(0);
    expect(db.tickets.get(id)).toMatchObject({ drawId: "draw-open", rawText: valid.text });
  });
});

describe("deleteTickets (ลบที่เลือก)", () => {
  test("ลบทุก id ในคำสั่งเดียว พร้อม audit หนึ่งแถวต่อโพย", async () => {
    const a = await createTicket(valid);
    const b = await createTicket({ ...valid, text: "11=50" });
    db.auditRows = [];
    const ids = [a, b].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteTickets({ ids });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(2);
    expect(db.tickets.size).toBe(0);
    expect(db.bets).toEqual([]);
    expect(db.auditRows).toHaveLength(2);
    expect(db.auditRows.every((row) => row.action === "DELETE")).toBe(true);
  });

  test("มีโพยของงวดที่ปิดแล้วปนอยู่ → ไม่ลบเลยสักใบ", async () => {
    const a = await createTicket(valid);
    db.draws.set("draw-other", { dealerId: "dealer-1", status: "OPEN" });
    const b = await createTicket({ ...valid, drawId: "draw-other", text: "11=50" });
    db.draws.set("draw-other", { dealerId: "dealer-1", status: "CLOSED" });
    db.auditRows = [];
    const ids = [a, b].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteTickets({ ids });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("tickets.drawNotOpen");
    expect(db.tickets.size).toBe(2);
    expect(db.auditRows).toHaveLength(0);
  });

  test("ไม่ได้เลือกอะไร → VALIDATION", async () => {
    const result = await deleteTickets({ ids: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});
