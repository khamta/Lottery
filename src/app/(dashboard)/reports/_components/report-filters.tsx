"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import { buildQueryString, toRoute } from "@/lib/query";
import { formatNumber } from "@/lottery/format";
import { ALL_GROUPS } from "../../tickets/types";
import { TOP_OPTIONS, reportGroupName, type DrawOption, type ReportGroupOption, type TopOption } from "../types";

/** ตัวเลือกงวด / กลุ่ม / จำนวนอันดับ — เขียนค่าลง URL (?draw=&group=&top=) ให้ server คิดรายงานใหม่ */
export function ReportFilters({
  draws,
  drawId,
  groups,
  groupKey,
  top,
  showTop,
}: {
  draws: DrawOption[];
  drawId: string;
  /** กลุ่มที่มีโพยในงวดนี้ */
  groups: ReportGroupOption[];
  /** กลุ่มที่เลือก — null = ทุกกลุ่ม */
  groupKey: string | null;
  top: TopOption;
  /** จำนวนอันดับใช้กับตารางเลขเท่านั้น */
  showTop: boolean;
}) {
  const { t, intl } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function apply(patch: Record<string, string>) {
    const qs = buildQueryString(searchParams, patch);
    startRouteProgress();
    startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
  }

  return (
    // มือถือ: งวดเต็มแถว แล้วกลุ่ม | อันดับ แบ่งครึ่ง
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-nowrap">
      <Select value={drawId} onValueChange={(value) => apply({ draw: value })} disabled={isPending}>
        <SelectTrigger className="col-span-2 min-w-0 sm:w-52" aria-label={t("reports.filterDraw")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {draws.map((draw) => (
            <SelectItem key={draw.id} value={draw.id}>
              {draw.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={groupKey ?? ALL_GROUPS} onValueChange={(value) => apply({ group: value })} disabled={isPending}>
        <SelectTrigger className={`min-w-0 sm:w-52 ${showTop ? "" : "col-span-2"}`} aria-label={t("reports.filterGroup")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_GROUPS}>{t("tickets.groupAll")}</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.key} value={group.key}>
              {reportGroupName(group, t)} ({t("reports.billCount", { count: formatNumber(group.bills, intl) })})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showTop ? (
        <Select value={String(top)} onValueChange={(value) => apply({ top: value })} disabled={isPending}>
          <SelectTrigger className="min-w-0 sm:w-32 sm:shrink-0" aria-label={t("reports.filterTop")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOP_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option ? t("reports.topN", { count: option }) : t("reports.topAll")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
