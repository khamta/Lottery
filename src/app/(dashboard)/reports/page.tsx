import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Coins, HandCoins, ReceiptText, TriangleAlert } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { closeExpiredDraws } from "@/lottery/draw-close";
import { buildQueryString, toRoute } from "@/lib/query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { dateToIso } from "@/lottery/date";
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
import { getReportGroups, pickReportGroup, reportGroupWhere } from "./groups";
import { REPORT_VIEWS, isReportView, reportGroupName, toTopOption, viewKey, type ReportView } from "./types";

export const metadata: Metadata = { title: "Reports" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * รายงานสรุปของงวด — ไม่ใช่หน้ารายการ: ยอดถูกรวมที่ฐานข้อมูล (groupBy) แล้วจัดตารางที่ server
 * สถานะของหน้า (งวด / กลุ่ม / มุมมอง / จำนวนอันดับ) อยู่ใน URL: ?draw=&group=&view=&top=
 * เลือกกลุ่ม = ทุกมุมมองและไฟล์ส่งออกคิดเฉพาะโพยของกลุ่มนั้น — ยกเว้นเกินอั้นที่นับทั้งงวดเสมอ (เพดานเป็นของทั้งงวด)
 */
export default async function ReportsPage({ searchParams }: PageProps) {
  const { t, intl } = await getTranslations();
  const { dealers, current } = await getDealerContext();
  if (!current) return <NoDealer title={t("reports.title")} description={t("reports.subtitle")} />;
  // งวดที่เลยเวลาออกผลแล้วปิดรับก่อนแสดง (เผื่อบอทไม่ได้ทำงานอยู่)
  await closeExpiredDraws(prisma, { dealerId: current.id });

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
      drawDate: true,
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

  // กลุ่มที่ไม่มีโพยในงวดนี้ (เช่น เพิ่งเปลี่ยนงวด) = ทุกกลุ่ม
  const groups = await getReportGroups(draw.id);
  const group = pickReportGroup(groups, first(raw.group));
  const ticket = reportGroupWhere(group);

  const [stakes, drawStakes, limits, counts] = await Promise.all([
    getDrawStakes(draw.id, ticket),
    group ? getDrawStakes(draw.id) : null,
    getLimitRules(current.id),
    getTicketCounts(draw.id, ticket),
  ]);

  const keys = winningKeys(draw);
  const stake = totalStake(stakes);
  const overLimits = findOverLimits(drawStakes ?? stakes, limits);
  // ยอดของกลุ่มเดียวเทียบกับเพดานของทั้งงวดไม่ได้ — ดูกลุ่มอยู่ไม่ระบายสีเกินอั้นในตารางเลข
  const highlightLimits = group ? [] : limits;
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
              groups={groups}
              groupKey={group?.key ?? null}
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
        {group ? (
          <Badge variant="outline">
            {t("reports.group")}: {reportGroupName(group, t)}
          </Badge>
        ) : null}
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
        <ReportExport drawId={draw.id} drawDate={dateToIso(draw.drawDate)} group={group} view={view} top={top} />
      </div>

      {view === "two" ? (
        twoDigit.length > 0 ? (
          <TwoDigitTable
            rows={top ? twoDigit.slice(0, top) : twoDigit}
            totals={sumTwoDigit(twoDigit)}
            limits={highlightLimits}
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
          limits={highlightLimits}
          winning={keys ? keys[0]!.number : null}
        />
      ) : null}
      {view === "customers" ? <CustomersSection drawId={draw.id} keys={keys} ticket={ticket} /> : null}
      {view === "bills" ? <BillsSection drawId={draw.id} ticket={ticket} /> : null}
      {view === "limits" ? (
        <>
          {group ? <p className="text-muted-foreground text-sm">{t("reports.limitsWholeDraw")}</p> : null}
          <LimitsSection rows={overLimits} />
        </>
      ) : null}
      {view === "winners" ? <WinnersSection drawId={draw.id} keys={keys} ticket={ticket} /> : null}
    </>
  );
}
