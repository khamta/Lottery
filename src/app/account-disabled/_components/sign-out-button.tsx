"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SignOutDialog } from "@/components/shared/sign-out-dialog";
import { useI18n } from "@/i18n/client";

export function SignOutButton() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <LogOut /> {t("user.signOut")}
      </Button>
      <SignOutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
