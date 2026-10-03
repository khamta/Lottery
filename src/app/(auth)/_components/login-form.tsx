"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, KeyRound, LogIn, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LoginProgressOverlay } from "@/components/shared/login-progress-overlay";
import { startRouteProgress } from "@/components/shared/route-progress";
import { notify } from "@/lib/notify";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { siteConfig } from "@/config/site";
import { useI18n } from "@/i18n/client";

/** เข้าสู่ระบบด้วยชื่อผู้ใช้หรืออีเมล + รหัสผ่าน (ตรวจที่ authorize ใน src/lib/auth.ts) */
export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  // true ตั้งแต่ signIn สำเร็จจนหน้า login ถูกถอดออก — โชว์ม่าน % และล็อกปุ่มกันกดซ้ำ
  const [redirecting, setRedirecting] = React.useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    if (redirecting) return;
    const res = await signIn("credentials", { ...values, redirect: false });

    if (res?.error) {
      notify.error(t("auth.loginFailed"), t("account.loginFailedDesc"));
      form.setFocus("password");
      return;
    }

    // ไม่ใช้ notify.success แล้ว — ม่าน % แสดง "เข้าสู่ระบบสำเร็จ" และประกาศผ่าน role="status" อยู่แล้ว
    // prefetch คู่ขนานกับ animation เพื่อให้แดชบอร์ดโผล่ทันทีหลังครบ 100%
    router.prefetch("/dashboard");
    setRedirecting(true);
  }

  const goToDashboard = React.useCallback(() => {
    startRouteProgress();
    router.push("/dashboard");
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("account.welcome")}</h1>
        <p className="text-sm text-muted-foreground">{t("account.loginSubtitle")}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("account.identifier")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={t("account.identifierPlaceholder")}
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      className="h-11 pl-10"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.password")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="h-11 pr-11 pl-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            loading={form.formState.isSubmitting}
            disabled={redirecting}
            className="h-11 w-full text-base"
          >
            <LogIn /> {t("auth.loginTitle")}
          </Button>
        </form>
      </Form>

      <p className="rounded-lg bg-muted px-3 py-2.5 text-center text-xs text-muted-foreground">
        {t("account.forgotHint")}
      </p>

      {siteConfig.enableRegister ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t("auth.registerTitle")}
          </Link>
        </p>
      ) : null}

      <LoginProgressOverlay active={redirecting} onFinish={goToDashboard} />
    </div>
  );
}
