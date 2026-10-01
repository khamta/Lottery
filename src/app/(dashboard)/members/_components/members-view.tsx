"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useOptimisticList } from "@/hooks/use-optimistic-list";
import { useI18n } from "@/i18n/client";
import type { CreateMemberInput, MemberInput, MemberPasswordInput } from "@/lib/validations/member";
import type { Paginated } from "@/types";
import { createMember, deleteMember, resetMemberPassword, setMemberActive, updateMember } from "../actions";
import type { MemberRow } from "../types";
import { getMemberColumns } from "./columns";
import { MemberDialog } from "./member-dialog";
import { MemberPasswordDialog } from "./member-password-dialog";

export function MembersView({ page }: { page: Paginated<MemberRow> }) {
  const { t, intl } = useI18n();
  const { rows, isPending, mutate, tempId } = useOptimisticList(page.rows);

  const [editing, setEditing] = React.useState<MemberRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState<MemberRow | null>(null);
  const [toggling, setToggling] = React.useState<MemberRow | null>(null);
  const [deleting, setDeleting] = React.useState<MemberRow | null>(null);

  const columns = React.useMemo(
    () =>
      getMemberColumns({
        t,
        intl,
        onEdit: (row) => {
          setEditing(row);
          setFormOpen(true);
        },
        onResetPassword: (row) => setResetting(row),
        onToggleActive: (row) => setToggling(row),
        onDelete: (row) => setDeleting(row),
      }),
    [t, intl],
  );

  function handleSave(values: MemberInput | CreateMemberInput) {
    // ค่าที่ได้ผ่าน zod แล้ว (อีเมลตัดช่องว่าง + ตัวเล็ก) — ฟอร์มแก้ไขไม่มีช่องรหัสผ่าน
    const shared: MemberInput = { name: values.name, email: values.email, role: values.role, isActive: values.isActive };

    if (editing) {
      mutate({
        patch: { type: "update", item: { ...editing, ...shared, online: shared.isActive && editing.online } },
        action: () => updateMember({ ...shared, id: editing.id }),
      });
    } else {
      const created = values as CreateMemberInput;
      mutate({
        patch: {
          type: "create",
          item: {
            id: tempId(),
            ...shared,
            lastSeenAt: null,
            online: false,
            dealerCount: 0,
            whatsappCount: 0,
            isSelf: false,
            createdAt: new Date().toISOString(),
          },
        },
        action: () => createMember(created),
      });
    }

    setFormOpen(false); // ปิดทันที ไม่รอ database
  }

  function handleResetPassword(row: MemberRow, values: MemberPasswordInput) {
    mutate({
      patch: { type: "update", item: row },
      action: () => resetMemberPassword({ ...values, id: row.id }),
    });
    setResetting(null);
  }

  function handleToggle(row: MemberRow) {
    const isActive = !row.isActive;
    mutate({
      patch: { type: "update", item: { ...row, isActive, online: isActive && row.online } },
      action: () => setMemberActive({ id: row.id, isActive }),
    });
    setToggling(null);
  }

  function handleDelete(row: MemberRow) {
    mutate({
      patch: { type: "delete", id: row.id },
      action: () => deleteMember({ id: row.id }),
    });
    setDeleting(null);
  }

  return (
    <>
      <DataTable
        columns={columns}
        page={{ ...page, rows }}
        pending={isPending}
        searchPlaceholderKey="members.search"
        emptyTitleKey="members.empty"
        emptyDescriptionKey="members.emptyDesc"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> {t("members.add")}
          </Button>
        }
      />

      <MemberDialog open={formOpen} onOpenChange={setFormOpen} member={editing} onSubmit={handleSave} />

      <MemberPasswordDialog
        member={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onSubmit={(values) => {
          if (resetting) handleResetPassword(resetting, values);
        }}
      />

      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.isActive ? t("members.disableTitle") : t("members.enableTitle")}
        description={t(toggling?.isActive ? "members.disableDesc" : "members.enableDesc", {
          name: toggling?.name ?? toggling?.email ?? "",
        })}
        confirmText={toggling?.isActive ? t("members.disable") : t("members.enable")}
        variant={toggling?.isActive ? "destructive" : "default"}
        onConfirm={() => {
          if (toggling) handleToggle(toggling);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("members.deleteTitle")}
        description={t("members.deleteDesc", { name: deleting?.name ?? deleting?.email ?? "" })}
        confirmText={t("members.deleteConfirm")}
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />
    </>
  );
}
