import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { buildOrderBy, paginate, parseListParams } from "@/lib/query";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import { rulesOf } from "@/lottery/ingest";
import type { PageProps } from "@/types";
import { ReadRulesView } from "./_components/read-rules-view";
import { READ_RULE_SORTABLE, type ReadRuleRow } from "./types";

export const metadata: Metadata = { title: "Read rules" };

/** เงื่อนไขอ่านโพยของแม่หวยที่เลือกอยู่ — ลูกค้าแต่ละแม่หวยพิมพ์ต่างกัน */
export default async function ReadRulesPage({ searchParams }: PageProps) {
  const { t } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("readRules.title")} description={t("readRules.subtitle")} />;

  const params = parseListParams(await searchParams, {
    sortable: READ_RULE_SORTABLE,
    defaultSort: "createdAt",
    defaultOrder: "asc",
  });

  const where = {
    dealerId: current.id,
    ...(params.q
      ? {
          OR: [
            { find: { contains: params.q, mode: "insensitive" as const } },
            { replace: { contains: params.q, mode: "insensitive" as const } },
            { note: { contains: params.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [page, activeRules] = await Promise.all([
    paginate<
      ReadRuleRow,
      {
        id: string;
        kind: ReadRuleRow["kind"];
        find: string;
        replace: string;
        note: string | null;
        isActive: boolean;
        updatedAt: Date;
      }
    >(prisma.readRule, {
      params,
      where,
      // ลำดับที่สร้าง = ลำดับที่ใช้ (ภายในชนิดเดียวกัน)
      orderBy: [buildOrderBy(params) ?? { createdAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, kind: true, find: true, replace: true, note: true, isActive: true, updatedAt: true },
      map: (row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }),
    }),
    // ทุกเงื่อนไขที่เปิดใช้ — ให้หน้าต่างลองข้อความอ่านได้เหมือนที่ระบบอ่านจริง
    rulesOf(prisma, current.id),
  ]);

  return (
    <>
      <PageHeader
        title={t("readRules.title")}
        description={t("readRules.subtitle")}
        action={<DealerSwitcher dealers={dealers} currentId={current.id} />}
      />
      <ReadRulesView page={page} activeRules={activeRules} />
    </>
  );
}
