"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import { buildQueryString, toRoute } from "@/lib/query";
import { TICKET_STATUSES, statusKey, type DrawOption, type TicketFilterValues } from "../types";

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ทั้งหมด" */
const ALL = "all";

/**
 * ตัวกรองงวด / สถานะ / ยอดกีบแปลก — เขียนค่าลง URL (?draw=&status=&odd=1) ให้ server กรองที่ฐานข้อมูล
 * ยอดกีบแปลก = มีรายการกีบไม่ลงท้าย 000 (เช่น 12,112) มักเป็นอ่านรูป/พิมพ์ผิด — ปุ่มบอกจำนวนให้รู้ว่ามีต้องตรวจไหม
 */
export function TicketFilters({
  draws,
  filters,
  oddLakCount,
  disabled,
}: {
  draws: DrawOption[];
  filters: TicketFilterValues;
  oddLakCount: number;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function apply(patch: Record<string, string | null>) {
    const qs = buildQueryString(searchParams, { ...patch, page: 1 });
    startRouteProgress();
    startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
  }

  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
      {/* "ทุกงวด" ต้องเขียน draw=all ลง URL เพราะไม่ระบุ = งวดที่เปิดรับล่าสุด */}
      <Select
        value={filters.drawId ?? ALL}
        onValueChange={(value) => apply({ draw: value })}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 flex-1 sm:w-44" aria-label={t("tickets.filterDraw")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("tickets.allDraws")}</SelectItem>
          {draws.map((draw) => (
            <SelectItem key={draw.id} value={draw.id}>
              {draw.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) => apply({ status: value === ALL ? null : value })}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 flex-1 sm:w-36" aria-label={t("tickets.filterStatus")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("tickets.allStatuses")}</SelectItem>
          {TICKET_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(statusKey[status])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant={filters.oddLak ? "default" : "outline"}
        aria-pressed={filters.oddLak}
        className="w-full sm:w-auto"
        disabled={disabled || isPending || (!filters.oddLak && oddLakCount === 0)}
        title={t("tickets.filterOddLakHint")}
        onClick={() => apply({ odd: filters.oddLak ? null : "1" })}
      >
        <CircleAlert className={filters.oddLak || oddLakCount === 0 ? undefined : "text-warning"} />
        {t("tickets.filterOddLak", { count: oddLakCount })}
      </Button>
    </div>
  );
}
