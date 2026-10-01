"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";

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
import { formatDate } from "@/lib/utils";
import { multiplierKey, type CustomerRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: CustomerRow) => void;
  onDelete: (row: CustomerRow) => void;
};

export function getCustomerColumns({
  t,
  intl,
  onEdit,
  onDelete,
}: ColumnOptions): ColumnDef<CustomerRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("customers.name"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-40">
          <p className="font-medium">{row.original.name}</p>
          {row.original.note ? (
            <p className="text-xs text-muted-foreground">{row.original.note}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: t("customers.phone"),
      enableSorting: true,
      cell: ({ row }) => <span className="tabular-nums">{row.original.phone ?? "–"}</span>,
    },
    {
      id: "lakMultiplier",
      accessorKey: "lakMultiplier",
      header: t("customers.lakMultiplier"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={row.original.lakMultiplier === 1000 ? "secondary" : "outline"}>
          {t(multiplierKey[row.original.lakMultiplier] ?? "customers.multiplier1")}
        </Badge>
      ),
    },
    {
      id: "ticketCount",
      enableSorting: false,
      header: t("customers.ticketCount"),
      cell: ({ row }) => <span className="tabular-nums">{row.original.ticketCount.toLocaleString(intl)}</span>,
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: t("customers.updatedAt"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt, intl)}</span>
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
