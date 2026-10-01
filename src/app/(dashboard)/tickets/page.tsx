import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { TicketsView } from "./_components/tickets-view";
import { TICKET_SORTABLE, isTicketStatus, type TicketRow } from "./types";

export const metadata: Metadata = { title: "Tickets" };

/** จำนวนตัวเลือกในฟอร์ม/ตัวกรอง — จำกัดไว้กันดึงทั้งตาราง */
const DRAW_OPTIONS = 30;
const CUSTOMER_OPTIONS = 500;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TicketsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("tickets.title")} description={t("tickets.subtitle")} />;

  const raw = await searchParams;
  const params = parseListParams(raw, {
    sortable: TICKET_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  const [draws, customers] = await Promise.all([
    prisma.draw.findMany({
      where: { dealerId: current.id },
      orderBy: { drawDate: "desc" },
      take: DRAW_OPTIONS,
      select: { id: true, name: true, status: true },
    }),
    prisma.customer.findMany({
      where: { dealerId: current.id },
      orderBy: { name: "asc" },
      take: CUSTOMER_OPTIONS,
      select: { id: true, name: true, lakMultiplier: true },
    }),
  ]);

  // ตัวกรองจาก URL (?draw=<id>|all&status=REVIEW) — ไม่ระบุงวด = งวดที่เปิดรับล่าสุด
  const drawParam = (first(raw.draw) ?? "").slice(0, 50);
  const drawId =
    drawParam === "all" ? null : drawParam || (draws.find((draw) => draw.status === "OPEN")?.id ?? null);
  const statusParam = first(raw.status);
  const status = isTicketStatus(statusParam) ? statusParam : null;

  // โพยเป็นของแม่หวยผ่านงวด — ?draw= ของแม่หวยอื่นจึงไม่เจออะไร
  const conditions: Record<string, unknown>[] = [{ draw: { dealerId: current.id } }];
  if (drawId) conditions.push({ drawId });
  if (status) conditions.push({ status });
  if (params.q) {
    conditions.push({
      OR: [
        { rawText: { contains: params.q, mode: "insensitive" as const } },
        { note: { contains: params.q, mode: "insensitive" as const } },
        { senderName: { contains: params.q, mode: "insensitive" as const } },
        { customer: { name: { contains: params.q, mode: "insensitive" as const } } },
      ],
    });
  }
  const where = { AND: conditions };

  const page = await paginate<
    TicketRow,
    {
      id: string;
      drawId: string;
      draw: { name: string };
      customerId: string | null;
      customer: { name: string } | null;
      senderName: string | null;
      source: TicketRow["source"];
      status: TicketRow["status"];
      rawText: string;
      lakMultiplier: number;
      note: string | null;
      issues: unknown;
      betCount: number;
      totalLak: unknown;
      totalThb: unknown;
      createdAt: Date;
    }
  >(prisma.ticket, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { createdAt: "desc" },
    select: {
      id: true,
      drawId: true,
      draw: { select: { name: true } },
      customerId: true,
      customer: { select: { name: true } },
      senderName: true,
      source: true,
      status: true,
      rawText: true,
      lakMultiplier: true,
      note: true,
      issues: true,
      betCount: true,
      totalLak: true,
      totalThb: true,
      createdAt: true,
    },
    map: ({ draw, customer, issues, ...row }) => ({
      ...row,
      drawName: draw.name,
      customerName: customer?.name ?? null,
      issueCount: Array.isArray(issues) ? issues.length : 0,
      totalLak: Number(row.totalLak),
      totalThb: Number(row.totalThb),
      createdAt: row.createdAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader
        title={t("tickets.title")}
        description={t("tickets.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <TicketsView page={page} draws={draws} customers={customers} filters={{ drawId, status }} />
    </>
  );
}
