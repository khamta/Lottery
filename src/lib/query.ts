import type { Route } from "next";

import { siteConfig } from "@/config/site";
import type { ListParams, Paginated, SearchParamsInput } from "@/types";

/**
 * ============================================================================
 * ชั้นกลางของการ "ดึงข้อมูลแบบแบ่งหน้าที่ฐานข้อมูล" — ทุก module ใช้ตัวนี้
 * ============================================================================
 * หลักการ: สถานะของตาราง (หน้า, จำนวนต่อหน้า, คำค้น, การเรียง) เก็บใน URL
 * ไม่ใช่ใน state ของ component  →  แชร์ลิงก์ได้ กดปุ่ม back ได้ refresh แล้วไม่หาย
 * และ server component อ่านค่าจาก searchParams ไปสั่ง Prisma ได้ตรง ๆ
 */

const { defaultPageSize, pageSizeOptions } = siteConfig.pagination;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type ParseListParamsOptions = {
  /** คอลัมน์ที่ยอมให้เรียงได้ — กัน orderBy ที่ไม่มีอยู่จริงหลุดเข้า Prisma */
  sortable?: readonly string[];
  defaultSort?: string;
  defaultOrder?: "asc" | "desc";
  defaultPageSize?: number;
};

/** แปลง searchParams ของ Next.js ให้เป็นค่าที่เชื่อถือได้เสมอ (ค่าเพี้ยน = ใช้ค่า default) */
export function parseListParams(
  searchParams: SearchParamsInput,
  options: ParseListParamsOptions = {},
): ListParams {
  const {
    sortable = [],
    defaultSort = "",
    defaultOrder = "desc",
    defaultPageSize: fallbackSize = defaultPageSize,
  } = options;

  const pageRaw = Number(first(searchParams.page));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const sizeRaw = Number(first(searchParams.pageSize));
  const pageSize = pageSizeOptions.includes(sizeRaw) ? sizeRaw : fallbackSize;

  const q = (first(searchParams.q) ?? "").trim().slice(0, 100);

  const sortRaw = first(searchParams.sort) ?? "";
  const sort = sortable.includes(sortRaw) ? sortRaw : defaultSort;

  const orderRaw = first(searchParams.order);
  const order: "asc" | "desc" = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : defaultOrder;

  return { page, pageSize, q, sort, order };
}

/** สร้าง orderBy ของ Prisma จาก ListParams (รองรับ field ซ้อน เช่น "category.name") */
export function buildOrderBy(params: Pick<ListParams, "sort" | "order">) {
  if (!params.sort) return undefined;

  return params.sort.split(".").reduceRight<Record<string, unknown>>(
    (acc, key, index, arr) => (index === arr.length - 1 ? { [key]: params.order } : { [key]: acc }),
    {},
  );
}

/**
 * delegate ของ Prisma ที่มี findMany + count (prisma.product, prisma.user, ...)
 * args ใช้ any เพราะ Prisma สร้าง type ของ args แยกตาม model (ProductFindManyArgs ≠ UserFindManyArgs ฯลฯ)
 * ถ้าใช้ Record<string, unknown> จะ assign จาก delegate จริงของ Prisma ไม่ได้เลย (arg ไม่มี index signature)
 */
type PrismaDelegate = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- เหตุผลตามคอมเมนต์ด้านบน
  findMany: (args: any) => Promise<unknown[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- เหตุผลตามคอมเมนต์ด้านบน
  count: (args: any) => Promise<number>;
};

/**
 * ดึงข้อมูล "เฉพาะหน้าที่ขอ" + นับจำนวนทั้งหมด ในครั้งเดียว
 *
 *   const result = await paginate<ProductRow>(prisma.product, {
 *     params, where, select, orderBy: buildOrderBy(params) ?? { updatedAt: "desc" },
 *     map: (row) => ({ ...row, price: Number(row.price) }),
 *   })
 *
 * ฐานข้อมูลส่งกลับแค่ pageSize แถว (skip/take) — เร็วเท่าเดิมไม่ว่าจะมีข้อมูลกี่ล้านแถว
 */
export async function paginate<TRow, TRaw = unknown>(
  model: PrismaDelegate,
  args: {
    params: ListParams;
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
    orderBy?: unknown;
    /** แปลงค่าที่ส่งข้ามไป client ไม่ได้ (Decimal, Date) ให้เป็น plain value */
    map?: (row: TRaw) => TRow;
  },
): Promise<Paginated<TRow>> {
  const { params, where, select, include, orderBy, map } = args;
  const { page, pageSize } = params;

  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      ...(select ? { select } : {}),
      ...(include ? { include } : {}),
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    model.count({ where }),
  ]);

  const pageCount = Math.max(Math.ceil(total / pageSize), 1);

  return {
    rows: (map ? (rows as TRaw[]).map(map) : (rows as TRow[])) as TRow[],
    total,
    page,
    pageSize,
    pageCount,
  };
}

/** ใช้ตอนเปลี่ยนหน้า/จำนวนต่อหน้า — คืน query string ใหม่โดยคงค่าที่เหลือไว้ */
export function buildQueryString(
  current: URLSearchParams | SearchParamsInput,
  patch: Record<string, string | number | undefined | null>,
) {
  const next =
    current instanceof URLSearchParams
      ? new URLSearchParams(current)
      : new URLSearchParams(
          Object.entries(current).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, Array.isArray(value) ? (value[0] ?? "") : value]],
          ) as [string, string][],
        );

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "") next.delete(key);
    else next.set(key, String(value));
  }

  return next.toString();
}

/**
 * ใช้ตอน router.push()/replace() ด้วย URL ที่ประกอบเอง เช่น `${pathname}?${qs}`
 * typedRoutes เช็ค URL แบบ literal ล่วงหน้าไม่ได้เพราะ query string มาจาก state — cast ตรงนี้ที่เดียว
 */
export function toRoute(path: string): Route {
  return path as Route;
}
