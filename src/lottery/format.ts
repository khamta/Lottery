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
