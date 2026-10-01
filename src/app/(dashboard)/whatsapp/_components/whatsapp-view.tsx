"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { WhatsappAccountInput } from "@/lib/validations/whatsapp-account";
import type { Paginated } from "@/types";
import { createWhatsappAccount, deleteWhatsappAccount, updateWhatsappAccount } from "../actions";
import type { WhatsappAccountRow, WhatsappOwnerOption } from "../types";
import { getWhatsappColumns } from "./columns";
import { WhatsappAccountDialog } from "./whatsapp-account-dialog";

/** หน้าของผู้ดูแลระบบ — owners = ผู้ใช้ที่เลือกผูกบัญชีได้ · currentUserId ใช้แสดง "ของฉัน" ตอนเพิ่มแบบ optimistic */
export function WhatsappView({
  page,
  owners,
  currentUserId,
}: {
  page: Paginated<WhatsappAccountRow>;
  owners: WhatsappOwnerOption[];
  currentUserId: string;
}) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<WhatsappAccountRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<WhatsappAccountRow | null>(null);

  const columns = React.useMemo(
    () =>
      getWhatsappColumns({
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

  function ownerNameOf(ownerId: string) {
    if (ownerId === currentUserId) return null;
    return owners.find((owner) => owner.id === ownerId)?.label ?? editing?.ownerName ?? null;
  }

  function handleSave(values: WhatsappAccountInput) {
    const shared = {
      name: values.name,
      pairingPhone: values.pairingPhone || null,
      ownerId: values.ownerId,
      ownerName: ownerNameOf(values.ownerId),
    };

    if (editing) {
      // เปลี่ยนเจ้าของ = กลุ่มที่เคยผูกกับแม่หวยของเจ้าของเดิมกลับเป็น "ไม่อ่าน" (actions.ts)
      const readingCount = editing.ownerId === values.ownerId ? editing.readingCount : 0;
      mutate({
        patch: { type: "update", item: { ...editing, ...shared, readingCount } },
        action: () => updateWhatsappAccount({ ...values, id: editing.id }),
      });
    } else {
      mutate({
        patch: {
          type: "create",
          item: {
            id: tempId(),
            ...shared,
            enabled: true,
            status: "STARTING",
            phone: null,
            waName: null,
            lastError: null,
            workerOnline: true,
            groupCount: 0,
            readingCount: 0,
            createdAt: new Date().toISOString(),
          },
        },
        action: () => createWhatsappAccount(values),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleDelete(row: WhatsappAccountRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteWhatsappAccount({ id: row.id }),
    });
    setDeleting(null);
  }

  return (
    <>
      <DataTable
        columns={columns}
        page={{ ...page, rows }}
        pending={isPending}
        searchPlaceholderKey="whatsapp.search"
        emptyTitleKey="whatsapp.empty"
        emptyDescriptionKey="whatsapp.emptyDesc"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("whatsapp.add")}
          </Button>
        }
      />

      <WhatsappAccountDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        owners={owners}
        defaultOwnerId={currentUserId}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("whatsapp.deleteTitle")}
        description={t("whatsapp.deleteDesc", { name: deleting?.name ?? "" })}
        confirmText={t("whatsapp.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />
    </>
  );
}
