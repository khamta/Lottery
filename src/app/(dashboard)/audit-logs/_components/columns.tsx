"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { formatDate } from "@/lib/utils";
import { actionKey, entityKey, type AuditActionValue, type AuditLogRow } from "../types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: Translate;
  intl: string;
  onView: (row: AuditLogRow) => void;
};

/** สีของการกระทำ — ใช้ variant ของ Badge ที่ผูกกับ theme token เท่านั้น */
export const actionVariant: Record<AuditActionValue, "success" | "warning" | "destructive"> = {
  CREATE: "success",
  UPDATE: "warning",
  DELETE: "destructive",
};

/** ชื่อผู้กระทำ: บัญชีปัจจุบัน → ชื่อที่บันทึกไว้ตอนเกิดเหตุ (บัญชีถูกลบ) → "ระบบ" */
export function actorLabel(row: Pick<AuditLogRow, "actor" | "userName">, t: Translate) {
  return row.actor?.name || row.actor?.email || row.userName || t("auditLogs.system");
}

export function getAuditLogColumns({ t, intl, onView }: ColumnOptions): ColumnDef<AuditLogRow>[] {
  return [
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: t("auditLogs.time"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          {formatDate(row.original.createdAt, intl)}
        </span>
      ),
    },
    {
      id: "userName",
      accessorKey: "userName",
      header: t("auditLogs.actor"),
      enableSorting: true,
      cell: ({ row }) => {
        const { actor, userName } = row.original;
        const name = actorLabel(row.original, t);
        const deleted = !actor && !!userName;

        return (
          <div className="flex min-w-40 items-center gap-2.5">
            <UserAvatar
              name={actor?.name ?? userName}
              email={actor?.email}
              image={actor?.image}
              className="size-8"
              fallbackClassName="text-xs"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{name}</p>
              {actor?.name ? (
                <p className="truncate text-xs text-muted-foreground">{actor.email}</p>
              ) : deleted ? (
                <p className="text-xs text-muted-foreground italic">{t("auditLogs.deletedUser")}</p>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: "action",
      accessorKey: "action",
      header: t("auditLogs.action"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={actionVariant[row.original.action]}>
          {t(actionKey[row.original.action])}
        </Badge>
      ),
    },
    {
      id: "entity",
      accessorKey: "entity",
      header: t("auditLogs.entity"),
      enableSorting: true,
      cell: ({ row }) => {
        const { entity, summary, entityId } = row.original;
        return (
          <div className="min-w-40">
            <p className="font-medium">{entityKey[entity] ? t(entityKey[entity]) : entity}</p>
            {summary || entityId ? (
              <p className="max-w-72 truncate text-xs text-muted-foreground">{summary || entityId}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("table.rowMenu")}>
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(row.original)}>
                <FileSearch /> {t("auditLogs.viewDetails")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
