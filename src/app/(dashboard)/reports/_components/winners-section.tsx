import { Trophy } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getTranslations } from "@/i18n/server";
import { currencyKey, digitsKey, positionKey } from "@/lottery/labels";
import { WINNING_BETS_MAX, getWinningBets } from "@/lottery/queries";
import type { WinningKey } from "@/lottery/report";
import { formatNumber } from "@/lottery/format";

/** รายการแทงที่ถูกรางวัลของงวด พร้อมยอดแทงจริง — ใช้ไล่จ่ายเงินรายคน (ยังไม่คูณอัตราจ่าย) */
export async function WinnersSection({
  drawId,
  keys,
}: {
  drawId: string;
  /** null = ยังไม่ได้กรอกผล */
  keys: WinningKey[] | null;
}) {
  const { t, intl } = await getTranslations();

  if (!keys) {
    return <EmptyState icon={Trophy} title={t("reports.noResult")} description={t("reports.noResultDesc")} />;
  }

  const bets = await getWinningBets(drawId, keys);
  if (bets.length === 0) {
    return <EmptyState icon={Trophy} title={t("reports.emptyWinners")} description={t("reports.emptyWinnersDesc")} />;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>{t("reports.customer")}</TableHead>
              <TableHead>{t("lottery.number")}</TableHead>
              <TableHead>{t("reports.type")}</TableHead>
              <TableHead>{t("reports.currency")}</TableHead>
              <TableHead className="text-right">{t("reports.amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bets.map((bet) => (
                <TableRow key={bet.id}>
                  <TableCell className={bet.customerName ? "font-medium" : "text-muted-foreground"}>
                    {bet.customerName ?? t("reports.noCustomer")}
                  </TableCell>
                  <TableCell className="text-base font-semibold tabular-nums">{bet.number}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t(digitsKey[bet.digits] ?? "lottery.digits2")} {t(positionKey[bet.position])}
                  </TableCell>
                  <TableCell>{t(currencyKey[bet.currency])}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(bet.amount, intl)}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {bets.length === WINNING_BETS_MAX ? (
        <p className="text-xs text-muted-foreground">{t("reports.truncated", { count: WINNING_BETS_MAX })}</p>
      ) : null}
    </div>
  );
}
