import { renderAppIcon } from "@/lib/pwa-icon";

// ไอคอนตอน "เพิ่มไปยังหน้าจอโฮม" บน iOS — iOS ตัดมุมเอง จึงใช้แบบพื้นเต็มกรอบ
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(size.width, { maskable: true });
}
