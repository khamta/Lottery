"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, KeyRound, Pencil, Trash2, UserCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OnlineDot } from "@/components/shared/online-dot";
import { formatDate } from "@/lib/utils";
import { formatNumber } from "@/lottery/format";
import { roleKey, type MemberRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: MemberRow) => void;
  onResetPassword: (row: MemberRow) => void;
  onToggleActive: (row: MemberRow) => void;
  onDelete: (row: MemberRow) => void;
};

export function getMemberColumns({
  t,
  intl,
  onEdit,
  onResetPassword,
  onToggleActive,
  onDelete,
}: ColumnOptions): ColumnDef<MemberRow>[] {
  const count = (value: number) => <span className="tabular-nums">{formatNumber(value, intl)}</span>;

  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("members.name"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-44 space-y-0.5">
          <p className="flex items-center gap-2 font-medium">
            {row.original.name ?? "-"}
            {row.original.isSelf ? <Badge variant="secondary">{t("members.you")}</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: "role",
      accessorKey: "role",
      header: t("members.role"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={row.original.role === "ADMIN" ? "default" : "secondary"}>
          {t(roleKey[row.original.role])}
        </Badge>
      ),
    },
    {
      id: "isActive",
      accessorKey: "isActive",
      header: t("members.status"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "outline"}>
          {row.original.isActive ? t("members.active") : t("members.inactive")}
        </Badge>
      ),
    },
    {
      id: "dealerCount",
      header: t("members.dealers"),
      enableSorting: false,
      cell: ({ row }) => count(row.original.dealerCount),
    },
    {
      id: "whatsappCount",
      header: t("members.whatsapp"),
      enableSorting: false,
      cell: ({ row }) => count(row.original.whatsappCount),
    },
    {
      id: "lastSeenAt",
      accessorKey: "lastSeenAt",
      header: t("presence.column"),
      enableSorting: true,
      cell: ({ row }) => {
        const { online, lastSeenAt } = row.original;
        return (
          <span className="flex items-center gap-2 text-sm whitespace-nowrap">
            <OnlineDot online={online} className="ring-0" />
            {online ? (
              <span className="font-medium text-success">{t("presence.online")}</span>
            ) : (
              <span className="text-muted-foreground">
                {lastSeenAt ? t("presence.lastSeen", { time: formatDate(lastSeenAt, intl) }) : t("presence.offline")}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: t("members.createdAt"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt, intl)}</span>
      ),
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
              <DropdownMenuLabel>{t("common.manage")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil /> {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onResetPassword(row.original)}>
                <KeyRound /> {t("members.resetPassword")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={row.original.isSelf} onClick={() => onToggleActive(row.original)}>
                {row.original.isActive ? <UserX /> : <UserCheck />}
                {row.original.isActive ? t("members.disable") : t("members.enable")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={row.original.isSelf}
                onClick={() => onDelete(row.original)}
              >
                <Trash2 /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
