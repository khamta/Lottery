import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import type { PageProps } from "@/types";
import { AuditLogsView } from "./_components/audit-logs-view";
import {
  AUDIT_LOG_SORTABLE,
  isAuditAction,
  type AuditActionValue,
  type AuditJsonValue,
  type AuditLogRow,
} from "./types";

export const metadata: Metadata = { title: "Audit log" };

type RawAuditLog = {
  id: string;
  action: AuditActionValue;
  entity: string;
  entityId: string | null;
  summary: string | null;
  changes: unknown;
  userName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { name: string | null; email: string; image: string | null } | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** หน้ารายการแบบอ่านอย่างเดียว (เฉพาะ ADMIN) — ประวัติว่าใครทำอะไรกับข้อมูลไหน */
export default async function AuditLogsPage({ searchParams }: PageProps) {
  // ไม่ใช่ ADMIN → กลับหน้า dashboard (เหมือนหน้า users) แทนการโยน error ขึ้นหน้าจอ
  await requireRole(["ADMIN"]).catch(() => redirect("/dashboard"));

  const { t } = await getTranslations();
  const raw = await searchParams;
  const params = parseListParams(raw, {
    sortable: AUDIT_LOG_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  // ตัวกรองเสริมจาก URL (?action=UPDATE&entity=Product) — ค่าเพี้ยนถูกทิ้งไป
  const actionParam = first(raw.action);
  const action = isAuditAction(actionParam) ? actionParam : undefined;
  const entity = (first(raw.entity) ?? "").trim().slice(0, 50) || undefined;

  const conditions: Record<string, unknown>[] = [];
  if (params.q) {
    conditions.push({
      OR: [
        { summary: { contains: params.q, mode: "insensitive" as const } },
        { entity: { contains: params.q, mode: "insensitive" as const } },
        { entityId: { contains: params.q, mode: "insensitive" as const } },
        { userName: { contains: params.q, mode: "insensitive" as const } },
      ],
    });
  }
  if (action) conditions.push({ action });
  if (entity) conditions.push({ entity });
  const where = conditions.length ? { AND: conditions } : undefined;

  const [page, entityRows] = await Promise.all([
    paginate<AuditLogRow, RawAuditLog>(prisma.auditLog, {
      params,
      where,
      orderBy: buildOrderBy(params) ?? { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        changes: true,
        userName: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        user: { select: { name: true, email: true, image: true } },
      },
      map: ({ user, changes, createdAt, ...row }) => ({
        ...row,
        actor: user,
        changes: (changes ?? null) as AuditJsonValue,
        createdAt: createdAt.toISOString(),
      }),
    }),
    // ตัวเลือกของตัวกรอง entity — มีไม่กี่ค่า จึงจำกัดจำนวนไว้กันพลาด
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <PageHeader title={t("auditLogs.title")} description={t("auditLogs.subtitle")} />
      <AuditLogsView
        page={page}
        entities={entityRows.map((row) => row.entity)}
        filters={{ action: action ?? null, entity: entity ?? null }}
      />
    </>
  );
}
