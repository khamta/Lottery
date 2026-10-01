"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { LimitInput } from "@/lib/validations/limit";
import type { Paginated } from "@/types";
import { createLimit, deleteLimit, deleteLimits, updateLimit } from "../actions";
import { currencyKey, digitsKey, positionKey, type LimitRow } from "../types";
import { getLimitColumns } from "./columns";
import { LimitDialog } from "./limit-dialog";

export function LimitsView({ page }: { page: Paginated<LimitRow> }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<LimitRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<LimitRow | null>(null);
  // รายการที่เลือกด้วย checkbox แล้วกด "ลบที่เลือก" (clear = ล้าง checkbox หลังยืนยัน)
  const [bulkDeleting, setBulkDeleting] = React.useState<{
    rows: LimitRow[];
    clear: () => void;
  } | null>(null);

  const columns = React.useMemo(
    () =>
      getLimitColumns({
        t,
        intl,
        onEdit: (row) => {
          setEditing(row);
          setFormOpen(true);
        },
        onDelete: (row) => setDeleting(row),
      }),
    [t, intl],
  );

  /** ชื่อเพดานที่อ่านรู้เรื่องในกล่องยืนยันลบ เช่น "2 ตัว · 32 · บน · กีบ" */
  const labelOf = (row: LimitRow) =>
    [
      t(digitsKey[row.digits] ?? "lottery.digits2"),
      row.number || t("limits.allNumbers"),
      t(positionKey[row.position]),
      t(currencyKey[row.currency]),
    ].join(" · ");

  function handleSave(values: LimitInput) {
    const shared = {
      digits: values.digits,
      number: values.number,
      position: values.position,
      currency: values.currency,
      maxAmount: Number(values.maxAmount),
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateLimit({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: { type: "create", item: { id: tempId(), ...shared } },
        action: () => createLimit(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: LimitRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteLimit({ id: row.id }),
    });
    setDeleting(null);
  }

  function handleBulkDelete({ rows: selected, clear }: { rows: LimitRow[]; clear: () => void }) {
    const ids = selected.map((row) => row.id);
    mutate({
      patch: { type: "delete-many", ids },
      action: () => deleteLimits({ ids }),
      successMessage: t("limits.deletedMany", { count: ids.length }),
    });
    clear();
    setBulkDeleting(null);
  }

  return (
    <>
      <DataTable
        columns={columns}
        page={{ ...page, rows }}
        pending={isPending}
        searchPlaceholderKey="limits.search"
        emptyTitleKey="limits.empty"
        emptyDescriptionKey="limits.emptyDesc"
        selectable
        bulkActions={(ctx) => (
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleting(ctx)}>
            <Trash2 /> {t("common.deleteSelected")}
          </Button>
        )}
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("limits.add")}
          </Button>
        }
      />

      <LimitDialog open={formOpen} onOpenChange={setFormOpen} limit={editing} onSubmit={handleSave} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("limits.deleteTitle")}
        description={t("limits.deleteDesc", { name: deleting ? labelOf(deleting) : "" })}
        confirmText={t("limits.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && setBulkDeleting(null)}
        title={t("limits.deleteTitle")}
        description={t("limits.bulkDeleteDesc", { count: bulkDeleting?.rows.length ?? 0 })}
        confirmText={t("limits.bulkDeleteConfirm", { count: bulkDeleting?.rows.length ?? 0 })}
        onConfirm={() => {
          if (bulkDeleting) handleBulkDelete(bulkDeleting);
        }}
      />
    </>
  );
}
