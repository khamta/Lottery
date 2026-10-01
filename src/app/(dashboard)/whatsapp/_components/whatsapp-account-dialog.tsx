"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappAccountSchema, type WhatsappAccountInput } from "@/lib/validations/whatsapp-account";
import { useI18n } from "@/i18n/client";
import type { WhatsappAccountRow, WhatsappOwnerOption } from "../types";

/** ฟอร์มล้วน ๆ — ไม่เรียก server action เอง ส่งค่ากลับให้ view ผ่าน onSubmit */
type WhatsappAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: WhatsappAccountRow | null;
  /** ผู้ใช้ที่ผูกบัญชีได้ (ใช้งานอยู่) */
  owners: WhatsappOwnerOption[];
  /** เจ้าของเริ่มต้นของบัญชีใหม่ (ผู้ดูแลที่เปิดหน้าอยู่) */
  defaultOwnerId: string;
  onSubmit: (values: WhatsappAccountInput) => void;
};

export function WhatsappAccountDialog({
  open,
  onOpenChange,
  account,
  owners,
  defaultOwnerId,
  onSubmit,
}: WhatsappAccountDialogProps) {
  const { t } = useI18n();
  const isEdit = !!account;

  const form = useForm<WhatsappAccountInput>({
    resolver: zodResolver(whatsappAccountSchema),
    defaultValues: { name: "", pairingPhone: "", ownerId: defaultOwnerId },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset(
      account
        ? { name: account.name, pairingPhone: account.pairingPhone ?? "", ownerId: account.ownerId }
        : { name: "", pairingPhone: "", ownerId: defaultOwnerId },
    );
  }, [open, account, defaultOwnerId, form]);

  // เจ้าของเดิมที่ถูกปิดใช้งานไปแล้วไม่อยู่ในรายชื่อ — เติมให้เพื่อให้ฟอร์มแสดงค่าปัจจุบันได้
  const ownerOptions = React.useMemo(() => {
    if (!account || owners.some((owner) => owner.id === account.ownerId)) return owners;
    return [...owners, { id: account.ownerId, label: account.ownerName ?? account.ownerId }];
  }, [owners, account]);

  const ownerChanged = isEdit && form.watch("ownerId") !== account.ownerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("whatsapp.editTitle") : t("whatsapp.addTitle")}</DialogTitle>
          <DialogDescription>{t("whatsapp.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("whatsapp.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("whatsapp.namePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("whatsapp.owner")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("whatsapp.ownerPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ownerOptions.map((owner) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {owner.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {ownerChanged ? t("whatsapp.ownerChangeWarning") : t("whatsapp.ownerHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pairingPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("whatsapp.pairingPhone")}</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="8562055512345" {...field} />
                  </FormControl>
                  <FormDescription>{t("whatsapp.pairingPhoneHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
