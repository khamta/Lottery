import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import type { PageProps } from "@/types";
import { CustomersView } from "./_components/customers-view";
import { CUSTOMER_SORTABLE, type CustomerRow } from "./types";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("customers.title")} description={t("customers.subtitle")} />;

  const params = parseListParams(await searchParams, {
    sortable: CUSTOMER_SORTABLE,
    defaultSort: "name",
    defaultOrder: "asc",
  });

  const where = {
    dealerId: current.id,
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { phone: { contains: params.q } },
            { note: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const page = await paginate<
    CustomerRow,
    {
      id: string;
      name: string;
      phone: string | null;
      lakMultiplier: number;
      note: string | null;
      updatedAt: Date;
      _count: { tickets: number };
    }
  >(prisma.customer, {
    params,
    where,
    orderBy: buildOrderBy(params) ?? { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      lakMultiplier: true,
      note: true,
      updatedAt: true,
      _count: { select: { tickets: true } },
    },
    map: ({ _count, ...row }) => ({
      ...row,
      ticketCount: _count.tickets,
      updatedAt: row.updatedAt.toISOString(),
    }),
  });

  return (
    <>
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <CustomersView page={page} />
    </>
  );
}
