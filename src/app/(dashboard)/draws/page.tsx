import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { siteConfig } from "@/config/site";
import { dateToIso, timeOf } from "@/lottery/date";
import { closeExpiredDraws } from "@/lottery/draw-close";
import { LOTTERY_TYPES } from "@/lottery/labels";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { DrawsView } from "./_components/draws-view";
import { DRAW_SORTABLE, type CloseTimes, type DrawRow } from "./types";

export const metadata: Metadata = { title: "Draws" };

export default async function DrawsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("draws.title")} description={t("draws.subtitle")} />;

  // งวดที่เลยเวลาออกผลแล้วปิดรับก่อนแสดง (เผื่อบอทไม่ได้ทำงานอยู่)
  await closeExpiredDraws(prisma, { dealerId: current.id });

  const params = parseListParams(await searchParams, {
    sortable: DRAW_SORTABLE,
    defaultSort: "drawDate",
    defaultOrder: "desc",
  });

  const where = {
    dealerId: current.id,
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" as const } } : {}),
  };

  const page = await paginate<
    DrawRow,
    {
      id: string;
      name: string;
      lottery: DrawRow["lottery"];
      drawDate: Date;
      closesAt: Date | null;
      status: DrawRow["status"];
      topResult: string | null;
      bottomResult: string | null;
      updatedAt: Date;
      _count: { tickets: number };
    }
  >(prisma.draw, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { drawDate: "desc" },
    select: {
      id: true,
      name: true,
      lottery: true,
      drawDate: true,
      closesAt: true,
      status: true,
      topResult: true,
      bottomResult: true,
      updatedAt: true,
      _count: { select: { tickets: true } },
    },
    map: ({ _count, closesAt, ...row }) => ({
      ...row,
      drawDate: dateToIso(row.drawDate),
      closeTime: closesAt ? timeOf(closesAt, siteConfig.timeZone) : null,
      ticketCount: _count.tickets,
      updatedAt: row.updatedAt.toISOString(),
    }),
  });

  // เวลาออกผลของงวดล่าสุดแต่ละประเภทหวย → ค่าตั้งต้นของฟอร์มงวดใหม่ (หวยเวียดนามแต่ละรอบเวลาไม่เปลี่ยน)
  const latest = await Promise.all(
    LOTTERY_TYPES.map((lottery) =>
      prisma.draw.findFirst({
        where: { dealerId: current.id, lottery, closesAt: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { lottery: true, closesAt: true },
      }),
    ),
  );
  const closeTimes = Object.fromEntries(
    latest.flatMap((draw) => (draw?.closesAt ? [[draw.lottery, timeOf(draw.closesAt, siteConfig.timeZone)]] : [])),
  ) as CloseTimes;

  return (
    <>
      <PageHeader
        title={t("draws.title")}
        description={t("draws.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <DrawsView page={page} closeTimes={closeTimes} />
    </>
  );
}
