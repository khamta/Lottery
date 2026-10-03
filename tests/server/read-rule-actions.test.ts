import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * เทสต์ server action ของ module read-rules — mock prisma / auth / next-cache ไว้ก่อน import ตัว action
 * (แบบเดียวกับ tests/server/limit-actions.test.ts)
 * rulesOf / rereadTickets (src/lottery/ingest.ts) ทำงานจริงกับฐานข้อมูลจำลอง — เงื่อนไขเปลี่ยนแล้วโพยต้องถูกอ่านใหม่จริง
 */
type Row = Record<string, unknown>;

const db = {
  rules: new Map<string, Row>(),
  /** โพยของแม่หวย — drawOpen = งวดของโพยยังเปิดรับ */
  tickets: new Map<string, Row>(),
  bets: [] as Row[],
  auditRows: [] as Row[],
};

const revalidated: string[] = [];
let currentUser: { id: string; role: "ADMIN" | "USER" } | null = { id: "user-1", role: "USER" };
/** แม่หวยที่เลือกอยู่ (null = บัญชียังไม่มีแม่หวย) */
let currentDealerId: string | null = "dealer-1";
let nextId = 1;
let clock = 0;

const rulesOfDealer = (dealerId: string) =>
  [...db.rules.values()]
    .filter((rule) => rule.dealerId === dealerId)
    .sort((a, b) => (a.createdAt as number) - (b.createdAt as number));

const tx = {
  readRule: {
    create: async ({ data }: { data: Row }) => {
      const rule = { id: `rule-${nextId++}`, createdAt: clock++, ...data };
      db.rules.set(rule.id, rule);
      return rule;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.rules.get(where.id)!, ...data };
      db.rules.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.rules.get(where.id)!;
      db.rules.delete(where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      for (const id of where.id.in) db.rules.delete(id);
      return { count: where.id.in.length };
    },
    count: async ({ where }: { where: { dealerId: string } }) => rulesOfDealer(where.dealerId).length,
    findFirst: async ({ where }: { where: { id: string; dealerId: string } }) => {
      const row = db.rules.get(where.id);
      return row && row.dealerId === where.dealerId ? row : null;
    },
    findMany: async ({
      where,
      select,
    }: {
      where: { dealerId: string; isActive?: boolean; id?: { in: string[] } };
      select?: Row;
    }) =>
      rulesOfDealer(where.dealerId)
        .filter((rule) => where.isActive === undefined || rule.isActive === where.isActive)
        .filter((rule) => !where.id || where.id.in.includes(rule.id as string))
        .map((rule) => (select ? { kind: rule.kind, find: rule.find, replace: rule.replace } : rule)),
  },
  ticket: {
    findMany: async ({ where }: { where: { draw: { dealerId: string } } }) =>
      [...db.tickets.values()]
        .filter((ticket) => ticket.dealerId === where.draw.dealerId && ticket.drawOpen && ticket.rawText !== "")
        .map((ticket) => ({ ...ticket, image: null })),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const updated = { ...db.tickets.get(where.id)!, ...data };
      db.tickets.set(where.id, updated);
      return updated;
    },
  },
  bet: {
    createMany: async ({ data }: { data: Row[] }) => {
      db.bets.push(...data);
    },
    deleteMany: async ({ where }: { where: { ticketId: string } }) => {
      db.bets = db.bets.filter((bet) => bet.ticketId !== where.ticketId);
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
    findMany: async ({ where }: { where: { entityId: { in: string[] } } }) =>
      db.auditRows
        .filter((row) => where.entityId.in.includes(row.entityId as string) && row.userId != null)
        .map((row) => ({ entityId: row.entityId })),
  },
};

