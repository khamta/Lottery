"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { ProductInput } from "@/lib/validations/product";
import type { Paginated } from "@/types";
import { createProduct, deleteProduct, deleteProducts, updateProduct } from "../actions";
import type { ProductRow } from "../types";
import { getProductColumns } from "./columns";
import { ProductDialog } from "./product-dialog";

/**
 * แม่แบบ client component ของ CRUD module:
 *  - รับข้อมูล "หน้าเดียว" มาจาก server (ไม่ดึงเองอีก)
 *  - ทุกการเปลี่ยนแปลงยิงผ่าน mutate() ของ useOptimisticList → หน้าจอขยับทันที
 */
export function ProductsView({ page }: { page: Paginated<ProductRow> }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<ProductRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ProductRow | null>(null);
  // รายการที่เลือกด้วย checkbox แล้วกด "ลบที่เลือก" (clear = ล้าง checkbox หลังยืนยัน)
  const [bulkDeleting, setBulkDeleting] = React.useState<{
    rows: ProductRow[];
    clear: () => void;
  } | null>(null);

  const columns = React.useMemo(
    () =>
      getProductColumns({
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

  function handleSave(values: ProductInput) {
    const shared = {
      name: values.name,
      sku: values.sku,
      description: values.description || null,
      price: Number(values.price),
      stock: Number(values.stock),
      status: values.status,
      updatedAt: new Date().toISOString(),
    };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared } },
        action: () => updateProduct({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: { type: "create", item: { id: tempId(), ...shared } },
        action: () => createProduct(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: ProductRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteProduct({ id: row.id }),
    });
    setDeleting(null);
  }

  function handleBulkDelete({ rows: selected, clear }: { rows: ProductRow[]; clear: () => void }) {
    const ids = selected.map((row) => row.id);
    mutate({
      patch: { type: "delete-many", ids },
      action: () => deleteProducts({ ids }),
      successMessage: t("products.deletedMany", { count: ids.length }),
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
        searchPlaceholderKey="products.search"
        emptyTitleKey="products.empty"
        emptyDescriptionKey="products.emptyDesc"
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
            <Plus /> {t("products.add")}
          </Button>
        }
      />

      <ProductDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("products.deleteTitle")}
        description={t("products.deleteDesc", { name: deleting?.name ?? "" })}
        confirmText={t("products.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && setBulkDeleting(null)}
        title={t("products.deleteTitle")}
        description={t("products.bulkDeleteDesc", { count: bulkDeleting?.rows.length ?? 0 })}
        confirmText={t("products.bulkDeleteConfirm", { count: bulkDeleting?.rows.length ?? 0 })}
        onConfirm={() => {
          if (bulkDeleting) handleBulkDelete(bulkDeleting);
        }}
      />
    </>
  );
}
