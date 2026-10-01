"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { CustomerInput } from "@/lib/validations/customer";
import type { Paginated } from "@/types";
import { createCustomer, deleteCustomer, deleteCustomers, updateCustomer } from "../actions";
import type { CustomerRow } from "../types";
import { getCustomerColumns } from "./columns";
import { CustomerDialog } from "./customer-dialog";

export function CustomersView({ page }: { page: Paginated<CustomerRow> }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<CustomerRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CustomerRow | null>(null);
  // รายการที่เลือกด้วย checkbox แล้วกด "ลบที่เลือก" (clear = ล้าง checkbox หลังยืนยัน)
  const [bulkDeleting, setBulkDeleting] = React.useState<{
    rows: CustomerRow[];
    clear: () => void;
  } | null>(null);

  const columns = React.useMemo(
    () =>
      getCustomerColumns({
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

  function handleSave(values: CustomerInput) {
    const shared = {
      name: values.name,
      phone: values.phone || null,
      lakMultiplier: Number(values.lakMultiplier),
      note: values.note || null,
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateCustomer({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: { type: "create", item: { id: tempId(), ticketCount: 0, ...shared } },
        action: () => createCustomer(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: CustomerRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteCustomer({ id: row.id }),
    });
    setDeleting(null);
  }

  function handleBulkDelete({ rows: selected, clear }: { rows: CustomerRow[]; clear: () => void }) {
    const ids = selected.map((row) => row.id);
    mutate({
      patch: { type: "delete-many", ids },
      action: () => deleteCustomers({ ids }),
      successMessage: t("customers.deletedMany", { count: ids.length }),
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
        searchPlaceholderKey="customers.search"
        emptyTitleKey="customers.empty"
        emptyDescriptionKey="customers.emptyDesc"
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
            <Plus /> {t("customers.add")}
          </Button>
        }
      />

      <CustomerDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("customers.deleteTitle")}
        description={t("customers.deleteDesc", { name: deleting?.name ?? "" })}
        confirmText={t("customers.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && setBulkDeleting(null)}
        title={t("customers.deleteTitle")}
        description={t("customers.bulkDeleteDesc", { count: bulkDeleting?.rows.length ?? 0 })}
        confirmText={t("customers.bulkDeleteConfirm", { count: bulkDeleting?.rows.length ?? 0 })}
        onConfirm={() => {
          if (bulkDeleting) handleBulkDelete(bulkDeleting);
        }}
      />
    </>
  );
}