mock.module("@/lib/prisma", () => ({
  prisma: {
    ...tx,
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
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

const { createReadRule, updateReadRule, deleteReadRule, deleteReadRules } = await import(
  "@/app/(dashboard)/read-rules/actions"
);

/** ลูกค้าพิมพ์ "ລ 30 70 x100" = เลข 30 และ 70 ล่าง ยอด 100 */
const pattern = { kind: "PATTERN" as const, find: "ລ {N} x{A}", replace: "{N}={A}ລ່າງ", note: "", isActive: true };

/** โพยรอตรวจที่ระบบอ่านไม่ออก (ยังไม่มีเงื่อนไข) */
function addTicket(id: string, rawText: string, overrides: Row = {}) {
  db.tickets.set(id, {
    id,
    dealerId: "dealer-1",
    drawId: "draw-1",
    drawOpen: true,
    rawText,
    lakMultiplier: 1000,
    status: "REVIEW",
    issues: [{ code: "UNREADABLE", line: 1, text: rawText }],
    totalLak: 0,
    totalThb: 0,
    betCount: 0,
    ...overrides,
  });
}

beforeEach(() => {
  currentDealerId = "dealer-1";
  db.rules.clear();
  db.tickets.clear();
  db.bets = [];
  db.auditRows = [];
  revalidated.length = 0;
  currentUser = { id: "user-1", role: "USER" };
  nextId = 1;
});

describe("createReadRule", () => {
  test("บันทึกเป็นของแม่หวยที่เลือกอยู่ และ revalidate หน้าที่ยอดอาจเปลี่ยน", async () => {
    const result = await createReadRule(pattern);

    expect(result.ok).toBe(true);
    expect([...db.rules.values()][0]).toMatchObject({ ...pattern, note: null, dealerId: "dealer-1" });
    expect(revalidated).toEqual(expect.arrayContaining(["/read-rules", "/tickets", "/reports", "/dashboard"]));
  });

  test("เพิ่มเงื่อนไขแล้วอ่านโพยในงวดที่เปิดรับใหม่ทันที — โพยที่อ่านไม่ออกกลายเป็นนับยอด", async () => {
    addTicket("ticket-1", "ລ 30 70 x100");

    const result = await createReadRule(pattern);

    expect(result.ok && result.data.reread).toBe(1);
    expect(db.tickets.get("ticket-1")).toMatchObject({
      rawText: "ລ 30 70 x100", // ข้อความเดิมไม่ถูกแก้
      status: "CONFIRMED",
      totalLak: 200_000,
      issues: [],
    });
    expect(db.bets.map((bet) => `${bet.number} ${bet.position} ${bet.amount}`)).toEqual([
      "30 BOTTOM 100000",
      "70 BOTTOM 100000",
    ]);
    // อ่านใหม่ในนามระบบ — โพยยังนับว่าไม่มีคนแตะ อ่านใหม่ได้อีกเมื่อเงื่อนไขเปลี่ยน
    expect(db.auditRows.find((row) => row.entity === "Ticket")).toMatchObject({ action: "UPDATE", userId: null });
  });

  test("ไม่แตะ: งวดที่ปิดแล้ว · โพยที่นับยอดแล้วที่คนแก้/ยืนยัน · แม่หวยอื่น", async () => {
    addTicket("closed", "ລ 30 70 x100", { drawOpen: false });
    addTicket("other-dealer", "ລ 30 70 x100", { dealerId: "dealer-2" });
    addTicket("by-user", "ລ 30 70 x100", { status: "CONFIRMED", issues: [] });
    db.auditRows.push({ entity: "Ticket", entityId: "by-user", userId: "user-1" });

    const result = await createReadRule(pattern);

    expect(result.ok && result.data.reread).toBe(0);
    for (const id of ["closed", "other-dealer"]) expect(db.tickets.get(id)).toMatchObject({ status: "REVIEW" });
    expect(db.tickets.get("by-user")).toMatchObject({ status: "CONFIRMED", totalLak: 0 });
  });

  test("รูปแบบที่ไม่มีช่อง / ใช้ช่องที่ไม่มีในรูปแบบค้นหา → VALIDATION ไม่แตะฐานข้อมูล", async () => {
    for (const input of [
      { ...pattern, find: "ລ 30 70" },
      { ...pattern, replace: "{N}={B}" },
      { ...pattern, find: "{X} {A}" },
      { ...pattern, find: "ລ {N}\nx{A}" },
    ]) {
      const result = await createReadRule(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("VALIDATION");
    }
    expect(db.rules.size).toBe(0);
  });

  test("ข้ามบรรทัด: เก็บผลลัพธ์ว่างเสมอ", async () => {
    await createReadRule({ kind: "SKIP", find: "ໂອນແລ້ວ", replace: "ค้างจากชนิดอื่น", note: "", isActive: true });
    expect([...db.rules.values()][0]).toMatchObject({ kind: "SKIP", find: "ໂອນແລ້ວ", replace: "" });
  });

  test("ไม่มีแม่หวย → dealers.required", async () => {
    currentDealerId = null;
    const result = await createReadRule(pattern);

    expect(result.ok).toBe(false);
    expect(db.rules.size).toBe(0);
  });

  test("เขียน audit log action CREATE พร้อมป้ายที่อ่านรู้เรื่อง", async () => {
    await createReadRule(pattern);

    expect(db.auditRows[0]).toMatchObject({
      action: "CREATE",
      entity: "ReadRule",
      userId: "user-1",
      summary: "PATTERN · ລ {N} x{A} → {N}={A}ລ່າງ",
    });
  });
});

describe("updateReadRule", () => {
  test("ปิดเงื่อนไข → โพยที่เคยอ่านได้เพราะเงื่อนไขนี้กลับไปรอตรวจ", async () => {
    addTicket("ticket-1", "ລ 30 70 x100");
    const created = await createReadRule(pattern);
    const id = created.ok ? created.data.id : "";

    const result = await updateReadRule({ ...pattern, id, isActive: false });

    expect(result.ok && result.data.reread).toBe(1);
    expect(db.tickets.get("ticket-1")).toMatchObject({ status: "REVIEW", totalLak: 0 });
    expect(db.bets).toEqual([]);
  });

  test("เงื่อนไขของแม่หวยอื่น แก้ไม่ได้", async () => {
    const created = await createReadRule(pattern);
    const id = created.ok ? created.data.id : "";
    currentDealerId = "dealer-2";

    const result = await updateReadRule({ ...pattern, id, find: "ບ {N} x{A}" });

    expect(result.ok).toBe(false);
    expect(db.rules.get(id)).toMatchObject({ find: pattern.find });
  });
});

describe("deleteReadRule / deleteReadRules", () => {
  test("ลบแล้วอ่านโพยใหม่ และเขียน audit log action DELETE", async () => {
    addTicket("ticket-1", "ລ 30 70 x100");
    const created = await createReadRule(pattern);
    const id = created.ok ? created.data.id : "";

    const result = await deleteReadRule({ id });

    expect(result.ok && result.data.reread).toBe(1);
    expect(db.rules.has(id)).toBe(false);
    expect(db.tickets.get("ticket-1")).toMatchObject({ status: "REVIEW" });
    expect(db.auditRows.find((row) => row.entity === "ReadRule" && row.action === "DELETE")).toMatchObject({
      entityId: id,
      userId: "user-1",
    });
  });

  test("ลบที่เลือกในคำสั่งเดียว พร้อม audit หนึ่งแถวต่อรายการ — ข้าม id ของแม่หวยอื่น", async () => {
    const a = await createReadRule(pattern);
    const b = await createReadRule({ ...pattern, kind: "REPLACE", find: "/", replace: "=" });
    currentDealerId = "dealer-2";
    const foreign = await createReadRule(pattern);
    currentDealerId = "dealer-1";
    db.auditRows = [];
    const ids = [a, b, foreign].map((r) => (r.ok ? r.data.id : ""));

    const result = await deleteReadRules({ ids });

    expect(result.ok && result.data.count).toBe(2);
    expect(db.rules.size).toBe(1);
    expect(db.auditRows.filter((row) => row.entity === "ReadRule")).toHaveLength(2);
  });

  test("ไม่ได้เลือกอะไร → VALIDATION", async () => {
    const result = await deleteReadRules({ ids: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION");
  });
});
