import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "@/i18n/server";
import { localeNames } from "@/i18n/config";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { t, locale } = await getTranslations();
  const session = await auth();

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.account")}</CardTitle>
            <CardDescription>{t("settings.accountDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">{t("settings.name")}</span>
              <span>{session?.user?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">{t("settings.email")}</span>
              <span>{session?.user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("settings.role")}</span>
              <Badge variant={session?.user?.role === "ADMIN" ? "default" : "secondary"}>
                {session?.user?.role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance")}</CardTitle>
            <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("language.label")}</span>
              <span>{localeNames[locale]}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("language.change")} / {t("theme.toggle")} — {t("nav.settings")} ▸ header
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
