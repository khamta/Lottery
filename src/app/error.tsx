"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("errors.title")}</AlertTitle>
          <AlertDescription>{error.message || t("errors.generic")}</AlertDescription>
        </Alert>
        <Button onClick={reset} className="w-full">
          <RotateCw /> {t("common.retry")}
        </Button>
      </div>
    </div>
  );
}
