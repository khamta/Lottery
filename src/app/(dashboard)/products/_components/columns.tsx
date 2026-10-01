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
import { formatCurrency, formatDate } from "@/lib/utils";
import { statusKey, type ProductRow } from "../types";

type ColumnOptions = {
  /** ตัวแปลจาก useI18n() — คอลัมน์ไม่เรียก hook เอง เพราะถูกสร้างนอก render tree */
  t: (key: string, params?: Record<string, string | number>) => string;
  intl: string;
  onEdit: (row: ProductRow) => void;
  onDelete: (row: ProductRow) => void;
};

const statusVariant = {
  ACTIVE: "success",
  DRAFT: "secondary",
  ARCHIVED: "outline",
} as const;

export function getProductColumns({
  t,
  intl,
  onEdit,
  onDelete,
}: ColumnOptions): ColumnDef<ProductRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("products.name"),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-40">
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.sku}</p>
        </div>
      ),
    },
    {
      id: "price",
      accessorKey: "price",
      header: t("products.price"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatCurrency(row.original.price, "THB", intl)}</span>
      ),
    },
    {
      id: "stock",
      accessorKey: "stock",
      header: t("products.stock"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className={row.original.stock === 0 ? "font-medium text-destructive" : "tabular-nums"}>
          {row.original.stock.toLocaleString(intl)}
        </span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("products.status"),
      enableSorting: true,
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status]}>{t(statusKey[row.original.status])}</Badge>
      ),
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: t("products.updatedAt"),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.updatedAt, intl)}
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
