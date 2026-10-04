import { siteConfig } from "@/config/site";

/**
 * แสดงตัวเลขตามภาษาที่เลือก — ใช้แทน value.toLocaleString(intl) เสมอ
 *   lo-LA → 1.234.567,5 · th-TH / en-US → 1,234,567.5
 * เบราว์เซอร์ส่วนใหญ่ (Chrome/Edge) ไม่มีข้อมูล Intl ของภาษาลาว แล้วแอบถอยไปใช้ en-US ("600,000")
 * ขณะที่ server (ICU เต็ม) ได้ "600.000" → hydration ไม่ตรงกัน จึงประกอบรูปแบบลาวเอง (เหมือน formatDate)
 */
export function formatNumber(value: number, locale: string) {
  if (!locale.startsWith("lo")) return value.toLocaleString(locale);
  // en-US มีในทุกเบราว์เซอร์ — สลับตัวคั่นหลักพัน "," ↔ ทศนิยม "."
  return value.toLocaleString("en-US").replace(/[,.]/g, (char) => (char === "," ? "." : ","));
}

const laoMonths = ["ມ.ກ.", "ກ.ພ.", "ມ.ນ.", "ມ.ສ.", "ພ.ພ.", "ມິ.ຖ.", "ກ.ລ.", "ສ.ຫ.", "ກ.ຍ.", "ຕ.ລ.", "ພ.ຈ.", "ທ.ວ."];

/**
 * วันเวลาถึงวินาที (เวลาของระบบ siteConfig.timeZone) — ใช้กับเวลาที่ส่งโพย ให้เทียบลำดับกับแชท WhatsApp ได้ตรง
 *   th-TH → 5 ต.ค. 2569 14:30:15 · lo-LA → 5 ຕ.ລ. 2026, 14:30:15
 *   en-US → Oct 5, 2026, 2:30:15 PM · zh-CN → 2026年10月5日 14:30:15
 * ภาษาลาวประกอบเองด้วยเหตุผลเดียวกับ formatDate (เบราว์เซอร์ไม่มี Intl ลาว)
 */
export function formatDateTimeSeconds(value: Date | string, locale: string) {
  const date = new Date(value);
  if (!locale.startsWith("lo")) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: siteConfig.timeZone }).format(date);
  }
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: siteConfig.timeZone,
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${Number(part.day)} ${laoMonths[Number(part.month) - 1]} ${part.year}, ${part.hour}:${part.minute}:${part.second}`;
}
