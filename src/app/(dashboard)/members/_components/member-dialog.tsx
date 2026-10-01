"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Save } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createMemberSchema,
  memberSchema,
  type CreateMemberInput,
  type MemberInput,
} from "@/lib/validations/member";
import { useI18n } from "@/i18n/client";
import { roleKey, type MemberRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง (view เป็นคนทำ optimistic update)
 * เพิ่มบัญชี = กรอกรหัสผ่านแรกด้วย · แก้ไข = ไม่มีช่องรหัสผ่าน (ใช้เมนู "ตั้งรหัสผ่านใหม่")
 * บัญชีของตัวเอง: เปลี่ยนสิทธิ์/ปิดใช้งานไม่ได้ (server เช็คซ้ำ)
 */
type MemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberRow | null;
  onSubmit: (values: MemberInput | CreateMemberInput) => void;
};

const emptyValues: CreateMemberInput = {
  name: "",
  email: "",
  role: "USER",
  isActive: true,
  password: "",
  confirmPassword: "",
};

export function MemberDialog({ open, onOpenChange, member, onSubmit }: MemberDialogProps) {
  const { t } = useI18n();
  const isEdit = !!member;
  const locked = !!member?.isSelf;

  // แก้ไขตรวจด้วย memberSchema (ไม่มีรหัสผ่าน) — ช่องรหัสผ่านที่ซ่อนอยู่จึงไม่ถูกบังคับ
  const resolver = React.useMemo(
    () => zodResolver(isEdit ? memberSchema : createMemberSchema) as unknown as Resolver<CreateMemberInput>,
    [isEdit],
  );

  const form = useForm<CreateMemberInput>({ resolver, defaultValues: emptyValues });

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      member
        ? { ...emptyValues, name: member.name ?? "", email: member.email, role: member.role, isActive: member.isActive }
        : emptyValues,
    );
  }, [open, member, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("members.editTitle") : t("members.addTitle")}</DialogTitle>
          <DialogDescription>{t("members.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("members.name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder={t("members.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("members.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.role")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={locked}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(roleKey).map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {t(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{locked ? t("members.selfHint") : t("members.roleHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={locked}
                    />
                    <span>
                      {t("members.isActiveLabel")}
                      <span className="block text-xs text-muted-foreground">{t("members.isActiveHint")}</span>
                    </span>
                  </label>
                </FormItem>
              )}
            />

            {isEdit ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("members.password")}</FormLabel>
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
                <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">{t("members.passwordHint")}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                <Save /> {isEdit ? t("common.saveEdit") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
