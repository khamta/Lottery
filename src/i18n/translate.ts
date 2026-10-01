import { defaultLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

export type TranslateParams = Record<string, string | number>;

/**
 * แปลคีย์แบบ dot path เช่น t("products.deleteDesc", { name: "เก้าอี้" })
 * คีย์ที่ไม่มีอยู่จริงจะคืนค่าเป็นตัวคีย์เอง — เห็นชัดทันทีว่ายังไม่ได้แปล
 */
export function translateWith(
  dict: Dictionary,
  key: string,
  params?: TranslateParams,
): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dict);

  if (typeof value !== "string") return key;
  if (!params) return value;

  return value.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

/**
 * dictionary ที่กำลังใช้อยู่ สำหรับโค้ดที่ไม่ใช่ React component
 * (เช่น notify/handleResult) — I18nProvider เป็นคนตั้งค่าให้
 */
let activeLocale: Locale = defaultLocale;
let activeDictionary: Dictionary = dictionaries[defaultLocale];

export function setActiveDictionary(locale: Locale) {
  activeLocale = locale;
  activeDictionary = dictionaries[locale];
}

export function getActiveLocale() {
  return activeLocale;
}

/** ใช้นอก React ได้ (ในคอมโพเนนต์ให้ใช้ useI18n().t แทน) */
export function t(key: string, params?: TranslateParams) {
  return translateWith(activeDictionary, key, params);
}
