import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { getTranslations } from "@/i18n/server";
import { resolveLimit, type LimitRule, type ThreeDigitRow } from "@/lottery/report";
import { formatNumber } from "@/lottery/format";

const COLUMNS = [
  { key: "lak", currency: "LAK", labelKey: "lottery.currencyLAK" },
  { key: "thb", currency: "THB", labelKey: "lottery.currencyTHB" },
] as const;

/** ตารางเลข 3 ตัวบน — แยกจากเลข 2 ตัว ไม่นำยอดไปรวมกัน */
export async function ThreeDigitSection({
  rows,
  top,
  limits,
  winning,
}: {
  /** ทุกเลขที่มียอด เรียงมาแล้ว */
  rows: ThreeDigitRow[];
  /** จำนวนอันดับที่แสดง (0 = ทั้งหมด) */
  top: number;
  limits: LimitRule[];
  /** เลข 3 ตัวบนที่ออก */
  winning: string | null;
}) {
  const { t, intl } = await getTranslations();

  if (rows.length === 0) {
    return <EmptyState title={t("reports.emptyBets")} description={t("reports.emptyBetsDesc")} />;
  }

  const shown = top ? rows.slice(0, top) : rows;
  const totals = rows.reduce((sum, row) => ({ lak: sum.lak + row.lak, thb: sum.thb + row.thb }), { lak: 0, thb: 0 });

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-12">{t("lottery.rank")}</TableHead>
            <TableHead>{t("lottery.number")}</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className="text-right">
                {t(column.labelKey)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, index) => (
            <TableRow key={row.number}>
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell>
                <span className="text-base font-semibold tabular-nums">{row.number}</span>
                {winning === row.number ? (
                  <Badge variant="success" className="ml-2">
                    {t("lottery.winTop")}
                  </Badge>
                ) : null}
              </TableCell>
              {COLUMNS.map((column) => {
                const amount = row[column.key];
                const limit = resolveLimit(limits, {
                  number: row.number,
                  digits: 3,
                  position: "TOP",
                  currency: column.currency,
                });
                const over = limit !== null && amount > limit;
                return (
                  <TableCell
                    key={column.key}
                    title={over ? t("lottery.overLimitBy", { amount: formatNumber(amount - limit, intl) }) : undefined}
                    className={cn(
                      "text-right tabular-nums",
                      amount === 0 && "text-muted-foreground",
                      over && "font-semibold text-destructive",
                    )}
                  >
                    {formatNumber(amount, intl)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>{t("lottery.totalAll")}</TableCell>
            {COLUMNS.map((column) => (
              <TableCell key={column.key} className="text-right tabular-nums">
                {formatNumber(totals[column.key], intl)}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
