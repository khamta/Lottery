"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";

import { Toaster } from "@/components/ui/sonner";
import { RouteProgress } from "@/components/shared/route-progress";
import { MutationOverlay } from "@/components/shared/mutation-overlay";
import { SplashGate } from "@/components/shared/app-splash";
import { ServiceWorkerRegister } from "@/components/shared/service-worker";
import { siteConfig } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider locale={locale}>
        <ThemeProvider
          attribute="class"
          defaultTheme={siteConfig.defaultTheme}
          enableSystem
          disableTransitionOnChange
        >
          <SplashGate />
          <RouteProgress />
          {children}
          {/* ม่านโหลดเต็มจอระหว่าง create/update/delete — mutate() เปิด/ปิดให้เอง */}
          <MutationOverlay />
          <Toaster />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
