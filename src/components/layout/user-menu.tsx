"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Settings, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/shared/sign-out-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useI18n } from "@/i18n/client";

type UserMenuProps = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "ADMIN" | "USER";
};

export function UserMenu({ name, email, image, role }: UserMenuProps) {
  const { t } = useI18n();
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("user.menu")}>
            <UserAvatar name={name} email={email} image={image} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="flex items-center gap-3">
              <UserAvatar name={name} email={email} image={image} className="size-10" />
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{name ?? t("user.fallbackName")}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  {t("user.role")}: {role}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserIcon /> {t("user.profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> {t("user.accountSettings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmSignOut(true)}>
            <LogOut /> {t("user.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={confirmSignOut} onOpenChange={setConfirmSignOut} />
    </>
  );
}
