"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { defaultLocale, intlLocale, type Locale } from "./config";
import { dictionaries } from "./dictionaries";
import { setActiveDictionary, translateWith, type TranslateParams } from "./translate";
import { setLocaleCookie } from "./actions";

type I18nContextValue = {
  locale: Locale;
  /** locale สำหรับ Intl เช่น "th-TH" */
  intl: string;
  t: (key: string, params?: TranslateParams) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // ให้โค้ดนอก React (notify/handleResult) ใช้ dictionary เดียวกัน
  if (typeof window !== "undefined") setActiveDictionary(locale);
  React.useEffect(() => {
    setActiveDictionary(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = React.useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];

    return {
      locale,
      intl: intlLocale[locale],
      t: (key, params) => translateWith(dict, key, params),
      setLocale: (next) => {
        setActiveDictionary(next);
        void setLocaleCookie(next).then(() => router.refresh());
      },
    };
  }, [locale, router]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * ใช้ในทุก client component ที่มีข้อความ
 *   const { t, intl } = useI18n()
 *   <span>{t("products.title")}</span>
 *
 * ถ้าเรียกนอก provider (เช่นในเทสต์) จะใช้ภาษาเริ่มต้นแทน
 */
export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (context) return context;

  const dict = dictionaries[defaultLocale];
  return {
    locale: defaultLocale,
    intl: intlLocale[defaultLocale],
    t: (key, params) => translateWith(dict, key, params),
    setLocale: () => {},
  };
}
