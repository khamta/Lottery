import { cookies } from "next/headers";

import { defaultLocale, intlLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries } from "./dictionaries";
import { translateWith, type TranslateParams } from "./translate";

/** อ่านภาษาปัจจุบันจาก cookie — ใช้ได้เฉพาะใน server component / server action */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/**
 * ตัวแปลสำหรับ server component
 *   const { t, locale, intl } = await getTranslations()
 */
export async function getTranslations() {
  const locale = await getLocale();
  const dict = dictionaries[locale];

  return {
    locale,
    intl: intlLocale[locale],
    t: (key: string, params?: TranslateParams) => translateWith(dict, key, params),
  };
}
