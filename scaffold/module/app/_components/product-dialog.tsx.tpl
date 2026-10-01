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
import { Textarea } from "@/components/ui/textarea";
import { AmountInput } from "@/components/shared/amount-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import { useI18n } from "@/i18n/client";
import { statusKey, type ProductRow } from "../types";

/**
 * ฟอร์มล้วน ๆ — ไม่เรียก server action เอง
 * ส่งค่ากลับให้ view ผ่าน onSubmit เพื่อให้ view เป็นคนทำ optimistic update
 * (ดู src/hooks/use-optimistic-list.ts)
 */
type ProductDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
  onSubmit: (values: ProductInput) => void;
};

const emptyValues: ProductInput = {
  name: "",
  sku: "",
  description: "",
  price: 0,
  stock: 0,
  status: "DRAFT",
};

export function ProductDialog({ open, onOpenChange, product, onSubmit }: ProductDialogProps) {
  const { t } = useI18n();
  const isEdit = !!product;

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyValues,
  });

  // sync ค่าเมื่อเปิด dialog (เพิ่มใหม่ = ล้างฟอร์ม, แก้ไข = เติมค่าเดิม)
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      product
        ? {
            name: product.name,
            sku: product.sku,
            description: product.description ?? "",
            price: product.price,
            stock: product.stock,
            status: product.status,
          }
        : emptyValues,
    );
  }, [open, product, form]);

  // zod ตรวจฝั่ง client แล้วค่อยส่งต่อ — server ตรวจซ้ำอีกชั้นเสมอ
  function handleValid(values: ProductInput) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("products.editTitle") : t("products.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("products.dialogDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleValid)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("products.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.sku")}</FormLabel>
                    <FormControl>
                      <Input placeholder="SKU-0001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.price")}</FormLabel>
                    <FormControl>
                      <AmountInput placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.stock")}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.status")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("products.statusPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(statusKey).map(([value, key]) => (
                          <SelectItem key={value} value={value}>
                            {t(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.description")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder={t("products.descriptionPlaceholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("products.descriptionHint")}</FormDescription>
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
