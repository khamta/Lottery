import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ClipboardCheck, Coins, ReceiptText, TriangleAlert } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { HEARTBEAT_MS, onlineSince } from "@/lib/presence";
import { toRoute } from "@/lib/query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { getTranslations } from "@/i18n/server";
import { getDealerContext } from "@/lottery/dealer";
import { InstallApp } from "@/lottery/components/install-app";
import { DealerSwitcher } from "@/lottery/components/dealer-switcher";
import { NoDealer } from "@/lottery/components/no-dealer";
import { StatCards } from "@/lottery/components/stat-card";
import { TwoDigitTable } from "@/lottery/components/two-digit-table";
import { getDrawStakes, getLimitRules, getTicketCounts } from "@/lottery/queries";
import { findOverLimits, pivotTwoDigit, totalStake } from "@/lottery/report";
import { formatNumber } from "@/lottery/format";
import { OnlineUsers } from "./_components/online-users";

export const metadata: Metadata = { title: "Dashboard" };

/** จำนวนคนที่แสดงในการ์ดออนไลน์ — เกินนี้แสดงเป็น "และอีก N คน" */
const ONLINE_PREVIEW = 12;
/** จำนวนเลข 2 ตัวยอดสูงสุดที่แสดงบน dashboard (รายงานเต็มอยู่ที่ /reports) */
const TOP_NUMBERS = 10;

/** ภาพรวมของงวดที่กำลังเปิดรับ — หน้า refresh เองเป็นระยะ จึงเห็นยอดที่บอท/คนอื่นคีย์เข้ามา */
export default async function DashboardPage() {
  const { t, intl } = await getTranslations();
  const user = await requireUser();
  const { dealers, current } = await getDealerContext();
  const onlineWhere = { lastSeenAt: { gte: onlineSince() }, isActive: true };
  const dealerId = current?.id ?? "";

  const [openDraw, latestDraw, onlineUsers, onlineTotal] = await Promise.all([
    prisma.draw.findFirst({
      where: { dealerId, status: "OPEN" },
      orderBy: { drawDate: "desc" },
      select: { id: true, name: true },
    }),
    prisma.draw.findFirst({ where: { dealerId }, orderBy: { drawDate: "desc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: onlineWhere,
      orderBy: { lastSeenAt: "desc" },
      take: ONLINE_PREVIEW,
      select: { id: true, name: true, email: true, image: true },
    }),
    prisma.user.count({ where: onlineWhere }),
  ]);

  // ไม่มีงวดเปิดรับ → แสดงงวดล่าสุดแทน
  const draw = openDraw ?? latestDraw;
  // การ์ดชวนติดตั้งแอป (PWA) อยู่ท้ายทุกกรณีของหน้านี้ — ซ่อนเองเมื่อติดตั้งแล้ว
  const online = (
    <>
      <InstallApp />
      <OnlineUsers users={onlineUsers} total={onlineTotal} currentUserId={user.id} />
      <LiveRefresh intervalMs={HEARTBEAT_MS} />
    </>
  );

  if (!current) {
    return (
      <>
        <NoDealer title={t("lottery.dashTitle")} description={t("lottery.dashSubtitle")} />
        {online}
      </>
    );
  }

  const switcher = <DealerSwitcher dealers={dealers} currentId={current.id} />;

  if (!draw) {
    return (
      <>
        <PageHeader title={t("lottery.dashTitle")} description={t("lottery.dashSubtitle")} action={switcher} />
        <EmptyState
          title={t("lottery.noDraw")}
          description={t("lottery.noDrawDesc")}
          action={
            <Button asChild>
              <Link href="/draws">{t("lottery.openDraw")}</Link>
            </Button>
          }
        />
        {online}
      </>
    );
  }

  const [stakes, limits, counts] = await Promise.all([
    getDrawStakes(draw.id),
    getLimitRules(current.id),
    getTicketCounts(draw.id),
  ]);
  const stake = totalStake(stakes);
  const overLimits = findOverLimits(stakes, limits);
  const topNumbers = pivotTwoDigit(stakes).slice(0, TOP_NUMBERS);

  return (
    <>
      <PageHeader
        title={t("lottery.dashTitle")}
        description={t(openDraw ? "lottery.currentDraw" : "lottery.latestDraw", { name: draw.name })}
        action={switcher}
      />

      <StatCards
        stats={[
          { label: t("lottery.stakeLak"), value: formatNumber(stake.lak, intl), icon: Banknote, hint: t("lottery.hintStake") },
          { label: t("lottery.stakeThb"), value: formatNumber(stake.thb, intl), icon: Coins, hint: t("lottery.hintStake") },
          {
            label: t("lottery.tickets"),
            value: formatNumber(counts.confirmed, intl),
            icon: ReceiptText,
            hint: t("lottery.hintTickets"),
          },
          {
            label: t("lottery.review"),
            value: formatNumber(counts.review, intl),
            icon: ClipboardCheck,
            hint: t("lottery.hintNotCounted"),
          },
        ]}
      />

      {counts.review > 0 ? (
        <Alert variant="warning">
          <ClipboardCheck />
          <AlertTitle>{t("lottery.reviewAlert", { count: counts.review })}</AlertTitle>
          <AlertDescription>
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              href={toRoute(`/tickets?draw=${draw.id}&status=REVIEW`)}
            >
              {t("lottery.reviewLink")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {overLimits.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t("lottery.overLimitAlert", { count: overLimits.length })}</AlertTitle>
          <AlertDescription>
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              href={toRoute(`/reports?draw=${draw.id}&view=limits`)}
            >
              {t("lottery.overLimitLink")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("lottery.topTitle", { count: TOP_NUMBERS })}</CardTitle>
          <CardDescription>{t("lottery.topDesc")}</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href={toRoute(`/reports?draw=${draw.id}`)}>{t("lottery.viewAll")}</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {topNumbers.length > 0 ? (
            <TwoDigitTable rows={topNumbers} limits={limits} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("lottery.noBets")}</p>
          )}
        </CardContent>
      </Card>

      {online}
    </>
  );
}
