"use client";

import Image from "next/image";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeFlags, localeNames, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

/** ธงกลม ๆ ของแต่ละภาษา — รูปอยู่ที่ public/img (ตั้งค่าใน localeFlags) */
export function LocaleFlag({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <Image
      src={localeFlags[locale]}
      alt=""
      width={40}
      height={40}
      className={cn("size-5 shrink-0 rounded-full border object-cover", className)}
    />
  );
}

/** สลับภาษา — ปุ่มแสดงธงของภาษาปัจจุบัน บันทึกลง cookie แล้ว refresh ให้ server component แปลใหม่ */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language.change")} title={t("language.change")}>
          <LocaleFlag locale={locale} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((item) => (
          <DropdownMenuItem key={item} onClick={() => setLocale(item)}>
            <LocaleFlag locale={item} />
            <span className="flex-1">{localeNames[item]}</span>
            {item === locale ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
