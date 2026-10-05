import type { LotteryType, Prisma, PrismaClient } from "@prisma/client";

import type { SearchParamsInput } from "@/types";
import {
  ALL_GROUPS,
  NO_GROUP,
  REMEMBERED_TICKET_PARAMS,
  type TicketGroupOption,
} from "./types";

/**
 * กลุ่มโพย + โพยที่ยังไม่ได้ดู + ตัวกรองที่จำไว้ ของหน้าโพย
 *
 *  - หน้าโพยแสดงทีละกลุ่ม WhatsApp ต่องวด (?group=<id>) เลือกหลายกลุ่มรวมกันได้ (?group=<id>,<id>) หรือทุกกลุ่ม (?group=all)
 *    โพยที่ไม่มีกลุ่ม (คีย์เอง / ไม่รู้กลุ่ม) อยู่ในกลุ่ม NO_GROUP
 *  - ยังไม่ได้ดู = เข้ามาหลังเวลาที่ผู้ใช้กด "ดูทั้งหมดแล้ว" ของกลุ่มนั้น (TicketSeen) และยังไม่เคยเปิดหน้าตรวจใบนั้น (TicketRead)
 *    ไม่เคยกดเลย = ยังไม่ได้ดูทุกใบที่ยังไม่ได้เปิด
 *
 * ฟังก์ชันที่ไม่แตะฐานข้อมูลแยกไว้ด้านบนให้เทสต์ได้ตรง ๆ
 */

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** กลุ่มที่เลือกพร้อมกันได้สูงสุด — กัน URL ยาวผิดปกติ */
const GROUP_PARAM_MAX = 50;

/** ?group= → "all" | รายการ key ที่พิมพ์มา (ยังไม่ได้ตรวจกับกลุ่มจริง) | null = ไม่ระบุ */
export function readGroupParam(raw: SearchParamsInput): typeof ALL_GROUPS | string[] | null {
  const value = (first(raw.group) ?? "").trim();
  if (!value) return null;
  if (value === ALL_GROUPS) return ALL_GROUPS;
  const keys = [...new Set(value.split(",").map((key) => key.trim().slice(0, 50)).filter(Boolean))];
  return keys.length ? keys.slice(0, GROUP_PARAM_MAX) : null;
}

/**
 * กลุ่มที่จะแสดงจริง — null = ทุกกลุ่ม
 * ตัด key ที่ไม่อยู่ในตัวเลือกทิ้ง (กลุ่มของงวด/แม่หวยอื่น) · ไม่ระบุ/เหลือไม่เหลือสักกลุ่ม = กลุ่มแรก (กลุ่มที่มีโพยล่าสุด)
 */
export function resolveGroups(
  param: ReturnType<typeof readGroupParam>,
  options: Pick<TicketGroupOption, "key">[],
): string[] | null {
  if (param === ALL_GROUPS) return null;
  const valid = new Set(options.map((option) => option.key));
  const picked = (param ?? []).filter((key) => valid.has(key));
  if (picked.length) return picked;
  return [options[0]?.key ?? NO_GROUP];
}

/** กลุ่มที่แสดง → ค่า ?group= (รูปแบบเดียวเสมอ หน้าเทียบกับ URL แล้ว redirect ให้ตรงกันได้โดยไม่วน) */
export function groupParamValue(groups: string[] | null) {
  return groups ? groups.join(",") : ALL_GROUPS;
}

/** where ของกลุ่มที่เลือก — NO_GROUP = groupId เป็น null */
export function groupWhere(keys: string[]): Prisma.TicketWhereInput {
  const ids = keys.filter((key) => key !== NO_GROUP);
  const withNone = keys.includes(NO_GROUP);
  if (!ids.length) return { groupId: null };
  if (!withNone) return { groupId: { in: ids } };
  return { OR: [{ groupId: { in: ids } }, { groupId: null }] };
}

/** key ของกลุ่มโพย */
export const groupKeyOf = (groupId: string | null) => groupId ?? NO_GROUP;

/** โพยนี้ยังไม่ได้ดูไหม — seenAt = เวลาที่กด "ดูทั้งหมดแล้ว" ของกลุ่มนั้นครั้งล่าสุด (undefined = ไม่เคยกด) */
export function isUnread(createdAt: Date, seenAt: Date | undefined) {
  return !seenAt || createdAt > seenAt;
}

/**
 * ค่าที่จำไว้ใน cookie → searchParams (เฉพาะคีย์ใน REMEMBERED_TICKET_PARAMS) — ว่าง/อ่านไม่ได้ = null (ไม่ต้อง redirect)
 * cookie ถูกแก้เองได้ จึงรับเฉพาะคีย์ที่รู้จัก แล้วให้ตัวอ่านของแต่ละตัวกรองตรวจค่าซ้ำตามปกติ
 */
