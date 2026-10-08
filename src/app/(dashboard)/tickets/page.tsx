import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { closeExpiredDraws } from "@/lottery/draw-close";
import { buildOrderBy, buildQueryString, paginate, parseListParams, toRoute } from "@/lib/query";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { rulesOf } from "@/lottery/ingest";
import { oddLakTicketIds } from "@/lottery/odd-lak";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { dealerUnreadCounts } from "@/lottery/unread";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { TicketsView } from "./_components/tickets-view";
import { readTicketFilters, REREAD_DRAW_MAX, rereadableWhere, ticketWhere, withImageWhere } from "./filters";
import {
  groupKeyOf,
  groupWhere,
  groupParamValue,
  isUnread,
  loadTicketGroups,
  readGroupParam,
  readRememberedParams,
  resolveGroups,
} from "./groups";
import { TICKET_SORTABLE, ticketFiltersCookie, type TicketRow } from "./types";

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

  // เข้ามาที่ /tickets เปล่า ๆ (เช่นกดเมนู) → ใช้ตัวกรองที่จำไว้ล่าสุดของแม่หวยนี้ (เขียนโดย <RememberTicketFilters />)
  const requested = await searchParams;
  const remembered =
    Object.keys(requested).length === 0
      ? readRememberedParams((await cookies()).get(ticketFiltersCookie(current.id))?.value)
      : null;
  const raw = remembered ?? requested;
  const params = parseListParams(raw, {
    sortable: TICKET_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "desc",
  });

  // rules = เงื่อนไขอ่านโพยของแม่หวย (หน้า /read-rules) — ให้ตัวอย่างในหน้าต่างโพยอ่านได้ตรงกับที่ server บันทึก
  const [draws, customers, rules, dealerSettings] = await Promise.all([
    prisma.draw.findMany({
      where: { dealerId: current.id },
      orderBy: { drawDate: "desc" },
      take: DRAW_OPTIONS,
      select: { id: true, name: true, status: true, lottery: true },
    }),
    prisma.customer.findMany({
      where: { dealerId: current.id },
      orderBy: { name: "asc" },
      take: CUSTOMER_OPTIONS,
      select: { id: true, name: true, lakMultiplier: true },
    }),
    rulesOf(prisma, current.id),
    prisma.dealer.findUniqueOrThrow({ where: { id: current.id }, select: { aiAutoCount: true } }),
  ]);

  // ตัวกรองจาก URL (?draw=<id>|all&status=REVIEW) — ไม่ระบุงวด = งวดที่เปิดรับล่าสุด · ไฟล์ส่งออกใช้ชุดเดียวกัน
  const filters = readTicketFilters(raw, draws);

  // กลุ่มของงวดนี้ + จำนวนที่ยังไม่ได้ดู — แสดงทีละกลุ่ม (ไม่ระบุ = กลุ่มที่มีโพยล่าสุด) เลือกหลายกลุ่มรวมกันได้
  const renderedAt = new Date();
  const { options: groupOptions, seen } = await loadTicketGroups(prisma, {
    userId: access.userId,
    dealerId: current.id,
    drawId: filters.drawId,
    lottery: draws.find((draw) => draw.id === filters.drawId)?.lottery ?? null,
  });
  filters.groups = resolveGroups(readGroupParam(raw), groupOptions);

  // เขียนกลุ่มที่แสดงจริงลง URL เสมอ (+ ตัวกรองที่จำไว้) — โพยใหม่จากกลุ่มอื่นเข้ามาแล้ว refresh จะไม่สลับกลุ่มเอง
  const group = groupParamValue(filters.groups);
  if (remembered || [raw.group].flat()[0] !== group) {
    redirect(toRoute(`/tickets?${buildQueryString(raw, { group })}`));
  }

  // โพยที่มียอดกีบไม่ลงท้าย 000 ของงวดที่กรองอยู่ — ปุ่มกรองแสดงจำนวนเสมอ ให้รู้ว่ามีต้องตรวจไหม
  // + จำนวนโพยที่มีรูปของงวดที่กรองอยู่ — แสดงบนปุ่มกรอง "มีรูป" · ทั้งสองนับเฉพาะกลุ่มที่ดูอยู่ ให้ตรงกับรายการบนจอ
  const scope = [
    { draw: { dealerId: current.id } },
    ...(filters.drawId ? [{ drawId: filters.drawId }] : []),
    ...(filters.groups ? [groupWhere(filters.groups)] : []),
  ];
  // + โพยที่ยังไม่ได้ดูของแม่หวยอื่น — ป้ายบนตัวเลือกแม่หวย (แม่หวยที่ใช้อยู่ดูจากแถบกลุ่ม)
  const [oddLakIds, imageCount, dealerUnread] = await Promise.all([
    oddLakTicketIds(prisma, current.id, filters.drawId),
    prisma.ticket.count({ where: { AND: [...scope, withImageWhere] } }),
    dealerUnreadCounts(
      prisma,
      access.userId,
      dealers.flatMap((dealer) => (dealer.id === current.id ? [] : [dealer.id])),
    ),
  ]);
  const oddLakCount =
    filters.groups && oddLakIds.length
      ? await prisma.ticket.count({ where: { AND: [...scope, { id: { in: oddLakIds } }] } })
      : oddLakIds.length;
  const where = ticketWhere(current.id, filters, params.q, oddLakIds);

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
      groupId: string | null;
      reads: unknown[];
      source: TicketRow["source"];
      status: TicketRow["status"];
      rawText: string;
      lakMultiplier: number;
      note: string | null;
      issues: unknown;
      image: {
        ocrStatus: TicketRow["ocrStatus"];
        ocrReader: string | null;
        editedAt: Date | null;
      } | null;
      betCount: number;
      totalLak: unknown;
      totalThb: unknown;
      createdAt: Date;
    }
  >(prisma.ticket, {
    params,
    where,
    // เรียงตามเวลา: โพยที่เวลาตรงกันถึงวินาทีเรียงต่อด้วยเลขบิล (ลำดับที่เข้ามา) — ลำดับจึงตรงกับแชท WhatsApp
    orderBy:
      params.sort === "createdAt"
        ? [{ createdAt: params.order }, { billNo: params.order }]
        : (buildOrderBy(params) ?? [{ createdAt: "desc" }, { billNo: "desc" }]),
    select: {
      id: true,
      billNo: true,
      drawId: true,
      draw: { select: { name: true } },
      customerId: true,
      customer: { select: { name: true } },
      senderName: true,
      groupId: true,
      // ผู้ใช้คนนี้เปิดหน้าตรวจโพยใบนี้แล้วหรือยัง (ตัวนับยังไม่ได้ดู)
      reads: { where: { userId: access.userId }, select: { userId: true }, take: 1 },
      source: true,
      status: true,
      rawText: true,
      lakMultiplier: true,
      note: true,
      issues: true,
      // สถานะการอ่านรูป — ตัวรูปดึงแยกทีละรูปตอนเปิดดู
      image: { select: { ocrStatus: true, ocrReader: true, editedAt: true } },
      betCount: true,
      totalLak: true,
      totalThb: true,
      createdAt: true,
    },
    map: ({ draw, customer, issues, image, reads, ...row }) => ({
      ...row,
      drawName: draw.name,
      customerName: customer?.name ?? null,
      issueCount: Array.isArray(issues) ? issues.length : 0,
      ocrStatus: image?.ocrStatus ?? null,
      ocrReader: image?.ocrReader ?? null,
      imageEditedAt: image?.editedAt?.toISOString() ?? null,
      totalLak: Number(row.totalLak),
      totalThb: Number(row.totalThb),
      createdAt: row.createdAt.toISOString(),
      isNew: reads.length === 0 && isUnread(row.createdAt, seen.get(groupKeyOf(row.groupId))),
    }),
  });

  return (
    <>
      <PageHeader
        title={t("tickets.title")}
        description={t("tickets.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} unread={dealerUnread} />}
      />
      {page.rows.some((row) => row.ocrStatus === "PENDING") ? <LiveRefresh intervalMs={OCR_REFRESH_MS} /> : null}
      <TicketsView
        page={page}
        draws={draws}
        customers={customers}
        rules={rules}
        filters={filters}
        oddLakCount={oddLakCount}
        imageTicketCount={imageCount}
        rereadDraw={rereadDraw}
        groupOptions={groupOptions}
        renderedAt={renderedAt.toISOString()}
        dealerId={current.id}
        aiAutoCount={dealerSettings.aiAutoCount}
      />
    </>
  );
}
