import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { siteConfig } from "@/config/site";
import { defaultLocale, intlLocale } from "@/i18n/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * แปลงตัวเลข/Decimal เป็นข้อความสกุลเงิน
 * locale ให้ส่งมาจาก useI18n().intl (client) หรือ getTranslations().intl (server)
 */
export function formatCurrency(
  value: number | string,
  currency = "THB",
  locale = "th-TH",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

/**
 * รูปแบบตัวเลขในช่องกรอกราคา/จำนวนเงิน: คั่นหลักพันด้วย "." และทศนิยมด้วย ","
 * เช่น 1.000 · 10.000 · 1.000.000 · 1.500,25 — ใช้คู่กับ <AmountInput />
 */
const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** จัดรูปข้อความที่ผู้ใช้กำลังพิมพ์ (ยังพิมพ์ไม่จบ เช่น "1.000," ก็ต้องคงไว้) */
export function formatAmountInput(raw: string, decimals = 2) {
  const cleaned = raw.replace(decimals > 0 ? /[^\d,]/g : /\D/g, "");
  const commaAt = cleaned.indexOf(",");
  const hasComma = decimals > 0 && commaAt !== -1;
  const intRaw = commaAt === -1 ? cleaned : cleaned.slice(0, commaAt);
  const fracRaw = hasComma ? cleaned.slice(commaAt + 1).replace(/,/g, "").slice(0, decimals) : "";

  const intDigits = intRaw.replace(/^0+(?=\d)/, "");
  if (!intDigits && !hasComma) return "";
  const intPart = groupThousands(intDigits || "0");
  return hasComma ? `${intPart},${fracRaw}` : intPart;
}

/** ตัวเลข → ข้อความในช่องกรอก (ตัดศูนย์ท้ายทศนิยมทิ้ง) */
export function formatAmount(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return "";
  const [int, frac = ""] = Math.abs(value).toFixed(decimals).split(".");
  const trimmed = frac.replace(/0+$/, "");
  return groupThousands(int) + (trimmed ? `,${trimmed}` : "");
}

/** ข้อความในช่องกรอก → ตัวเลข ("1.000.000,5" → 1000000.5, ว่าง → 0) */
export function parseAmount(text: string) {
  const normalized = text.replace(/\./g, "").replace(",", ".");
  return normalized ? Number(normalized) : 0;
}

const dateStyles = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * แสดงวันที่/เวลาตามรูปแบบของภาษาที่เลือก — ส่ง intl จาก useI18n() / getTranslations() เสมอ
 *   th-TH → 24 ก.ย. 2569 21:05 · lo-LA → 24 ກ.ຍ. 2026, 21:05
 *   en-US → Sep 24, 2026, 9:05 PM · zh-CN → 2026年9月24日 21:05
 * เขตเวลาตายตัวตาม siteConfig.timeZone เพื่อให้ server กับเบราว์เซอร์ได้ผลเดียวกัน
 */
export function formatDate(
  value: Date | string,
  locale: string = intlLocale[defaultLocale],
  style: keyof typeof dateStyles = "datetime",
) {
  if (locale.startsWith("lo")) return formatLaoDate(new Date(value), style);
  return new Intl.DateTimeFormat(locale, {
    ...dateStyles[style],
    timeZone: siteConfig.timeZone,
  }).format(new Date(value));
}

/**
 * เบราว์เซอร์ส่วนใหญ่ (Chrome/Edge) ไม่มีข้อมูล Intl ของภาษาลาว แล้วแอบถอยไปใช้ en-US
 * จึงประกอบรูปแบบเองให้ได้ผลเดียวกับ ICU เต็ม (Node) ทั้งฝั่ง server และเบราว์เซอร์
 */
const laoMonths = ["ມ.ກ.", "ກ.ພ.", "ມ.ນ.", "ມ.ສ.", "ພ.ພ.", "ມິ.ຖ.", "ກ.ລ.", "ສ.ຫ.", "ກ.ຍ.", "ຕ.ລ.", "ພ.ຈ.", "ທ.ວ."];

function formatLaoDate(value: Date, style: keyof typeof dateStyles) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: siteConfig.timeZone,
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  const date = `${Number(parts.day)} ${laoMonths[Number(parts.month) - 1]} ${parts.year}`;
  const time = `${parts.hour}:${parts.minute}`;
  if (style === "date") return date;
  if (style === "time") return time;
  return `${date}, ${time}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ก-๙\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
