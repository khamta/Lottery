import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { dateToIso } from "@/lottery/date";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { DrawsView } from "./_components/draws-view";
import { DRAW_SORTABLE, type DrawRow } from "./types";

export const metadata: Metadata = { title: "Draws" };

export default async function DrawsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("draws.title")} description={t("draws.subtitle")} />;

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
      status: true,
      topResult: true,
      bottomResult: true,
      updatedAt: true,
      _count: { select: { tickets: true } },
    },
    map: ({ _count, ...row }) => ({
      ...row,
      drawDate: dateToIso(row.drawDate),
      ticketCount: _count.tickets,
      updatedAt: row.updatedAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader
        title={t("draws.title")}
        description={t("draws.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <DrawsView page={page} />
    </>
  );
}
