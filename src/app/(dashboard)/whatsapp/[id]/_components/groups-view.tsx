"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/shared/data-table";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { DealerOption } from "@/lottery/dealer";
import type { Paginated } from "@/types";
import { formatNumber } from "@/lottery/format";
import { assignWhatsappGroup } from "../../actions";
import type { WhatsappGroupRow } from "../types";

/** Radix Select ไม่รับค่าว่าง จึงใช้ค่านี้แทน "ไม่อ่านกลุ่มนี้" */
const NONE = "none";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function getGroupColumns({
  t,
  intl,
  dealers,
  onAssign,
}: {
  t: Translate;
  intl: string;
  dealers: DealerOption[];
  onAssign: (row: WhatsappGroupRow, dealerId: string | null) => void;
}): ColumnDef<WhatsappGroupRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("whatsapp.groupName"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-40 space-y-0.5">
          <p className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.dealerId ? <Badge variant="success">{t("whatsapp.reading")}</Badge> : null}
          </p>
          <p className="text-xs break-all text-muted-foreground">{row.original.jid}</p>
        </div>
      ),
    },
    {
      id: "size",
      accessorKey: "size",
      header: t("whatsapp.members"),
      enableSorting: true,
      cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.size, intl)}</span>,
    },
    {
      id: "dealerId",
      header: t("whatsapp.readInto"),
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.dealerId ?? NONE}
          onValueChange={(value) => onAssign(row.original, value === NONE ? null : value)}
        >
          <SelectTrigger className="w-full min-w-44 sm:w-56" aria-label={t("whatsapp.readInto")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("whatsapp.notReading")}</SelectItem>
            {dealers.map((dealer) => (
              <SelectItem key={dealer.id} value={dealer.id}>
                {dealer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];
}

/** รายชื่อกลุ่มที่บอทอ่านได้จากบัญชีนี้ — เลือกแม่หวยให้กลุ่มไหน บอทก็อ่านโพยกลุ่มนั้นเข้าแม่หวยนั้น */
export function GroupsView({ page, dealers }: { page: Paginated<WhatsappGroupRow>; dealers: DealerOption[] }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate } = useOptimisticList(page.rows);

  const columns = React.useMemo(
    () =>
      getGroupColumns({
        t,
        intl,
        dealers,
        onAssign: (row, dealerId) => {
          if (row.dealerId === dealerId) return;
          mutate({
            patch: { type: "update", item: { ...row, dealerId } },
            action: () => assignWhatsappGroup({ id: row.id, dealerId }),
          });
        },
      }),
    [t, intl, dealers, mutate],
  );

  return (
    <DataTable
      columns={columns}
      page={{ ...page, rows }}
      pending={isPending}
      searchPlaceholderKey="whatsapp.searchGroups"
      emptyTitleKey="whatsapp.noGroups"
      emptyDescriptionKey="whatsapp.noGroupsDesc"
    />
  );
}