export function readRememberedParams(value: string | undefined): Record<string, string> | null {
  if (!value) return null;
  // client เขียนแบบ encodeURIComponent — ตัวอ่าน cookie ส่วนใหญ่ถอดให้แล้ว ถ้ายังไม่ถอด (ไม่มี "=") ถอดเอง
  let text = value.slice(0, 2000);
  if (!text.includes("=")) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(text);
  const remembered: Record<string, string> = {};
  for (const key of REMEMBERED_TICKET_PARAMS) {
    const item = params.get(key);
    if (item) remembered[key] = item;
  }
  return Object.keys(remembered).length ? remembered : null;
}

/** searchParams ปัจจุบัน → ค่าที่จะเก็บใน cookie (เฉพาะคีย์ที่จำ · ไม่จำเลขหน้า) */
export function rememberedQuery(current: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of REMEMBERED_TICKET_PARAMS) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  return next.toString();
}

/**
 * ตัวเลือกกลุ่มของงวดที่กรองอยู่ (drawId null = ทุกงวด) + เวลาที่ผู้ใช้ดูแต่ละกลุ่มแล้ว
 *
 * กลุ่มที่แสดง = กลุ่มที่มีโพยในงวดนี้ (ล่าสุดขึ้นก่อน) + กลุ่มที่ผูกกับแม่หวยนี้และอ่านหวยประเภทเดียวกับงวด (ยังไม่มีโพย เรียงตามชื่อ)
 * + NO_GROUP ไว้ท้ายเสมอ (โพยที่คีย์เองอยู่กลุ่มนี้ ต้องหาเจอได้)
 * จำนวนนับด้วย groupBy ที่ฐานข้อมูล — ไม่ดึงโพยมานับเอง
 */
export async function loadTicketGroups(
  db: Pick<PrismaClient, "ticket" | "whatsappGroup" | "ticketSeen">,
  { userId, dealerId, drawId, lottery }: { userId: string; dealerId: string; drawId: string | null; lottery: LotteryType | null },
): Promise<{ options: TicketGroupOption[]; seen: Map<string, Date> }> {
  const scope: Prisma.TicketWhereInput = { draw: { dealerId }, ...(drawId ? { drawId } : {}) };

  const [stats, seenRows] = await Promise.all([
    db.ticket.groupBy({ by: ["groupId"], where: scope, _count: { _all: true }, _max: { createdAt: true } }),
    db.ticketSeen.findMany({ where: { userId, dealerId }, select: { groupKey: true, seenAt: true } }),
  ]);
  const seen = new Map(seenRows.map((row) => [row.groupKey, row.seenAt]));

  const statIds = stats.flatMap((stat) => (stat.groupId ? [stat.groupId] : []));
  const groups = await db.whatsappGroup.findMany({
    where: {
      OR: [{ id: { in: statIds } }, { dealerId, active: true, ...(lottery ? { lottery } : {}) }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const keys = [...groups.map((group) => group.id), NO_GROUP];
  const unreadStats = await db.ticket.groupBy({
    by: ["groupId"],
    where: {
      AND: [
        scope,
        // เปิดหน้าตรวจดูทีละใบแล้ว = ดูแล้ว
        { reads: { none: { userId } } },
        {
          OR: keys.map((key) => {
            const seenAt = seen.get(key);
            return { ...groupWhere([key]), ...(seenAt ? { createdAt: { gt: seenAt } } : {}) };
          }),
        },
      ],
    },
    _count: { _all: true },
  });

  const statOf = new Map(stats.map((stat) => [groupKeyOf(stat.groupId), stat]));
  const unreadOf = new Map(unreadStats.map((stat) => [groupKeyOf(stat.groupId), stat._count._all]));
  const latest = (key: string) => statOf.get(key)?._max.createdAt?.getTime() ?? 0;

  const options: TicketGroupOption[] = [
    ...groups.map((group) => ({ key: group.id, name: group.name })),
    { key: NO_GROUP, name: null },
  ]
    .map((option) => ({ ...option, total: statOf.get(option.key)?._count._all ?? 0, unread: unreadOf.get(option.key) ?? 0 }))
    // กลุ่มที่มีโพยก่อน (ล่าสุดก่อน) · ไม่มีโพย = ตามชื่อ (findMany เรียงมาแล้ว) และ NO_GROUP อยู่ท้าย
    .sort((a, b) => latest(b.key) - latest(a.key));

  return { options, seen };
}
