import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { buildQueryString, toRoute } from "@/lib/query";
import { cn, formatDate } from "@/lib/utils";
import { getTranslations } from "@/i18n/server";
import { DRAW_BILLS_MAX, getDrawBills } from "@/lottery/queries";
import { formatNumber } from "@/lottery/format";
import { billGroupName } from "../types";

/**
 * รายงานตามบิล: บิลของงวดจัดกลุ่มตามกลุ่ม WhatsApp ที่ส่งมา ในกลุ่มเรียงตามวันเวลา
 * เลขบิลกดไปเปิดโพยนั้นที่หน้าโพย · ข้อมูลชุดเดียวกับไฟล์ส่งออก (getDrawBills)
 */
export async function BillsSection({ drawId }: { drawId: string }) {
  const { t, intl } = await getTranslations();
  const groups = await getDrawBills(drawId);

  if (groups.length === 0) {
    return <EmptyState title={t("reports.emptyBets")} description={t("reports.emptyBetsDesc")} />;
  }

  const count = groups.reduce((sum, group) => sum + group.bills.length, 0);
  const money = (value: number, className?: string) => (
    <TableCell className={cn("text-right tabular-nums", value === 0 && "text-muted-foreground", className)}>
      {formatNumber(value, intl)}
    </TableCell>
  );

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-xl border">
          <header className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <MessagesSquare className="text-muted-foreground size-4" />
              {billGroupName(group, t)}
            </h2>
            <p className="text-muted-foreground text-sm tabular-nums">
              {t("reports.billCount", { count: group.bills.length })} · {t("tickets.totalLak")}{" "}
              <span className="text-foreground font-semibold">{formatNumber(group.total.lak, intl)}</span> ·{" "}
              {t("tickets.totalThb")}{" "}
              <span className="text-foreground font-semibold">{formatNumber(group.total.thb, intl)}</span>
            </p>
          </header>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tickets.billNo")}</TableHead>
                <TableHead>{t("tickets.createdAt")}</TableHead>
                <TableHead>{t("reports.customer")}</TableHead>
                <TableHead className="text-right">{t("tickets.betCount")}</TableHead>
                <TableHead className="text-right">{t("tickets.totalLak")}</TableHead>
                <TableHead className="text-right">{t("tickets.totalThb")}</TableHead>
                <TableHead>{t("tickets.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium whitespace-nowrap tabular-nums">
                    <Link
                      className="hover:underline"
                      href={toRoute(`/tickets?${buildQueryString({}, { draw: drawId, q: bill.billNo })}`)}
                    >
                      {bill.billNo}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDate(bill.createdAt, intl)}</TableCell>
                  <TableCell className={bill.name ? undefined : "text-muted-foreground"}>
                    {bill.name ?? t("reports.noCustomer")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(bill.betCount, intl)}</TableCell>
                  {money(bill.lak)}
                  {money(bill.thb)}
                  <TableCell>
                    <Badge variant={bill.status === "CONFIRMED" ? "success" : "warning"}>
                      {t(`tickets.status${bill.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
      {count === DRAW_BILLS_MAX ? (
        <p className="text-muted-foreground text-sm">{t("reports.billsMax", { count: DRAW_BILLS_MAX })}</p>
      ) : null}
    </div>
  );
}
