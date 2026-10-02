import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/shared/empty-state";
import { getTranslations } from "@/i18n/server";
import { getWinningBets } from "@/lottery/queries";
import { addMoney, emptyMoney, type MoneyPair, type WinningKey } from "@/lottery/report";
import { formatNumber } from "@/lottery/format";

/** จำนวนลูกค้าที่แสดง — เรียงตามยอดซื้อกีบมากไปน้อย */
const CUSTOMERS_MAX = 200;

/** โพยที่ไม่ระบุลูกค้ารวมเป็นแถวเดียว */
const NO_CUSTOMER = "";

/**
 * สรุปตามลูกค้า: ยอดซื้อ · ยอดแทงของเลขที่ถูก (ยอดจริง ยังไม่คูณอัตราจ่าย)
 * ยอดถูกแสดงเมื่องวดกรอกผลแล้ว
 */
export async function CustomersSection({
  drawId,
  keys,
}: {
  drawId: string;
  keys: WinningKey[] | null;
}) {
  const { t, intl } = await getTranslations();

  const [groups, winners] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["customerId"],
      where: { drawId, status: "CONFIRMED" },
      _sum: { totalLak: true, totalThb: true },
      _count: { _all: true },
      orderBy: { _sum: { totalLak: "desc" } },
      take: CUSTOMERS_MAX,
    }),
    keys ? getWinningBets(drawId, keys) : [],
  ]);

  if (groups.length === 0) {
    return <EmptyState title={t("reports.emptyBets")} description={t("reports.emptyBetsDesc")} />;
  }

  const ids = groups.flatMap((group) => (group.customerId ? [group.customerId] : []));
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(customers.map((customer) => [customer.id, customer.name]));

  const won = new Map<string, MoneyPair>();
  for (const bet of winners) {
    const key = bet.customerId ?? NO_CUSTOMER;
    won.set(key, addMoney(won.get(key) ?? emptyMoney(), bet.currency, bet.amount));
  }

  const money = (value: number, className?: string) => (
    <TableCell className={cn("text-right tabular-nums", value === 0 && "text-muted-foreground", className)}>
      {formatNumber(value, intl)}
    </TableCell>
  );

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>{t("reports.customer")}</TableHead>
            <TableHead className="text-right">{t("reports.ticketCount")}</TableHead>
            <TableHead className="text-right">{t("reports.stakeLak")}</TableHead>
            <TableHead className="text-right">{t("reports.stakeThb")}</TableHead>
            {keys ? (
              <>
                <TableHead className="text-right">{t("reports.wonLak")}</TableHead>
                <TableHead className="text-right">{t("reports.wonThb")}</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const stake = { lak: Number(group._sum.totalLak ?? 0), thb: Number(group._sum.totalThb ?? 0) };
            const winning = won.get(group.customerId ?? NO_CUSTOMER) ?? emptyMoney();
            const name = group.customerId ? nameOf.get(group.customerId) : undefined;
            return (
              <TableRow key={group.customerId ?? NO_CUSTOMER}>
                <TableCell className={name ? "font-medium" : "text-muted-foreground"}>
                  {name ?? t("reports.noCustomer")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(group._count._all, intl)}</TableCell>
                {money(stake.lak)}
                {money(stake.thb)}
                {keys ? (
                  <>
                    {money(winning.lak, "font-semibold")}
                    {money(winning.thb, "font-semibold")}
                  </>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
