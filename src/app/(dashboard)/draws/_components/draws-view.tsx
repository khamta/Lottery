"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { DrawInput } from "@/lib/validations/draw";
import type { Paginated } from "@/types";
import { nextDrawStatus } from "@/lottery/draw-status";
import { createDraw, deleteDraw, setDrawStatus, updateDraw } from "../actions";
import type { DrawRow } from "../types";
import { getDrawColumns } from "./columns";
import { DrawDialog } from "./draw-dialog";

export function DrawsView({ page }: { page: Paginated<DrawRow> }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<DrawRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DrawRow | null>(null);

  const columns = React.useMemo(
    () =>
      getDrawColumns({
        t,
        intl,
        onEdit: (row) => {
          setEditing(row);
          setFormOpen(true);
        },
        // ปิดรับ / เปิดรับอีกครั้ง — ไม่มีฟอร์ม จึงสั่งจากเมนูของแถวได้ทันที
        onSetStatus: (row, status) =>
          mutate({
            patch: { type: "update", item: { ...row, status, updatedAt: new Date().toISOString() } },
            action: () => setDrawStatus({ id: row.id, status }),
          }),
        onDelete: (row) => setDeleting(row),
      }),
    [t, intl, mutate],
  );

  function handleSave(values: DrawInput) {
    const results = { topResult: values.topResult || null, bottomResult: values.bottomResult || null };
    const shared = {
      name: values.name,
      drawDate: values.drawDate,
      ...results,
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: {
          type: "update",
          item: { ...editing, ...shared, status: nextDrawStatus(results, editing.status) },
        },
        action: () => updateDraw({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: {
          type: "create",
          item: { id: tempId(), ticketCount: 0, ...shared, status: nextDrawStatus(results, null) },
        },
        action: () => createDraw(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: DrawRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteDraw({ id: row.id }),
    });
    setDeleting(null);
  }

  return (
    <>
      <DataTable
        columns={columns}
        page={{ ...page, rows }}
        pending={isPending}
        searchPlaceholderKey="draws.search"
        emptyTitleKey="draws.empty"
        emptyDescriptionKey="draws.emptyDesc"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("draws.add")}
          </Button>
        }
      />

      <DrawDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        draw={editing}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("draws.deleteTitle")}
        description={t("draws.deleteDesc", { name: deleting?.name ?? "" })}
        confirmText={t("draws.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />
    </>
  );
}
