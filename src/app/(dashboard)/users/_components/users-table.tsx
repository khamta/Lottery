"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { OnlineDot } from "@/components/shared/online-dot";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import type { Paginated } from "@/types";
import type { UserRow } from "../types";

export function UsersTable({ page }: { page: Paginated<UserRow> }) {
  const { t, intl } = useI18n();

  const columns = React.useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("users.name"),
        enableSorting: true,
        cell: ({ row }) => <span className="font-medium">{row.original.name ?? "-"}</span>,
      },
      {
        id: "email",
        accessorKey: "email",
        header: t("users.email"),
        enableSorting: true,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: "role",
        accessorKey: "role",
        header: t("users.role"),
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.role === "ADMIN" ? "default" : "secondary"}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        id: "isActive",
        accessorKey: "isActive",
        header: t("users.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "outline"}>
            {row.original.isActive ? t("users.active") : t("users.inactive")}
          </Badge>
        ),
      },
      {
        id: "lastSeenAt",
        accessorKey: "lastSeenAt",
        header: t("presence.column"),
        enableSorting: true,
        cell: ({ row }) => {
          const { online, lastSeenAt } = row.original;
          return (
            <span className="flex items-center gap-2 text-sm">
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
        header: t("users.createdAt"),
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.createdAt, intl)}
          </span>
        ),
      },
    ],
    [t, intl],
  );

  return (
    <DataTable
      columns={columns}
      page={page}
      searchPlaceholderKey="users.search"
      emptyTitleKey="users.empty"
    />
  );
}
