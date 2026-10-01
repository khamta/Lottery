"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/**
 * กดครั้งเดียวสลับ สว่าง ⇄ มืด
 * อ่านจาก resolvedTheme จึงสลับถูกแม้ค่าเริ่มต้นเป็น "system"
 * ไอคอนสลับด้วย class `dark:` ล้วน ๆ ไม่ต้องรอ mount (ไม่มี hydration mismatch)
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
