"use client";

import * as React from "react";
import { Plus, Power, PowerOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import { notify } from "@/lib/notify";
import type { ReadRuleInput } from "@/lib/validations/read-rule";
import type { ReadRuleSpec } from "@/lottery/read-rules";
import type { Paginated } from "@/types";
import {
  createReadRule,
  createReadRules,
  deleteReadRule,
  deleteReadRules,
  setReadRulesActive,
  updateReadRule,
} from "../actions";
import type { ReadRuleRow } from "../types";
import { getReadRuleColumns } from "./columns";
import { ReadRuleDialog } from "./read-rule-dialog";

type ReadRulesViewProps = {
  page: Paginated<ReadRuleRow>;
  /** ทุกเงื่อนไขที่เปิดใช้ของแม่หวย — ให้หน้าต่างลองข้อความอ่านได้เหมือนระบบจริง */
  activeRules: ReadRuleSpec[];
};

export function ReadRulesView({ page, activeRules }: ReadRulesViewProps) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<ReadRuleRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ReadRuleRow | null>(null);
  // รายการที่เลือกด้วย checkbox แล้วกด "ลบที่เลือก" (clear = ล้าง checkbox หลังยืนยัน)
  const [bulkDeleting, setBulkDeleting] = React.useState<{
    rows: ReadRuleRow[];
    clear: () => void;
  } | null>(null);

  /** เงื่อนไขเปลี่ยนแล้วระบบอ่านโพยในงวดที่เปิดรับใหม่ — บอกว่ามีโพยกี่ใบที่ผลเปลี่ยน */
  const reportReread = ({ reread }: { reread: number }) => {
    if (reread > 0) notify.info(t("readRules.reread", { count: reread }));
  };

  function handleSave(list: ReadRuleInput[]) {
    const [values] = list;
    if (!values) return;
    const shared = {
      kind: values.kind,
      find: values.find.trim(),
      replace: values.kind === "SKIP" ? "" : values.replace.trim(),
      note: values.note?.trim() || null,
      isActive: values.isActive,
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateReadRule({ ...values, id: editing.id }),
        onSuccess: reportReread,
      });
    } else if (list.length === 1) {
      mutate({
        patch: { type: "create", item: { id: tempId(), ...shared } },
        action: () => createReadRule(values),
        onSuccess: reportReread,
      });
    } else {
      // patch ทีละแถวเท่านั้น — แสดงข้อแรกทันที ข้อที่เหลือมากับ router.refresh() หลังบันทึก
      mutate({
        patch: { type: "create", item: { id: tempId(), ...shared } },
        action: () => createReadRules({ rules: list }),
        successMessage: t("readRules.createdMany", { count: list.length }),
        onSuccess: reportReread,
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  /** เปิด/ปิดหลายรายการที่เลือก — แสดงข้อแรกทันที (patch ทีละแถว) ที่เหลือมากับ router.refresh() */
  function handleBulkActive({ rows: selected, clear }: { rows: ReadRuleRow[]; clear: () => void }, isActive: boolean) {
    const changing = selected.filter((row) => row.isActive !== isActive);
    clear();
    const [first] = changing;
    if (!first) return;
    mutate({
      patch: { type: "update", item: { ...first, isActive, updatedAt: new Date().toISOString() } },
      action: () => setReadRulesActive({ ids: changing.map((row) => row.id), isActive }),
      successMessage: t("readRules.updatedMany", { count: changing.length }),
      onSuccess: reportReread,
    });
  }

  function handleToggle(row: ReadRuleRow) {
    const values: ReadRuleInput = {
      kind: row.kind,
      find: row.find,
      replace: row.replace,
      note: row.note ?? "",
      isActive: !row.isActive,
    };
    mutate({
      patch: { type: "update", item: { ...row, isActive: values.isActive, updatedAt: new Date().toISOString() } },
      action: () => updateReadRule({ ...values, id: row.id }),
      onSuccess: reportReread,
    });
  }

  const columns = React.useMemo(
    () =>
      getReadRuleColumns({
        t,
        intl,
        onEdit: (row) => {
          setEditing(row);
          setFormOpen(true);
        },
        onToggle: handleToggle,
        onDelete: (row) => setDeleting(row),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleToggle ใช้แค่ mutate ซึ่งคงที่
    [t, intl, mutate],
  );

  function handleDelete(row: ReadRuleRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteReadRule({ id: row.id }),
      onSuccess: reportReread,
    });
    setDeleting(null);
  }

  function handleBulkDelete({ rows: selected, clear }: { rows: ReadRuleRow[]; clear: () => void }) {
    const ids = selected.map((row) => row.id);
    mutate({
      patch: { type: "delete-many", ids },
      action: () => deleteReadRules({ ids }),
      successMessage: t("readRules.deletedMany", { count: ids.length }),
      onSuccess: reportReread,
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
        searchPlaceholderKey="readRules.search"
        emptyTitleKey="readRules.empty"
        emptyDescriptionKey="readRules.emptyDesc"
        selectable
        bulkActions={(ctx) => (
          <>
            <Button variant="outline" size="sm" aria-label={t("readRules.activate")} onClick={() => handleBulkActive(ctx, true)}>
              <Power /> <span className="hidden sm:inline">{t("readRules.activate")}</span>
            </Button>
            <Button variant="outline" size="sm" aria-label={t("readRules.deactivate")} onClick={() => handleBulkActive(ctx, false)}>
              <PowerOff /> <span className="hidden sm:inline">{t("readRules.deactivate")}</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleting(ctx)}>
              <Trash2 /> {t("common.deleteSelected")}
            </Button>
          </>
        )}
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("readRules.add")}
          </Button>
        }
      />

      <ReadRuleDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        activeRules={activeRules}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("readRules.deleteTitle")}
        description={t("readRules.deleteDesc", { name: deleting?.find ?? "" })}
        confirmText={t("readRules.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && setBulkDeleting(null)}
        title={t("readRules.deleteTitle")}
        description={t("readRules.bulkDeleteDesc", { count: bulkDeleting?.rows.length ?? 0 })}
        confirmText={t("readRules.bulkDeleteConfirm", { count: bulkDeleting?.rows.length ?? 0 })}
        onConfirm={() => {
          if (bulkDeleting) handleBulkDelete(bulkDeleting);
        }}
      />
    </>
  );
}
