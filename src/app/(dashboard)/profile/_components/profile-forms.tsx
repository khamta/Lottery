"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { KeyRound, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { beginMutation } from "@/components/shared/mutation-overlay";
import type { ActionResult } from "@/lib/action";
import { handleResult } from "@/lib/notify";
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from "@/lib/validations/profile";
import { useI18n } from "@/i18n/client";
import { changePassword, updateProfile } from "../actions";

/**
 * ยิง action พร้อมม่านโหลดกลาง แล้ว map error รายฟิลด์กลับเข้าฟอร์ม
 * (ฟอร์มในหน้านี้ไม่ได้ปิดหลังกดบันทึกเหมือน dialog จึงโชว์ error ใต้ช่องได้)
 */
async function submitWithOverlay<TValues extends FieldValues, TData>(
  form: UseFormReturn<TValues>,
  run: () => Promise<ActionResult<TData>>,
) {
  const end = beginMutation("common.saving");
  try {
    const result = await run();
    if (!handleResult(result)) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as Path<TValues>, { message: messages[0] });
        }
      }
      return false;
    }
    return true;
  } finally {
    end();
  }
}

export function PersonalInfoForm({ name, email }: { name: string; email: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  });

  React.useEffect(() => form.reset({ name }), [name, form]);

  async function onSubmit(values: UpdateProfileInput) {
    if (await submitWithOverlay(form, () => updateProfile(values))) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.personalInfo")}</CardTitle>
        <CardDescription>{t("profile.personalInfoDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" placeholder={t("auth.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid content-start gap-2">
                <Label htmlFor="profile-email">{t("profile.email")}</Label>
                <Input id="profile-email" type="email" value={email} readOnly disabled />
                <p className="text-xs text-muted-foreground">{t("profile.emailHint")}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!form.formState.isDirty} className="w-full sm:w-auto">
                <Save /> {t("common.saveEdit")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

const emptyPassword: ChangePasswordInput = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyPassword,
  });

  async function onSubmit(values: ChangePasswordInput) {
    if (await submitWithOverlay(form, () => changePassword(values))) form.reset(emptyPassword);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.security")}</CardTitle>
        <CardDescription>{t("profile.securityDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasPassword ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.currentPassword")}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("profile.newPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormDescription>{t("auth.passwordHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("profile.confirmPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!form.formState.isDirty} className="w-full sm:w-auto">
                  <KeyRound /> {t("profile.changePassword")}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <p className="text-sm text-muted-foreground">{t("profile.noPassword")}</p>
        )}
      </CardContent>
    </Card>
  );
}
