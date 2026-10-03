import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { getTranslations } from "@/i18n/server";
import { getCustomerSummary } from "@/lottery/queries";
import type { WinningKey } from "@/lottery/report";
import { formatNumber } from "@/lottery/format";

/**
 * สรุปตามลูกค้า: ยอดซื้อ · ยอดแทงของเลขที่ถูก (ยอดจริง ยังไม่คูณอัตราจ่าย)
 * ยอดถูกแสดงเมื่องวดกรอกผลแล้ว · ข้อมูลชุดเดียวกับไฟล์ส่งออก (getCustomerSummary)
 */
export async function CustomersSection({
  drawId,
  keys,
}: {
  drawId: string;
  keys: WinningKey[] | null;
}) {
  const { t, intl } = await getTranslations();
  const rows = await getCustomerSummary(drawId, keys);

  if (rows.length === 0) {
    return <EmptyState title={t("reports.emptyBets")} description={t("reports.emptyBetsDesc")} />;
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
          {rows.map((row) => (
            <TableRow key={row.customerId ?? ""}>
              <TableCell className={row.name ? "font-medium" : "text-muted-foreground"}>
                {row.name ?? t("reports.noCustomer")}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(row.tickets, intl)}</TableCell>
              {money(row.stake.lak)}
              {money(row.stake.thb)}
              {keys ? (
                <>
                  {money(row.won.lak, "font-semibold")}
                  {money(row.won.thb, "font-semibold")}
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
