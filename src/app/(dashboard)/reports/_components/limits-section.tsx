import { CircleCheck } from "lucide-react";

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
import type { OverLimitRow } from "@/lottery/report";

/** เลขที่ยอดรับเกินเพดานอั้น — ส่วนเกินคือยอดที่ต้องส่งต่อหรือคืนลูกค้า */
export async function LimitsSection({ rows }: { rows: OverLimitRow[] }) {
  const { t, intl } = await getTranslations();

  if (rows.length === 0) {
    return (
      <EmptyState icon={CircleCheck} title={t("reports.emptyLimits")} description={t("reports.emptyLimitsDesc")} />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>{t("lottery.number")}</TableHead>
            <TableHead>{t("reports.type")}</TableHead>
            <TableHead>{t("reports.currency")}</TableHead>
            <TableHead className="text-right">{t("reports.stake")}</TableHead>
            <TableHead className="text-right">{t("reports.limit")}</TableHead>
            <TableHead className="text-right">{t("reports.excess")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.digits}-${row.number}-${row.position}-${row.currency}`}>
              <TableCell className="text-base font-semibold tabular-nums">{row.number}</TableCell>
              <TableCell className="whitespace-nowrap">
                {t(digitsKey[row.digits] ?? "lottery.digits2")} {t(positionKey[row.position])}
              </TableCell>
              <TableCell>{t(currencyKey[row.currency])}</TableCell>
              <TableCell className="text-right tabular-nums">{row.amount.toLocaleString(intl)}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {row.limit.toLocaleString(intl)}
              </TableCell>
              <TableCell className="text-right font-semibold text-destructive tabular-nums">
                {row.excess.toLocaleString(intl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
