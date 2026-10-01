import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getTranslations } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errors.notFoundDesc")}</p>
      <Button asChild>
        <Link href="/dashboard">{t("errors.backHome")}</Link>
      </Button>
    </div>
  );
}
