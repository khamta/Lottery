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
import { getTranslations } from "@/i18n/server";
import { formatNumber } from "@/lottery/format";
import type { Currency, Position } from "../parser";
import { resolveLimit, type LimitRule, type TwoDigitRow } from "../report";

const COLUMNS: Array<{ key: keyof Omit<TwoDigitRow, "number">; position: Position; currency: Currency }> = [
  { key: "topLak", position: "TOP", currency: "LAK" },
  { key: "bottomLak", position: "BOTTOM", currency: "LAK" },
  { key: "topThb", position: "TOP", currency: "THB" },
  { key: "bottomThb", position: "BOTTOM", currency: "THB" },
];

/**
 * ตารางสรุปเลข 2 ตัว: อันดับ · เลข · บน/ล่าง กีบ · บน/ล่าง บาท (เรียงตามยอดกีบบน+ล่าง)
 * ช่องที่ยอดเกินเพดานอั้นเป็นสีเตือน · เลขที่ออกมีป้ายกำกับ
 */
export async function TwoDigitTable({
  rows,
  totals,
  limits = [],
  winning,
}: {
  /** แถวที่จะแสดง (ตัดตาม Top N มาแล้ว) */
  rows: TwoDigitRow[];
  /** ยอดรวมของทุกเลข ไม่ใช่เฉพาะแถวที่แสดง — ไม่ส่ง = ไม่มีแถวรวม */
  totals?: Omit<TwoDigitRow, "number">;
  limits?: LimitRule[];
  /** เลข 2 ตัวที่ออก */
  winning?: { top: string; bottom: string } | null;
}) {
  const { t, intl } = await getTranslations();

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-12">{t("lottery.rank")}</TableHead>
            <TableHead>{t("lottery.number")}</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className="text-right">
                {t(`lottery.${column.key}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.number}>
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell>
                <span className="text-base font-semibold tabular-nums">{row.number}</span>
                {winning?.top === row.number ? (
                  <Badge variant="success" className="ml-2">
                    {t("lottery.winTop")}
                  </Badge>
                ) : null}
                {winning?.bottom === row.number ? (
                  <Badge variant="success" className="ml-2">
                    {t("lottery.winBottom")}
                  </Badge>
                ) : null}
              </TableCell>
              {COLUMNS.map((column) => {
                const amount = row[column.key];
                const limit = resolveLimit(limits, { number: row.number, digits: 2, ...column });
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
        {totals ? (
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
        ) : null}
      </Table>
    </div>
  );
}
