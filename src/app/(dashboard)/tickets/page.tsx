import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { closeExpiredDraws } from "@/lottery/draw-close";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { rulesOf } from "@/lottery/ingest";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { TicketsView } from "./_components/tickets-view";
import { readTicketFilters, REREAD_DRAW_MAX, rereadableWhere, ticketWhere } from "./filters";
import { TICKET_SORTABLE, type TicketRow } from "./types";

export const metadata: Metadata = { title: "Tickets" };

/** จำนวนตัวเลือกในฟอร์ม/ตัวกรอง — จำกัดไว้กันดึงทั้งตาราง */
const DRAW_OPTIONS = 30;
const CUSTOMER_OPTIONS = 500;
/** มีรูปที่บอทยังอ่านไม่เสร็จในหน้านี้ → refresh ถี่ ๆ ให้ข้อความที่อ่านได้ (และสถานะนับยอด) ขึ้นเอง — OCR ใช้ ~5-10 วินาที/รูป */
const OCR_REFRESH_MS = 3_000;

export default async function TicketsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { access, dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("tickets.title")} description={t("tickets.subtitle")} />;
  // งวดที่เลยเวลาออกผลแล้วปิดรับก่อนแสดง (เผื่อบอทไม่ได้ทำงานอยู่)
  await closeExpiredDraws(prisma, { dealerId: current.id });

  const raw = await searchParams;
  const params = parseListParams(raw, {
    sortable: TICKET_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  // rules = เงื่อนไขอ่านโพยของแม่หวย (หน้า /read-rules) — ให้ตัวอย่างในหน้าต่างโพยอ่านได้ตรงกับที่ server บันทึก
  const [draws, customers, rules] = await Promise.all([
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
    rulesOf(prisma, current.id),
  ]);

  // ตัวกรองจาก URL (?draw=<id>|all&status=REVIEW) — ไม่ระบุงวด = งวดที่เปิดรับล่าสุด · ไฟล์ส่งออกใช้ชุดเดียวกัน
  const filters = readTicketFilters(raw, draws);
  const where = ticketWhere(current.id, filters, params.q);

  // ผู้ดูแลระบบ: ปุ่มอ่านรูปโพยรอตรวจทั้งงวดใหม่ — เฉพาะเมื่อกรองงวดเดียวที่ยังเปิดรับ (null = ไม่แสดงปุ่ม)
  const filteredDraw = draws.find((draw) => draw.id === filters.drawId);
  const rereadDraw =
    access.isAdmin && filteredDraw?.status === "OPEN"
      ? {
          drawId: filteredDraw.id,
          drawName: filteredDraw.name,
          count: await prisma.ticket.count({ where: rereadableWhere(current.id, filteredDraw.id) }),
          limit: REREAD_DRAW_MAX,
        }
      : null;

  const page = await paginate<
    TicketRow,
    {
      id: string;
      billNo: string;
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
      image: { ocrStatus: TicketRow["ocrStatus"]; transcript: string | null } | null;
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
      billNo: true,
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
      // สถานะ + ข้อความทุกอย่างที่อ่านได้จากรูป (ขั้นที่ 1) — ตัวรูปดึงแยกทีละรูปตอนเปิดดู
      image: { select: { ocrStatus: true, transcript: true } },
      betCount: true,
      totalLak: true,
      totalThb: true,
      createdAt: true,
    },
    map: ({ draw, customer, issues, image, ...row }) => ({
      ...row,
      drawName: draw.name,
      customerName: customer?.name ?? null,
      issueCount: Array.isArray(issues) ? issues.length : 0,
      ocrStatus: image?.ocrStatus ?? null,
      ocrTranscript: image?.transcript ?? null,
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
      {page.rows.some((row) => row.ocrStatus === "PENDING") ? <LiveRefresh intervalMs={OCR_REFRESH_MS} /> : null}
      <TicketsView
        page={page}
        draws={draws}
        customers={customers}
        rules={rules}
        filters={filters}
        rereadDraw={rereadDraw}
      />
    </>
  );
}
