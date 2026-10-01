export const locales = ["th", "lo", "en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "lo";

/** ชื่อภาษาเขียนด้วยภาษานั้นเอง — ใช้ในตัวสลับภาษา */
export const localeNames: Record<Locale, string> = {
  th: "ไทย",
  lo: "ລາວ",
  en: "English",
  zh: "中文",
};

/** ธงประจำภาษา (ไฟล์อยู่ใน public/img) — ใช้ในตัวสลับภาษา */
export const localeFlags: Record<Locale, string> = {
  th: "/img/th.jpg",
  lo: "/img/la.png",
  en: "/img/en.png",
  zh: "/img/china.png",
};

/** locale ที่ใช้กับ Intl (วันที่/ตัวเลข/สกุลเงิน) */
export const intlLocale: Record<Locale, string> = {
  th: "th-TH",
  lo: "lo-LA",
  en: "en-US",
  zh: "zh-CN",
};

export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
