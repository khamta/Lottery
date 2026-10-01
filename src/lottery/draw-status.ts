import type { DrawStatusValue } from "@/lib/validations/draw";

/**
 * สถานะของงวดหลังบันทึกฟอร์ม — ใช้ทั้งฝั่ง server (action) และ client (optimistic update)
 *
 *  - กรอกเลขที่ออกครบ = ออกผลแล้ว
 *  - งวดใหม่ที่ยังไม่มีผล = เปิดรับ
 *  - งวดเดิมที่ยังไม่มีผล = คงสถานะเปิด/ปิดรับไว้ · ลบผลของงวดที่ออกผลแล้ว = ปิดรับ (ไม่เปิดรับโพยเองโดยไม่ตั้งใจ)
 */
export function nextDrawStatus(
  results: { topResult: string | null; bottomResult: string | null },
  current: DrawStatusValue | null,
): DrawStatusValue {
  if (results.topResult && results.bottomResult) return "SETTLED";
  if (!current) return "OPEN";
  return current === "OPEN" ? "OPEN" : "CLOSED";
}
