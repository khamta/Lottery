import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HEARTBEAT_MS, isOnline } from "@/lib/presence";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import type { PageProps } from "@/types";
import { UsersTable } from "./_components/users-table";
import { USER_SORTABLE, type UserRow } from "./types";

export const metadata: Metadata = { title: "Users" };

/** หน้ารายการแบบอ่านอย่างเดียว — ใช้มาตรฐานเดียวกับ products ทุกประการ */
export default async function UsersPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/dashboard");

  const params = parseListParams(await searchParams, {
    sortable: USER_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  const now = new Date();
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { email: { contains: params.q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const page = await paginate<
    UserRow,
    {
      id: string;
      name: string | null;
      email: string;
      role: UserRow["role"];
      isActive: boolean;
      lastSeenAt: Date | null;
      createdAt: Date;
    }
  >(prisma.user, {
    params,
    where,
    // เรียงตามการใช้งานล่าสุด: คนที่ไม่เคยเข้า (null) ไปอยู่ท้ายเสมอ
    orderBy:
      params.sort === "lastSeenAt"
        ? { lastSeenAt: { sort: params.order, nulls: "last" } }
        : (buildOrderBy(params) ?? { createdAt: "desc" }),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
    },
    map: (row) => ({
      ...row,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      online: isOnline(row.lastSeenAt, now),
      createdAt: row.createdAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader title={t("users.title")} description={t("users.subtitle")} />
      <UsersTable page={page} />
      <LiveRefresh intervalMs={HEARTBEAT_MS} />
    </>
  );
}
