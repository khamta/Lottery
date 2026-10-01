"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { buildQueryString, toRoute } from "@/lib/query";
import { startRouteProgress } from "@/components/shared/route-progress";
import { useI18n } from "@/i18n/client";
import type { Paginated } from "@/types";

type Meta = Pick<Paginated<unknown>, "page" | "pageSize" | "total" | "pageCount">;

function useGoTo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (patch: Record<string, string | number>) => {
    const qs = buildQueryString(searchParams, patch);
    startRouteProgress(); // ให้แถบโหลดด้านบนขึ้นทันทีที่กด
    router.push(toRoute(`${pathname}?${qs}`), { scroll: false });
  };
}

/**
 * ตัวเลือก "จำนวนรายการต่อหน้า" — วางไว้แถบบนของตาราง (ก่อนช่องค้นหา)
 * ค่าเริ่มต้นและตัวเลือกทั้งหมดตั้งที่ src/config/site.ts
 */
export function PageSizeSelect({ pageSize, disabled }: { pageSize: number; disabled?: boolean }) {
  const { t } = useI18n();
  const go = useGoTo();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm whitespace-nowrap text-muted-foreground">{t("table.perPage")}</span>
      <Select
        value={String(pageSize)}
        onValueChange={(value) => go({ pageSize: value, page: 1 })}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="w-20" aria-label={t("table.perPage")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {siteConfig.pagination.pageSizeOptions.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** แถบล่างของตาราง: ช่วงรายการที่แสดง + ปุ่มเปลี่ยนหน้า */
export function DataTablePagination({ meta, disabled }: { meta: Meta; disabled?: boolean }) {
  const { t, intl } = useI18n();
  const go = useGoTo();

  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  const nf = (value: number) => value.toLocaleString(intl);

  // มือถือ: ทุกอย่างอยู่กึ่งกลาง / จอใหญ่: ข้อความชิดซ้าย ปุ่มชิดขวา
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
      <p className="text-sm text-muted-foreground">
        {t("table.showing", { from: nf(from), to: nf(to), total: nf(meta.total) })}
      </p>

      <div className="flex items-center justify-center gap-1">
        <span className="mr-2 text-sm whitespace-nowrap text-muted-foreground">
          {t("table.pageOf", { page: meta.page, pageCount: meta.pageCount })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("table.first")}
          disabled={disabled || meta.page <= 1}
          onClick={() => go({ page: 1 })}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("table.prev")}
          disabled={disabled || meta.page <= 1}
          onClick={() => go({ page: meta.page - 1 })}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("table.next")}
          disabled={disabled || meta.page >= meta.pageCount}
          onClick={() => go({ page: meta.page + 1 })}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("table.last")}
          disabled={disabled || meta.page >= meta.pageCount}
          onClick={() => go({ page: meta.pageCount })}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
