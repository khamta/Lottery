"use client";

import * as React from "react";

import { DataTable } from "@/components/shared/data-table";
import { useI18n } from "@/i18n/client";
import type { Paginated } from "@/types";
import type { AuditLogRow } from "../types";
import { AuditLogDialog } from "./audit-log-dialog";
import { AuditLogFilters, type AuditLogFilterValues } from "./audit-log-filters";
import { getAuditLogColumns } from "./columns";

/**
 * หน้ารายการอ่านอย่างเดียว — ไม่มี create/update/delete จึงไม่ใช้ useOptimisticList
 * สถานะตาราง + ตัวกรองอยู่ใน URL ทั้งหมด; state ในนี้มีแค่แถวที่เปิดดูรายละเอียด
 */
export function AuditLogsView({
  page,
  entities,
  filters,
}: {
  page: Paginated<AuditLogRow>;
  entities: string[];
  filters: AuditLogFilterValues;
}) {
  const { t, intl } = useI18n();
  const [viewing, setViewing] = React.useState<AuditLogRow | null>(null);

  const columns = React.useMemo(
    () => getAuditLogColumns({ t, intl, onView: setViewing }),
    [t, intl],
  );

  const filtered = !!(filters.action || filters.entity);

  return (
    <>
      <DataTable
        columns={columns}
        page={page}
        searchPlaceholderKey="auditLogs.search"
        emptyTitleKey={filtered ? "auditLogs.emptyFiltered" : "auditLogs.empty"}
        emptyDescriptionKey={filtered ? "auditLogs.emptyFilteredDesc" : "auditLogs.emptyDesc"}
        toolbar={<AuditLogFilters entities={entities} filters={filters} />}
      />

      <AuditLogDialog log={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </>
  );
}
