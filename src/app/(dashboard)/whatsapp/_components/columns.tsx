"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, Pencil, QrCode, Trash2 } from "lucide-react";

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
import { toRoute } from "@/lib/query";
import { formatNumber } from "@/lottery/format";
import { statusKey, statusVariant, type WhatsappAccountRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: WhatsappAccountRow) => void;
  onDelete: (row: WhatsappAccountRow) => void;
};

export function getWhatsappColumns({ t, intl, onEdit, onDelete }: ColumnOptions): ColumnDef<WhatsappAccountRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("whatsapp.name"),
      enableSorting: true,
      cell: ({ row }) => (
        <Link href={toRoute(`/whatsapp/${row.original.id}`)} className="block min-w-40 space-y-0.5">
          <p className="font-medium underline-offset-4 hover:underline">{row.original.name}</p>
          {row.original.phone ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              +{row.original.phone}
              {row.original.waName ? ` · ${row.original.waName}` : ""}
            </p>
          ) : null}
        </Link>
      ),
    },
    {
      id: "owner",
      header: t("whatsapp.owner"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.ownerName ? (
          <span className="text-sm">{row.original.ownerName}</span>
        ) : (
          <Badge variant="secondary">{t("whatsapp.ownerMe")}</Badge>
        ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("whatsapp.status"),
      enableSorting: true,
      cell: ({ row }) =>
        row.original.workerOnline ? (
          <Badge variant={statusVariant[row.original.status]}>{t(statusKey[row.original.status])}</Badge>
        ) : (
          <Badge variant="destructive">{t("whatsapp.workerOffline")}</Badge>
        ),
    },
    {
      id: "groups",
      header: t("whatsapp.groups"),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {t("whatsapp.readingOf", {
            reading: formatNumber(row.original.readingCount, intl),
            total: formatNumber(row.original.groupCount, intl),
          })}
        </span>
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
              <DropdownMenuItem asChild>
                <Link href={toRoute(`/whatsapp/${row.original.id}`)}>
                  <QrCode /> {t("whatsapp.open")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil /> {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.original)}>
                <Trash2 /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}
