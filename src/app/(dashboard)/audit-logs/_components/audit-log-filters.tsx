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
import { AUDIT_ACTIONS, actionKey, entityKey, type AuditActionValue } from "../types";

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ทั้งหมด" แล้วลบออกจาก URL */
const ALL = "__all";

export type AuditLogFilterValues = {
  action: AuditActionValue | null;
  entity: string | null;
};

/** ตัวกรอง action / entity — เขียนค่าลง URL (?action=&entity=) ให้ server กรองที่ฐานข้อมูล */
export function AuditLogFilters({
  entities,
  filters,
  disabled,
}: {
  entities: string[];
  filters: AuditLogFilterValues;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function apply(key: "action" | "entity", value: string) {
    const qs = buildQueryString(searchParams, { [key]: value === ALL ? null : value, page: 1 });
    startRouteProgress();
    startTransition(() => router.replace(toRoute(`${pathname}?${qs}`), { scroll: false }));
  }

  // entity ที่เลือกอยู่แต่ไม่อยู่ในรายการ (เช่นมาจากลิงก์) ยังต้องแสดงได้
  const entityOptions =
    filters.entity && !entities.includes(filters.entity) ? [filters.entity, ...entities] : entities;

  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <Select
        value={filters.action ?? ALL}
        onValueChange={(value) => apply("action", value)}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 flex-1 sm:w-40" aria-label={t("auditLogs.filterAction")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("auditLogs.allActions")}</SelectItem>
          {AUDIT_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {t(actionKey[action])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.entity ?? ALL}
        onValueChange={(value) => apply("entity", value)}
        disabled={disabled || isPending}
      >
        <SelectTrigger className="min-w-0 flex-1 sm:w-40" aria-label={t("auditLogs.filterEntity")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("auditLogs.allEntities")}</SelectItem>
          {entityOptions.map((entity) => (
            <SelectItem key={entity} value={entity}>
              {entityKey[entity] ? t(entityKey[entity]) : entity}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
