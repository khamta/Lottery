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
import { TOP_OPTIONS, type DrawOption, type TopOption } from "../types";

/** ตัวเลือกงวด / จำนวนอันดับ — เขียนค่าลง URL (?draw=&top=) ให้ server คิดรายงานใหม่ */
export function ReportFilters({
  draws,
  drawId,
  top,
  showTop,
}: {
  draws: DrawOption[];
  drawId: string;
  top: TopOption;
  /** จำนวนอันดับใช้กับตารางเลขเท่านั้น */
  showTop: boolean;
}) {
  const { t } = useI18n();
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
    <div className="flex w-full gap-2 sm:w-auto">
      <Select value={drawId} onValueChange={(value) => apply({ draw: value })} disabled={isPending}>
        <SelectTrigger className="min-w-0 flex-1 sm:w-52" aria-label={t("reports.filterDraw")}>
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

      {showTop ? (
        <Select value={String(top)} onValueChange={(value) => apply({ top: value })} disabled={isPending}>
          <SelectTrigger className="w-32 shrink-0" aria-label={t("reports.filterTop")}>
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
