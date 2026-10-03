import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { HEARTBEAT_MS, isOnline } from "@/lib/presence";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { ACCOUNT_DISABLED_PATH, findAccess } from "@/lottery/access";
import type { PageProps } from "@/types";
import { MembersView } from "./_components/members-view";
import { MEMBER_SORTABLE, type MemberRow } from "./types";

export const metadata: Metadata = { title: "Users" };

/** จัดการบัญชีผู้ใช้ — เฉพาะผู้ดูแลระบบ (เช็คสิทธิ์จากฐานข้อมูล ไม่ใช่ role ใน session) */
export default async function MembersPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const user = await requireUser();
  const access = await findAccess(user.id);
  if (!access) redirect(ACCOUNT_DISABLED_PATH);
  if (!access.isAdmin) redirect("/dashboard");

  const params = parseListParams(await searchParams, {
    sortable: MEMBER_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  const now = new Date();
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { username: { contains: params.q, mode: "insensitive" as const } },
          { email: { contains: params.q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const page = await paginate<
    MemberRow,
    {
      id: string;
      name: string | null;
      username: string | null;
      email: string;
      role: MemberRow["role"];
      isActive: boolean;
      lastSeenAt: Date | null;
      createdAt: Date;
      _count: { dealers: number; whatsappAccounts: number };
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
      username: true,
      email: true,
      role: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
      _count: { select: { dealers: true, whatsappAccounts: true } },
    },
    map: ({ _count, ...row }) => ({
      ...row,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      online: row.isActive && isOnline(row.lastSeenAt, now),
      dealerCount: _count.dealers,
      whatsappCount: _count.whatsappAccounts,
      isSelf: row.id === user.id,
      createdAt: row.createdAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader title={t("members.title")} description={t("members.subtitle")} />
      <MembersView page={page} />
      <LiveRefresh intervalMs={HEARTBEAT_MS} />
    </>
  );
}
