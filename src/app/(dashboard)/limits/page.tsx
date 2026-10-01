import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { LimitsView } from "./_components/limits-view";
import { LIMIT_SORTABLE, type LimitRow } from "./types";

export const metadata: Metadata = { title: "Limits" };

export default async function LimitsPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("limits.title")} description={t("limits.subtitle")} />;

  const params = parseListParams(await searchParams, {
    sortable: LIMIT_SORTABLE,
    defaultSort: "digits",
    defaultOrder: "asc",
  });

  // ค้นหาด้วยตัวเลข = เลขที่อั้น
  const where = { dealerId: current.id, ...(params.q ? { number: { contains: params.q } } : {}) };

  const page = await paginate<
    LimitRow,
    {
      id: string;
      digits: number;
      number: string;
      position: LimitRow["position"];
      currency: LimitRow["currency"];
      maxAmount: unknown;
      updatedAt: Date;
    }
  >(prisma.limit, {
    params,
    where,
    // เรียงรอง: กฎทั่วไป (number ว่าง) ขึ้นก่อนกฎเฉพาะเลขของประเภทเดียวกัน
    orderBy: [buildOrderBy(params) ?? { digits: "asc" }, { number: "asc" }, { position: "asc" }, { currency: "asc" }],
    select: {
      id: true,
      digits: true,
      number: true,
      position: true,
      currency: true,
      maxAmount: true,
      updatedAt: true,
    },
    map: (row) => ({
      ...row,
      digits: row.digits === 3 ? 3 : 2,
      maxAmount: Number(row.maxAmount),
      updatedAt: row.updatedAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader
        title={t("limits.title")}
        description={t("limits.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <LimitsView page={page} />
    </>
  );
}
