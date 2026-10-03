import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { ACCOUNT_DISABLED_PATH, findAccess } from "@/lottery/access";
import type { DealerOption } from "@/lottery/dealer";
import type { PageProps } from "@/types";
import { isWorkerOnline } from "../types";
import { ConnectionPanel } from "./_components/connection-panel";
import { GroupsView } from "./_components/groups-view";
import { GROUP_SORTABLE, type WhatsappAccountDetail, type WhatsappGroupRow } from "./types";

export const metadata: Metadata = { title: "WhatsApp" };

/**
 * หน้าบัญชี WhatsApp: สแกน QR / กรอกรหัสจับคู่ + เลือกว่าแต่ละกลุ่มอ่านเข้าแม่หวยไหน
 * QR มาจากบอท (worker) ผ่านฐานข้อมูล และเปลี่ยนทุก ~20 วินาที หน้านี้จึง refresh ถี่ระหว่างรอสแกน
 */
export default async function WhatsappAccountPage({ params, searchParams }: PageProps<{ id: string }>) {
  const { t } = await getTranslations();
  const user = await requireUser();
  const access = await findAccess(user.id);
  if (!access) redirect(ACCOUNT_DISABLED_PATH);
  if (!access.isAdmin) redirect("/dashboard");
  const { id } = await params;

  const account = await prisma.whatsappAccount.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      pairingPhone: true,
      enabled: true,
      status: true,
      qr: true,
      pairingCode: true,
      phone: true,
      waName: true,
      lastError: true,
      seenAt: true,
      createdAt: true,
      groups: { where: { active: true }, select: { dealerId: true } },
    },
  });
  if (!account) notFound();

  // กลุ่มผูกได้เฉพาะแม่หวยของเจ้าของบัญชี WhatsApp (ผู้ดูแลที่เปิดบัญชีของคนอื่นจะเห็นแม่หวยของคนนั้น)
  const ownerDealers = await prisma.dealer.findMany({
    where: { ownerId: account.ownerId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const dealers: DealerOption[] = ownerDealers.map((dealer) => ({ ...dealer, ownerName: null }));

  const list = parseListParams(await searchParams, {
    sortable: GROUP_SORTABLE,
    defaultSort: "name",
    defaultOrder: "asc",
  });

  const page = await paginate<WhatsappGroupRow, WhatsappGroupRow>(prisma.whatsappGroup, {
    params: list,
    where: {
      accountId: account.id,
      active: true,
      ...(list.q ? { name: { contains: list.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: buildOrderBy(list) ?? { name: "asc" },
    select: { id: true, name: true, jid: true, size: true, active: true, dealerId: true, lottery: true },
    map: (row) => row,
  });

  const { groups, seenAt, qr, owner, ...rest } = account;
  const { ownerId } = account;
  const showQr = account.status === "QR" && !!qr && !account.pairingCode;
  const detail: WhatsappAccountDetail = {
    ...rest,
    ownerName: ownerId === user.id ? null : (owner.name ?? owner.email),
    workerOnline: isWorkerOnline(seenAt),
    groupCount: groups.length,
    readingCount: groups.filter((group) => group.dealerId).length,
    createdAt: account.createdAt.toISOString(),
    qrImage: showQr ? await QRCode.toDataURL(qr, { margin: 2, width: 320 }) : null,
  };

  return (
    <>
      <PageHeader
        title={account.name}
        description={
          detail.ownerName
            ? `${t("whatsapp.owner")}: ${detail.ownerName} · ${t("whatsapp.detailSubtitle")}`
            : t("whatsapp.detailSubtitle")
        }
        action={
          <Button asChild variant="outline">
            <Link href="/whatsapp">
              <ArrowLeft /> {t("whatsapp.back")}
            </Link>
          </Button>
        }
      />

      <ConnectionPanel account={detail} />

      <div className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold">{t("whatsapp.groupsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("whatsapp.groupsDesc")}</p>
        </div>
        <GroupsView page={page} dealers={dealers} />
      </div>

      {/* ระหว่างรอสแกน QR ต้องเห็น QR ใหม่ทันที — เชื่อมต่อแล้วแค่คอยดูกลุ่มใหม่ */}
      <LiveRefresh intervalMs={account.status === "CONNECTED" ? 15_000 : 2_500} />
    </>
  );
}
