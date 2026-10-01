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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LAK_MULTIPLIERS, customerSchema, type CustomerInput } from "@/lib/validations/customer";
import { useI18n } from "@/i18n/client";
import { multiplierKey, type CustomerRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 */
type CustomerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerRow | null;
  onSubmit: (values: CustomerInput) => void;
};

const emptyValues: CustomerInput = {
  name: "",
  phone: "",
  lakMultiplier: 1000,
  note: "",
};

export function CustomerDialog({ open, onOpenChange, customer, onSubmit }: CustomerDialogProps) {
  const { t } = useI18n();
  const isEdit = !!customer;

  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: emptyValues,
  });

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      customer
        ? {
            name: customer.name,
            phone: customer.phone ?? "",
            lakMultiplier: customer.lakMultiplier,
            note: customer.note ?? "",
          }
        : emptyValues,
    );
  }, [open, customer, form]);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: CustomerInput) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("customers.editTitle") : t("customers.addTitle")}</DialogTitle>
          <DialogDescription>{t("customers.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("customers.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("customers.phone")}</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="8562055512345" className="tabular-nums" {...field} />
                    </FormControl>
                    <FormDescription>{t("customers.phoneHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="lakMultiplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.lakMultiplier")}</FormLabel>
                  <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LAK_MULTIPLIERS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {t(multiplierKey[value])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("customers.lakMultiplierHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.note")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("customers.notePlaceholder")} {...field} />
                  </FormControl>
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
