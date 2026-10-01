import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { ACCOUNT_DISABLED_PATH, findAccess } from "@/lottery/access";
import type { PageProps } from "@/types";
import { WhatsappView } from "./_components/whatsapp-view";
import { WHATSAPP_SORTABLE, isWorkerOnline, type WhatsappAccountRow, type WhatsappOwnerOption } from "./types";

export const metadata: Metadata = { title: "WhatsApp" };

/**
 * บัญชี WhatsApp ทั้งระบบ — เฉพาะผู้ดูแลระบบ (เช็คสิทธิ์จากฐานข้อมูล ไม่ใช่ role ใน session)
 * ผู้ดูแลเลือกว่าแต่ละบัญชีผูกกับผู้ใช้คนไหน · สถานะมาจากบอท หน้าจึง refresh เองเป็นระยะ
 */
export default async function WhatsappPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const user = await requireUser();
  const access = await findAccess(user.id);
  if (!access) redirect(ACCOUNT_DISABLED_PATH);
  if (!access.isAdmin) redirect("/dashboard");

  const params = parseListParams(await searchParams, {
    sortable: WHATSAPP_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "asc",
  });

  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: "insensitive" as const } },
          { phone: { contains: params.q } },
          { owner: { name: { contains: params.q, mode: "insensitive" as const } } },
          { owner: { email: { contains: params.q, mode: "insensitive" as const } } },
        ],
      }
    : undefined;

  const page = await paginate<
    WhatsappAccountRow,
    {
      id: string;
      name: string;
      ownerId: string;
      owner: { name: string | null; email: string };
      pairingPhone: string | null;
      enabled: boolean;
      status: WhatsappAccountRow["status"];
      phone: string | null;
      waName: string | null;
      lastError: string | null;
      seenAt: Date | null;
      createdAt: Date;
      groups: Array<{ dealerId: string | null }>;
    }
  >(prisma.whatsappAccount, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      pairingPhone: true,
      enabled: true,
      status: true,
      phone: true,
      waName: true,
      lastError: true,
      seenAt: true,
      createdAt: true,
      groups: { where: { active: true }, select: { dealerId: true } },
    },
    map: ({ groups, seenAt, owner, ...row }) => ({
      ...row,
      ownerName: row.ownerId === user.id ? null : (owner.name ?? owner.email),
      workerOnline: isWorkerOnline(seenAt),
      groupCount: groups.length,
      readingCount: groups.filter((group) => group.dealerId).length,
      createdAt: row.createdAt.toISOString(),
    }),
  });

  // ผู้ใช้ที่ผูกบัญชีได้ — เฉพาะบัญชีที่ยังใช้งานอยู่ (เจ้าของเดิมที่ถูกปิดไปแล้ว dialog เติมให้เองตอนแก้ไข)
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });
  const owners: WhatsappOwnerOption[] = users.map((owner) => ({
    id: owner.id,
    label: owner.name ? `${owner.name} (${owner.email})` : owner.email,
  }));

  return (
    <>
      <PageHeader title={t("whatsapp.title")} description={t("whatsapp.subtitle")} />
      <WhatsappView page={page} owners={owners} currentUserId={user.id} />
      <LiveRefresh intervalMs={10_000} />
    </>
  );
}
