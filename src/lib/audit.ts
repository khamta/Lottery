import { headers } from "next/headers";
import { Prisma, type PrismaClient, type AuditAction } from "@prisma/client";

/**
 * Audit log กลาง — ทุก server action ที่เขียนข้อมูลต้องเรียก `logAudit()` (หรือ `logAuditMany()`
 * สำหรับลบ/แก้หลายรายการพร้อมกัน) **ภายใน** `prisma.$transaction()` เดียวกับการเขียนข้อมูลจริง
 * เพื่อให้ audit log กับข้อมูลจริง atomic กัน (ดู AGENTS.md ข้อ 2.4)
 *
 * `changes` เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง (`diffChanges`) และ redact ฟิลด์อ่อนไหวเสมอ
 * ห้ามส่ง before/after ทั้งก้อนของ record ที่มีฟิลด์อ่อนไหวแบบดิบ ๆ — ให้แปลงเป็นค่าที่ปลอดภัยก่อน
 * (เช่นหน้าโปรไฟล์ ส่ง `{ avatar: true/false }` แทน bytes จริง — ดู profile/actions.ts)
 */

/** ฟิลด์ที่ไม่มีความหมายสำหรับ audit (metadata ของ record เอง) */
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

/** ฟิลด์อ่อนไหว — เก็บได้แค่ว่า "เปลี่ยน" ไม่เก็บค่าจริง */
const SENSITIVE_FIELDS = new Set(["password", "avatar"]);
const REDACTED = "[redacted]";

function isSensitiveField(field: string): boolean {
  return SENSITIVE_FIELDS.has(field) || /token/i.test(field);
}

/** marker ภายในไว้บอกว่า "ข้ามฟิลด์นี้ไปเลย" (เช่น Buffer ที่ diff เป็น JSON ไม่ได้) */
const SKIP = Symbol("audit-skip-field");

function isDecimal(value: unknown): value is Prisma.Decimal {
  return value instanceof Prisma.Decimal;
}

function isBytes(value: unknown): boolean {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

/** ทำให้ค่าเดียวปลอดภัยสำหรับเก็บใน JSON column: Decimal → number, Date → ISO string, Bytes → ข้าม */
function normalizeValue(value: unknown): unknown | typeof SKIP {
  if (value === undefined) return SKIP;
  if (value instanceof Date) return value.toISOString();
  if (isDecimal(value)) return value.toNumber();
  if (isBytes(value)) return SKIP;
  return value;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function redact(field: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  return isSensitiveField(field) ? REDACTED : value;
}

export type AuditFieldChange = { from?: unknown; to?: unknown };
export type AuditChanges = Record<string, AuditFieldChange>;

/**
 * สร้าง `changes` JSON ตามรูปแบบมาตรฐาน:
 *   CREATE → { field: { to } }
 *   UPDATE → { field: { from, to } } เฉพาะฟิลด์ที่เปลี่ยนจริง
 *   DELETE → { field: { from } }
 * ข้าม id / createdAt / updatedAt เสมอ, redact ฟิลด์อ่อนไหว (password / avatar / *token*)
 */
export function diffChanges(
  action: AuditAction,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): AuditChanges {
  const changes: AuditChanges = {};

  if (action === "CREATE") {
    for (const [field, raw] of Object.entries(after ?? {})) {
      if (IGNORED_FIELDS.has(field)) continue;
      const value = normalizeValue(raw);
      if (value === SKIP) continue;
      changes[field] = { to: redact(field, value) };
    }
    return changes;
  }

  if (action === "DELETE") {
    for (const [field, raw] of Object.entries(before ?? {})) {
      if (IGNORED_FIELDS.has(field)) continue;
      const value = normalizeValue(raw);
      if (value === SKIP) continue;
      changes[field] = { from: redact(field, value) };
    }
    return changes;
  }

  // UPDATE — เทียบทุกฟิลด์ที่ปรากฏฝั่งใดฝั่งหนึ่ง
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue;

    const from = normalizeValue((before ?? {})[field]);
    const to = normalizeValue((after ?? {})[field]);
    if (from === SKIP && to === SKIP) continue;

    const fromValue = from === SKIP ? undefined : from;
    const toValue = to === SKIP ? undefined : to;
    if (isEqual(fromValue, toValue)) continue;

    changes[field] = { from: redact(field, fromValue), to: redact(field, toValue) };
  }
  return changes;
}

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditActor = { id: string; name?: string | null; email?: string | null } | null | undefined;

export type LogAuditParams = {
  action: AuditAction;
  /** ชื่อ model เช่น "Product" */
  entity: string;
  entityId?: string | null;
  /** ป้ายชื่อที่อ่านรู้เรื่อง เช่น "SKU-001 · Coffee" — ยังอ่านได้แม้ record ถูกลบไปแล้ว */
  summary?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  user?: AuditActor;
};

/** อ่าน ip / user-agent จาก request ปัจจุบัน — ปลอดภัยแม้เรียกนอก request (เช่นในเทสต์) */
async function readRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const list = await headers();
    const forwardedFor = list.get("x-forwarded-for");
    const ip = (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) || list.get("x-real-ip");
    return { ip: ip || null, userAgent: list.get("user-agent") || null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

type AuditRow = {
  action: AuditAction;
  entity: string;
  entityId: string | null;
  summary: string | null;
  changes: Prisma.InputJsonValue | undefined;
  userId: string | null;
  userName: string | null;
  ip: string | null;
  userAgent: string | null;
};

function buildAuditRow(
  params: LogAuditParams,
  meta: { ip: string | null; userAgent: string | null },
): AuditRow | null {
  const { action, entity, entityId, summary, before, after, user } = params;

  const changes = diffChanges(action, before, after);
  // UPDATE ที่ไม่มีอะไรเปลี่ยนจริง ๆ ไม่ต้องเขียนแถว audit
  if (action === "UPDATE" && Object.keys(changes).length === 0) return null;

  return {
    action,
    entity,
    entityId: entityId ?? null,
    summary: summary ?? null,
    changes: Object.keys(changes).length > 0 ? (changes as Prisma.InputJsonValue) : undefined,
    userId: user?.id ?? null,
    userName: user?.name ?? user?.email ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

/**
 * บันทึกประวัติการเปลี่ยนแปลง 1 แถว — เรียกภายใน `prisma.$transaction()` เดียวกับการเขียนข้อมูลจริงเสมอ
 *
 *   await prisma.$transaction(async (tx) => {
 *     const product = await tx.product.create({ data: input });
 *     await logAudit(tx, {
 *       action: "CREATE",
 *       entity: "Product",
 *       entityId: product.id,
 *       summary: `${product.sku} · ${product.name}`,
 *       after: product,
 *       user,
 *     });
 *     return product;
 *   });
 */
export async function logAudit(db: Db, params: LogAuditParams): Promise<void> {
  const meta = await readRequestMeta();
  const row = buildAuditRow(params, meta);
  if (!row) return;

  await db.auditLog.create({ data: row });
}

/** เหมือน `logAudit` แต่เขียนหลายแถวในคำสั่งเดียว (`createMany`) — ใช้กับ deleteMany / bulk actions */
export async function logAuditMany(db: Db, entries: LogAuditParams[]): Promise<void> {
  if (entries.length === 0) return;

  const meta = await readRequestMeta();
  const rows = entries
    .map((params) => buildAuditRow(params, meta))
    .filter((row): row is AuditRow => row !== null);

  if (rows.length === 0) return;
  await db.auditLog.createMany({ data: rows });
}
