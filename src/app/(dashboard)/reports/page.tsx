import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Coins, HandCoins, ReceiptText, TriangleAlert } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { buildQueryString, toRoute } from "@/lib/query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import { StatCards, type Stat } from "@/lottery/components/stat-card";
import { TwoDigitTable } from "@/lottery/components/two-digit-table";
import { DRAW_OPTIONS_MAX, getDrawStakes, getLimitRules, getTicketCounts } from "@/lottery/queries";
import {
  findOverLimits,
  pivotThreeDigit,
  pivotTwoDigit,
  sumTwoDigit,
  totalStake,
  totalWinningStake,
  winningKeys,
} from "@/lottery/report";
import type { PageProps } from "@/types";
import { formatNumber } from "@/lottery/format";
import { statusKey } from "../draws/types";
import { BillsSection } from "./_components/bills-section";
import { CustomersSection } from "./_components/customers-section";
import { LimitsSection } from "./_components/limits-section";
import { ReportExport } from "./_components/report-export";
import { ReportFilters } from "./_components/report-filters";
import { ThreeDigitSection } from "./_components/three-digit-section";
import { WinnersSection } from "./_components/winners-section";
import { REPORT_VIEWS, isReportView, toTopOption, viewKey, type ReportView } from "./types";

export const metadata: Metadata = { title: "Reports" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * รายงานสรุปของงวด — ไม่ใช่หน้ารายการ: ยอดถูกรวมที่ฐานข้อมูล (groupBy) แล้วจัดตารางที่ server
 * สถานะของหน้า (งวด / มุมมอง / จำนวนอันดับ) อยู่ใน URL: ?draw=&view=&top=
 */
export default async function ReportsPage({ searchParams }: PageProps) {
  const { t, intl } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("reports.title")} description={t("reports.subtitle")} />;

  const raw = await searchParams;
  const switcher = <DealerSwitcher dealers={dealers} currentId={current.id} />;

  const draws = await prisma.draw.findMany({
    where: { dealerId: current.id },
    orderBy: { drawDate: "desc" },
    take: DRAW_OPTIONS_MAX,
    select: {
      id: true,
      name: true,
      status: true,
      topResult: true,
      bottomResult: true,
    },
  });

  if (draws.length === 0) {
    return (
      <>
        <PageHeader title={t("reports.title")} description={t("reports.subtitle")} action={switcher} />
        <EmptyState
          title={t("lottery.noDraw")}
          description={t("lottery.noDrawDesc")}
          action={
            <Button asChild>
              <Link href="/draws">{t("lottery.openDraw")}</Link>
            </Button>
          }
        />
      </>
    );
  }

  // ไม่ระบุงวด = งวดที่เปิดรับล่าสุด (ไม่มีงวดเปิด = งวดล่าสุด)
  const drawParam = first(raw.draw);
  const draw =
    draws.find((item) => item.id === drawParam) ?? draws.find((item) => item.status === "OPEN") ?? draws[0]!;
  const viewParam = first(raw.view);
  const view: ReportView = isReportView(viewParam) ? viewParam : "two";
  const top = toTopOption(first(raw.top));

  const [stakes, limits, counts] = await Promise.all([
    getDrawStakes(draw.id),
    getLimitRules(current.id),
    getTicketCounts(draw.id),
  ]);

  const keys = winningKeys(draw);
  const stake = totalStake(stakes);
  const overLimits = findOverLimits(stakes, limits);
  const twoDigit = pivotTwoDigit(stakes);

  const stats: Stat[] = [
    { label: t("lottery.stakeLak"), value: formatNumber(stake.lak, intl), icon: Banknote, hint: t("lottery.hintStake") },
    { label: t("lottery.stakeThb"), value: formatNumber(stake.thb, intl), icon: Coins, hint: t("lottery.hintStake") },
    {
      label: t("lottery.tickets"),
      value: formatNumber(counts.confirmed, intl),
      icon: ReceiptText,
      hint: t("lottery.hintReview", { count: counts.review }),
    },
    {
      label: t("lottery.overLimit"),
      value: formatNumber(overLimits.length, intl),
      icon: TriangleAlert,
      hint: t("lottery.hintOverLimit"),
    },
  ];

  if (keys) {
    const won = totalWinningStake(stakes, keys);
    stats.push(
      { label: t("reports.winStakeLak"), value: formatNumber(won.lak, intl), icon: HandCoins, hint: t("reports.hintWinStake") },
      { label: t("reports.winStakeThb"), value: formatNumber(won.thb, intl), icon: HandCoins, hint: t("reports.hintWinStake") },
    );
  }

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {switcher}
            <ReportFilters
              draws={draws.map(({ id, name }) => ({ id, name }))}
              drawId={draw.id}
              top={top}
              showTop={view === "two" || view === "three"}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={draw.status === "OPEN" ? "success" : draw.status === "CLOSED" ? "warning" : "secondary"}>
          {t(statusKey[draw.status])}
        </Badge>
        {keys ? (
          <span className="font-medium tabular-nums">
            {t("reports.result", { top: keys[0]!.number, top2: keys[1]!.number, bottom: keys[2]!.number })}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("reports.noResultYet")}</span>
        )}
      </div>

      <StatCards stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-2" aria-label={t("reports.views")}>
          {REPORT_VIEWS.map((item) => (
            <Button key={item} asChild size="sm" variant={item === view ? "default" : "outline"}>
              <Link
                href={toRoute(`/reports?${buildQueryString(raw, { view: item })}`)}
                aria-current={item === view ? "page" : undefined}
              >
                {t(viewKey[item])}
                {item === "limits" && overLimits.length > 0 ? ` (${overLimits.length})` : ""}
              </Link>
            </Button>
          ))}
        </nav>
        <ReportExport drawId={draw.id} view={view} top={top} />
      </div>

      {view === "two" ? (
        twoDigit.length > 0 ? (
          <TwoDigitTable
            rows={top ? twoDigit.slice(0, top) : twoDigit}
            totals={sumTwoDigit(twoDigit)}
            limits={limits}
            winning={keys ? { top: keys[1]!.number, bottom: keys[2]!.number } : null}
          />
        ) : (
          <EmptyState title={t("reports.emptyBets")} description={t("reports.emptyBetsDesc")} />
        )
      ) : null}
      {view === "three" ? (
        <ThreeDigitSection
          rows={pivotThreeDigit(stakes)}
          top={top}
          limits={limits}
          winning={keys ? keys[0]!.number : null}
        />
      ) : null}
      {view === "customers" ? <CustomersSection drawId={draw.id} keys={keys} /> : null}
      {view === "bills" ? <BillsSection drawId={draw.id} /> : null}
      {view === "limits" ? <LimitsSection rows={overLimits} /> : null}
      {view === "winners" ? <WinnersSection drawId={draw.id} keys={keys} /> : null}
    </>
  );
}
