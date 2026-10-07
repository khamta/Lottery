"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { DealerInput } from "@/lib/validations/dealer";
import type { OcrModels } from "@/lottery/ai-models";
import type { OllamaAccess } from "@/lottery/ollama";
import { useSwitchDealer } from "@/lottery/components/dealer-switcher";
import type { Paginated } from "@/types";
import { createDealer, deleteDealer, updateDealer } from "../actions";
import type { DealerRow } from "../types";
import { getDealerColumns } from "./columns";
import { DealerDialog } from "./dealer-dialog";

export function DealersView({
  page,
  currentId,
  showOwner,
  ocrDefaults,
  ollamaModels,
  ollamaAccess,
}: {
  page: Paginated<DealerRow>;
  currentId: string | null;
  /** ผู้ดูแลระบบ: แสดงคอลัมน์เจ้าของ */
  showOwner: boolean;
  /** รุ่นที่โหมดอัตโนมัติใช้ (env) — แสดงในตัวเลือก "อัตโนมัติ" */
  ocrDefaults: OcrModels;
  /** รุ่นของ Ollama Cloud ที่อ่านรูปได้ (ดึงที่ server) */
  ollamaModels: string[];
  /** รุ่น Ollama ไหนใช้ได้กับแผนของ key ตอนนี้ */
  ollamaAccess: Record<string, OllamaAccess>;
}) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);
  const { switchTo } = useSwitchDealer();

  const [editing, setEditing] = React.useState<DealerRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DealerRow | null>(null);

  const columns = React.useMemo(
    () =>
      getDealerColumns({
        t,
        intl,
        currentId,
        showOwner,
        onSelect: (row) => switchTo(row.id),
        onEdit: (row) => {
          setEditing(row);
          setFormOpen(true);
        },
        onDelete: (row) => setDeleting(row),
      }),
    [t, intl, currentId, showOwner, switchTo],
  );

  function handleSave(values: DealerInput) {
    const shared = {
      name: values.name,
      note: values.note || null,
      ocrModel: values.ocrModel,
      ocrStrongModel: values.ocrStrongModel,
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateDealer({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: {
          type: "create",
          item: { id: tempId(), ownerName: null, drawCount: 0, customerCount: 0, groupCount: 0, ...shared },
        },
        action: () => createDealer(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: DealerRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteDealer({ id: row.id }),
    });
    setDeleting(null);
  }

  return (
    <>
      <DataTable
        columns={columns}
        page={{ ...page, rows }}
        pending={isPending}
        searchPlaceholderKey="dealers.search"
        emptyTitleKey="dealers.empty"
        emptyDescriptionKey="dealers.emptyDesc"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("dealers.add")}
          </Button>
        }
      />

      <DealerDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        dealer={editing}
        ocrDefaults={ocrDefaults}
        ollamaModels={ollamaModels}
        ollamaAccess={ollamaAccess}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("dealers.deleteTitle")}
        description={t("dealers.deleteDesc", { name: deleting?.name ?? "" })}
        confirmText={t("dealers.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />
    </>
  );
}
