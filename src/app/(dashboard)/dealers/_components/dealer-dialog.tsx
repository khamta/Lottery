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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dealerSchema, type DealerInput } from "@/lib/validations/dealer";
import { useI18n } from "@/i18n/client";
import type { DealerRow } from "../types";

/** ฟอร์มล้วน ๆ — ไม่เรียก server action เอง ส่งค่ากลับให้ view ผ่าน onSubmit */
type DealerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealer: DealerRow | null;
  onSubmit: (values: DealerInput) => void;
};

const emptyValues: DealerInput = { name: "", note: "" };

export function DealerDialog({ open, onOpenChange, dealer, onSubmit }: DealerDialogProps) {
  const { t } = useI18n();
  const isEdit = !!dealer;

  const form = useForm<DealerInput>({
    resolver: zodResolver(dealerSchema),
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset(dealer ? { name: dealer.name, note: dealer.note ?? "" } : emptyValues);
  }, [open, dealer, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("dealers.editTitle") : t("dealers.addTitle")}</DialogTitle>
          <DialogDescription>{t("dealers.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dealers.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("dealers.namePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dealers.note")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
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
