import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * โลโก้ของแอป — ไฟล์นี้เป็นของ project (แก้ได้อิสระ ไม่ชนกับการอัปเดต template)
 * ใช้ใน sidebar, แถบบนบนมือถือ และหน้า login/register
 *
 * เปลี่ยนเป็นรูปของตัวเองได้ เช่น
 *   return <Image src="/img/logo.svg" alt="" width={16} height={16} className={className} />;
 * ขนาดส่งมาทาง className (size-4 / size-5) — สีพื้นกรอบมาจาก token ของธีม
 */
export function BrandIcon({ className }: { className?: string }) {
  return <Boxes aria-hidden className={cn("size-4", className)} />;
}
