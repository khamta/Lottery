import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  /** โพยที่ผู้ใช้เปิดดูแล้ว (TicketRead) */
  reads: [] as Row[],
  auditRows: [] as Row[],
  /** ticketId -> รูปโพย (โพยจาก WhatsApp ที่เป็นรูป) */
  images: new Map<string, Row>(),
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;

/** include: { draw } ของ findUnique / findMany */
const withDraw = (ticket: Row) => ({
  ...ticket,
  draw: db.draws.get(ticket.drawId as string)!,
  image: db.images.get(ticket.id as string) ?? null,
});

const ofDealer = (ticket: Row, dealerId: string) => db.draws.get(ticket.drawId as string)?.dealerId === dealerId;

const tx = {
  // advisory lock ของการออกเลขบิล (src/lottery/bill.ts)
  $queryRaw: async () => [{ locked: 1 }],
  // เงื่อนไขอ่านโพยของแม่หวย (หน้า /read-rules) — เทสต์นี้ไม่มีเงื่อนไข
  readRule: { findMany: async () => [] },
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
  ticketRead: {
    create: async ({ data }: { data: Row }) => {
      db.reads.push(data);
      return data;
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
    findFirst: async ({ where }: { where: { id: string; draw: { dealerId: string } } | { billNo: { startsWith: string } } }) => {
      // เลขบิลล่าสุดของวันเดียวกัน (src/lottery/bill.ts)
      if ("billNo" in where) {
        const bills = [...db.tickets.values()].map((ticket) => String(ticket.billNo)).filter((no) => no.startsWith(where.billNo.startsWith));
        return bills.length ? { billNo: bills.sort().at(-1)! } : null;
      }
      const ticket = db.tickets.get(where.id);
      return ticket && ofDealer(ticket, where.draw.dealerId) ? withDraw(ticket) : null;
    },
    findMany: async ({
      where,
    }: {
      where: { id: { in: string[] }; draw: { dealerId: string } } | { drawId: string; draw: { dealerId: string } };
    }) => {
      // อ่านรูปใหม่ทั้งงวด (rereadableWhere): มีรูป · รอตรวจ · รูปไม่ได้อยู่ในคิวอ่าน
      if ("drawId" in where) {
        return [...db.tickets.values()]
          .filter((ticket) => {
            const image = db.images.get(ticket.id as string);
            return (
              ticket.drawId === where.drawId &&
              ofDealer(ticket, where.draw.dealerId) &&
              ticket.status === "REVIEW" &&
              !!image?.path &&
              image.ocrStatus !== "PENDING"
            );
          })
          .map((ticket) => ({ id: ticket.id }));
      }
      return where.id.in.flatMap((id) => {
        const ticket = db.tickets.get(id);
        return ticket && ofDealer(ticket, where.draw.dealerId) ? [withDraw(ticket)] : [];
      });
    },
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
  ticketImage: {
    update: async ({ where, data }: { where: { ticketId: string }; data: Row }) => {
      const updated = { ...db.images.get(where.ticketId)!, ...data };
      db.images.set(where.ticketId, updated);
      return updated;
    },
  },
  // src/lottery/access.ts อ่าน role/isActive จากฐานข้อมูล (requireAdminAccess)
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      currentUser && currentUser.id === where.id ? { role: currentUser.role, isActive: true } : null,
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

// รูปที่แก้แล้ว (editTicketImage) เขียนลงโฟลเดอร์ uploads ชั่วคราว — ต้องตั้งก่อนโหลด image-store
process.env.UPLOAD_DIR ??= await mkdtemp(join(tmpdir(), "uploads-actions-"));
const { readTicketImage } = await import("@/lottery/image-store");
const { createTicket, updateTicket, deleteTicket, deleteTickets, rereadTicketImage, rereadDrawImages, editTicketImage } =
  await import("@/app/(dashboard)/tickets/actions");

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
  db.reads = [];
  db.auditRows = [];
  db.images.clear();
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

  test("คนคีย์โพยเห็นโพยนั้นแล้ว → ไม่ขึ้นเป็นยังไม่ได้ดูของตัวเอง", async () => {
    await createTicket(valid);
    expect(db.reads).toEqual([{ userId: "user-1", ticketId: "ticket-1" }]);
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

  test("เลขบิล = BNO + ปีเดือนวันเวลา · สร้างในวินาทีเดียวกันได้เลขถัดไป · แก้ไข/ย้ายงวดเลขเดิม", async () => {
    db.draws.set("draw-open-2", { dealerId: "dealer-1", status: "OPEN" });
    setSystemTime(new Date("2026-10-02T07:30:15Z")); // 14:30:15 เวลาลาว
    try {
      const first = await createTicket(valid);
      const second = await createTicket(valid);
      const secondId = second.ok ? second.data.id : "";
      expect(db.tickets.get(first.ok ? first.data.id : "")).toMatchObject({ billNo: "BNO261002143015" });
      expect(db.tickets.get(secondId)).toMatchObject({ billNo: "BNO261002143016" });

      await updateTicket({ ...valid, id: secondId, drawId: "draw-open-2", text: "32=100" });
      expect(db.tickets.get(secondId)).toMatchObject({ drawId: "draw-open-2", billNo: "BNO261002143016" });
    } finally {
      setSystemTime();
    }
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

describe("อ่านรูปโพยรอตรวจใหม่", () => {
  /** โพยจากรูปที่บอทอ่านแล้วแต่ยังรอตรวจ: ข้อความจากรูป + คำบรรยายใต้รูป (ລວມ400) */
  function seedImageTicket(
    id: string,
    { drawId = "draw-open", status = "REVIEW", ocrStatus = "DONE", path = `tickets/2026-10/${id}.jpg` as string | null } = {},
  ) {
    db.tickets.set(id, {
      id,
      drawId,
      status,
      rawText: "32=300\n43240\n\nລວມ400",
      lakMultiplier: 1000,
      issues: [{ code: "UNREADABLE", line: 2, text: "43240" }],
      senderName: "Noy",
      betCount: 0,
      totalLak: 0,
      totalThb: 0,
    });
    db.images.set(id, { ticketId: id, path, ocrStatus, ocrText: "32=300\n43240", ocrEngine: null, ocrError: null });
  }

  describe("ใบเดียว (ผู้ใช้ทุกคน)", () => {
    test("ตัวอ่านปกติ → รูปกลับเข้าคิว ตัดข้อความจากรูปครั้งก่อน คงคำบรรยายใต้รูป และ audit ในชื่อคนสั่ง", async () => {
      seedImageTicket("t1");

      const result = await rereadTicketImage({ id: "t1", engine: "OCR" });

      expect(result.ok).toBe(true);
      expect(db.images.get("t1")).toMatchObject({ ocrStatus: "PENDING", ocrEngine: "OCR", ocrText: null });
      expect(db.tickets.get("t1")).toMatchObject({ status: "REVIEW", rawText: "ລວມ400", betCount: 0 });
      expect((db.tickets.get("t1")!.issues as Array<{ code: string }>)[0]!.code).toBe("FROM_IMAGE");
      expect(db.auditRows.at(-1)).toMatchObject({ action: "UPDATE", entityId: "t1", userId: "user-1" });
      expect(revalidated).toContain("/tickets");
    });

    test("AI → จำตัวอ่านที่เลือกไว้ให้บอท", async () => {
      seedImageTicket("t1");

      await rereadTicketImage({ id: "t1", engine: "AI" });

      expect(db.images.get("t1")).toMatchObject({ ocrStatus: "PENDING", ocrEngine: "AI" });
    });

    test("คนแก้ข้อความไปแล้ว → แทนข้อความทั้งหมดด้วยผลอ่านใหม่", async () => {
      seedImageTicket("t1");
      db.tickets.set("t1", { ...db.tickets.get("t1")!, rawText: "32=500\n43=240" });

      await rereadTicketImage({ id: "t1", engine: "OCR" });

      expect(db.tickets.get("t1")).toMatchObject({ rawText: "" });
    });

    test("โพยที่นับยอดแล้ว / รูปอยู่ในคิวอยู่แล้ว / ไม่มีรูป / งวดปิด / แม่หวยอื่น → ไม่สั่ง", async () => {
      seedImageTicket("confirmed", { status: "CONFIRMED" });
      seedImageTicket("reading", { ocrStatus: "PENDING" });
      seedImageTicket("closed", { drawId: "draw-closed" });
      seedImageTicket("other", { drawId: "draw-other" });
      seedImageTicket("no-file", { path: null });
      db.tickets.set("manual", { id: "manual", drawId: "draw-open", status: "REVIEW", rawText: "43240" });

      const messages = [];
      for (const id of ["confirmed", "reading", "closed", "other", "no-file", "manual"]) {
        const result = await rereadTicketImage({ id, engine: "OCR" });
        messages.push(result.ok ? "ok" : result.message);
      }

      expect(messages).toEqual([
        "tickets.rereadNotReview",
        "tickets.rereadReading",
        "tickets.drawNotOpen",
        "tickets.notFound",
        "tickets.rereadNoImage",
        "tickets.rereadNoImage",
      ]);
      expect(db.images.get("confirmed")).toMatchObject({ ocrStatus: "DONE" });
      expect(db.auditRows).toHaveLength(0);
    });

    test("ตัวอ่านที่ไม่รู้จัก → VALIDATION", async () => {
      seedImageTicket("t1");
      const result = await rereadTicketImage({ id: "t1", engine: "GPT" as "AI" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
    });
  });

  describe("ทั้งงวด (ผู้ดูแลระบบเท่านั้น)", () => {
    test("ผู้ใช้ทั่วไป → FORBIDDEN ไม่แตะรูป", async () => {
      seedImageTicket("t1");

      const result = await rereadDrawImages({ drawId: "draw-open", engine: "OCR" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("FORBIDDEN");
      expect(db.images.get("t1")).toMatchObject({ ocrStatus: "DONE" });
    });

    test("ผู้ดูแล → สั่งอ่านเฉพาะโพยรอตรวจที่มีรูปและไม่ได้อยู่ในคิว ของงวดนั้น", async () => {
      currentUser = { id: "admin-1", role: "ADMIN" };
      seedImageTicket("a");
      seedImageTicket("b");
      seedImageTicket("confirmed", { status: "CONFIRMED" });
      seedImageTicket("reading", { ocrStatus: "PENDING" });
      db.draws.set("draw-next", { dealerId: "dealer-1", status: "OPEN" });
      seedImageTicket("next-draw", { drawId: "draw-next" });

      const result = await rereadDrawImages({ drawId: "draw-open", engine: "AI" });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.count).toBe(2);
      expect(db.images.get("a")).toMatchObject({ ocrStatus: "PENDING", ocrEngine: "AI" });
      expect(db.images.get("b")).toMatchObject({ ocrStatus: "PENDING", ocrEngine: "AI" });
      expect(db.images.get("confirmed")).toMatchObject({ ocrStatus: "DONE", ocrEngine: null });
      expect(db.images.get("reading")).toMatchObject({ ocrEngine: null });
      expect(db.images.get("next-draw")).toMatchObject({ ocrStatus: "DONE" });
      expect(db.auditRows.map((row) => row.userId)).toEqual(["admin-1", "admin-1"]);
    });

    test("ไม่มีอะไรให้อ่าน / งวดปิด / งวดของแม่หวยอื่น → แจ้งเหตุ", async () => {
      currentUser = { id: "admin-1", role: "ADMIN" };
      seedImageTicket("closed", { drawId: "draw-closed" });

      const results = await Promise.all(
        ["draw-open", "draw-closed", "draw-other"].map((drawId) => rereadDrawImages({ drawId, engine: "OCR" })),
      );

      expect(results.map((result) => (result.ok ? "ok" : result.message))).toEqual([
        "tickets.rereadNone",
        "tickets.drawNotOpen",
        "tickets.drawNotFound",
      ]);
    });
  });
  describe("แก้รูป (ครอป / ยางลบ) แล้วอ่านใหม่", () => {
    /** JPEG ปลอมที่ขึ้นต้นด้วยไบต์ของ JPEG จริง */
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");

    test("บันทึกรูปใหม่ เก็บต้นฉบับไว้ แล้วเข้าคิวอ่านด้วยตัวอ่านที่เลือก", async () => {
      seedImageTicket("t1");

      const result = await editTicketImage({ id: "t1", engine: "OCR", mimeType: "image/jpeg", data: jpeg });

      expect(result.ok).toBe(true);
      const image = db.images.get("t1")!;
      expect(image).toMatchObject({
        ocrStatus: "PENDING",
        ocrEngine: "OCR",
        mimeType: "image/jpeg",
        originalPath: "tickets/2026-10/t1.jpg",
      });
      expect(image.path).not.toBe("tickets/2026-10/t1.jpg");
      expect(image.editedAt).toBeInstanceOf(Date);
      expect(await readTicketImage(image.path as string)).toEqual(new Uint8Array(Buffer.from(jpeg, "base64")));
      expect(db.tickets.get("t1")).toMatchObject({ status: "REVIEW", rawText: "ລວມ400" });
      expect(db.auditRows.at(-1)).toMatchObject({ action: "UPDATE", entityId: "t1" });
      expect(revalidated).toContain("/tickets");
    });

    test("แก้ซ้ำ → ต้นฉบับยังเป็นรูปแรกที่ลูกค้าส่งมา ไฟล์ที่แก้รอบก่อนถูกลบ", async () => {
      seedImageTicket("t1");
      await editTicketImage({ id: "t1", engine: "OCR", mimeType: "image/jpeg", data: jpeg });
      const firstEdit = db.images.get("t1")!.path as string;
      db.images.set("t1", { ...db.images.get("t1")!, ocrStatus: "DONE" });

      const result = await editTicketImage({ id: "t1", engine: "AI", mimeType: "image/jpeg", data: jpeg });

      expect(result.ok).toBe(true);
      expect(db.images.get("t1")).toMatchObject({ originalPath: "tickets/2026-10/t1.jpg", ocrEngine: "AI" });
      expect(db.images.get("t1")!.path).not.toBe(firstEdit);
      expect(await readTicketImage(firstEdit)).toBeNull();
    });

    test("สั่งไม่ได้ (นับยอดแล้ว / อยู่ในคิว) → รูปเดิมไม่ถูกแตะ", async () => {
      seedImageTicket("confirmed", { status: "CONFIRMED" });
      seedImageTicket("reading", { ocrStatus: "PENDING" });

      const confirmed = await editTicketImage({ id: "confirmed", engine: "OCR", mimeType: "image/jpeg", data: jpeg });
      const reading = await editTicketImage({ id: "reading", engine: "OCR", mimeType: "image/jpeg", data: jpeg });

      expect(confirmed.ok ? "ok" : confirmed.message).toBe("tickets.rereadNotReview");
      expect(reading.ok ? "ok" : reading.message).toBe("tickets.rereadReading");
      expect(db.images.get("confirmed")).toMatchObject({ path: "tickets/2026-10/confirmed.jpg", ocrStatus: "DONE" });
      expect(db.images.get("confirmed")!.originalPath).toBeUndefined();
      expect(db.auditRows).toHaveLength(0);
    });

    test("ไฟล์ไม่ใช่รูปตามชนิดที่บอก → ไม่บันทึก", async () => {
      seedImageTicket("t1");

      const result = await editTicketImage({
        id: "t1",
        engine: "OCR",
        mimeType: "image/png",
        data: jpeg,
      });

      expect(result.ok ? "ok" : result.message).toBe("tickets.validation.imageInvalid");
      expect(db.images.get("t1")).toMatchObject({ path: "tickets/2026-10/t1.jpg", ocrStatus: "DONE" });
    });

    test("ข้อมูลไม่ใช่ base64 → VALIDATION", async () => {
      seedImageTicket("t1");
      const result = await editTicketImage({ id: "t1", engine: "OCR", mimeType: "image/jpeg", data: "<svg>" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
    });
  });
});
