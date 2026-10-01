"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { KeyRound } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memberPasswordSchema, type MemberPasswordInput } from "@/lib/validations/member";
import { useI18n } from "@/i18n/client";
import type { MemberRow } from "../types";

const emptyValues: MemberPasswordInput = { password: "", confirmPassword: "" };

/** ผู้ดูแลตั้งรหัสผ่านใหม่ให้บัญชีนี้ (ไม่ต้องรู้รหัสเดิม) — เปิดเมื่อ member ไม่เป็น null */
export function MemberPasswordDialog({
  member,
  onOpenChange,
  onSubmit,
}: {
  member: MemberRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MemberPasswordInput) => void;
}) {
  const { t } = useI18n();
  const open = !!member;

  const form = useForm<MemberPasswordInput>({
    resolver: zodResolver(memberPasswordSchema),
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("members.resetPasswordTitle")}</DialogTitle>
          <DialogDescription>
            {t("members.resetPasswordDesc", { name: member?.name ?? member?.email ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.newPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.confirmPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="-mt-2 text-xs text-muted-foreground">{t("members.passwordHint")}</p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                <KeyRound /> {t("members.resetPassword")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
